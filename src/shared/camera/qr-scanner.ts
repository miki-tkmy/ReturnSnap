import jsQR from 'jsqr';

export class QrScanner {
  /**
   * 与えられたCanvasの映像データからQRコードをスキャン・デコードします。
   * QRコードが検出された場合はその文字列データ（URL等）を返し、検出されなかった場合は null を返します。
   */
  public static scan(canvas: HTMLCanvasElement): string | null {
    const ctx = canvas.getContext('2d');
    if (!ctx) {
      return null;
    }

    try {
      const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
      const code = jsQR(imageData.data, imageData.width, imageData.height, {
        inversionAttempts: 'dontInvert'
      });

      if (code && code.data) {
        return code.data;
      }
    } catch (err) {
      console.warn('jsQR scan process warning:', err);
    }
    
    return null;
  }
}
