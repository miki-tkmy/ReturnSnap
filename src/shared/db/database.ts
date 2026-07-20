export class ReturnSnapDatabase {
  private dbName: string = 'returnsnap-db';
  private dbVersion: number = 1;
  private db: IDBDatabase | null = null;

  /**
   * データベースを開き、必要に応じてオブジェクトストアを初期設定します。
   */
  public open(): Promise<IDBDatabase> {
    return new Promise((resolve, reject) => {
      if (this.db) {
        resolve(this.db);
        return;
      }

      const request = indexedDB.open(this.dbName, this.dbVersion);

      request.onupgradeneeded = () => {
        const db = request.result;

        // 1. settings ストア
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'key' });
        }

        // 2. drafts ストア
        if (!db.objectStoreNames.contains('drafts')) {
          const draftsStore = db.createObjectStore('drafts', { keyPath: 'draftId' });
          draftsStore.createIndex('status', 'status', { unique: false });
          draftsStore.createIndex('createdAt', 'createdAt', { unique: false });
        }

        // 3. images ストア
        if (!db.objectStoreNames.contains('images')) {
          const imagesStore = db.createObjectStore('images', { keyPath: 'imageId' });
          imagesStore.createIndex('draftId', 'draftId', { unique: false });
          imagesStore.createIndex('uploadStatus', 'uploadStatus', { unique: false });
        }

        // 4. uploadQueue ストア
        if (!db.objectStoreNames.contains('uploadQueue')) {
          const queueStore = db.createObjectStore('uploadQueue', { keyPath: 'uploadId' });
          queueStore.createIndex('draftId', 'draftId', { unique: true });
        }

        // 5. completedHistory ストア (画像Blobは保持しない)
        if (!db.objectStoreNames.contains('completedHistory')) {
          const historyStore = db.createObjectStore('completedHistory', { keyPath: 'uploadId' });
          historyStore.createIndex('completedAt', 'completedAt', { unique: false });
        }
      };

      request.onsuccess = () => {
        this.db = request.result;
        resolve(this.db);
      };

      request.onerror = () => {
        reject(request.error || new Error('Failed to open IndexedDB'));
      };
    });
  }

  /**
   * データベースの接続を閉じます。
   */
  public close(): void {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }

  /**
   * 指定したストアにデータを保存（追加または上書き）します。
   */
  public put(storeName: string, value: any): Promise<void> {
    return this.runInTransaction(storeName, 'readwrite', (store) => {
      return store.put(value);
    });
  }

  /**
   * 指定したストアからデータをキーで取得します。
   */
  public get<T = any>(storeName: string, key: IDBValidKey): Promise<T | undefined> {
    return this.runInTransaction(storeName, 'readonly', (store) => {
      return store.get(key);
    });
  }

  /**
   * 指定したストアからすべてのデータを取得します。
   */
  public getAll<T = any>(storeName: string): Promise<T[]> {
    return this.runInTransaction(storeName, 'readonly', (store) => {
      return store.getAll();
    });
  }

  /**
   * 指定したストアからデータをキーで削除します。
   */
  public delete(storeName: string, key: IDBValidKey): Promise<void> {
    return this.runInTransaction(storeName, 'readwrite', (store) => {
      return store.delete(key);
    });
  }

  /**
   * インデックスを使用してデータを検索します。
   */
  public getByIndex<T = any>(
    storeName: string,
    indexName: string,
    query: IDBValidKey | IDBKeyRange
  ): Promise<T[]> {
    return this.runInTransaction(storeName, 'readonly', (store) => {
      const index = store.index(indexName);
      return index.getAll(query);
    });
  }

  /**
   * トランザクション処理を実行する共通ヘルパーメソッドです。
   */
  private runInTransaction<R>(
    storeName: string,
    mode: IDBTransactionMode,
    callback: (store: IDBObjectStore) => IDBRequest
  ): Promise<R> {
    return new Promise((resolve, reject) => {
      if (!this.db) {
        reject(new Error('Database is not opened'));
        return;
      }

      const tx = this.db.transaction(storeName, mode);
      const store = tx.objectStore(storeName);
      const request = callback(store);

      tx.oncomplete = () => {
        resolve(request.result);
      };

      tx.onerror = () => {
        reject(tx.error || request.error || new Error('Transaction error'));
      };

      tx.onabort = () => {
        reject(tx.error || new Error('Transaction aborted'));
      };
    });
  }
}
