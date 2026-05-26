/**
 * MTG 録音メモ - Google Apps Script Web App
 * Notion / Google スプレッドシート 両対応の中継役。
 *
 * 保存先はリクエストの destinations プロパティで選択:
 *   destinations: ['notion']            → Notion のみ
 *   destinations: ['sheet']             → スプレッドシートのみ
 *   destinations: ['notion', 'sheet']   → 両方
 *   未指定                              → Notion のみ（後方互換）
 *
 * ===== 初回セットアップ =====
 * 1. https://www.notion.so/my-integrations でインテグレーション作成 → トークン取得
 * 2. Notion にデータベース作成 → インテグレーションと接続
 * 3. setNotionCredentials() のトークンと DB ID を書き換えて「実行」
 * 4. ログに「✅ 設定完了」が出たら、トークン行を削除して再保存
 * 5. デプロイを管理 → 新しいバージョン → デプロイ（URL は変わりません）
 */

// ===== スプレッドシート設定 =====
const SPREADSHEET_ID = '1THwJXYyFXD5CcZAiY3FOL7xfb51SPQMq99ctA7UF5T8';
const SHEET_NAME     = 'MTG録音';
const SHEET_HEADERS  = ['日時', 'クライアント名', 'MTG日', '長さ(秒)', '長さ', '文字数', 'AI要約', '全文テキスト', 'ID'];

// ===== 初回のみ実行する設定関数 =====
function setNotionCredentials() {
  PropertiesService.getScriptProperties().setProperties({
    NOTION_TOKEN:       'ここに ntn_xxx... を貼り付け',
    NOTION_DATABASE_ID: '36b1e4c4319e80c3bb45f8e6251a16f9',
  });
  Logger.log('✅ 設定完了');
}

/* ===== メイン ===== */
function doPost(e) {
  try {
    const data         = JSON.parse(e.postData.contents);
    const destinations = Array.isArray(data.destinations) && data.destinations.length
                       ? data.destinations
                       : ['notion']; // 後方互換: デフォルトは Notion のみ
    const results = {};

    if (destinations.indexOf('notion') !== -1) {
      results.notion = saveToNotion_(data);
    }
    if (destinations.indexOf('sheet') !== -1) {
      results.sheet = saveToSheet_(data);
    }

    // 全部成功した場合のみ ok: true
    const allOk = Object.keys(results).every(function(k) { return results[k].ok; });
    return jsonOut_({ ok: allOk, results: results });

  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return jsonOut_({ ok: true, msg: 'MTG録音メモ endpoint alive (Notion + Sheet)' });
}

/* ===== Notion 保存 ===== */
function saveToNotion_(data) {
  try {
    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty('NOTION_TOKEN');
    const dbId  = props.getProperty('NOTION_DATABASE_ID');
    if (!token || token.startsWith('ここに')) {
      return { ok: false, error: 'setNotionCredentials() を先に実行してください' };
    }

    const clientName  = String(data.clientName || '').trim() || '不明';
    const mtgDate     = String(data.mtgDate || '');
    const createdAt   = data.createdAt ? new Date(data.createdAt) : new Date();
    const tz          = Session.getScriptTimeZone();
    const title       = clientName + (mtgDate ? ' - ' + mtgDate : '');
    const displayDate = mtgDate ? jpDate_(mtgDate) : Utilities.formatDate(createdAt, tz, 'yyyy年MM月dd日');

    const body = {
      parent:     { database_id: dbId },
      icon:       { type: 'emoji', emoji: '🎙️' },
      properties: { '名前': { title: [{ text: { content: title } }] } },
      children:   buildBlocks_(clientName, displayDate, data, createdAt, tz),
    };

    const res     = UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
      method:             'post',
      headers:            notionHeaders_(token),
      payload:            JSON.stringify(body),
      muteHttpExceptions: true,
    });
    const resData = JSON.parse(res.getContentText());
    if (res.getResponseCode() !== 200) {
      return { ok: false, error: resData.message || 'Notion API エラー' };
    }
    return { ok: true, url: resData.url };

  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

/* ===== スプレッドシート保存（行追加） ===== */
function saveToSheet_(data) {
  try {
    const ss    = SpreadsheetApp.openById(data.spreadsheetId || SPREADSHEET_ID);
    let   sheet = ss.getSheetByName(SHEET_NAME);
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      sheet.appendRow(SHEET_HEADERS);
      sheet.getRange(1, 1, 1, SHEET_HEADERS.length)
        .setFontWeight('bold')
        .setBackground('#0f172a')
        .setFontColor('#f1f5f9');
      sheet.setFrozenRows(1);
      sheet.setColumnWidth(1, 140); // 日時
      sheet.setColumnWidth(2, 140); // クライアント名
      sheet.setColumnWidth(3, 110); // MTG日
      sheet.setColumnWidth(4, 70);  // 長さ(秒)
      sheet.setColumnWidth(5, 90);  // 長さ
      sheet.setColumnWidth(6, 70);  // 文字数
      sheet.setColumnWidth(7, 380); // AI要約
      sheet.setColumnWidth(8, 380); // 全文テキスト
      sheet.setColumnWidth(9, 140); // ID
    }

    const createdAt   = data.createdAt ? new Date(data.createdAt) : new Date();
    const durationSec = Number(data.durationSec || 0);

    sheet.appendRow([
      createdAt,                                // 日時
      String(data.clientName || ''),            // クライアント名
      String(data.mtgDate || ''),               // MTG日
      durationSec,                              // 長さ(秒)
      formatDuration_(durationSec),             // 長さ（人間表記）
      Number((data.text || '').length),         // 文字数
      String(data.summary || ''),               // AI要約
      String(data.text || ''),                  // 全文テキスト
      String(data.id || ''),                    // ID
    ]);

    // 折返表示を有効に
    const lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 7, 1, 2).setWrap(true).setVerticalAlignment('top');

    return { ok: true, row: lastRow };
  } catch (err) {
    return { ok: false, error: String(err && err.message || err) };
  }
}

/* ===== Notion ブロック構築 ===== */
function buildBlocks_(clientName, displayDate, data, createdAt, tz) {
  const tz_     = tz || Session.getScriptTimeZone();
  const timeStr = Utilities.formatDate(createdAt, tz_, 'HH:mm');
  const dur     = formatDuration_(Number(data.durationSec || 0));
  const chars   = (String(data.text || '').length).toLocaleString();
  const summary = String(data.summary || '');
  const text    = String(data.text    || '');
  const blocks  = [];

  // メタ情報 callout
  blocks.push({
    object: 'block', type: 'callout',
    callout: {
      icon:      { type: 'emoji', emoji: '📋' },
      rich_text: [{ text: { content:
        '👤 クライアント: ' + clientName +
        '\n📅 MTG日: ' + displayDate +
        '　' + timeStr +
        '\n⏱ 長さ: ' + dur + '　📝 ' + chars + '文字'
      } }],
      color: 'gray_background',
    },
  });

  // AI 要約
  blocks.push(h2_('✨ AI 要約'));
  chunk_(summary || '（要約なし）').forEach(function(c) { blocks.push(p_(c)); });
  blocks.push({ object: 'block', type: 'divider', divider: {} });

  // 全文テキスト
  blocks.push(h2_('📄 全文テキスト'));
  chunk_(text || '（文字起こしなし）').forEach(function(c) { blocks.push(p_(c)); });

  return blocks;
}

/* ===== ユーティリティ ===== */
function jpDate_(dateStr) {
  try {
    var parts = dateStr.split('-');
    return parts[0] + '年' + Number(parts[1]) + '月' + Number(parts[2]) + '日';
  } catch(_) { return dateStr; }
}
function h2_(t) {
  return { object: 'block', type: 'heading_2', heading_2: { rich_text: [{ text: { content: t } }] } };
}
function p_(t) {
  return { object: 'block', type: 'paragraph', paragraph: { rich_text: [{ text: { content: t } }] } };
}
function chunk_(text) {
  var r = [];
  for (var i = 0; i < text.length; i += 1900) r.push(text.slice(i, i + 1900));
  return r.length ? r : [''];
}
function notionHeaders_(token) {
  return { 'Authorization': 'Bearer ' + token, 'Notion-Version': '2022-06-28', 'Content-Type': 'application/json' };
}
function formatDuration_(sec) {
  if (!sec) return '0秒';
  var h = Math.floor(sec/3600), m = Math.floor((sec%3600)/60), s = sec%60;
  return (h?h+'時間':'') + (m?m+'分':'') + (s||(!h&&!m)?s+'秒':'');
}
function jsonOut_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}
