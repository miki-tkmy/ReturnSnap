export interface SlipInfo {
  isValid: boolean;
  slipCode: string; // 最終整形値 (例: DLW024141-00 または DLW024141)
  slipBaseCode: string; // 伝票から抽出されたBaseコード (例: LW)
  serialNumber: string; // 数字6桁部分 (例: 024141)
  branchCode?: string; // 枝番 (例: 00)
  errorMessage?: string;
}

export class SlipValidator {
  // QRコードから抽出するための正規表現 (例: code=DLW024141-00)
  private static qrRegex = /code=(D[A-Z0-9]{2}[0-9]{6}-[0-9]{2})/;
  // 抽出された値そのものの検証用 (例: DLW024141-00)
  private static slipFormatRegex = /^D([A-Z0-9]{2})([0-9]{6})-([0-9]{2})$/;

  /**
   * QRコードで読み取った生データから伝票番号を抽出・検証します。
   */
  public static validateQr(qrRawText: string): SlipInfo {
    const cleanText = qrRawText.trim();
    
    // URLからcodeパラメータ部分を抽出
    const match = cleanText.match(this.qrRegex);
    if (!match || !match[1]) {
      // URLではなく直接 "DLW024141-00" が入ってきた場合も許容する
      const directMatch = cleanText.match(this.slipFormatRegex);
      if (directMatch) {
        return {
          isValid: true,
          slipCode: cleanText,
          slipBaseCode: directMatch[1],
          serialNumber: directMatch[2],
          branchCode: directMatch[3]
        };
      }
      return { isValid: false, slipCode: '', slipBaseCode: '', serialNumber: '', errorMessage: '伝票QRコードの形式が正しくありません' };
    }

    const slipCode = match[1];
    const formatMatch = slipCode.match(this.slipFormatRegex);
    if (!formatMatch) {
      return { isValid: false, slipCode: '', slipBaseCode: '', serialNumber: '', errorMessage: '伝票コードの形式が不正です' };
    }

    return {
      isValid: true,
      slipCode: slipCode,
      slipBaseCode: formatMatch[1],
      serialNumber: formatMatch[2],
      branchCode: formatMatch[3]
    };
  }

  /**
   * 6桁手入力を検証し、端末Baseコードを付与して整形します。
   */
  public static validateManualInput(inputText: string, deviceBaseCode: string): SlipInfo {
    // 1. 全角数字を半角数字に変換、空白を削除
    let cleanText = inputText.replace(/[０-９]/g, (s) => {
      return String.fromCharCode(s.charCodeAt(0) - 0xFEE0);
    }).replace(/\s+/g, '');

    // 2. 数字6桁のみであることを検証
    const digitRegex = /^[0-9]{6}$/;
    if (!digitRegex.test(cleanText)) {
      return { isValid: false, slipCode: '', slipBaseCode: '', serialNumber: '', errorMessage: '伝票番号は数字6桁で入力してください' };
    }

    // 3. 端末Baseコード（例: "LW" または "DLW" 等）から大文字2文字を取得
    // もしすでに "DLW" のようにDが入っている場合は後ろの2文字を使う
    let base = deviceBaseCode.toUpperCase().trim();
    if (base.startsWith('D') && base.length === 3) {
      base = base.substring(1);
    }
    if (base.length !== 2) {
      return { isValid: false, slipCode: '', slipBaseCode: '', serialNumber: '', errorMessage: '端末の拠点(Base)設定が不正です' };
    }

    // 最終伝票番号 DLW024141 形式を作成 (手入力時は枝番なし)
    const slipCode = `D${base}${cleanText}`;

    return {
      isValid: true,
      slipCode: slipCode,
      slipBaseCode: base,
      serialNumber: cleanText
    };
  }
}
