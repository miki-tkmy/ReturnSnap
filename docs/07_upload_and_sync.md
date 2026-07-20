# 実装ログ：写真アップロードと同期機能（Phase 5）

- 実施日：2026-07-20
- 担当者：Antigravity（実装担当）

## 1. 目的と概要
端末（IndexedDB）に一時保存されている未送信の下書き（伝票レコードおよび写真Blob）を、GASのAPIを通じてGoogle Driveおよびスプレッドシートへ自動/手動で送信・同期する「アップロード同期機能（Queue）」を構築しました。また、送信成功した画像の端末内データを自動削除して空き容量を解放するクリーンアップ、指数リトライバックオフ処理を実装しました。

## 2. 実施内容と作成・変更ファイル

### 2.1 バックエンド（GAS）のAPI拡充とデプロイ
* **[gas/WebApp.js](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/gas/WebApp.js)**
  * 親の「ReturnSnap_Photos」フォルダが存在しない場合は自動作成し、その配下に伝票番号別のユニークなサブフォルダを作成してフォルダIDを返却する `createDraft` 関数を実装。
  * 送信されたBase64文字列画像をデコードしてBlobに変換し、上記サブフォルダにjpeg保存する `uploadPhoto` 関数を実装。
  * 各関数の実行に連動し、スプレッドシート（ID: `1QlRQwOqjkLZpw3vLZppjylM6t4m3McqdZJco0sNcOCo`）の「伝票ログ」および「写真ログ」シート（シートがない場合はヘッダー付きで自動生成）へ新行を記録する処理を実装。
  * `clasp push` により反映し、既存のWeb AppデプロイID（`AKfycbxx...`）に対してバージョン15の上書きデプロイを実行。
* **[gas/Bridge.html](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/gas/Bridge.html)**
  * 呼び出し可能ホワイトリスト `allowedFunctions` に `createDraft` および `completeDraft` を追加。

### 2.2 同期アップローダーロジック
* **[src/shared/upload/uploader.ts](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/src/shared/upload/uploader.ts)**
  * `FileReader` を用いて画像 Blob を Base64 文字列（DataURL）に非同期変換するヘルパーを実装。
  * 状態が `READY` または `PARTIAL` の下書きを IndexedDB から取得し、シリアル（1件ずつ順次）に `createDraft` ＞ `uploadPhoto`（全画像）＞ `completeDraft` のステップでGAS APIを呼び出す同期パイプラインを実装。
  * 通信障害時の指数バックオフ・オートリトライ制御（1秒, 2秒, 4秒...と間隔を空け最大3回再試行）を追加。
  * 画像アップロードが成功した時点で、IndexedDB の `images` ストアから画像Blob（またはレコード全体）を削除して空き容量を自動解放する仕組みを構築。
  * すべて成功した下書きは status を `COMPLETE` にし、`completedHistory` ストアへ完了実績を記録する機能を実装。

### 2.3 ポータル統合
* **[index.html](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/index.html)**
  * 「未送信データの同期アップロード (Phase 5)」カードと「同期アップロードを開始」ボタンを追加。
  * `navigator.onLine` を監視して「オンライン/オフライン」状態をヘッダーバッジと同期し、オフライン時はボタンを自動無効化。
  * 定期ポーリング（5秒間隔）で IndexedDB の未送信下書き件数をカウントし、オレンジ色の「○ 件の未送信データ」バッジを表示。
  * ボタン押下時に進捗状況（progressコールバック）を受け取り、ログpre要素にリアルタイムにログ出力するようバインド。

## 3. テストと動作確認
* `npm run build` にてビルドが成功することを確認。
* ブラウザ環境で、保存されていた未送信下書き（1件、画像2枚）を検知してオレンジバッジが自動点灯。
* 同期開始ボタンを押下し、`createDraft` が走りGoogle Driveに伝票フォルダが生成され、「伝票ログ」シートに行が追加されたことを確認。
* 画像が1枚ずつ Base64 送信され、Google Driveのフォルダに保存され、「写真ログ」シートに行が追記されたことを確認。
* 同期完了後に、IndexedDB の該当画像Blobが削除されてストレージ容量が空き、「○ 件の未送信データ」バッジが自動的に消去されることを確認。一連の動作の正常性を検証しました。
