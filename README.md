# 音声録音 & テキスト化

ブラウザだけで動く音声録音 / 文字起こし / AI要約アプリ。

## 機能
- マイクで録音 (MediaRecorder, WebM/Opus)
- 日本語リアルタイム文字起こし (Web Speech API)
- Gemini API による AI 要約
- **Google スプレッドシートへの自動保存** (Apps Script Web App 経由)
- IndexedDB にローカル保存 (録音音声・テキスト・要約)
- 一覧表示 / 検索 / 編集 / 音声再生 / ダウンロード / JSONエクスポート

## 公開 URL
https://coolura.github.io/voice-transcriber/

## 使い方
1. Chrome または Edge でアクセス
2. マイクの利用を許可
3. 「録音開始」→ 話す → 「停止 & 保存」
4. (任意) 上部の「⚙️ AI 要約設定」に [Gemini API キー](https://aistudio.google.com/app/apikey) を入力 → 各項目の「要約」ボタン

## Google スプレッドシート連携セットアップ
1. [新しいスプレッドシート](https://sheets.new) を作成
2. メニュー「拡張機能」→「Apps Script」
3. [`apps-script/Code.gs`](apps-script/Code.gs) の内容を全部コピーして貼り付け、保存
4. 右上「デプロイ」→「新しいデプロイ」
   - 種類: **ウェブアプリ**
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員** (URL を知っている人のみアクセス可)
5. 「デプロイ」→ 表示された **ウェブアプリ URL** をコピー
6. アプリ画面の「📊 シート保存設定」に URL を貼り付け → 「保存」
7. 「接続テスト」を押してシートに 1 行追加されることを確認

「録音停止後に自動で要約 → シート送信」にチェックを入れると、停止ボタンを押すだけで全自動になります。

## 注意
- データはすべてブラウザのローカル (IndexedDB / localStorage) に保存されます。
- 外部送信は (1) Gemini API への要約リクエスト、(2) 指定した Apps Script Web App へのシート送信、のみです。
- API キーと Web App URL は利用者ご自身のブラウザにのみ保存されます。
