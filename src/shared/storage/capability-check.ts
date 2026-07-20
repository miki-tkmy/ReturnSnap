import { ReturnSnapDatabase } from '../db/database';

export interface StorageCapability {
  supported: boolean;
  indexedDbOk: boolean;
  serviceWorkerOk: boolean;
  writeReadDeleteOk: boolean;
  quotaBytes?: number;
  usageBytes?: number;
  availableBytes?: number;
  isQuotaLow: boolean;
  blockReason?: string;
}

export class StorageCapabilityChecker {
  private db: ReturnSnapDatabase;
  private readonly MIN_AVAILABLE_BYTES = 300 * 1024 * 1024; // 300 MiB

  constructor() {
    this.db = new ReturnSnapDatabase();
  }

  /**
   * 端末とブラウザのストレージ能力を総合的に診断します。
   */
  public async check(): Promise<StorageCapability> {
    const capability: StorageCapability = {
      supported: true,
      indexedDbOk: typeof window.indexedDB !== 'undefined',
      serviceWorkerOk: 'serviceWorker' in navigator,
      writeReadDeleteOk: false,
      isQuotaLow: false
    };

    // 1. 基本的なAPIの確認
    if (!capability.indexedDbOk || !capability.serviceWorkerOk) {
      capability.supported = false;
      capability.blockReason = 'IndexedDB または Service Worker がサポートされていません。';
      return capability;
    }

    // localhost 以外の環境では HTTPS であることを確認します
    const isLocalhost = 
      window.location.hostname === 'localhost' || 
      window.location.hostname === '127.0.0.1';
    
    if (window.location.protocol !== 'https:' && !isLocalhost) {
      capability.supported = false;
      capability.blockReason = 'このアプリはセキュアな接続 (HTTPS) でのみ動作します。';
      return capability;
    }

    // 2. IndexedDBの書き込み・読み込み・削除テスト
    try {
      await this.db.open();
      
      const testKey = '__storage_test_key__';
      const testValue = {
        test: true,
        timestamp: Date.now(),
        dummyBlob: new Blob(['ReturnSnap storage test data'], { type: 'text/plain' })
      };

      // 保存テスト
      await this.db.put('settings', { key: testKey, value: testValue });

      // 読み戻しテスト
      const retrieved = await this.db.get('settings', testKey);
      if (!retrieved || !retrieved.value || retrieved.value.test !== true) {
        throw new Error('IndexedDB read verification failed');
      }

      // 削除テスト
      await this.db.delete('settings', testKey);

      capability.writeReadDeleteOk = true;
    } catch (err) {
      capability.supported = false;
      capability.writeReadDeleteOk = false;
      capability.blockReason = 'プライベートブラウズまたは一時的な要因により、ストレージにデータを保存できません。';
      return capability;
    } finally {
      this.db.close();
    }

    // 3. 容量制限とQuotaの確認
    if (navigator.storage && navigator.storage.estimate) {
      try {
        const estimate = await navigator.storage.estimate();
        capability.quotaBytes = estimate.quota;
        capability.usageBytes = estimate.usage;
        
        if (estimate.quota !== undefined && estimate.usage !== undefined) {
          const available = estimate.quota - estimate.usage;
          capability.availableBytes = available;

          // 空き容量が300MiB未満の場合は即時停止
          if (available < this.MIN_AVAILABLE_BYTES) {
            capability.supported = false;
            capability.isQuotaLow = true;
            capability.blockReason = '端末の空き容量が不足しています (残り300MB未満)。不要なデータを削除してください。';
            return capability;
          }
        }
      } catch (err) {
        console.warn('Storage estimate failed:', err);
      }
    }

    return capability;
  }
}
