/**
 * 音声録音 & テキスト化アプリ用 Google Apps Script Web App
 * MTG ごとに新しいシートを追加し、index シートで一覧管理します。
 *
 * セットアップ手順:
 *  1. Google スプレッドシートを新規作成
 *  2. 「拡張機能」→「Apps Script」を開く
 *  3. このファイルの内容をすべて貼り付けて保存
 *  4. 右上の「デプロイ」→「新しいデプロイ」
 *     - 種類: 「ウェブアプリ」
 *     - 次のユーザーとして実行: 自分
 *     - アクセスできるユーザー: 全員
 *  5. 「デプロイ」をクリック → 表示された URL をコピー
 *  6. 音声録音アプリの「📊 シート保存設定」に貼り付けて「保存」
 */

// ===== 設定 =====
const INDEX_SHEET  = 'index';   // 一覧シート名
const DATE_FORMAT  = 'yyyy-MM-dd HH:mm'; // シートタブ名フォーマット

// ===== エントリポイント =====
function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const ss   = SpreadsheetApp.getActiveSpreadsheet();

    // 1) index シートを確保
    const indexSheet = getOrCreateIndex_(ss);

    // 2) 新しい MTG シートを作成
    const createdAt  = data.createdAt ? new Date(data.createdAt) : new Date();
    const sheetTitle = makeSheetTitle_(ss, createdAt);
    const mtgSheet   = ss.insertSheet(sheetTitle);
    fillMtgSheet_(mtgSheet, data, createdAt);

    // 3) index に 1 行追加
    const durationStr = formatDuration_(Number(data.durationSec || 0));
    indexSheet.appendRow([
      indexSheet.getLastRow(), // No.
      createdAt,
      durationStr,
      Number((data.text || '').length),
      sheetTitle,
      String(data.summary || '').slice(0, 120) + (String(data.summary || '').length > 120 ? '…' : ''),
    ]);

    // index の最終行をハイパーリンク化（シート名でジャンプ）
    const lastRow    = indexSheet.getLastRow();
    const ssId       = ss.getId();
    const gid        = mtgSheet.getSheetId();
    const linkFormula = `=HYPERLINK("https://docs.google.com/spreadsheets/d/${ssId}/edit#gid=${gid}","${sheetTitle}")`;
    indexSheet.getRange(lastRow, 5).setFormula(linkFormula);

    return jsonOut_({ ok: true, sheet: sheetTitle });
  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return jsonOut_({ ok: true, msg: 'voice-transcriber endpoint is alive. Use POST to append rows.' });
}

// ===== MTG シート作成 =====
function fillMtgSheet_(sheet, data, createdAt) {
  const durationStr = formatDuration_(Number(data.durationSec || 0));
  const text        = String(data.text    || '（文字起こしなし）');
  const summary     = String(data.summary || '（要約なし）');

  // --- ヘッダー情報ブロック ---
  const meta = [
    ['📅 日時',   Utilities.formatDate(createdAt, Session.getScriptTimeZone(), 'yyyy年MM月dd日 HH:mm:ss')],
    ['⏱ 長さ',   durationStr],
    ['📝 文字数', (data.text || '').length + '文字'],
    ['🆔 ID',     String(data.id || '')],
  ];
  meta.forEach(([k, v], i) => {
    sheet.getRange(i + 1, 1).setValue(k).setFontWeight('bold');
    sheet.getRange(i + 1, 2).setValue(v);
  });

  const rowOffset = meta.length + 2;

  // --- AI 要約ブロック ---
  sheet.getRange(rowOffset, 1).setValue('✨ AI 要約')
    .setFontWeight('bold').setFontSize(12)
    .setBackground('#1e3a2f').setFontColor('#86efac');
  sheet.getRange(rowOffset, 1, 1, 6).merge().setBackground('#1e3a2f');

  const summaryLines = summary.split('\n');
  summaryLines.forEach((line, i) => {
    sheet.getRange(rowOffset + 1 + i, 1).setValue(line);
    sheet.getRange(rowOffset + 1 + i, 1, 1, 6).merge();
  });

  const textOffset = rowOffset + summaryLines.length + 2;

  // --- 全文テキストブロック ---
  sheet.getRange(textOffset, 1).setValue('📄 全文テキスト')
    .setFontWeight('bold').setFontSize(12)
    .setBackground('#1e2a3a').setFontColor('#93c5fd');
  sheet.getRange(textOffset, 1, 1, 6).merge().setBackground('#1e2a3a');

  const textLines = text.split('\n');
  textLines.forEach((line, i) => {
    sheet.getRange(textOffset + 1 + i, 1).setValue(line);
    sheet.getRange(textOffset + 1 + i, 1, 1, 6).merge();
  });

  // --- 列幅調整 ---
  sheet.setColumnWidth(1, 120);
  sheet.setColumnWidth(2, 600);
  sheet.setFrozenRows(0);
}

// ===== index シート初期化 =====
function getOrCreateIndex_(ss) {
  let sheet = ss.getSheetByName(INDEX_SHEET);
  if (!sheet) {
    // 末尾ではなく先頭に挿入
    sheet = ss.insertSheet(INDEX_SHEET, 0);
    const headers = ['No.', '日時', '長さ', '文字数', 'シート', '要約(冒頭)'];
    sheet.appendRow(headers);
    const hRange = sheet.getRange(1, 1, 1, headers.length);
    hRange.setFontWeight('bold').setBackground('#0f172a').setFontColor('#f1f5f9');
    sheet.setFrozenRows(1);
    sheet.setColumnWidth(1, 50);
    sheet.setColumnWidth(2, 160);
    sheet.setColumnWidth(3, 80);
    sheet.setColumnWidth(4, 80);
    sheet.setColumnWidth(5, 180);
    sheet.setColumnWidth(6, 400);
  }
  return sheet;
}

// ===== ユーティリティ =====
function makeSheetTitle_(ss, date) {
  const base    = Utilities.formatDate(date, Session.getScriptTimeZone(), DATE_FORMAT);
  let   title   = base;
  let   suffix  = 2;
  // 同名があれば連番を付ける
  while (ss.getSheetByName(title)) {
    title = base + ' (' + suffix + ')';
    suffix++;
  }
  return title;
}

function formatDuration_(sec) {
  if (!sec) return '0秒';
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  let str = '';
  if (h) str += h + '時間';
  if (m) str += m + '分';
  if (s || !str) str += s + '秒';
  return str;
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
