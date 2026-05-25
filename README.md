# 音声録音 & テキスト化

ブラウザだけで動く音声録音 / 文字起こし / AI要約アプリ。

## 機能
- マイクで録音 (MediaRecorder, WebM/Opus)
- 日本語リアルタイム文字起こし (Web Speech API)
- Gemini API による AI 要約
- IndexedDB にローカル保存 (録音音声・テキスト・要約)
- 一覧表示 / 検索 / 編集 / 音声再生 / ダウンロード / JSONエクスポート

## 使い方
1. Chrome または Edge でアクセス
2. マイクの利用を許可
3. 「録音開始」→ 話す → 「停止 & 保存」
4. (任意) 上部の「⚙️ AI 要約設定」に [Gemini API キー](https://aistudio.google.com/app/apikey) を入力 → 各項目の「要約」ボタン

## 注意
- データはすべてブラウザのローカル (IndexedDB / localStorage) に保存されます。サーバ側には何も送信されません。
- AI 要約時のみ Gemini API へテキストを送信します。
- API キーは利用者ご自身のブラウザにのみ保存されます。
