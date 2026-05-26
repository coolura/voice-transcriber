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
 * 1. SPREADSHEET_ID に管理DBとして使う自分のスプレッドシートIDを設定
 * 2. Webアプリとしてデプロイし、URLを index.html の GAS_URL に設定
 * 3. WebアプリURLにアクセスして「利用者設定」シートを作成
 * 4. 管理DBスプレッドシートに利用者ID / 初期パスワード / 利用者名を登録
 * 5. 利用者にログイン情報を渡し、アプリの設定画面から保存先を登録してもらう
 * 6. コード更新時は「デプロイを管理」→「新バージョン」→「デプロイ」
 */

// ===== 管理DB / 保存先設定 =====
// このスプレッドシートをSaaS利用者設定の管理DBとして使います。
const SPREADSHEET_ID       = '1THwJXYyFXD5CcZAiY3FOL7xfb51SPQMq99ctA7UF5T8';
const SETTINGS_SHEET_NAME  = '利用者設定';
const SHEET_NAME           = 'MTG録音';
const SHEET_HEADERS        = ['日時', 'クライアント名', 'MTG日', '長さ(秒)', '長さ', '文字数', 'AI要約', '全文テキスト', 'ID'];
const SETTINGS_HEADERS     = [
  '利用者ID',
  'パスワードハッシュ',
  '初期パスワード',
  '利用者名',
  '保存先スプレッドシートID',
  'Notion DB ID',
  'Notionトークン',
  'Gemini APIキー',
  'Geminiモデル',
  'AI要約プロンプト',
  'Googleカレンダー クライアントID',
  'Googleカレンダー埋め込みURL',
  'Googleカレンダー表示件数',
  '有効',
  '作成日時',
  '更新日時',
];

const SESSION_TTL_SEC = 60 * 60 * 24 * 7;
const DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
const DEFAULT_PROMPT = `以下はMTGを音声録音・文字起こししたテキストです。日本語でMTG議事録として整理してください。

## 要約
（全体を1〜2文で簡潔に）

## 主な内容・議題
・（箇条書きで3〜5項目）

## 決定事項・ネクストアクション
・（あれば記載、なければ「特になし」）

---
文字起こし:
"""
\${text}
"""`;

// ===== 任意: 後方互換用のデフォルトNotion設定 =====
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
    if (data.action) return handleAction_(data);

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
  ensureSettingsSheet_();
  return jsonOut_({ ok: true, msg: 'MTG録音メモ endpoint alive (Login + Settings + Notion + Sheet)' });
}

/* ===== ログイン / 利用者設定 API ===== */
function handleAction_(data) {
  switch (data.action) {
    case 'login':
      return jsonOut_(login_(data));
    case 'getSettings':
      return jsonOut_(withAuth_(data, function(user) {
        return { ok: true, user: publicUser_(user), settings: publicSettings_(user) };
      }));
    case 'saveSettings':
      return jsonOut_(withAuth_(data, function(user) {
        const updated = saveUserSettings_(user, data.settings || {});
        return { ok: true, user: publicUser_(updated), settings: publicSettings_(updated) };
      }));
    case 'saveRecording':
      return jsonOut_(withAuth_(data, function(user) {
        return saveRecordingForUser_(user, data.recording || {});
      }));
    default:
      return jsonOut_({ ok: false, error: '不明な action です: ' + data.action });
  }
}

function login_(data) {
  const userId = String(data.userId || '').trim();
  const password = String(data.password || '');
  if (!userId || !password) return { ok: false, error: '利用者IDとパスワードを入力してください' };

  let user = findUser_(userId);
  if (!user || !isActive_(user.active)) return { ok: false, error: 'ログイン情報が正しくありません' };

  const passwordHash = hashPassword_(userId, password);
  if (user.initialPassword && user.initialPassword === password) {
    setUserPasswordHash_(user.row, userId, password);
    user = findUser_(userId);
  } else if (user.passwordHash !== passwordHash) {
    return { ok: false, error: 'ログイン情報が正しくありません' };
  }

  return {
    ok: true,
    token: createSessionToken_(userId),
    user: publicUser_(user),
    settings: publicSettings_(user),
  };
}

function withAuth_(data, fn) {
  const userId = verifySessionToken_(String(data.token || ''));
  if (!userId) return { ok: false, error: 'AUTH_REQUIRED' };
  const user = findUser_(userId);
  if (!user || !isActive_(user.active)) return { ok: false, error: 'AUTH_REQUIRED' };
  return fn(user);
}

function saveUserSettings_(user, settings) {
  const sheet = ensureSettingsSheet_();
  const row = user.row;
  const now = new Date();
  const values = sheet.getRange(row, 1, 1, SETTINGS_HEADERS.length).getValues()[0];
  const updates = {
    displayName:              valueOrExisting_(settings.displayName, values[3]),
    spreadsheetId:            valueOrExisting_(settings.spreadsheetId, values[4]),
    notionDatabaseId:         valueOrExisting_(settings.notionDatabaseId, values[5]),
    notionToken:              secretOrExisting_(settings.notionToken, values[6]),
    geminiApiKey:             secretOrExisting_(settings.geminiApiKey, values[7]),
    geminiModel:              valueOrExisting_(settings.geminiModel, values[8] || DEFAULT_GEMINI_MODEL),
    prompt:                   valueOrExisting_(settings.prompt, values[9] || DEFAULT_PROMPT),
    gcalClientId:             valueOrExisting_(settings.gcalClientId, values[10]),
    gcalEmbedUrl:             valueOrExisting_(settings.gcalEmbedUrl, values[11]),
    gcalCount:                valueOrExisting_(settings.gcalCount, values[12] || 5),
  };

  sheet.getRange(row, 4, 1, 10).setValues([[
    updates.displayName,
    updates.spreadsheetId,
    updates.notionDatabaseId,
    updates.notionToken,
    updates.geminiApiKey,
    updates.geminiModel,
    updates.prompt,
    updates.gcalClientId,
    updates.gcalEmbedUrl,
    updates.gcalCount,
  ]]);
  sheet.getRange(row, 16).setValue(now);
  return findUser_(user.userId);
}

function saveRecordingForUser_(user, recording) {
  const destinations = Array.isArray(recording.destinations) && recording.destinations.length
                     ? recording.destinations
                     : ['notion'];
  const data = {
    id:          String(recording.id || Utilities.getUuid()),
    clientName:  String(recording.clientName || ''),
    mtgDate:     String(recording.mtgDate || ''),
    text:        String(recording.text || ''),
    durationSec: Number(recording.durationSec || 0),
    createdAt:   recording.createdAt || new Date().toISOString(),
    destinations: destinations,
  };

  let summary = '';
  let summaryError = '';
  try {
    summary = geminiSummarize_(data.text, String(recording.agenda || ''), user);
  } catch (err) {
    summaryError = String(err && err.message || err);
  }
  data.summary = summary;

  const results = {};
  if (destinations.indexOf('notion') !== -1) {
    results.notion = saveToNotion_(data, user);
  }
  if (destinations.indexOf('sheet') !== -1) {
    results.sheet = saveToSheet_(data, user);
  }
  const allOk = Object.keys(results).every(function(k) { return results[k].ok; });
  return { ok: allOk, summary: summary, summaryError: summaryError, results: results };
}

/* ===== 利用者設定DB ===== */
function ensureSettingsSheet_() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  let sheet = ss.getSheetByName(SETTINGS_SHEET_NAME);
  if (!sheet) {
    sheet = ss.insertSheet(SETTINGS_SHEET_NAME);
    sheet.appendRow(SETTINGS_HEADERS);
    sheet.getRange(1, 1, 1, SETTINGS_HEADERS.length)
      .setFontWeight('bold')
      .setBackground('#0f172a')
      .setFontColor('#f1f5f9');
    sheet.setFrozenRows(1);
    sheet.setColumnWidths(1, SETTINGS_HEADERS.length, 160);
    sheet.setColumnWidth(10, 420);
  } else {
    const lastColumn = Math.max(sheet.getLastColumn(), SETTINGS_HEADERS.length);
    const headers = sheet.getRange(1, 1, 1, lastColumn).getValues()[0];
    if (headers[0] === '利用者ID' && headers[1] === 'パスワードハッシュ' && headers[2] !== '初期パスワード') {
      sheet.insertColumnAfter(2);
    }
    sheet.getRange(1, 1, 1, SETTINGS_HEADERS.length).setValues([SETTINGS_HEADERS]);
  }
  return sheet;
}

function findUser_(userId) {
  const sheet = ensureSettingsSheet_();
  const rows = sheet.getDataRange().getValues();
  for (var i = 1; i < rows.length; i++) {
    if (String(rows[i][0]).trim() === userId) {
      return rowToUser_(rows[i], i + 1);
    }
  }
  return null;
}

function rowToUser_(row, rowNumber) {
  return {
    row: rowNumber,
    userId: String(row[0] || '').trim(),
    passwordHash: String(row[1] || ''),
    initialPassword: String(row[2] || ''),
    displayName: String(row[3] || ''),
    spreadsheetId: String(row[4] || ''),
    notionDatabaseId: String(row[5] || ''),
    notionToken: String(row[6] || ''),
    geminiApiKey: String(row[7] || ''),
    geminiModel: String(row[8] || DEFAULT_GEMINI_MODEL),
    prompt: String(row[9] || DEFAULT_PROMPT),
    gcalClientId: String(row[10] || ''),
    gcalEmbedUrl: String(row[11] || ''),
    gcalCount: String(row[12] || '5'),
    active: row[13],
    createdAt: row[14],
    updatedAt: row[15],
  };
}

function publicUser_(user) {
  return {
    userId: user.userId,
    displayName: user.displayName,
  };
}

function publicSettings_(user) {
  return {
    displayName: user.displayName,
    spreadsheetId: user.spreadsheetId,
    notionDatabaseId: user.notionDatabaseId,
    hasNotionToken: Boolean(user.notionToken),
    hasGeminiApiKey: Boolean(user.geminiApiKey),
    geminiModel: user.geminiModel || DEFAULT_GEMINI_MODEL,
    prompt: user.prompt || DEFAULT_PROMPT,
    gcalClientId: user.gcalClientId,
    gcalEmbedUrl: user.gcalEmbedUrl,
    gcalCount: user.gcalCount || '5',
  };
}

function isActive_(active) {
  return String(active).toUpperCase() !== 'FALSE';
}

function valueOrExisting_(value, existing) {
  return value === undefined || value === null ? existing : String(value);
}

function secretOrExisting_(value, existing) {
  const v = value === undefined || value === null ? '' : String(value).trim();
  return v ? v : existing;
}

function setUserPasswordHash_(row, userId, password) {
  const sheet = ensureSettingsSheet_();
  sheet.getRange(row, 2).setValue(hashPassword_(userId, password));
  sheet.getRange(row, 3).clearContent();
  sheet.getRange(row, 16).setValue(new Date());
}

/* ===== Notion 保存 ===== */
function saveToNotion_(data, user) {
  try {
    const props = PropertiesService.getScriptProperties();
    const token = (user && user.notionToken) || data.notionToken || props.getProperty('NOTION_TOKEN');
    const dbId  = (user && user.notionDatabaseId) || data.notionDatabaseId || props.getProperty('NOTION_DATABASE_ID');
    if (!token || token.startsWith('ここに')) {
      return { ok: false, error: 'Notion トークンが未設定です' };
    }
    if (!dbId) {
      return { ok: false, error: 'Notion DB ID が未設定です' };
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
function saveToSheet_(data, user) {
  try {
    const ss    = SpreadsheetApp.openById((user && user.spreadsheetId) || data.spreadsheetId || SPREADSHEET_ID);
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

/* ===== Gemini 要約 ===== */
function geminiSummarize_(text, agenda, user) {
  const key = user && user.geminiApiKey;
  if (!key) throw new Error('Gemini API キーが未設定です');
  if (!text) throw new Error('要約対象のテキストがありません');

  const model = user.geminiModel || DEFAULT_GEMINI_MODEL;
  const template = user.prompt || DEFAULT_PROMPT;
  let prompt = template.replace('${text}', text);
  if (agenda) prompt = '【MTGのアジェンダ】\n' + agenda + '\n\n' + prompt;

  const res = UrlFetchApp.fetch(
    'https://generativelanguage.googleapis.com/v1beta/models/' + encodeURIComponent(model) + ':generateContent?key=' + encodeURIComponent(key),
    {
      method: 'post',
      contentType: 'application/json',
      payload: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: { temperature: 0.2, maxOutputTokens: 1024 },
      }),
      muteHttpExceptions: true,
    }
  );
  const body = JSON.parse(res.getContentText() || '{}');
  if (res.getResponseCode() < 200 || res.getResponseCode() >= 300) {
    throw new Error('Gemini ' + res.getResponseCode() + ': ' + ((body.error && body.error.message) || res.getContentText()));
  }
  const parts = body.candidates && body.candidates[0] && body.candidates[0].content && body.candidates[0].content.parts;
  const out = parts ? parts.map(function(p) { return p.text || ''; }).join('\n').trim() : '';
  if (!out) throw new Error('要約結果が空でした');
  return out;
}

/* ===== 認証ユーティリティ ===== */
function hashPassword_(userId, password) {
  return hmacHex_(getAppSecret_(), userId + ':' + password);
}

function createSessionToken_(userId) {
  const payload = {
    userId: userId,
    exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SEC,
    nonce: Utilities.getUuid(),
  };
  const encoded = base64UrlEncode_(JSON.stringify(payload));
  return encoded + '.' + hmacHex_(getAppSecret_(), encoded);
}

function verifySessionToken_(token) {
  const parts = token.split('.');
  if (parts.length !== 2) return '';
  const expected = hmacHex_(getAppSecret_(), parts[0]);
  if (expected !== parts[1]) return '';
  try {
    const payload = JSON.parse(Utilities.newBlob(base64UrlDecode_(parts[0])).getDataAsString());
    if (!payload.exp || payload.exp < Math.floor(Date.now() / 1000)) return '';
    return String(payload.userId || '');
  } catch (_) {
    return '';
  }
}

function getAppSecret_() {
  const props = PropertiesService.getScriptProperties();
  let secret = props.getProperty('APP_SECRET');
  if (!secret) {
    secret = Utilities.getUuid() + Utilities.getUuid();
    props.setProperty('APP_SECRET', secret);
  }
  return secret;
}

function hmacHex_(secret, message) {
  const bytes = Utilities.computeHmacSha256Signature(message, secret);
  return bytes.map(function(b) {
    const v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function base64UrlEncode_(text) {
  return Utilities.base64EncodeWebSafe(text).replace(/=+$/, '');
}

function base64UrlDecode_(text) {
  let padded = text;
  while (padded.length % 4) padded += '=';
  return Utilities.base64DecodeWebSafe(padded);
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
