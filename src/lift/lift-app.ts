import { ReturnSnapDatabase } from '../shared/db/database';
import { SlipValidator, SlipInfo } from '../shared/validation/slip-validation';
import { CameraController } from '../shared/camera/camera-controller';
import { ImageProcessor } from '../shared/camera/image-processor';
import { QrScanner } from '../shared/camera/qr-scanner';

export type PhotoCategory = 'RETURN_MATERIAL' | 'LOAD_WHOLE' | 'LOAD_DETAIL';

export class ReturnSnapLiftApp {
  private db: ReturnSnapDatabase;
  private camera: CameraController | null = null;

  // アプリの状態
  private currentStep: 'INPUT' | 'SHOOTING' | 'PREVIEW' = 'INPUT';
  private currentBaseCode: string = 'LW';
  private currentBaseName: string = 'Lab.West';
  private currentDeviceName: string = '協力会社A_A';
  private activeSlipInfo: SlipInfo | null = null;

  // リフトアプリ専用の撮影バッファ
  private capturedImages: Array<{
    imageId: string;
    blob: Blob;
    width: number;
    height: number;
    checksum: string;
    sequence: number;
    category: PhotoCategory;
    previewUrl: string;
  }> = [];

  // 現在選択されている撮影用カテゴリ
  private activeCategory: PhotoCategory = 'RETURN_MATERIAL';
  private selectedGrade: string = ''; // A, B, C, D (必須)

  // 各カテゴリの枚数上限定義
  private readonly CATEGORY_LIMITS: Record<PhotoCategory, number> = {
    RETURN_MATERIAL: 10,
    LOAD_WHOLE: 2,
    LOAD_DETAIL: 10
  };

  // 再撮影管理
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
  private elPreviewContainer!: HTMLElement;
  private elUnsentCountBadge!: HTMLElement;

  private elCategoryTabs!: NodeListOf<HTMLElement>;
  private elImageCountBadge!: HTMLElement;
  private elGradeRadios!: NodeListOf<HTMLInputElement>;
  
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
   * アプリを初期設定し起動します。
   */
  public async init(): Promise<void> {
    await this.db.open();
    
    // 設定の読み込み
    const baseCodeSetting = await this.db.get('settings', 'BaseCode');
    const baseNameSetting = await this.db.get('settings', 'BaseName');
    const deviceNameSetting = await this.db.get('settings', 'DeviceName');

    if (baseCodeSetting) this.currentBaseCode = baseCodeSetting.value;
    if (baseNameSetting) this.currentBaseName = baseNameSetting.value;
    if (deviceNameSetting) this.currentDeviceName = deviceNameSetting.value;

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
    this.elPreviewContainer = document.getElementById('previewContainer')!;
    this.elUnsentCountBadge = document.getElementById('unsentCountBadge')!;
    this.elImageCountBadge = document.getElementById('imageCountBadge')!;
    
    // カテゴリ切り替えタブ (ラジオボタンなど)
    this.elCategoryTabs = document.getElementsByName('photoCategory') as NodeListOf<HTMLInputElement>;
    // グレード評価ラジオボタン
    this.elGradeRadios = document.getElementsByName('gradeSelection') as NodeListOf<HTMLInputElement>;

    this.btnManualSubmit = document.getElementById('btnManualSubmit') as HTMLButtonElement;
    this.btnStartQr = document.getElementById('btnStartQr') as HTMLButtonElement;
    this.btnStopQr = document.getElementById('btnStopQr') as HTMLButtonElement;
    this.btnGoToPreview = document.getElementById('btnGoToPreview') as HTMLButtonElement;
    this.btnSaveDraft = document.getElementById('btnSaveDraft') as HTMLButtonElement;
    this.btnCancelDraft = document.getElementById('btnCancelDraft') as HTMLButtonElement;

    this.elBaseInfo.textContent = `[${this.currentBaseName}] [${this.currentDeviceName}]`;
    this.camera = new CameraController(this.elVideoElement);
  }

  private registerEventListeners(): void {
    this.btnManualSubmit.addEventListener('click', () => this.handleManualSubmit());
    
    this.btnStartQr.addEventListener('click', () => this.startQrScanning());
    this.btnStopQr.addEventListener('click', () => this.stopQrScanning());

    this.elShutterBtn.addEventListener('click', () => this.handleCapture());
    this.btnGoToPreview.addEventListener('click', () => this.transitionTo('PREVIEW'));

    this.btnSaveDraft.addEventListener('click', () => this.handleSaveDraft());
    this.btnCancelDraft.addEventListener('click', () => this.handleCancelDraft());

    // カテゴリ切り替えイベントの登録
    this.elCategoryTabs.forEach((tab) => {
      tab.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          this.activeCategory = target.value as PhotoCategory;
          this.updateShootingBadge();
        }
      });
    });

    // グレード選択イベントの登録
    this.elGradeRadios.forEach((radio) => {
      radio.addEventListener('change', (e) => {
        const target = e.target as HTMLInputElement;
        if (target.checked) {
          this.selectedGrade = target.value;
        }
      });
    });
  }

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

  private async startQrScanning(): Promise<void> {
    try {
      this.btnStartQr.style.display = 'none';
      this.btnStopQr.style.display = 'inline-block';
      this.elSlipInput.disabled = true;
      this.btnManualSubmit.disabled = true;

      await this.camera!.start();
      
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
   * 写真撮影処理
   */
  private async handleCapture(): Promise<void> {
    if (!this.camera || this.isProcessingImage) return;

    // 現在のカテゴリの枚数をカウント
    const categoryCount = this.capturedImages.filter((img) => img.category === this.activeCategory).length;
    const limit = this.CATEGORY_LIMITS[this.activeCategory];

    // 再撮影時以外の枚数制限チェック
    if (this.retakeIndex === null && categoryCount >= limit) {
      alert(`このカテゴリ(${this.getCategoryLabel(this.activeCategory)})の撮影枚数は最大 ${limit} 枚までです。`);
      return;
    }

    this.isProcessingImage = true;
    this.elShutterBtn.disabled = true;
    this.elShutterBtn.textContent = '保存中...';

    try {
      const captureCanvas = this.camera.capture();
      const processed = await ImageProcessor.process(captureCanvas);
      const checksum = await ImageProcessor.calculateChecksum(processed.blob);
      const previewUrl = URL.createObjectURL(processed.blob);

      if (this.retakeIndex !== null) {
        // 再撮影処理
        const oldImage = this.capturedImages[this.retakeIndex];
        URL.revokeObjectURL(oldImage.previewUrl);
        
        this.capturedImages[this.retakeIndex] = {
          imageId: `img-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
          blob: processed.blob,
          width: processed.width,
          height: processed.height,
          checksum: checksum,
          sequence: oldImage.sequence,
          category: oldImage.category, // 元のカテゴリを引き継ぐ
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
          category: this.activeCategory,
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
   * プレビューギャラリーの表示
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

      // カテゴリラベルと連番バッジ
      const label = document.createElement('span');
      label.textContent = `${img.sequence}:${this.getCategoryShortLabel(img.category)}`;
      label.style.position = 'absolute';
      label.style.top = '4px';
      label.style.left = '4px';
      label.style.background = '#1a237e';
      label.style.color = 'white';
      label.style.padding = '2px 6px';
      label.style.borderRadius = '4px';
      label.style.fontSize = '10px';
      label.style.fontWeight = 'bold';

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
      item.appendChild(label);
      item.appendChild(deleteBtn);
      item.appendChild(retakeBtn);
      
      this.elPreviewContainer.appendChild(item);
    });
  }

  private handleDeleteImage(index: number): void {
    if (!confirm('この写真を削除してよろしいですか？')) return;
    
    const removed = this.capturedImages.splice(index, 1)[0];
    URL.revokeObjectURL(removed.previewUrl);

    // 全体の連番(sequence)を再割り当て
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
   * IndexedDBへの保存 (グレード判定必須)
   */
  private async handleSaveDraft(): Promise<void> {
    if (!this.activeSlipInfo || this.capturedImages.length === 0) return;

    // グレード判定が選択されているかチェック
    if (!this.selectedGrade) {
      alert('返納材の評価グレード（A〜D）を選択してください。');
      return;
    }

    this.btnSaveDraft.disabled = true;
    this.btnSaveDraft.textContent = '保存中...';

    const draftId = `draft-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`;
    const totalBytes = this.capturedImages.reduce((sum, img) => sum + img.blob.size, 0);

    try {
      // 1. drafts テーブル保存 (appType: 'LIFT', gradeをセット)
      const draftRecord = {
        draftId: draftId,
        appType: 'LIFT',
        uploadType: 'LIFT',
        slipCode: this.activeSlipInfo.slipCode,
        slipBaseCode: this.activeSlipInfo.slipBaseCode,
        inputMethod: this.activeSlipInfo.branchCode ? 'QR' : 'MANUAL',
        qrRawText: this.activeSlipInfo.branchCode ? `code=${this.activeSlipInfo.slipCode}` : '',
        baseCode: this.currentBaseCode,
        baseMismatch: this.activeSlipInfo.slipBaseCode !== this.currentBaseCode,
        grade: this.selectedGrade, // グレード判定をセット
        status: 'READY',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        workDate: new Date().toISOString().split('T')[0],
        totalBytes: totalBytes
      };

      await this.db.put('drafts', draftRecord);

      // 2. images テーブルに各画像Blobを保存 (カテゴリをセット)
      for (const img of this.capturedImages) {
        const imageRecord = {
          imageId: img.imageId,
          draftId: draftId,
          category: img.category, // カテゴリを設定
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
    this.selectedGrade = '';
    this.elSlipInput.value = '';

    // ラジオボタンのクリア
    this.elGradeRadios.forEach((r) => {
      r.checked = false;
    });

    this.updateShootingBadge();
  }

  private transitionTo(step: 'INPUT' | 'SHOOTING' | 'PREVIEW'): void {
    this.currentStep = step;
    
    if (step !== 'INPUT') {
      this.stopQrScanning();
    }

    if (step !== 'SHOOTING' && this.camera) {
      this.camera.stop();
    }

    this.renderState();
  }

  private renderState(): void {
    this.elStepInput.style.display = this.currentStep === 'INPUT' ? 'block' : 'none';
    this.elStepShooting.style.display = this.currentStep === 'SHOOTING' ? 'block' : 'none';
    this.elStepPreview.style.display = this.currentStep === 'PREVIEW' ? 'block' : 'none';

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
    const totalCount = this.capturedImages.length;
    const catCount = this.capturedImages.filter((img) => img.category === this.activeCategory).length;
    const limit = this.CATEGORY_LIMITS[this.activeCategory];

    // オーバーレイには、現在のカテゴリの撮影枚数/上限と全体の枚数を表示
    this.elImageCountBadge.textContent = `${this.getCategoryLabel(this.activeCategory)}: ${catCount}/${limit}枚 (全${totalCount}枚)`;
    this.btnGoToPreview.disabled = totalCount === 0;
  }

  private async updateUnsentCountBadge(): Promise<void> {
    try {
      const drafts = await this.db.getAll('drafts');
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

  private getCategoryLabel(cat: PhotoCategory): string {
    switch (cat) {
      case 'RETURN_MATERIAL': return '返納材';
      case 'LOAD_WHOLE': return '積込全体';
      case 'LOAD_DETAIL': return '積込詳細';
    }
  }

  private getCategoryShortLabel(cat: PhotoCategory): string {
    switch (cat) {
      case 'RETURN_MATERIAL': return '返納';
      case 'LOAD_WHOLE': return '全体';
      case 'LOAD_DETAIL': return '詳細';
    }
  }
}
