# ReturnSnap 完全実装仕様 (01_complete_implementation_spec.md)

## 0. 文書情報

- プロジェクト名：ReturnSnap
- 対象アプリ：
  - ReturnSnap Count
  - ReturnSnap Lift
- GitHubリポジトリ：`miki-tkmy/ReturnSnap`
- GitHub Pages想定URL：`https://miki-tkmy.github.io/ReturnSnap/`
- 主対象端末：最新iOSを搭載したiPhone
- フロントエンド：GitHub Pages上のPWA
- バックエンド：既存Google Apps Scriptを再構成して流用
- 保存先：既存Google Drive
- ログ・マスタ：既存Googleスプレッドシート
- 会社所有GitHub Organization：なし
- GPS・位置情報・導線取得：対象外
- スクリプトID：`1t60FXdlUAqDtk0l5o10LR9xd_Y1umq-GDkC-Gd-WnXOLfA-tpBbJy_5Y`
- スプレッドシートID：`1QlRQwOqjkLZpw3vLZppjylM6t4m3McqdZJco0sNcOCo`

---

## 1. 実装方針

### 1.1 基本方針

現在のGAS Webアプリは、Base一覧取得、QR解析、伝票番号生成、画像圧縮、Driveフォルダ作成、画像保存、UploadLog・ErrorLog記録まで実装されている。一方で、オフライン保存、PWA、端末認証、二重送信防止、撮影者識別、荷姿撮影は未実装である。

完成版では責務を次のように分ける。

```text
GitHub Pages PWA
├ 画面表示
├ QR読取
├ カメラ撮影
├ 画像圧縮
├ 写真確認・削除・再撮影
├ IndexedDB保存
├ 未送信キュー
├ 送信確認
└ PWA更新管理
        ↓
GASブリッジ
├ GitHub Pagesとのメッセージ受け渡し
└ google.script.runによるGAS関数呼出し
        ↓
GASバックエンド
├ 端末認証
├ 入力検証
├ 二重送信防止
├ フォルダ生成
├ Drive保存
├ ログ記録
└ マスタ配信
```

### 1.2 採用しない方式

- GitHub PagesからGASへ、認証なしで直接POSTする方式
- フロントから保存先フォルダIDを指定する方式
- 画像をGitHubへ保存する方式
- Google DriveやスプレッドシートのIDをフロントの公開JavaScriptへ埋め込む方式
- アップロード成功前に端末内の画像を削除する方式
- 通信復旧だけを理由に、利用者確認なしで自動アップロードする方式
- GPS・位置情報の取得
- OCRによる手書き伝票番号認識
- Microsoft Graph、OneDrive API、Google Workspaceドメイン認証を前提にする方式

---

## 2. 技術構成

### 2.1 フロントエンド

- Vite
- TypeScript
- HTML / CSS
- PWA
- Service Worker
- IndexedDB
- `jsQR`をnpmパッケージとしてバンドル
- Canvasによる画像変換
- Web Camera API
- Web Crypto API
- GitHub ActionsによるGitHub Pages公開

フレームワークは使用しない。画面数が少なく、現場用アプリとして長期保守しやすい構成を優先する。

### 2.2 バックエンド

- Google Apps Script V8
- HtmlService
- `google.script.run`
- SpreadsheetApp
- DriveApp
- LockService
- CacheService
- PropertiesService
- Utilities

### 2.3 GitHub PagesとGAS의通信方式

GitHub PagesからGASへ直接`fetch`するのではなく、GASで配信する非表示のブリッジHTMLをGitHub Pages内の`iframe`として読み込む。

```text
GitHub Pages
  ↓ window.postMessage
GAS Bridge.html
  ↓ google.script.run
GASサーバー関数
```

ブリッジの要件：

- `HtmlService.XFrameOptionsMode.ALLOWALL`を使用する
- ブリッジ画面は操作UIを持たない
- `message`イベントの`origin`が許可済みGitHub Pagesのオリジンのと一致しない場合は無視する
- 全要求でDeviceID・DeviceToken・RequestIDを検証する
- 返信先は要求元の`event.source`だけに限定する
- `postMessage`の宛先に`*`を使用しない
- タイムアウトを設ける
- ブリッジ未接続時は端末内保存だけを許可し、アップロードを開始しない

### 2.4 最初に行う通信PoC

本実装前に、次の最小PoCを実施する。

1. GitHub Pagesにテストページを配置
2. GAS Bridgeをiframeで読込
3. Pagesから`PING`を送信
4. GAS側で`google.script.run`を実行
5. `PONG`をPagesへ返す
6. iPhoneのSafariとホーム画面PWAの両方で確認

PoCが失敗した場合は、GASのHTML応答を利用したフォームPOST＋iframe返信方式へ切り替える。追加の外部サーバーは導入しない。

---

## 3. リポジトリ構成

```text
ReturnSnap/
├ .github/
│  └ workflows/
│     └ deploy-pages.yml
├ docs/
│  ├ 00_project_overview.md
│  ├ 01_complete_implementation_spec.md
│  ├ 02_operation_manual.md
│  ├ 03_test_plan.md
│  └ 04_release_notes.md
├ gas/
│  ├ appsscript.json
│  ├ Config.gs
│  ├ WebApp.gs
│  ├ AuthService.gs
│  ├ BridgeService.gs
│  ├ BaseService.gs
│  ├ UploadService.gs
│  ├ DriveService.gs
│  ├ LogService.gs
│  ├ AdminService.gs
│  ├ Validation.gs
│  ├ Utils.gs
│  ├ Bridge.html
│  ├ .claspignore
│  └ README.md
├ public/
│  ├ icons/
│  │  ├ common/
│  │  ├ count/
│  │  └ lift/
│  ├ references/
│  │  └ load-condition-standard.webp
│  └ offline.html
├ src/
│  ├ count/
│  │  ├ main.ts
│  │  └ count-app.ts
│  ├ lift/
│  │  ├ main.ts
│  │  └ lift-app.ts
│  ├ shared/
│  │  ├ api/
│  │  │  ├ gas-bridge.ts
│  │  │  └ request-types.ts
│  │  ├ camera/
│  │  │  ├ camera-controller.ts
│  │  │  ├ image-processor.ts
│  │  │  └ qr-scanner.ts
│  │  ├ db/
│  │  │  ├ database.ts
│  │  │  ├ migrations.ts
│  │  │  └ repositories.ts
│  │  ├ queue/
│  │  │  ├ upload-queue.ts
│  │  │  └ upload-resume.ts
│  │  ├ storage/
│  │  │  ├ capability-check.ts
│  │  │  └ quota-manager.ts
│  │  ├ ui/
│  │  ├ validation/
│  │  ├ config/
│  │  └ types/
│  └ sw.ts
├ count/
│  ├ index.html
│  └ manifest.webmanifest
├ lift/
│  ├ index.html
│  └ manifest.webmanifest
├ index.html
├ package.json
├ package-lock.json
├ tsconfig.json
├ vite.config.ts
├ eslint.config.js
├ .gitignore
└ README.md
```

### 3.1 GitHub Pages設定

- Viteの`base`は`/ReturnSnap/`
- GitHub Pagesの公開元はGitHub Actions
- `main`ブランチへのpushで、テスト・ビルド成功後にデプロイ
- デプロイ前に型チェック、単体テスト、ビルドを実行
- `.clasp.json`、秘密情報、ローカル設定はGitへ含めない

---

## 4. アプリ名称・URL・アイコン

### 4.1 URL

```text
ReturnSnap Count
https://miki-tkmy.github.io/ReturnSnap/count/

ReturnSnap Lift
https://miki-tkmy.github.io/ReturnSnap/lift/
```

### 4.2 PWA名

| 項目 | Count | Lift |
|---|---|---|
| name | ReturnSnap Count | ReturnSnap Lift |
| short_name | RS Count | RS Lift |
| id | /ReturnSnap/count/ | /ReturnSnap/lift/ |
| start_url | /ReturnSnap/count/ | /ReturnSnap/lift/ |
| scope | /ReturnSnap/count/ | /ReturnSnap/lift/ |
| display | standalone | standalone |

### 4.3 アイコン

共通のRSロゴ、紺・白・黄色の色調を維持する。

- Count：
  - 青系の小さな員数マーク
  - Liftと見分けられる青いアクセント
- Lift：
  - 黄色系の小さなフォークリフトまたは荷姿マーク
  - Countより黄色を強調

必要サイズ：

- 180x180：Apple Touch Icon
- 192x192：PWA
- 512x512：PWA
- 512x512：maskable
- 1024x1024：原本

---

## 5. 端末・利用者管理

### 5.1 端末区分

#### Count

- 個人名は管理しない
- 暫定端末名：
  - 協力会社A_A～協力会社A_J
- 内部ID：
  - COUNT-001～COUNT-010
- 登録者名欄には端末表示名を保存する

#### Lift

- 個人専用iPhone
- 暫定撮影者名：A・B・C・D
- 内部撮影者ID：
  - LIFT-USER-001～004
- 内部端末ID：
  - LIFT-001～004
- 毎回の氏名選択は不要

### 5.2 初回端末登録

1. 管理者がDeviceMasterへ端末情報を登録する
2. 管理者が一度だけ使えるActivationCodeを発行する
3. 初回起動時にActivationCodeを入力またはQRで読み取る
4. GASが端末区分・Base・端末名・撮影者を確認する
5. GASが256bit以上のDeviceTokenを発行する
6. DeviceTokenはIndexedDBへ保存する
7. GASはTokenのハッシュだけを保存する
8. ActivationCodeは使用済みにする
9. 以降はDeviceIDとDeviceTokenで認証する

### 5.3 端末無効化

DeviceMasterのStatusを`REVOKED`にすると、次回通信時からアップロードできない。

無効化された場合：

- 既存の未送信データは端末に残す
- 新しい撮影は停止する
- 管理者へ連絡するメッセージを表示する
- 再登録コードの入力画面を表示できる

---

## 6. 共通起動処理

アプリ起動時に、次の順で確認する。

1. HTTPSである
2. Service Workerが登録済み
3. PWAのキャッシュが利用できる
4. IndexedDBが開ける
5. テストBlobを書き込める
6. テストBlobを読み戻せる
7. テストBlobを削除できる
8. StorageManagerの容量情報を取得する
9. 永続ストレージを要求する
10. 端末登録情報を読み込む
11. Base情報のキャッシュを読み込む
12. 未送信件数を表示する
13. オンラインの場合はGAS BridgeのHealth Checkを行う
14. アプリ更新の有無を確認する

### 6.1 使用禁止条件

次のいずれかに該当する場合は撮影を開始させない。

- ホーム画面PWAではなく、通常ブラウザまたはプライベートブラウズで開いている
- IndexedDBが利用できない
- Blobの書込・読込・削除テストに失敗した
- Service Workerが利用できない
- 推定残容量が300MiB未満
- 端末登録が無効
- DBのスキーマ移行に失敗した
- アプリデータが破損している

表示例：

```text
この端末では写真を安全に保存できません。

ホーム画面に追加したReturnSnapから起動してください。
プライベートブラウズでは使用できません。
問題が続く場合は管理者へ連絡してください。
```

`navigator.storage.persist()`が拒否されたことだけでは即時停止しない。IndexedDBの実保存テストと容量を優先して判定する。

---

## 7. IndexedDB設計

### 7.1 DB名

```text
returnsnap-db
```

### 7.2 オブジェクトストア

#### settings

- key
- value
- updatedAt

保存例：

- DeviceID
- DeviceToken
- AppType
- BaseCode
- DeviceName
- OperatorID
- OperatorName
- LastBaseMasterSync
- AppVersion

#### drafts

1回の撮影作業を表す。

- draftId
- appType
- uploadType
- slipCode
- slipBaseCode
- inputMethod
- qrRawText
- baseCode
- baseMismatch
- grade
- status
- createdAt
- updatedAt
- workDate
- totalBytes

Status：

- EDITING
- READY
- UPLOADING
- PARTIAL
- COMPLETE
- ERROR

#### images

- imageId
- draftId
- category
- sequence
- capturedAt
- blob
- mimeType
- width
- height
- byteSize
- checksum
- uploadStatus
- driveFileId
- lastError

Category：

- COUNT
- RETURN_MATERIAL
- LOAD_WHOLE
- LOAD_DETAIL

#### uploadQueue

- uploadId
- draftId
- retryCount
- nextRetryAt
- lastAttemptAt
- lastError
- serverSessionTimestamp
- serverState

#### completedHistory

画像Blobは保持しない。

- uploadId
- slipCode
- uploadType
- completedAt
- imageCount
- folderName
- status

完了履歴は7日後に自動削除する。

### 7.3 撮影直後の保存

シャッター操作後、次の処理が完了するまで画面を次へ進めない。

1. Canvasへ描画
2. 長辺2000pxへ縮小
3. JPEG品質0.9でBlob化
4. SHA-256チェックサム生成
5. IndexedDBへ保存
6. 保存したBlobを読み戻して存在確認
7. サムネイルを表示
8. 「端末に保存済み」と表示

---

## 8. 保存容量管理

### 8.1 閾値

固定値と端末の推定容量の両方で判定する。

```text
警告基準：
min(1GiB, 推定Quotaの60%)

撮影停止基準：
min(1.5GiB, 推定Quotaの75%)

即時停止：
推定残容量300MiB未満
```

`StorageManager.estimate()`が利用できない場合：

- 1GiBで警告
- 1.5GiBで停止

### 8.2 容量警告

警告時：

```text
未送信写真が増えています。
Wi-Fiまたはモバイル回線を確認し、アップロードしてください。
```

停止時：

```text
未送信データの保存上限に達しました。
アップロードが完了するまで新しい撮影はできません。
```

### 8.3 QuotaExceededError

- 現在の撮影を中止する
- 既存データを削除しない
- 新規撮影を停止する
- 未送信データのアップロード画面へ誘導する
- ErrorLogへ記録できる状態なら記録する

---

## 9. QR・伝票番号仕様

### 9.1 QR形式

例：

```text
https://skynet.srg.jp/api/efu/?id=SR1104&seg=72&subcode=00&code=DLW024141-00
```

抽出対象：

```text
DLW024141-00
```

正規表現：

```regex
^D([A-Z0-9]{2})([0-9]{6})-([0-9]{2})$
```

分解：

- D：返却
- LW：伝票BaseCode
- 024141：伝票番号
- 00：枝番

### 9.2 QR読取

優先順：

1. ライブカメラでQRを検知し、自動確定
2. QR静止画を撮影して解析
3. 6桁手入力

QRライブラリはCDNではなくアプリへ同梱し、オフラインでも動作させる。

### 9.3 手入力

- 数字6桁のみ
- 全角数字は半角化
- 空白削除
- 英字・記号は禁止
- 先頭0を保持
- 枝番なし
- 端末BaseがLW、入力が024141の場合：

```text
DLW024141
```

### 9.4 Base不一致

端末Baseと伝票Baseが異なっても保存可能。

- 黄色の警告を表示
- 保存を禁止しない
- 保存先の最上位Baseは端末Base
- 伝票BaseCodeを別項目で記録
- Base不一致をTRUEで記録

---

## 10. カメラ・画像仕様

### 10.1 カメラ

- 背面カメラを優先
- ReturnSnap内のカメラUIを使用
- シャッター後にOSの「写真を使用」を表示しない
- 写真アプリへ自動保存しない
- カメラ権限がない場合は説明を表示
- Web Camera APIが使えない場合は`input type=file`をフォールバックにする

### 10.2 画像

- 出力形式：JPEG
- 長辺：2000px
- JPEG品質：0.9
- 最大枚数：30枚
- サムネイル表示
- タップで拡大
- 1枚ずつ削除
- 再撮影
- 撮影順表示
- 保存前に伝票番号と枚数を確認

### 10.3 画像の向き

- iPhoneの縦横情報を反映する
- Canvas出力後の画像が正立していることを確認する
- フォールバックでHEIC等が選択された場合も、ブラウザで読込後JPEGへ変換する
- 変換できない形式はエラーにして元データを破棄しない

---

## 11. ReturnSnap Count仕様

### 11.1 通常画面

上部のBase表示は極小表示とする。

```text
[Westエリア Lab.West] [協力会社A_A]
```

Base変更は管理者向けの小さなボタンにする。

主ボタン：

- QRを読む
- 番号を手入力する
- 撮影する
- 保存する
- 現在の入力を削除する
- 未送信を見る

### 11.2 操作フロー

```text
QR読取または手入力
↓
伝票番号確定
↓
連続撮影
↓
プレビュー確認
↓
削除・再撮影
↓
保存
↓
未送信キューへ登録
↓
通信確認
↓
アップロード
```

### 11.3 保存条件

- 伝票番号あり
- 写真1枚以上
- 写真30枚以下
- 端末保存成功
- Base設定済み

### 11.4 保存先

```text
Base / 年 / 月 / 撮影日 / 伝票番号 / 員数
```

### 11.5 ファイル名

```text
員数_<伝票番号>_<撮影日時>_<連番>.jpg
```

例：

```text
員数_DLW024141-00_20260720_143025_123_001.jpg
```

---

## 12. ReturnSnap Lift仕様

### 12.1 端末表示

```text
[Westエリア Lab.West] [撮影者 A]
```

撮影者変更は通常画面に出さない。端末再登録時だけ変更可能とする。

### 12.2 操作フロー

```text
QR読取または手入力
↓
伝票番号確定
↓
撮影内容を選択
├ 返却資材を撮影
└ 荷姿を撮影
```

### 12.3 返却資材

- 現在の荷下ろし写真に相当
- 写真1枚以上
- 最大30枚
- プレビュー・削除・再撮影可能

保存先：

```text
Base / 年 / 月 / 撮影日 / 伝票番号 / 返却資材
```

ファイル名：

```text
返却資材_<伝票番号>_<撮影日時>_<連番>.jpg
```

### 12.4 荷姿

画面項目：

- 荷姿基準
- A判定
- B判定
- C判定
- D判定
- 全体を撮影する
- 細部を撮影する
- 保存する

#### 必須枚数

| 写真区分 | 最低枚数 | 最大 |
|---|---:|---:|
| 全体 | 1 | 30枚の範囲内 |
| 細部 | 2 | 30枚の範囲内 |
| 合計 | 3 | 30 |

全体と細部のどちらも最低枚数を超えて撮影可能。

保存先：

```text
Base / 年 / 月 / 撮影日 / 伝票番号 / 荷姿 / A～D
```

ファイル名：

```text
荷姿_<Grade>_全体_<SlipCode>_<CaptureTimestamp>_<Sequence>.jpg
荷姿_<Grade>_細部_<SlipCode>_<CaptureTimestamp>_<Sequence>.jpg
```

---

## 13. 荷姿判定基準

### 13.1 大原則

「該当束数」と「トラック全体に占める割合」を比較し、悪い方を採用する。

| 判定 | 該当束数 | 割合 | 状態・対応 |
|---|---:|---:|---|
| A | 0束 | 5%以内 | 良好・問題なし |
| B | 1～2束 | 20%以内 | 軽微な乱れ・注意 |
| C | 3～6束 | 21～49% | 改善が必要・改善対象 |
| D | 7束以上 | 50%以上 | 改善必須・即改善必須 |

### 13.2 判定対象

- 他サイズ混在：長さ・規格違いの混入
- 抱き合わせ：複数資材の不適切な結束
- 他資材混在：別カテゴリ資材の混入
- 結束不良：番線なし、ゆるみ、崩れなど
- ラック不適正返却：資材使用ラックへの入返却など

### 13.3 即D判定

束数・割合に関係なくD：

- 番線なしのバラ返却
- 資材使用ラックへの入返却

### 13.4 荷姿基準画面

- A～Dを色分けカードで表示
- 束数・割合・状態を大きく表示
- 即D条件を赤い警告枠で表示
- 判定対象一覧を表示
- 原本画像を拡大表示可能
- すべてService Workerへキャッシュ
- オフライン閲覧可能

評価自動計算は初期版では行わない。リフトマンが基準を確認してA～Dを選択する。将来、該当束数・割合の入力から自動判定する機能を追加できる構造にする。

---

## 14. 保存・アップロードフロー

### 14.1 保存ボタン

「保存する」はGoogle Driveへの即時保存ではなく、端末の未送信キューへ登録する操作とする。

保存成功表示：

```text
端末に保存しました。
通信を確認してアップロードしてください。
```

### 14.2 通信確認

iPhoneのWebアプリではWi-Fiとモバイル回線の種別を信頼できる形で判定しない。

アップロード前に次を表示する。

```text
Wi-Fiまたはモバイル回線に接続していることを確認してください。

伝票番号：DLW024141-00
撮影種別：員数
写真：20枚
容量：24.5MB

□ 通信状態を確認しました

[アップロードする]
[あとで送信する]
```

- チェック前はアップロードボタン無効
- `navigator.onLine`は参考表示だけに使う
- 実際の通信可否はGAS Bridge of Health Checkで確認する
- 自動送信は行わない

### 14.3 アップロード

1. UploadIDを生成
2. 画像一覧・メタ情報を端末に保存
3. GASへセッション作成要求
4. サーバーが保存先を決定
5. 画像を1枚ずつ順次送信
6. 各画像の完了を端末DBへ記録
7. 全画像送信後にFinalize要求
8. GASが必要枚数・保存枚数を検証
9. UploadLogを確定
10. 完了応答を返す
11. 端末の画像Blobを削除
12. 完了履歴だけ残す

並列送信は初期版では行わない。GAS負荷とiPhoneメモリ使用量を抑えるため、1枚ずつ送信する。

### 14.4 再送

- アプリ起動時にPARTIALを検出
- GASへUploadIDの状態確認
- 保存済み画像は再送しない
- 未保存画像だけ再送
- ユーザーが再度通信確認してから再送
- 再送回数に上限を設けず、手動で中止できる
- 連続5回失敗した場合は赤いエラー表示と管理者向け情報を表示

---

## 15. 二重送信防止

### 15.1 UploadID

- 1回の保存ごとにUUIDを生成
- 同じ保存の再送では同じUploadIDを使用
- GAS側でUploadIDを一意キーにする

### 15.2 ファイル名の決定

- 初回セッション作成時にGASがSessionTimestampを発行
- 再送時も同じSessionTimestampを返す
- 画像順は端末で確定したSequenceを使用
- 同じファイル名が既に存在する場合は新規作成しない

### 15.3 サーバー側

- UploadSessionsでUploadIDを検索
- 完了済みなら完了情報を返す
- 途中なら不足画像一覧を返す
- LockServiceでセッション更新を排他制御する
- フロントからFolderIDを受け取らない
- 最終保存先はGASが再計算する

---

## 16. GASバックエンド仕様

### 16.1 Script Properties

実値はGitへ保存しない。

- SPREADSHEET_ID
- RETURN_ROOT_FOLDER_ID
- LOAD_CONDITION_ROOT_FOLDER_ID
- ALLOWED_PAGES_ORIGIN
- TOKEN_PEPPER
- APP_ENV
- MIN_SUPPORTED_VERSION

初期はRETURN_ROOT_FOLDER_IDとLOAD_CONDITION_ROOT_FOLDER_IDに同じ既存親フォルダを設定する。

### 16.2 公開関数

Bridgeから呼出し可能な関数：

- healthCheck(request)
- activateDevice(request)
- authenticateDevice(request)
- getBootstrapConfig(request)
- createUploadSession(request)
- getUploadStatus(request)
- uploadImage(request)
- finalizeUpload(request)
- logClientError(request)

公開関数は必ず次を行う。

- 入力型検証
- Device認証
- AppType検証
- 文字数制限
- UploadID形式検証
- SlipCode形式検証
- BaseCodeマスタ照合
- 画像サイズ検証
- レート制御
- 監査ログ
- 例外の安全な返却

### 16.3 サーバーで受け付けない値

- 任意のFolderID
- 任意のSpreadsheetID
- 任意のファイルパス
- 任意のGAS関数名
- HTML
- スクリプト
- 未定義の撮影種別
- 未定義の荷姿評価

---

## 17. Google Drive仕様

### 17.1 ルート

- 員数・返却資材：RETURN_ROOT_FOLDER_ID
- 荷姿：LOAD_CONDITION_ROOT_FOLDER_ID

初期値は同じ親フォルダ。将来、荷姿だけ別親フォルダへ変更可能。

### 17.2 フォルダ構成

```text
BaseCode
└ YYYY
   └ MM
      └ YYYY-MM-DD
         └ SlipCode
            ├ 員数
            ├ 返却資材
            └ 荷姿
               ├ A
               ├ B
               ├ C
               └ D
```

### 17.3 日付

- フォルダの日付は撮影日
- アップロード日ではない
- オフラインで翌日に送信しても撮影日のフォルダへ保存

### 17.4 ファイル名

禁止文字はサーバー側で除去する。

```text
員数_<SlipCode>_<CaptureTimestamp>_<Sequence>.jpg
返却資材_<SlipCode>_<CaptureTimestamp>_<Sequence>.jpg
荷姿_<Grade>_全体_<SlipCode>_<CaptureTimestamp>_<Sequence>.jpg
荷姿_<Grade>_細部_<SlipCode>_<CaptureTimestamp>_<Sequence>.jpg
```

---

## 18. スプレッドシート仕様

既存UploadLogの先頭19列は変更しない。

### 18.1 Config_Base

既存：

- BaseCode
- BaseName
- AreaName
- SortNo
- IsActive

### 18.2 UploadLog

既存19列：

1. 登録日時
2. エリア名
3. Baseコード
4. Base名
5. 作業区分
6. 作業日
7. 伝票番号
8. 伝票BaseCode
9. 入力方法
10. 枚数
11. 登録者名
12. 端末メモ
13. エラー有無
14. エラー内容
15. 保存先フォルダID
16. 保存先フォルダURL
17. QRコード全文
18. Base不一致
19. UserAgent

右側へ追加：

20. UploadID
21. アプリ種別
22. 撮影種別
23. 荷姿判定
24. 全体写真枚数
25. 細部写真枚数
26. 撮影者ID
27. 端末ID
28. 撮影日時
29. アップロード日時
30. オフライン保存
31. 画像合計容量
32. アプリバージョン
33. 送信状態

### 18.3 ErrorLog

既存列を維持し、右側へ追加：

- UploadID
- ImageID
- DeviceID
- AppType
- Action
- AppVersion
- ClientTime
- ServerTime
- RetryCount
- ErrorCode

### 18.4 DeviceMaster

- DeviceID
- DeviceName
- AppType
- BaseCode
- OperatorID
- OperatorName
- TokenHash
- Status
- ActivatedAt
- LastSeenAt
- CreatedAt
- UpdatedAt
- Notes

### 18.5 DeviceActivation

- ActivationID
- DeviceID
- ActivationCodeHash
- ExpiresAt
- UsedAt
- Status
- CreatedAt

### 18.6 UploadSessions

1行1登録。

- UploadID
- DeviceID
- AppType
- UploadType
- BaseCode
- SlipCode
- SlipBaseCode
- Grade
- WorkDate
- CaptureStartedAt
- SessionTimestamp
- ExpectedImageCount
- WholeImageCount
- DetailImageCount
- ImageManifestJSON
- SavedImagesJSON
- FolderID
- FolderURL
- Status
- LastError
- CreatedAt
- UpdatedAt
- FinalizedAt

画像ごとの別シートは作らない。30枚分のImageID・ファイル名・FileIDをJSONで保持し、行数の増加を抑える。

### 18.7 Config_LoadCondition

- Grade
- BundleCondition
- RatioCondition
- StatusText
- ActionText
- Color
- DisplayOrder
- IsActive

### 18.8 Config_LoadConditionRule

- RuleID
- RuleType
- Title
- Description
- ForcedGrade
- DisplayOrder
- IsActive

### 18.9 Config_App

秘密情報は置かない。

- Key
- Value
- ValueType
- Description
- UpdatedAt

---

## 19. UI・UX要件

### 19.1 基本

- 日本語
- 文字サイズ大
- 高コントラスト
- 主要ボタンは画面幅いっぱい
- 主要操作以外は小さくする
- 1画面の選択肢を増やしすぎない
- 破壊操作は確認ダイアログ
- 保存状態を色と文章の両方で表示
- アイコンだけに意味を依存しない

### 19.2 状態色

- 緑：完了
- 青：端末保存済み
- 黄：注意・Base不一致・未送信
- 赤：保存不能・送信失敗・容量不足
- 灰：無効

### 19.3 未送信表示

全画面上部に常時表示する。

```text
未送信 0件
未送信 3件・合計245MB
アップロード中 7/20
送信失敗・再送が必要
```

### 19.4 削除

- 画像削除は1枚単位
- 現在の入力削除は確認必須
- 未送信一式の削除は管理者向け確認を2段階にする
- アップロード済みデータはアプリから削除できない

---

## 20. セキュリティ要件

- GitHubリポジトリは公開前提
- 秘密情報をフロントへ置かない
- DeviceTokenをURLに含めない
- DeviceTokenをログへ出さない
- TokenはIndexedDBへ保存
- GAS側ではTokenHashを保存
- HTTPSのみ
- Originを固定
- 任意FolderIDを拒否
- 任意関数実行を拒否
- 文字列長・枚数・画像サイズを制限
- ActivationCodeは一度だけ使用可能
- 端末無効化を可能にする
- UploadIDでリプレイ時の重複を防ぐ
- QR全文をログへ保存するが、画面へ不用意に再表示しない
- 個人名はLift端末に必要な範囲だけ保存
- GPS・位置情報・分析SDKを入れない
- Google Analytics等の外部解析を初期版へ入れない
- `Bridge.html`はクリック可能なUIを持たない
- `postMessage`のOriginを必ず照合する

---

## 21. PWA・Service Worker仕様

### 21.1 キャッシュ対象

- HTML
- CSS
- JavaScript
- jsQR
- アイコン
- 荷姿基準
- オフライン画面
- 初期Baseマスタ
- 初期設定JSON

Google Drive画像やGASレスポンスはService Workerへキャッシュしない。

### 21.2 キャッシュ戦略

- アプリシェル：Cache First
- バージョン情報：Network First
- GAS Bridge：Network Only
- 荷姿基準：Cache First＋オンライン時更新
- Baseマスタ：IndexedDB優先＋オンライン時更新

### 21.3 更新

- 新しいService Workerを検出しても即時切替しない
- 未送信データがある場合は更新を保留
- 未送信0件の場合に更新案内
- ユーザー操作で更新
- DBマイグレーション失敗時は旧キャッシュへ戻す
- アプリバージョンを画面下部に表示

---

## 22. エラー処理

### 22.1 エラーコード

例：

- STORAGE_UNAVAILABLE
- STORAGE_QUOTA_LOW
- CAMERA_PERMISSION_DENIED
- CAMERA_UNAVAILABLE
- QR_INVALID
- SLIP_INVALID
- DEVICE_NOT_REGISTERED
- DEVICE_REVOKED
- BRIDGE_UNAVAILABLE
- AUTH_FAILED
- UPLOAD_SESSION_FAILED
- IMAGE_UPLOAD_FAILED
- FINALIZE_FAILED
- DUPLICATE_UPLOAD
- SERVER_BUSY
- APP_VERSION_UNSUPPORTED

### 22.2 ユーザー向け文言

技術エラーをそのまま表示しない。

例：

```text
写真を送信できませんでした。
写真はこの端末に保存されています。
通信を確認して、未送信画面から再送してください。
```

管理者向け詳細：

- エラーコード
- UploadID
- DeviceID
- 発生日時
- アプリバージョン

---

## 23. 性能・負荷要件

### 23.1 初期想定

- Count：10台
- Lift：4台
- 1日平均20伝票
- 1伝票平均20枚
- 1登録最大30枚

### 23.2 端末性能

- 30枚のサムネイル表示で操作不能にならない
- 元画像のDataURLを配列へ長時間保持しない
- BlobをIndexedDBへ保存し、画面では縮小サムネイルを使用
- 画像変換中に多重シャッターを防止
- アップロードは1枚ずつ
- 処理中でも画面状態を表示する

### 23.3 GAS

- 1画像1実行を基本とする
- 各実行を短時間で完了させる
- 6分実行上限を超えない
- Script Lockの保持時間を最小にする
- Base・DeviceマスタはCacheServiceを利用
- UploadSessionsの検索方法を最適化する
- 全国展開前に1日1万枚以上を想定した負荷試験を行う
- 割り当てエラーが発生する場合は、別バックエンドへの移行判断を行う

---

## 24. 移行手順

### Phase 0：バックアップ

- 現在のGASコードをGitへ保存
- 現在のWebアプリURLとデプロイIDを記録
- スプレッドシートをコピー
- Drive親フォルダ設定を記録
- 既存デプロイは削除しない

### Phase 1：通信PoC

- Pages公開
- GAS Bridge作成
- iPhoneでPING/PONG
- Device認証PoC
- テスト画像1枚保存
- ログ1行記録

### Phase 2：PWA基盤

- Service Worker
- IndexedDB
- 保存能力テスト
- PWAインストール
- Count/Lift別manifest
- アイコン

### Phase 3：ReturnSnap Count

- QR
- 手入力
- カメラ
- 30枚
- プレビュー
- オフライン
- 手動アップロード
- 再送
- Drive・Log

### Phase 4：ReturnSnap Lift

- 個人端末登録
- 返却資材
- 荷姿
- 荷姿基準
- A～D
- 全体1＋細部2
- 保存先分岐

### Phase 5：試運転

- Count 1～2台
- Lift 1台
- 1週間
- 問題修正
- 14台へ展開

### Phase 6：全国展開準備

- Base追加手順
- 端末追加手順
- 操作手順
- 問合せフロー
- 負荷試験
- 容量監視
- ロールバック手順

---

## 25. ロールバック

- 既存GAS Webアプリを試運転期間中は残す
- 新PWAに重大障害がある場合は旧URLへ戻す
- 未送信データがある端末ではURL変更やPWA削除を行わない
- ロールバック前に未送信一覧を確認する
- 新旧アプリが同じフォルダへ保存してもファイル名が衝突しないことを確認する
- 新GAS is 新しいデプロイIDで公開し、旧デプロイを上書きしない

---

## 26. テスト仕様

### 26.1 単体テスト

- QR抽出
- 6桁手入力
- 全角半角変換
- 先頭0
- Base不一致
- ファイル名
- フォルダパス
- 荷姿最低枚数
- 容量閾値
- UploadID
- Device認証
- 端末無効化
- 二重送信判定

### 26.2 iPhone実機

- ホーム画面追加
- Count/Lift別表示
- オフライン起動
- 機内モード撮影
- 30枚撮影
- アプリ強制終了
- iPhone再起動
- 未送信復元
- 写真削除
- 再撮影
- QR自動読取
- QR静止画
- 手入力
- カメラ権限拒否
- 保存容量不足
- アップロード途中切断
- 再送
- 重複なし
- アプリ更新保留

### 26.3 業務受入

- 20伝票×20枚相当
- 複数端末同時送信
- 同じ伝票へ追加入力
- 端末Baseと伝票Base不一致
- CountとLiftの保存先
- 荷姿A～D
- D例外条件表示
- 全体1・細部2
- UploadLog列
- ErrorLog
- 端末名・撮影者名

---

## 27. 完了条件

次をすべて満たした時点で「完全実装」とする。

- GitHub PagesからCount・Liftを起動できる
- 最新iPhoneでPWAとして別々に追加できる
- オフラインで全機能が動く
- 保存不能環境をブロックできる
- 30枚を安全に端末保存できる
- 通信確認後に手動アップロードできる
- 中断再送で重複が発生しない
- Drive保存構成が一致する
- UploadLog・ErrorLogが一致する
- 端末登録・無効化が動く
- Lift撮影者を自動記録できる
- 返却資材と荷姿を分けられる
- 荷姿基準をオフライン表示できる
- 荷姿最低枚数を強制できる
- 旧アプリへロールバックできる
- セキュリティレビューで重大問題がない
- 現場試運転で重大な操作問題がない

---

## 28. 対象外

- GPS
- フォークリフト導線
- 場内カメラ画像認識
- OCR
- 社内サーバーへの直接保存
- OneDrive
- Microsoft Graph
- Google Workspaceドメイン認証
- ネイティブiOSアプリ
- App Store配布
- 自動バックグラウンドアップロード
- 個人の作業評価
- AIによる荷姿自動判定

---

## 29. Antigravity実装指示

- 推測で実装済みと判断しない
- 現在のGASコードをバックアップしてから変更する
- 既存UploadLogの先頭19列を変更しない
- GitHub公開領域へ秘密情報を置かない
- TypeScriptの`any`を原則禁止する
- UI・通信・DB・カメラ・GAS責務を分離する
- 1ファイルへ全処理を集約しない
- 各段階で実機テスト方法を提示する
- 変更前に影響範囲、ロールバック、テスト方法を説明する
- iPhoneのPWA実機確認なしで完成扱いにしない
- 保存成功を推測しない
- DriveFileIDとUploadLog確定を確認してから端末Blobを削除する
- エラーを握りつぶさない
- ただし、ユーザー画面には理解可能な日本語を表示する
- READMEへ初期設定、Pages公開、GASデプロイ、Script Properties、端末登録方法を書く
- `npm audit`、ESLint、TypeScript、単体テストを実行する
- 生成物をコミットする前に秘密情報検査を行う

---

## 30. Codexレビュー指示

レビューでは次を重点確認する。

1. GitHub Pagesに秘密情報がないか
2. postMessageのOrigin検証があるか
3. GASがFolderIDをクライアントから受けていないか
4. DeviceTokenがログやURLへ出ていないか
5. UploadIDの冪等性が成立しているか
6. 部分アップロード後の再送で重複しないか
7. IndexedDB保存完了前に撮影成功扱いしていないか
8. アップロード完了前にBlobを消していないか
9. Count・Lift・撮影種別の権限検証があるか
10. 荷姿の全体1枚・細部2枚をクライアントとGASの両方で検証しているか
11. Base不一致を許可しつつログへ残しているか
12. Service Worker更新で未送信データが失われないか
13. DBマイグレーションが安全か
14. iPhoneでメモリを過剰消費しないか
15. 30枚の処理がUIを固めないか
16. 全国展開時のGAS割り当て・シート行数に懸念がないか
17. 旧GASへ戻せるか
18. エラー時にユーザーが次に何をすべきか分かるか
