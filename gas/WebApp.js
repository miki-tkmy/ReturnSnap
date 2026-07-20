// スプレッドシートIDと親フォルダ名
var SPREADSHEET_ID = "1QlRQwOqjkLZpw3vLZppjylM6t4m3McqdZJco0sNcOCo";
var PARENT_FOLDER_NAME = "ReturnSnap_Photos";

/**
 * Webアプリにアクセスされた際に実行される doGet 関数。
 * iframeとして読み込まれるため、XFrameOptionsMode.ALLOWALL を設定して Bridge.html を配信します。
 */
function doGet(e) {
  var template = HtmlService.createTemplateFromFile('Bridge');
  
  // 親のオリジンをクエリパラメータから取得してテンプレートへ渡す
  var parentOrigin = e && e.parameter && e.parameter.origin ? e.parameter.origin : '';
  template.parentOrigin = parentOrigin;
  
  return template.evaluate()
    .setTitle('ReturnSnap GAS Bridge')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}

/**
 * PING/PONGやサーバーのヘルスチェックを行う関数です。
 */
function healthCheck(request) {
  return {
    action: 'healthCheck',
    requestId: request.requestId,
    success: true,
    payload: {
      message: 'PONG',
      serverTime: new Date().toISOString(),
      receivedPayload: request.payload
    }
  };
}

/**
 * 伝票下書きフォルダの作成とシート登録
 */
function createDraft(request) {
  var payload = request.payload;
  var slipCode = payload.slipCode;
  var grade = payload.grade || '';
  var appType = payload.appType || 'COUNT';
  var baseCode = payload.baseCode || '';

  // 1. Google Driveの親フォルダを取得または作成
  var parentFolder;
  var folders = DriveApp.getFoldersByName(PARENT_FOLDER_NAME);
  if (folders.hasNext()) {
    parentFolder = folders.next();
  } else {
    parentFolder = DriveApp.createFolder(PARENT_FOLDER_NAME);
  }

  // 2. 伝票番号別のサブフォルダを作成
  var folderName = slipCode + "_" + Utilities.formatDate(new Date(), "GMT+9", "yyyyMMdd_HHmmss");
  var subFolder = parentFolder.createFolder(folderName);
  var folderId = subFolder.getId();
  var folderUrl = subFolder.getUrl();

  // 3. スプレッドシート「伝票ログ」へ新行追加
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName("伝票ログ");
  if (!sheet) {
    sheet = ss.insertSheet("伝票ログ");
    sheet.appendRow(["送信日時", "伝票番号", "拠点コード", "評価グレード", "アプリ種別", "フォルダID", "フォルダURL"]);
  }
  
  sheet.appendRow([
    new Date(),
    slipCode,
    baseCode,
    grade,
    appType,
    folderId,
    folderUrl
  ]);

  return {
    action: 'createDraft',
    requestId: request.requestId,
    success: true,
    payload: {
      folderId: folderId,
      folderUrl: folderUrl
    }
  };
}

/**
 * 写真データのアップロードと写真ログ登録
 */
function uploadPhoto(request) {
  var payload = request.payload;
  var folderId = payload.folderId;
  var slipCode = payload.slipCode;
  var category = payload.category;
  var sequence = payload.sequence;
  var base64Data = payload.base64Data; // 'data:image/jpeg;base64,...' 形式
  var filename = payload.filename || (slipCode + "_" + category + "_" + sequence + ".jpg");

  // 1. Base64データをデコードしてBlob化
  var searchString = "base64,";
  var base64Index = base64Data.indexOf(searchString);
  var pureBase64 = base64Data;
  if (base64Index !== -1) {
    pureBase64 = base64Data.substring(base64Index + searchString.length);
  }
  var decodedBytes = Utilities.base64Decode(pureBase64);
  var blob = Utilities.newBlob(decodedBytes, "image/jpeg", filename);

  // 2. 指定フォルダにファイルを保存
  var folder = DriveApp.getFolderById(folderId);
  var file = folder.createFile(blob);
  var fileId = file.getId();
  var fileUrl = file.getUrl();

  // 3. スプレッドシート「写真ログ」へ新行追加
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var sheet = ss.getSheetByName("写真ログ");
  if (!sheet) {
    sheet = ss.insertSheet("写真ログ");
    sheet.appendRow(["送信日時", "伝票番号", "カテゴリ", "連番", "ファイルID", "ファイルURL"]);
  }

  sheet.appendRow([
    new Date(),
    slipCode,
    category,
    sequence,
    fileId,
    fileUrl
  ]);

  return {
    action: 'uploadPhoto',
    requestId: request.requestId,
    success: true,
    payload: {
      fileId: fileId,
      fileUrl: fileUrl
    }
  };
}

/**
 * 送信の最終完了処理
 */
function completeDraft(request) {
  // 今回の構成では、createDraft と uploadPhoto の完了で同期が成立するため、
  // 拡張用の関数として success のみを返します。
  return {
    action: 'completeDraft',
    requestId: request.requestId,
    success: true,
    payload: {}
  };
}

function debugLog(msg) {
  console.log('BRIDGE_DEBUG: ' + msg);
}