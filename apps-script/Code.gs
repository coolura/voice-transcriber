/**
 * MTG 録音メモ - Google Apps Script Web App
 * Notion API への中継役。クライアント名・MTG日・要約・全文を保存します。
 *
 * ===== 初回セットアップ =====
 * 1. https://www.notion.so/my-integrations でインテグレーション作成 → トークン取得
 * 2. Notion にデータベース作成 → インテグレーションと接続
 * 3. setNotionCredentials() のトークンと DB ID を書き換えて「実行」
 * 4. ログに「✅ 設定完了」が出たら、トークン行を削除して再保存
 * 5. デプロイを管理 → 新しいバージョン → デプロイ（URL は変わりません）
 */

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
    const props = PropertiesService.getScriptProperties();
    const token = props.getProperty('NOTION_TOKEN');
    const dbId  = props.getProperty('NOTION_DATABASE_ID');
    if (!token || token.startsWith('ここに')) {
      return jsonOut_({ ok: false, error: 'setNotionCredentials() を先に実行してください' });
    }

    const data        = JSON.parse(e.postData.contents);
    const clientName  = String(data.clientName || '').trim() || '不明';
    const mtgDate     = String(data.mtgDate || '');
    const createdAt   = data.createdAt ? new Date(data.createdAt) : new Date();
    const tz          = Session.getScriptTimeZone();

    // ページタイトル: 「山田商事 - 2026-05-25」
    const title = clientName + (mtgDate ? ' - ' + mtgDate : '');

    // 日本語表示用の日付
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
      return jsonOut_({ ok: false, error: resData.message || 'Notion API エラー' });
    }
    return jsonOut_({ ok: true, url: resData.url });

  } catch (err) {
    return jsonOut_({ ok: false, error: String(err && err.message || err) });
  }
}

function doGet() {
  return jsonOut_({ ok: true, msg: 'MTG録音メモ Notion endpoint alive' });
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
  // 'YYYY-MM-DD' → '2026年5月25日'
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
