import { ReturnSnapDatabase } from '../db/database';
import { GasBridgeClient } from '../api/gas-bridge';

export interface UploadProgress {
  totalDrafts: number;
  currentDraftIndex: number;
  currentSlipCode: string;
  totalImages: number;
  currentImageIndex: number;
  status: 'IDLE' | 'PREPARING' | 'UPLOADING' | 'COMPLETING' | 'SUCCESS' | 'ERROR';
  message: string;
}

export class ReturnSnapUploader {
  private db: ReturnSnapDatabase;
  private bridge: GasBridgeClient;
  private isUploading: boolean = false;
  private progressCallback: ((progress: UploadProgress) => void) | null = null;

  constructor(bridgeUrl: string) {
    this.db = new ReturnSnapDatabase();
    this.bridge = new GasBridgeClient(bridgeUrl);
  }

  /**
   * 進捗変更を監視するコールバックを登録します。
   */
  public onProgress(callback: (progress: UploadProgress) => void): void {
    this.progressCallback = callback;
  }

  /**
   * 未送信下書きの同期（アップロード）を開始します。
   */
  public async sync(): Promise<void> {
    if (this.isUploading) {
      console.warn('Upload sync is already in progress');
      return;
    }

    this.isUploading = true;
    
    try {
      await this.db.open();
      await this.bridge.init();

      // 1. READY (送信準備完了) または PARTIAL (一部送信成功) の下書きを取得
      const drafts = await this.db.getAll('drafts');
      const unsentDrafts = drafts.filter(
        (d: any) => d.status === 'READY' || d.status === 'PARTIAL'
      );

      if (unsentDrafts.length === 0) {
        this.notifyProgress({
          totalDrafts: 0,
          currentDraftIndex: 0,
          currentSlipCode: '',
          totalImages: 0,
          currentImageIndex: 0,
          status: 'SUCCESS',
          message: '同期する未送信データはありません。'
        });
        return;
      }

      const totalDrafts = unsentDrafts.length;

      for (let i = 0; i < totalDrafts; i++) {
        const draft = unsentDrafts[i];
        
        this.notifyProgress({
          totalDrafts,
          currentDraftIndex: i + 1,
          currentSlipCode: draft.slipCode,
          totalImages: 0,
          currentImageIndex: 0,
          status: 'PREPARING',
          message: `伝票番号: ${draft.slipCode} の送信準備中... (${i + 1}/${totalDrafts}件)`
        });

        // 1つの下書きのアップロード処理を実行
        await this.uploadSingleDraft(draft, i + 1, totalDrafts);
      }

      this.notifyProgress({
        totalDrafts,
        currentDraftIndex: totalDrafts,
        currentSlipCode: '',
        totalImages: 0,
        currentImageIndex: 0,
        status: 'SUCCESS',
        message: `すべてのデータ (${totalDrafts} 件) の同期が完了しました！`
      });

    } catch (err: any) {
      this.notifyProgress({
        totalDrafts: 0,
        currentDraftIndex: 0,
        currentSlipCode: '',
        totalImages: 0,
        currentImageIndex: 0,
        status: 'ERROR',
        message: `同期エラーが発生しました: ${err.message}`
      });
      throw err;
    } finally {
      this.isUploading = false;
      this.db.close();
    }
  }

  /**
   * 1伝票分の下書きと画像をアップロードします。
   */
  private async uploadSingleDraft(draft: any, draftIndex: number, totalDrafts: number): Promise<void> {
    // 1. 紐づく画像を取得して sequence 順に並び替え
    const allImages = await this.db.getByIndex('images', 'draftId', draft.draftId);
    const imagesToUpload = allImages
      .filter((img: any) => img.uploadStatus !== 'SUCCESS')
      .sort((a: any, b: any) => a.sequence - b.sequence);

    if (imagesToUpload.length === 0) {
      // 写真がない、またはすべて送信済み
      draft.status = 'COMPLETE';
      await this.db.put('drafts', draft);
      return;
    }

    const totalImages = imagesToUpload.length;

    // 2. GAS側でフォルダ作成 ＆ スプレッドシート行追加 (createDraft)
    let folderId = draft.folderId;
    if (!folderId) {
      const draftResult = await this.bridge.send('createDraft', {
        slipCode: draft.slipCode,
        grade: draft.grade,
        appType: draft.appType,
        baseCode: draft.baseCode
      });

      if (!draftResult.success || !draftResult.payload || !draftResult.payload.folderId) {
        throw new Error(`伝票フォルダの作成に失敗しました: ${draftResult.error?.message || 'Unknown error'}`);
      }

      folderId = draftResult.payload.folderId;
      draft.folderId = folderId;
      draft.folderUrl = draftResult.payload.folderUrl;
      draft.status = 'PARTIAL';
      await this.db.put('drafts', draft);
    }

    // 3. 各画像を1枚ずつ Base64 にエンコードして送信 (uploadPhoto)
    for (let j = 0; j < totalImages; j++) {
      const img = imagesToUpload[j];

      this.notifyProgress({
        totalDrafts,
        currentDraftIndex: draftIndex,
        currentSlipCode: draft.slipCode,
        totalImages,
        currentImageIndex: j + 1,
        status: 'UPLOADING',
        message: `画像送信中... (${j + 1}/${totalImages}枚) [伝票: ${draft.slipCode}]`
      });

      // Blob を Base64 形式のデータURLに変換
      const base64Data = await this.blobToBase64(img.blob);
      const filename = `${draft.slipCode}_${img.category}_${img.sequence}.jpg`;

      // リトライ制御付きの送信処理
      const uploadResult = await this.sendPhotoWithRetry(folderId, draft.slipCode, img.category, img.sequence, base64Data, filename);

      if (uploadResult.success && uploadResult.payload) {
        // 画像送信成功: IndexedDB内の画像Blobデータを削除して端末のストレージを解放
        await this.db.delete('images', img.imageId);
      } else {
        throw new Error(`画像「${filename}」のアップロードに失敗しました: ${uploadResult.error?.message || 'Unknown error'}`);
      }
    }

    // 4. 全写真の送信成功に伴い、下書きを完了状態へ更新 (completeDraft)
    this.notifyProgress({
      totalDrafts,
      currentDraftIndex: draftIndex,
      currentSlipCode: draft.slipCode,
      totalImages,
      currentImageIndex: totalImages,
      status: 'COMPLETING',
      message: '同期完了処理を実行中...'
    });

    await this.bridge.send('completeDraft', {
      draftId: draft.draftId,
      status: 'COMPLETE'
    });

    // 5. 下書きレコードのステータス変更、履歴書き出し
    draft.status = 'COMPLETE';
    draft.updatedAt = Date.now();
    await this.db.put('drafts', draft);

    // 送信完了履歴 (completedHistory) ストアに完了実績を追加 (画像Blobは持たない)
    await this.db.put('completedHistory', {
      uploadId: `hist-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      slipCode: draft.slipCode,
      uploadType: draft.uploadType,
      completedAt: Date.now(),
      imageCount: allImages.length,
      folderName: draft.slipCode,
      status: 'SUCCESS'
    });
  }

  /**
   * 通信エラー時の自動指数リトライ制御をかけて写真を送信します。
   */
  private async sendPhotoWithRetry(
    folderId: string,
    slipCode: string,
    category: string,
    sequence: number,
    base64Data: string,
    filename: string,
    maxRetries: number = 3
  ): Promise<any> {
    let attempt = 0;
    
    while (attempt < maxRetries) {
      try {
        const result = await this.bridge.send('uploadPhoto', {
          folderId,
          slipCode,
          category,
          sequence,
          base64Data,
          filename
        });
        
        if (result.success) {
          return result;
        }
        
        throw new Error(result.error?.message || 'Server error');
      } catch (err: any) {
        attempt++;
        console.warn(`Upload attempt ${attempt} failed for sequence ${sequence}: ${err.message}`);
        
        if (attempt >= maxRetries) {
          throw err; // 最大試行数を超えたらエラーを送出
        }
        
        // 指数バックオフによる待機 (1秒, 2秒, 4秒...)
        const delay = Math.pow(2, attempt) * 1000;
        await new Promise((resolve) => setTimeout(resolve, delay));
      }
    }
  }

  private blobToBase64(blob: Blob): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => {
        resolve(reader.result as string);
      };
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  private notifyProgress(progress: UploadProgress): void {
    if (this.progressCallback) {
      this.progressCallback(progress);
    }
  }
}
