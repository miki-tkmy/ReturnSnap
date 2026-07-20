export class ImageProcessor {
  private static readonly MAX_LONG_SIDE = 2000;
  private static readonly JPEG_QUALITY = 0.9;

  /**
   * キャプチャされたCanvasから画像を読み込み、長辺を最大2000pxに維持して縮小し、
   * JPEG品質0.9の圧縮Blobデータに変換します。
   */
  public static process(canvas: HTMLCanvasElement): Promise<{ blob: Blob; width: number; height: number }> {
    return new Promise((resolve, reject) => {
      let width = canvas.width;
      let height = canvas.height;

      // 長辺2000pxを超える場合に縮小計算
      if (width > this.MAX_LONG_SIDE || height > this.MAX_LONG_SIDE) {
        if (width > height) {
          height = Math.round((height * this.MAX_LONG_SIDE) / width);
          width = this.MAX_LONG_SIDE;
        } else {
          width = Math.round((width * this.MAX_LONG_SIDE) / height);
          height = this.MAX_LONG_SIDE;
        }
      }

      // 縮小描画用の別Canvasを作成
      const resizeCanvas = document.createElement('canvas');
      resizeCanvas.width = width;
      resizeCanvas.height = height;

      const ctx = resizeCanvas.getContext('2d');
      if (!ctx) {
        reject(new Error('Canvas 2D context initialization failed during image processing'));
        return;
      }

      // 画質を保ちながらリサイズ描画
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(canvas, 0, 0, width, height);

      // JPEG品質0.9でエンコード
      resizeCanvas.toBlob(
        (blob) => {
          if (blob) {
            resolve({ blob, width, height });
          } else {
            reject(new Error('Failed to generate image/jpeg blob from canvas'));
          }
        },
        'image/jpeg',
        this.JPEG_QUALITY
      );
    });
  }

  /**
   * Web Crypto APIを使用して、画像データ(Blob)のSHA-256ハッシュチェックサムを生成します。
   */
  public static async calculateChecksum(blob: Blob): Promise<string> {
    const buffer = await blob.arrayBuffer();
    const hashBuffer = await crypto.subtle.digest('SHA-256', buffer);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map((b) => b.toString(16).padStart(2, '0')).join('');
  }
}
