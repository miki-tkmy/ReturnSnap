import { GasRequest, GasResponse } from './request-types';

export class GasBridgeClient {
  private iframe: HTMLIFrameElement | null = null;
  private bridgeUrl: string;
  private bridgeOrigin: string;
  private actualBridgeOrigin: string | null = null; // リダイレクト後の実際のオリジン
  private actualBridgeSource: MessageEventSource | null = null; // リダイレクト後の実際のウィンドウオブジェクト (window.top への送信元)
  private pendingRequests: Map<
    string,
    {
      resolve: (value: GasResponse) => void;
      reject: (reason: any) => void;
      timer: number;
    }
  > = new Map();

  constructor(bridgeUrl: string) {
    this.bridgeUrl = bridgeUrl;
    try {
      const url = new URL(bridgeUrl);
      this.bridgeOrigin = url.origin;
    } catch {
      this.bridgeOrigin = 'https://script.google.com';
    }
  }

  /**
   * ブリッジ用のiframeを初期化し、子フレームからbridgeReadyメッセージが届くのを待ちます。
   */
  public init(container: HTMLElement = document.body): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.iframe) {
        resolve();
        return;
      }

      // メッセージハンドラを先に登録（bridgeReadyをキャッチするため）
      const readyHandler = (event: MessageEvent) => {
        // GASからのオリジン検証（セキュリティ）
        const isValidOrigin = 
          event.origin === this.bridgeOrigin || 
          event.origin.endsWith('.googleusercontent.com') ||
          event.origin === 'https://script.googleusercontent.com';

        if (!isValidOrigin) return;

        if (event.data && event.data.action === 'bridgeReady') {
          this.actualBridgeOrigin = event.origin;
          this.actualBridgeSource = event.source; // 内側の実際のウィンドウオブジェクトを保持
          window.clearTimeout(loadTimeout);
          window.removeEventListener('message', readyHandler);
          
          // 通常のメッセージリッスンを開始
          window.addEventListener('message', this.handleMessage.bind(this));
          resolve();
        }
      };

      window.addEventListener('message', readyHandler);

      this.iframe = document.createElement('iframe');
      this.iframe.style.display = 'none';

      // 現在のフロントエンドのオリジンをクエリパラメータとして子フレームに渡します
      const currentOrigin = window.location.origin;
      const urlSeparator = this.bridgeUrl.includes('?') ? '&' : '?';
      this.iframe.src = `${this.bridgeUrl}${urlSeparator}origin=${encodeURIComponent(currentOrigin)}`;

      const loadTimeout = window.setTimeout(() => {
        window.removeEventListener('message', readyHandler);
        reject(new Error('GAS Bridge initialization timeout (no bridgeReady received)'));
      }, 25000); // GASの初回起動が遅い場合やリダイレクトを考慮し25秒

      container.appendChild(this.iframe);
    });
  }

  /**
   * GASに対してリクエストを送信します。
   */
  public send<T = any, R = any>(action: string, payload: T, timeoutMs: number = 30000): Promise<GasResponse<R>> {
    return new Promise((resolve, reject) => {
      if (!this.iframe || !this.actualBridgeSource || !this.actualBridgeOrigin) {
        reject(new Error('GAS Bridge is not initialized or ready'));
        return;
      }

      const requestId = this.generateRequestId();
      const request: GasRequest<T> = {
        action,
        requestId,
        payload
      };

      const timer = window.setTimeout(() => {
        const pending = this.pendingRequests.get(requestId);
        if (pending) {
          this.pendingRequests.delete(requestId);
          pending.reject(new Error(`Request timeout for action: ${action} (requestId: ${requestId})`));
        }
      }, timeoutMs);

      this.pendingRequests.set(requestId, {
        resolve: resolve as any,
        reject,
        timer
      });

      // iframeのコンテンツウィンドウではなく、メッセージ送信元の実際のウィンドウオブジェクト（ラッパーを抜けた内側）に直接送信
      (this.actualBridgeSource as any).postMessage(request, this.actualBridgeOrigin);
    });
  }

  /**
   * 受信したメッセージの処理を行います。
   */
  private handleMessage(event: MessageEvent): void {
    if (event.origin !== this.actualBridgeOrigin) {
      return; // 接続確立時のオリジン以外からのメッセージは遮断
    }

    const response = event.data as GasResponse;
    if (!response || typeof response !== 'object' || !response.requestId) {
      return;
    }

    const pending = this.pendingRequests.get(response.requestId);
    if (!pending) {
      return;
    }

    window.clearTimeout(pending.timer);
    this.pendingRequests.delete(response.requestId);

    if (response.success) {
      pending.resolve(response);
    } else {
      pending.reject(response.error || new Error('Unknown server error'));
    }
  }

  private generateRequestId(): string {
    return 'req-' + Math.random().toString(36).substring(2, 15) + '-' + Date.now();
  }
}
