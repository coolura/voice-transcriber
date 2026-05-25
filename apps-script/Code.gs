/**
 * 音声録音 & テキスト化アプリ用 Google Apps Script Web App
 * Notion API への中継役として動作します。
 *
 * ===== 初回セットアップ手順 =====
 *
 * 【1】Notion インテグレーションを作成
 *   https://www.notion.so/my-integrations
 *   → 「新しいインテグレーション」→ 名前: voice-transcriber → 送信
 *   → 「シークレット」をコピー（secret_xxx...）
 *
 * 【2】Notion にデータベースを作成
 *   Notion で新しいページ → 「/database」→ 「データベース（インライン）」を選択
 *   → 作成したデータベースの URL から ID をコピー:
 *     https://www.notion.so/username/【ここの32文字】?v=...
 *
 * 【3】データベースをインテグレーションと共有
 *   データベース右上の「...」→「接続先」→ voice-transcriber を選択
 *
 * 【4】このスクリプトに認証情報を保存（1回だけ実行）
 *   下の setNotionCredentials() の 2 行を書き換えて保存
 *   → 上部メニュー「実行」→「実行する関数を選択: setNotionCredentials」→「実行」
 *   → ログに「✅ 設定完了」と出たら、トークンと ID の行を元の説明文に戻して保存
 *
 * 【5】再デプロイ（デプロイを管理 → 新しいバージョン → デプロイ）
 *   ※ URL は変わりません
 */

// ===== 初回のみ実行する設定関数 =====
function setNotionCredentials() {
  PropertiesService.getScriptProperties().setProperties({
    NOTION_TOKEN:       'ここに Notion インテグレーションのシークレットを貼り付け',
    NOTION_DATABASE_ID: 'ここに Notion データベース ID を貼り付け',
  });
  Logger.log('✅ 設定完了');
}

// ===== メイン: POST を受け取って Notion にページを追加 =====
function doPost(e) {
  try {
    const props  = PropertiesService.getScriptProperties();
    const token  = props.getProperty('NOTION_TOKEN');
    const dbId   = props.getProperty('NOTION_DATABASE_ID');

    if (!token || !dbId || token.startsWith('ここに')) {
      return jsonOut_({ ok: false, error: 'Notion の認証情報が未設定です。setNotionCredentials() を実行してください。' });
    }

    const data      = JSON.parse(e.postData.contents);
    const createdAt = data.createdAt ? new Date(data.createdAt) : new Date();
    const tz        = Session.getScriptTimeZone();
    const title     = Utilities.formatDate(createdAt, tz, 'yyyy-MM-dd HH:mm') + ' MTG';
    const duration  = formatDuration_(Number(data.durationSec || 0));

    const body = {
      parent:     { database_id: dbId },
      icon:       { type: 'emoji', emoji: '🎙️' },
      properties: {
        '名前': { title: [{ text: { content: title } }] },
      },
      children: buildBlocks_(
        Utilities.formatDate(createdAt, tz, 'yyyy年MM月dd日 HH:mm:ss'),
        duration,
        Number((data.text || '').length),
        String(data.summary || ''),
        String(data.text    || ''),
      ),
    };

    const res     = UrlFetchApp.fetch('https://api.notion.com/v1/pages', {
      method:          'post',
      headers:         notionHeaders_(token),
      payload:         JSON.stringify(body),
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
  return jsonOut_({ ok: true, msg: 'voice-transcriber Notion endpoint is alive.' });
}

// ===== Notion ブロック構築 =====
function buildBlocks_(dateStr, duration, charCount, summary, text) {
  const blocks = [];

  // メタ情報 callout
  blocks.push({
    object: 'block', type: 'callout',
    callout: {
      icon:      { type: 'emoji', emoji: '📋' },
      rich_text: [{ text: { content:
        '日時: ' + dateStr + '　長さ: ' + duration + '　文字数: ' + charCount + '文字'
      } }],
      color: 'gray_background',
    },
  });

  // AI 要約
  blocks.push(heading2_('✨ AI 要約'));
  chunkText_(summary || '（要約なし）').forEach(function(chunk) {
    blocks.push(paragraph_(chunk));
  });

  blocks.push({ object: 'block', type: 'divider', divider: {} });

  // 全文テキスト
  blocks.push(heading2_('📄 全文テキスト'));
  chunkText_(text || '（文字起こしなし）').forEach(function(chunk) {
    blocks.push(paragraph_(chunk));
  });

  return blocks;
}

function heading2_(content) {
  return {
    object: 'block', type: 'heading_2',
    heading_2: { rich_text: [{ text: { content: content } }] },
  };
}

function paragraph_(content) {
  return {
    object: 'block', type: 'paragraph',
    paragraph: { rich_text: [{ text: { content: content } }] },
  };
}

// Notion rich_text は 2000 文字制限
function chunkText_(text) {
  var chunks = [];
  for (var i = 0; i < text.length; i += 1900) {
    chunks.push(text.slice(i, i + 1900));
  }
  return chunks.length ? chunks : [''];
}

// ===== ユーティリティ =====
function notionHeaders_(token) {
  return {
    'Authorization':  'Bearer ' + token,
    'Notion-Version': '2022-06-28',
    'Content-Type':   'application/json',
  };
}

function formatDuration_(sec) {
  if (!sec) return '0秒';
  var h = Math.floor(sec / 3600), m = Math.floor((sec % 3600) / 60), s = sec % 60;
  return (h ? h + '時間' : '') + (m ? m + '分' : '') + (s || (!h && !m) ? s + '秒' : '');
}

function jsonOut_(obj) {
  return ContentService
    .createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
