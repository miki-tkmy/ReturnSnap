# 実装ログ：PWA基盤およびIndexedDB構築（Phase 2）

- 実施日：2026-07-20
- 担当者：Antigravity（実装担当）

## 1. 目的と概要
ReturnSnapのオフライン対応のためのデータ保存先としてローカルデータベース（IndexedDB）を設計・実装し、アプリ起動時の環境診断ロジックを構築しました。また、PWAの基礎として Service Worker をカスタムビルドし、マニフェストファイルを各アプリ（Count/Lift）のスコープに合わせて設定しました。

## 2. 実施内容と作成・変更ファイル

### 2.1 データベース（IndexedDB）構築
* **[src/shared/db/database.ts](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/src/shared/db/database.ts)**
  * `returnsnap-db`（バージョン 1）を開き、以下のオブジェクトストアを初期化・更新する Promise ラッパークラスを作成。
    * `settings`: アプリの設定（ID、トークン、Baseなど）を格納するキー・バリューストア。
    * `drafts`: 送信前の下書き伝票の管理用。インデックスに `status` と `createdAt` を作成。
    * `images`: 撮影画像Blobの実体。インデックスに `draftId` と `uploadStatus` を作成。
    * `uploadQueue`: アップロード送信キュー。インデックスに `draftId` を作成（1下書きあたり1キューとして一意制約）。
    * `completedHistory`: 完了後の履歴。インデックスに `completedAt` を作成。

### 2.2 ストレージ・ブラウザ診断
* **[src/shared/storage/capability-check.ts](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/src/shared/storage/capability-check.ts)**
  * 起動時に動作要件を確認する診断処理を実装。
    * 接続プロトコル（localhost を除く HTTPS接続）の確認。
    * Service Worker と IndexedDB のサポート確認。
    * `settings` ストアでのダミー画像の書き込み ＞ 読み戻し ＞ 削除テスト。
    * `navigator.storage.estimate()` による残り容量制限（残り 300MiB 未満の場合は診断不合格としブロック理由を返す）。

### 2.3 PWAおよびService Worker設定
* **[vite.config.ts](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/vite.config.ts)**
  * `vite-plugin-pwa` で独自Service Workerである `src/sw.ts` をコンパイルする `injectManifest` 戦略を設定。
* **[src/sw.ts](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/src/sw.ts)**
  * ビルド時に Workbox が事前キャッシュリスト（`self.__WB_MANIFEST`）を埋め込み、アセット（HTML, CSS, JS等）を `Cache First` でキャッシュ。
  * 画像やフォント等の静的リソースは実行時キャッシュ（Cache First）。
  * GAS WebApp ドメインへのリクエストは `Network Only` でバイパス。
* **PWAマニフェストファイル**
  * 各アプリのスコープと起動URLを区別するため、静的に個別の manifest を設定：
    * **[count/manifest.webmanifest](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/count/manifest.webmanifest)** (RS Count用)
    * **[lift/manifest.webmanifest](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/lift/manifest.webmanifest)** (RS Lift用)
  * 各HTMLファイルの `<head>` にマニフェストリンクを紐づけ。
    * **[count/index.html](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/count/index.html)**
    * **[lift/index.html](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/lift/index.html)**

### 2.4 テストUIの追加
* **[index.html](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/index.html)**
  * 「ストレージ診断 (Phase 2)」カードおよび「ストレージ診断を実行」ボタンを追加。
  * ボタン押下時に診断処理を呼び出し、結果をコンソールおよびログ領域に詳細表示。

## 3. テストと動作確認
* `npm run build` を実行し、WorkboxのService Workerビルドおよびアセットのインジェクションがエラーなく成功することを確認。
* ブラウザ環境で「ストレージ診断を実行」し、IndexedDBの全オブジェクトストアの作成を確認。
* 診断ログに `総合評価: ✅ 合格`、`読み書き削除テスト: OK`、空き容量情報の正常出力を確認。
