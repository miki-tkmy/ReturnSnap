export class CameraController {
  private stream: MediaStream | null = null;
  private videoElement: HTMLVideoElement;

  constructor(videoElement: HTMLVideoElement) {
    this.videoElement = videoElement;
  }

  /**
   * 背面カメラを起動してビデオストリーミングを開始します。
   */
  public async start(): Promise<void> {
    if (this.stream) {
      this.stop();
    }

    // 背面カメラ優先の制約を設定
    const constraints: MediaStreamConstraints = {
      video: {
        facingMode: { ideal: 'environment' },
        width: { ideal: 1920 },
        height: { ideal: 1080 }
      },
      audio: false
    };

    try {
      this.stream = await navigator.mediaDevices.getUserMedia(constraints);
      this.videoElement.srcObject = this.stream;
      this.videoElement.setAttribute('playsinline', 'true'); // iOS Safariでの全画面起動防止
      this.videoElement.muted = true; // iOSポリシー対応
      await this.videoElement.play();
    } catch (err: any) {
      console.warn('Camera environmental stream acquisition failed, trying fallback:', err);
      // フォールバック: 制約を緩めて任意のビデオソースで起動を試みます
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: true,
          audio: false
        });
        this.videoElement.srcObject = this.stream;
        this.videoElement.setAttribute('playsinline', 'true');
        this.videoElement.muted = true;
        await this.videoElement.play();
      } catch (fallbackErr) {
        console.error('All camera fallback initialization failed:', fallbackErr);
        throw new Error('カメラが検出されません。またはブラウザのカメラ権限が拒否されています。');
      }
    }
  }

  /**
   * 現在のビデオフレームをキャプチャし、Canvasとして返します。
   */
  public capture(): HTMLCanvasElement {
    const video = this.videoElement;
    const canvas = document.createElement('canvas');
    
    // ビデオストリームの実際の解像度をキャプチャ幅に指定
    canvas.width = video.videoWidth || 640;
    canvas.height = video.videoHeight || 480;

    const ctx = canvas.getContext('2d');
    if (!ctx) {
      throw new Error('Canvas 2D context acquisition failed');
    }

    // 映像をCanvas上に描画
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    return canvas;
  }

  /**
   * カメラストリーミングを停止し、デバイスの占有を解除します。
   */
  public stop(): void {
    if (this.stream) {
      this.stream.getTracks().forEach((track) => {
        track.stop();
      });
      this.stream = null;
    }
    this.videoElement.srcObject = null;
  }
}
