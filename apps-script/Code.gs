/**
 * 音声録音 & テキスト化アプリ用 Google Apps Script Web App
 *
 * セットアップ手順:
 *  1. Google スプレッドシートを新規作成
 *  2. 「拡張機能」→「Apps Script」を開く
 *  3. このファイルの内容をすべて貼り付けて保存
 *  4. 右上の「デプロイ」→「新しいデプロイ」
 *     - 種類: 「ウェブアプリ」
 *     - 説明: voice-transcriber
 *     - 次のユーザーとして実行: 自分
 *     - アクセスできるユーザー: 全員
 *  5. 「デプロイ」をクリック → 表示された「ウェブアプリ URL」をコピー
 *  6. 音声録音アプリの「⚙️ AI 要約設定」→「📊 シート保存設定」に貼り付けて「保存」
 *
 * 注意:
 *  - 「全員」公開しても URL を知らない人はアクセスできません (URL がランダム文字列で長い)
 *  - 心配な場合は「アクセスできるユーザー: 自分のみ」にして、ブラウザで同じ Google アカウントにログインしておく
 */

// ===== 設定 =====
const SHEET_NAME = 'recordings'; // 書き込み先シート名 (なければ自動作成)
const HEADERS = ['日時', '長さ(秒)', '文字数', 'テキスト', 'AI要約', 'ID'];

// ===== エントリポイント =====
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = getOrCreateSheet_();
    ensureHeader_(sheet);

    sheet.appendRow([
      data.createdAt ? new Date(data.createdAt) : new Date(),
      Number(data.durationSec || 0),
      Number((data.text || '').length),
      String(data.text || ''),
      String(data.summary || ''),
      String(data.id || ''),
    ]);

    return jsonOut_({ ok: true, sheet: SHEET_NAME });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  // ヘルスチェック用 (ブラウザで URL を開いたとき)
  return jsonOut_({ ok: true, msg: 'voice-transcriber endpoint is alive. Use POST to append rows.' });
}

// ===== ヘルパ =====
function getOrCreateSheet_() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  return sheet;
}

function ensureHeader_(sheet) {
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.setFrozenRows(1);
    const rng = sheet.getRange(1, 1, 1, HEADERS.length);
    rng.setFontWeight('bold').setBackground('#1e293b').setFontColor('#f1f5f9');
    sheet.setColumnWidth(1, 160); // 日時
    sheet.setColumnWidth(2, 80);  // 長さ
    sheet.setColumnWidth(3, 80);  // 文字数
    sheet.setColumnWidth(4, 480); // テキスト
    sheet.setColumnWidth(5, 480); // 要約
    sheet.setColumnWidth(6, 140); // ID
  }
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
