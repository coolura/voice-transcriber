# MTG 録音メモ

ブラウザだけで動く MTG 録音 / 文字起こし / AI要約アプリ。

## 利用者向けガイド

GitHub Pages で公開: https://coolura.github.io/voice-transcriber/guide.html

## 管理者向け: Apps Script のセットアップ

GAS URL を `index.html` の `GAS_URL` 定数に設定するための手順です。

1. [Google Apps Script](https://script.google.com/home) を開く
2. 「新しいプロジェクト」を作成
3. `apps-script/Code.gs` の内容を全部コピーして貼り付け、保存
4. 右上の「デプロイ」→「新しいデプロイ」
   - 種類: **ウェブアプリ**
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員**
5. 「デプロイ」→ 初回は権限確認に従って許可
6. 表示された **ウェブアプリ URL** を `index.html` の `const GAS_URL = '...'` に設定
7. コミット & プッシュ

コード更新時は「デプロイを管理」→ 編集 →「新バージョン」→「デプロイ」で反映（URL は変わりません）。

利用者ごとの保存先（スプレッドシート ID / Notion DB ID / Notion トークン）はブラウザの設定画面で利用者自身が入力するため、Apps Script のコード編集は不要です。
