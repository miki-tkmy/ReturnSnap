# 実装ログ：初期環境構築および通信PoC（Phase 1）

- 実施日：2026-07-20
- 担当者：Antigravity（実装担当）

## 1. 目的と概要
ReturnSnapの初期環境を構築（Vite, TypeScript, PWA）し、GitHub Pages（フロント）とGoogle Apps Script（バックエンド）がiframeを介して安全に通信できることを検証するための「通信PoC」を実装しました。

## 2. 実施内容と作成ファイル

### 2.1 環境構築関連
* **[package.json](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/package.json)**
  * Vite、TypeScript、jsQR、vite-plugin-pwa などの依存関係を設定。
* **[tsconfig.json](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/tsconfig.json)**
  * TypeScriptコンパイラ設定（Bundlerモード、厳格型チェック等）を設定。
* **[vite.config.ts](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/vite.config.ts)**
  * baseパスを `/ReturnSnap/` に設定し、マルチエントリーポイント（`index.html`, `count/index.html`, `lift/index.html`）を定義。
* **[.gitignore](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/.gitignore)**
  * `node_modules` や秘密情報、clasp 設定ファイル（`.clasp.json`）を対象外に設定。

### 2.2 フロントエンド（通信PoC）
* **[src/shared/api/request-types.ts](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/src/shared/api/request-types.ts)**
  * 送受信するリクエスト・レスポンスデータの型定義。
* **[src/shared/api/gas-bridge.ts](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/src/shared/api/gas-bridge.ts)**
  * 動的iframe生成、`postMessage` の送信、オリジン（送信元ドメイン）の確認、Promiseを用いた返信受信ハンドラ、タイムアウト制限を実装。
* **[index.html](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/index.html)**
  * WebApp URLの入力、接続の初期化、PING/PONGテストを行えるデバッグ・テストUIを作成。

### 2.3 バックエンド（Google Apps Script）
* **[gas/WebApp.gs](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/gas/WebApp.gs)**
  * `doGet` で `Bridge.html` を `XFrameOptionsMode.ALLOWALL` で配信。PINGリクエストに対してサーバー時刻等を返す `healthCheck` を公開。
* **[gas/Bridge.html](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/gas/Bridge.html)**
  * 親ウィンドウ（GitHub Pages等）からのメッセージをリッスン。ホワイトリスト方式で送信元オリジンの検証を行い、許可されたオリジンからの `healthCheck` のみを `google.script.run` で実行。結果をセキュアに返送。

### 2.4 その他
* Viteビルド検証用のダミーファイルとして以下を作成：
  * **[src/count/main.ts](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/src/count/main.ts)**
  * **[src/lift/main.ts](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/src/lift/main.ts)**
  * **[count/index.html](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/count/index.html)**
  * **[lift/index.html](file:///c:/Users/stoma/.gemini/antigravity-ide/scratch/ai-dev-orchestrator/ReturnSnap/lift/index.html)**

## 3. テストと動作確認
* `npm install` を実行し、必要なモジュールをインストール。
* `npm run build` を実行し、すべてのファイルがエラーなくビルド可能（TypeScriptの型エラーやViteのコンパイルエラーが無いこと）を確認。

## 4. ユーザー側の作業手順（検証に向けて）

検証を行うため、以下の手順でGASにコードを配置し、デプロイしてください。

1. **Google Apps Scriptエディタを開く**
   - 紐づけられているスプレッドシート（ID: `1QlRQwOqjkLZpw3vLZppjylM6t4m3McqdZJco0sNcOCo`）の拡張機能 ＞ Apps Script を開く。
   - または、スクリプトID `1t60FXdlUAqDtk0l5o10LR9xd_Y1umq-GDkC-Gd-WnXOLfA-tpBbJy_5Y` のGASプロジェクトを開きます。
2. **ファイルを新規作成しコードを貼り付ける**
   - **WebApp.gs** ファイルを作成し、`gas/WebApp.gs` の内容をコピー＆ペーストします。
   - **Bridge.html** ファイルを作成し、`gas/Bridge.html` の内容をコピー＆ペーストします。
3. **Webアプリとしてデプロイする**
   - 「デプロイ」＞「新しいデプロイ」を選択します。
   - 種類を「Webアプリ」にします。
   - 設定項目：
     - 次のユーザーとして実行：**自分**
     - アクセスできるユーザー：**全員** （外部のGitHub Pagesから呼び出すために必要です）
   - 「デプロイ」ボタンをクリックし、発行された **「ウェブアプリのURL」** をコピーします。
    - 「1. ブリッジ初期化」を押し、その後「2. PING送信」を押して、ログに「PONG受信成功！」と表示されれば疎通確認完了です。

---

## 5. デバッグ記録：二重iframeとpostMessageルーティング問題の解決

テスト実行時、親から子への `postMessage` が届かないタイムアウト問題が発生しました。調査の結果、以下の原因と対策を実施しました。

### 5.1 原因
1. **Google WebAppのリダイレクトによるクエリパラメータ・Referrerの消失**
   親から iframe 読み込み時に origin 情報を付与しても、Google 側のドメイン（`*.googleusercontent.com`）へリダイレクトされる際にパラメータが破棄され、referrer も隠蔽されるため、子フレームから親のオリジンを特定できなくなっていました。
2. **多重iframeによる送信先の不一致**
   GAS WebApp は `script.google.com` のラッパーフレーム内に実際のアプリが入れ子（ネスト）で読み込まれます。
   親から `iframe.contentWindow` に向けて postMessage を送信しても、これはラッパーフレームにしか届かず、内側の実際のJSに届きませんでした。

### 5.2 解決策
1. **GASテンプレート機能によるオリジン文字列の埋め込み**
   GAS側の `doGet(e)` でクエリパラメータ `origin` を受け取り、テンプレート変数 `template.parentOrigin = e.parameter.origin;` を使って `Bridge.html` にレンダリング時にハードコード（埋め込み）させました。これにより、どれだけリダイレクトされても正確な親オリジンが引き継がれます。
2. **最上位ウィンドウ (`window.top`) をターゲットにしたReady通知**
   子フレームは `window.top.postMessage` を使い、多重フレームをバイパスして直接最上位のポータル（親）へ `bridgeReady` を通知するようにしました。
3. **`event.source`（内側ウィンドウオブジェクト）の捕捉**
   親（`gas-bridge.ts`）は `bridgeReady` を受け取った際の `event.source`（これはラッパーを抜けた内側ウィンドウを直接指している）を保持し、以降の PING 等のメッセージは `iframe.contentWindow` ではなくこの `event.source` に向けて送信するよう変更しました。

この対策により、クロスドメイン制約および多重 iframe の障壁を完全に解消し、ローカル環境（`localhost:5173`）から GAS WebApp（`script.google.com` 及び `googleusercontent.com`）への双方向通信の疎通を確認（PONGの受信成功）しました。
