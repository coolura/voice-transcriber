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

## 保存先設定
アプリの「⚙️ AI 要約設定」内にある保存先設定へ、必要な値を入力します。

- **Notion Apps Script URL（保存用 URL）**: 管理者から共有された URL を貼り付けます。
- **スプレッドシート ID**: 自分の Google スプレッドシートに保存したい場合に入力します。
- **Notion DB ID** と **Notion トークン**: 自分の Notion データベースに保存したい場合に入力します。

未入力の保存先は、管理者が用意したデフォルトの保存先が使われます。

### スプレッドシート ID の取得方法
1. [新しいスプレッドシート](https://sheets.new) を作成、または保存先にしたい既存のスプレッドシートを開く
2. ブラウザ上部の URL を確認
3. `/d/` と `/edit` の間にある長い文字列をコピー
4. アプリ画面の **スプレッドシート ID** 欄に貼り付け

URL の例:
`https://docs.google.com/spreadsheets/d/1abcDEFghiJKLMnopQRstuVWxyz/edit#gid=0`

この場合、スプレッドシート ID は `1abcDEFghiJKLMnopQRstuVWxyz` です。

スプレッドシートの共有設定は、通常は自分が編集できる状態であれば問題ありません。保存に失敗する場合は、管理者に保存用 URL 側の権限設定を確認してください。

「録音停止後に自動で要約 → シート送信」にチェックを入れると、停止ボタンを押すだけで全自動になります。

## Notion 保存先の設定
自分の Notion に保存する場合は、Notion インテグレーションの **トークン** と、保存先データベースの **DB ID** が必要です。

### Notion トークンの取得方法
1. [Notion インテグレーション](https://www.notion.so/my-integrations) を開く
2. 「新しいインテグレーション」をクリック
3. 名前を入力し、関連ワークスペースを選択して作成
4. 作成後の画面で「内部インテグレーションシークレット」を表示またはコピー
5. コピーした `ntn_...` で始まる文字列を、アプリ画面の **Notion トークン** 欄に貼り付け

トークンはパスワードと同じ扱いです。GitHub などに公開しないでください。

### Notion DB ID の取得方法
1. Notion で保存先にするデータベースを開く
2. 右上の「...」→「接続」または「コネクト」から、作成したインテグレーションを追加
3. データベースの URL をコピー
4. URL 内のワークスペース名またはページ名の後ろにある 32 文字の英数字が **Notion DB ID** です。
5. アプリ画面の **Notion DB ID** 欄に貼り付け

URL の例:
`https://www.notion.so/example/36b1e4c4319e80c3bb45f8e6251a16f9?v=xxxxxxxx`

この場合、DB ID は `36b1e4c4319e80c3bb45f8e6251a16f9` です。URL にハイフンが入っている場合は、ハイフンを除いた 32 文字を使ってください。

データベースには、タイトル型のプロパティ **名前** を用意してください。アプリはこの `名前` プロパティに録音メモのタイトルを書き込みます。

### アプリ画面での保存
1. アプリ画面の「⚙️ AI 要約設定」を開く
2. 管理者から共有された **Notion Apps Script URL（保存用 URL）** を入力
3. 必要に応じて **スプレッドシート ID**、**Notion DB ID**、**Notion トークン** を入力
4. 「保存」をクリック
5. 「接続テスト」を押して、Notion またはスプレッドシートにテストデータが保存されることを確認

## 注意
- データはすべてブラウザのローカル (IndexedDB / localStorage) に保存されます。
- 外部送信は (1) Gemini API への要約リクエスト、(2) 指定した Apps Script Web App への送信、(3) Apps Script から Notion API / Google スプレッドシートへの保存、のみです。
- API キー、保存用 URL、スプレッドシート ID、Notion DB ID、Notion トークンは利用者ご自身のブラウザに保存されます。
