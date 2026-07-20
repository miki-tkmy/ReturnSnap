import { ReturnSnapDatabase } from '../shared/db/database';
import { SlipValidator, SlipInfo } from '../shared/validation/slip-validation';
import { CameraController } from '../shared/camera/camera-controller';
import { ImageProcessor } from '../shared/camera/image-processor';
import { QrScanner } from '../shared/camera/qr-scanner';

export class ReturnSnapCountApp {
  private db: ReturnSnapDatabase;
  private camera: CameraController | null = null;
  
  // アプリの状態
  private currentStep: 'INPUT' | 'SHOOTING' | 'PREVIEW' = 'INPUT';
  private currentBaseCode: string = 'LW'; // デフォルトBaseコード
  private currentBaseName: string = 'Lab.West';
  private currentDeviceName: string = '協力会社A_A';
  private activeSlipInfo: SlipInfo | null = null;

  // 撮影データ一時バッファ (imageId と Blob、チェックサムなどのメタ情報)
  private capturedImages: Array<{
    imageId: string;
    blob: Blob;
    width: number;
    height: number;
    checksum: string;
    sequence: number;
    previewUrl: string;
  }> = [];

  // 再撮影用のインデックス管理 (null でない場合は再撮影中)
  private retakeIndex: number | null = null;
  private isProcessingImage: boolean = false;
  private qrScanIntervalId: number | null = null;

  // DOM要素
  private elBaseInfo!: HTMLElement;
  private elStepInput!: HTMLElement;
  private elStepShooting!: HTMLElement;
  private elStepPreview!: HTMLElement;
  private elSlipInput!: HTMLInputElement;
  private elVideoElement!: HTMLVideoElement;
  private elShutterBtn!: HTMLButtonElement;
  private elImageCountBadge!: HTMLElement;
  private elPreviewContainer!: HTMLElement;
  private elUnsentCountBadge!: HTMLElement;
  
  private btnManualSubmit!: HTMLButtonElement;
  private btnStartQr!: HTMLButtonElement;
  private btnStopQr!: HTMLButtonElement;
  private btnGoToPreview!: HTMLButtonElement;
  private btnSaveDraft!: HTMLButtonElement;
  private btnCancelDraft!: HTMLButtonElement;

  constructor() {
    this.db = new ReturnSnapDatabase();
  }

  /**
   * アプリを初期化し、イベントリスナーを登録します。
   */
  public async init(): Promise<void> {
    await this.db.open();
    
    // settings ストアから設定を読み込み
    const baseCodeSetting = await this.db.get('settings', 'BaseCode');
    const baseNameSetting = await this.db.get('settings', 'BaseName');
    const deviceNameSetting = await this.db.get('settings', 'DeviceName');

    if (baseCodeSetting) this.currentBaseCode = baseCodeSetting.value;
    if (baseNameSetting) this.currentBaseName = baseNameSetting.value;
    if (deviceNameSetting) this.currentDeviceName = deviceNameSetting.value;

    // 初回のみDBにデフォルト設定を書き込み（デバッグ用）
    if (!baseCodeSetting) {
      await this.db.put('settings', { key: 'BaseCode', value: this.currentBaseCode });
      await this.db.put('settings', { key: 'BaseName', value: this.currentBaseName });
      await this.db.put('settings', { key: 'DeviceName', value: this.currentDeviceName });
    }

    this.bindDomElements();
    this.registerEventListeners();
    await this.updateUnsentCountBadge();
    this.renderState();
  }

  private bindDomElements(): void {
    this.elBaseInfo = document.getElementById('baseInfo')!;
    this.elStepInput = document.getElementById('stepInput')!;
    this.elStepShooting = document.getElementById('stepShooting')!;
    this.elStepPreview = document.getElementById('stepPreview')!;
    
    this.elSlipInput = document.getElementById('slipInput') as HTMLInputElement;
    this.elVideoElement = document.getElementById('video') as HTMLVideoElement;
    this.elShutterBtn = document.getElementById('btnShutter') as HTMLButtonElement;
    this.elImageCountBadge = document.getElementById('imageCountBadge')!;
    this.elPreviewContainer = document.getElementById('previewContainer')!;
    this.elUnsentCountBadge = document.getElementById('unsentCountBadge')!;
    
    this.btnManualSubmit = document.getElementById('btnManualSubmit') as HTMLButtonElement;
    this.btnStartQr = document.getElementById('btnStartQr') as HTMLButtonElement;
    this.btnStopQr = document.getElementById('btnStopQr') as HTMLButtonElement;
    this.btnGoToPreview = document.getElementById('btnGoToPreview') as HTMLButtonElement;
    this.btnSaveDraft = document.getElementById('btnSaveDraft') as HTMLButtonElement;
    this.btnCancelDraft = document.getElementById('btnCancelDraft') as HTMLButtonElement;

    // 拠点情報を上部に表示
    this.elBaseInfo.textContent = `[${this.currentBaseName}] [${this.currentDeviceName}]`;
    this.camera = new CameraController(this.elVideoElement);
  }

  private registerEventListeners(): void {
    // 手入力の確定
    this.btnManualSubmit.addEventListener('click', () => this.handleManualSubmit());
    
    // QRコードスキャンの開始と停止
    this.btnStartQr.addEventListener('click', () => this.startQrScanning());
    this.btnStopQr.addEventListener('click', () => this.stopQrScanning());

    // シャッター撮影
    this.elShutterBtn.addEventListener('click', () => this.handleCapture());

    // プレビュー確認画面へ遷移
    this.btnGoToPreview.addEventListener('click', () => this.transitionTo('PREVIEW'));

    // 保存とキャンセル
    this.btnSaveDraft.addEventListener('click', () => this.handleSaveDraft());
    this.btnCancelDraft.addEventListener('click', () => this.handleCancelDraft());
  }

  /**
   * 手入力伝票番号の確定処理
   */
  private handleManualSubmit(): void {
    const rawInput = this.elSlipInput.value.trim();
    const info = SlipValidator.validateManualInput(rawInput, this.currentBaseCode);

    if (info.isValid) {
      this.activeSlipInfo = info;
      alert(`伝票番号を確定しました: ${info.slipCode}`);
      this.transitionTo('SHOOTING');
    } else {
      alert(info.errorMessage || '伝票番号が正しくありません');
    }
  }

  /**
   * QRコードスキャンカメラの起動とループ処理
   */
  private async startQrScanning(): Promise<void> {
    try {
      this.btnStartQr.style.display = 'none';
      this.btnStopQr.style.display = 'inline-block';
      this.elSlipInput.disabled = true;
      this.btnManualSubmit.disabled = true;

      await this.camera!.start();
      
      // QRコードを周期的にデコードスキャンするループを開始 (300ms間隔)
      this.qrScanIntervalId = window.setInterval(() => {
        if (!this.camera) return;
        const tempCanvas = this.camera.capture();
        const decodedText = QrScanner.scan(tempCanvas);

        if (decodedText) {
          const info = SlipValidator.validateQr(decodedText);
          if (info.isValid) {
            this.stopQrScanning();
            this.activeSlipInfo = info;
            alert(`QRコードを検知しました:\n伝票番号: ${info.slipCode}`);
            this.transitionTo('SHOOTING');
          }
        }
      }, 300);

    } catch (err: any) {
      alert(err.message || 'QRカメラの起動に失敗しました。');
      this.stopQrScanning();
    }
  }

  /**
   * QRコードスキャンの停止処理
   */
  private stopQrScanning(): void {
    if (this.qrScanIntervalId) {
      window.clearInterval(this.qrScanIntervalId);
      this.qrScanIntervalId = null;
    }
    if (this.camera) {
      this.camera.stop();
    }
    this.btnStartQr.style.display = 'inline-block';
    this.btnStopQr.style.display = 'none';
    this.elSlipInput.disabled = false;
    this.btnManualSubmit.disabled = false;
  }

  /**
   * 写真撮影と圧縮処理
   */
  private async handleCapture(): Promise<void> {
    if (!this.camera || this.isProcessingImage) return;

    if (this.capturedImages.length >= 30 && this.retakeIndex === null) {
      alert('1回に撮影できる写真は最大30枚までです。');
      return;
    }

    this.isProcessingImage = true;
    this.elShutterBtn.disabled = true;
    this.elShutterBtn.textContent = '保存中...';

    try {
      const captureCanvas = this.camera.capture();
      const processed = await ImageProcessor.process(captureCanvas);
      const checksum = await ImageProcessor.calculateChecksum(processed.blob);

      // 一時プレビューURLを生成
      const previewUrl = URL.createObjectURL(processed.blob);

      if (this.retakeIndex !== null) {
        // 再撮影・上書き処理
        const oldImage = this.capturedImages[this.retakeIndex];
        URL.revokeObjectURL(oldImage.previewUrl); // メモリ解放
        
        this.capturedImages[this.retakeIndex] = {
          imageId: `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          blob: processed.blob,
          width: processed.width,
          height: processed.height,
          checksum: checksum,
          sequence: this.retakeIndex + 1,
          previewUrl: previewUrl
        };
        alert('写真を差し替えました。');
        this.retakeIndex = null;
        this.transitionTo('PREVIEW');
      } else {
        // 新規追加
        const nextSequence = this.capturedImages.length + 1;
        this.capturedImages.push({
          imageId: `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          blob: processed.blob,
          width: processed.width,
          height: processed.height,
          checksum: checksum,
          sequence: nextSequence,
          previewUrl: previewUrl
        });
      }

      this.updateShootingBadge();
    } catch (err: any) {
      alert(`写真の保存に失敗しました: ${err.message}`);
    } finally {
      this.isProcessingImage = false;
      this.elShutterBtn.disabled = false;
      this.elShutterBtn.textContent = this.retakeIndex !== null ? '📷 撮り直す' : '📷 撮影する';
    }
  }

  /**
   * プレビュー画面の生成
   */
  private renderPreviewList(): void {
    this.elPreviewContainer.innerHTML = '';

    if (this.capturedImages.length === 0) {
      this.elPreviewContainer.innerHTML = '<p style="text-align: center; color: #666;">撮影された写真はありません</p>';
      this.btnSaveDraft.disabled = true;
      return;
    }

    this.btnSaveDraft.disabled = false;

    this.capturedImages.forEach((img, index) => {
      const item = document.createElement('div');
      item.style.position = 'relative';
      item.style.display = 'inline-block';
      item.style.margin = '8px';
      
      const imgEl = document.createElement('img');
      imgEl.src = img.previewUrl;
      imgEl.style.width = '120px';
      imgEl.style.height = '90px';
      imgEl.style.objectFit = 'cover';
      imgEl.style.borderRadius = '4px';
      imgEl.style.border = '1px solid #ccc';

      const seqBadge = document.createElement('span');
      seqBadge.textContent = img.sequence.toString();
      seqBadge.style.position = 'absolute';
      seqBadge.style.top = '4px';
      seqBadge.style.left = '4px';
      seqBadge.style.background = '#1a237e';
      seqBadge.style.color = 'white';
      seqBadge.style.padding = '2px 6px';
      seqBadge.style.borderRadius = '50%';
      seqBadge.style.fontSize = '12px';

      // 削除ボタン
      const deleteBtn = document.createElement('button');
      deleteBtn.textContent = '✕ 削除';
      deleteBtn.style.position = 'absolute';
      deleteBtn.style.bottom = '4px';
      deleteBtn.style.left = '4px';
      deleteBtn.style.background = 'red';
      deleteBtn.style.color = 'white';
      deleteBtn.style.border = 'none';
      deleteBtn.style.borderRadius = '4px';
      deleteBtn.style.cursor = 'pointer';
      deleteBtn.style.fontSize = '11px';
      deleteBtn.addEventListener('click', () => this.handleDeleteImage(index));

      // 撮り直しボタン
      const retakeBtn = document.createElement('button');
      retakeBtn.textContent = '↻ 撮直';
      retakeBtn.style.position = 'absolute';
      retakeBtn.style.bottom = '4px';
      retakeBtn.style.right = '4px';
      retakeBtn.style.background = '#ffd600';
      retakeBtn.style.color = 'black';
      retakeBtn.style.border = 'none';
      retakeBtn.style.borderRadius = '4px';
      retakeBtn.style.cursor = 'pointer';
      retakeBtn.style.fontSize = '11px';
      retakeBtn.addEventListener('click', () => this.handleRetakeImage(index));

      item.appendChild(imgEl);
      item.appendChild(seqBadge);
      item.appendChild(deleteBtn);
      item.appendChild(retakeBtn);
      
      this.elPreviewContainer.appendChild(item);
    });
  }

  private handleDeleteImage(index: number): void {
    if (!confirm('この写真を削除してよろしいですか？')) return;
    
    const removed = this.capturedImages.splice(index, 1)[0];
    URL.revokeObjectURL(removed.previewUrl); // メモリ解放

    // 連番(sequence)を再割り当て
    this.capturedImages.forEach((img, i) => {
      img.sequence = i + 1;
    });

    this.renderPreviewList();
    this.updateShootingBadge();
  }

  private async handleRetakeImage(index: number): Promise<void> {
    this.retakeIndex = index;
    this.elShutterBtn.textContent = '📷 撮り直す';
    this.transitionTo('SHOOTING');
  }

  /**
   * IndexedDBへの下書き保存
   */
  private async handleSaveDraft(): Promise<void> {
    if (!this.activeSlipInfo || this.capturedImages.length === 0) return;

    this.btnSaveDraft.disabled = true;
    this.btnSaveDraft.textContent = '保存中...';

    const draftId = `draft-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const totalBytes = this.capturedImages.reduce((sum, img) => sum + img.blob.size, 0);

    try {
      // 1. drafts テーブルにレコード保存
      const draftRecord = {
        draftId: draftId,
        appType: 'COUNT',
        uploadType: 'COUNT',
        slipCode: this.activeSlipInfo.slipCode,
        slipBaseCode: this.activeSlipInfo.slipBaseCode,
        inputMethod: this.activeSlipInfo.branchCode ? 'QR' : 'MANUAL',
        qrRawText: this.activeSlipInfo.branchCode ? `code=${this.activeSlipInfo.slipCode}` : '',
        baseCode: this.currentBaseCode,
        baseMismatch: this.activeSlipInfo.slipBaseCode !== this.currentBaseCode,
        grade: '', // 員数は評価なし
        status: 'READY', // 送信準備完了
        createdAt: Date.now(),
        updatedAt: Date.now(),
        workDate: new Date().toISOString().split('T')[0],
        totalBytes: totalBytes
      };

      await this.db.put('drafts', draftRecord);

      // 2. images テーブルに各画像Blobを保存
      for (const img of this.capturedImages) {
        const imageRecord = {
          imageId: img.imageId,
          draftId: draftId,
          category: 'COUNT',
          sequence: img.sequence,
          capturedAt: Date.now(),
          blob: img.blob,
          mimeType: img.blob.type,
          width: img.width,
          height: img.height,
          byteSize: img.blob.size,
          checksum: img.checksum,
          uploadStatus: 'PENDING',
          driveFileId: '',
          lastError: ''
        };
        await this.db.put('images', imageRecord);
      }

      alert('端末へ正常に保存しました。\nオンラインの環境に接続後、アップロードを行ってください。');
      
      // バッファのクリア
      this.clearSessionBuffer();
      this.transitionTo('INPUT');
      await this.updateUnsentCountBadge();

    } catch (err: any) {
      alert(`保存中にエラーが発生しました: ${err.message}`);
      this.btnSaveDraft.disabled = false;
      this.btnSaveDraft.textContent = '保存する';
    }
  }

  private handleCancelDraft(): void {
    if (!confirm('現在の入力および撮影した写真をすべて破棄してよろしいですか？')) return;
    this.clearSessionBuffer();
    this.transitionTo('INPUT');
  }

  private clearSessionBuffer(): void {
    this.capturedImages.forEach((img) => {
      URL.revokeObjectURL(img.previewUrl);
    });
    this.capturedImages = [];
    this.activeSlipInfo = null;
    this.retakeIndex = null;
    this.elSlipInput.value = '';
    this.updateShootingBadge();
  }

  /**
   * 画面状態の描画制御
   */
  private transitionTo(step: 'INPUT' | 'SHOOTING' | 'PREVIEW'): void {
    this.currentStep = step;
    
    // QRスキャンのクリーンアップ
    if (step !== 'INPUT') {
      this.stopQrScanning();
    }

    // カメラストリームのクリーンアップ
    if (step !== 'SHOOTING' && this.camera) {
      this.camera.stop();
    }

    this.renderState();
  }

  private renderState(): void {
    // 画面ブロックの表示・非表示
    this.elStepInput.style.display = this.currentStep === 'INPUT' ? 'block' : 'none';
    this.elStepShooting.style.display = this.currentStep === 'SHOOTING' ? 'block' : 'none';
    this.elStepPreview.style.display = this.currentStep === 'PREVIEW' ? 'block' : 'none';

    // 各状態に応じた初期化処理
    if (this.currentStep === 'SHOOTING') {
      this.btnGoToPreview.disabled = this.capturedImages.length === 0;
      this.camera!.start().catch((err) => {
        alert(err.message);
        this.transitionTo('INPUT');
      });
      this.elShutterBtn.textContent = this.retakeIndex !== null ? '📷 撮り直す' : '📷 撮影する';
    } else if (this.currentStep === 'PREVIEW') {
      this.renderPreviewList();
    }
  }

  private updateShootingBadge(): void {
    this.elImageCountBadge.textContent = `${this.capturedImages.length} 枚`;
    this.btnGoToPreview.disabled = this.capturedImages.length === 0;
  }

  /**
   * 未送信キュー件数バッジの更新
   */
  private async updateUnsentCountBadge(): Promise<void> {
    try {
      const drafts = await this.db.getAll('drafts');
      // status が 'READY' または 'PARTIAL' のものを未送信件数とする
      const unsent = drafts.filter((d: any) => d.status === 'READY' || d.status === 'PARTIAL');
      
      if (unsent.length > 0) {
        this.elUnsentCountBadge.style.display = 'inline-block';
        this.elUnsentCountBadge.textContent = `${unsent.length} 件未送信`;
      } else {
        this.elUnsentCountBadge.style.display = 'none';
      }
    } catch (err) {
      console.warn('Failed to retrieve unsent count:', err);
    }
  }
}
