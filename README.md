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

- **Notion Apps Script URL（保存用 URL）**: 自分で作成した Apps Script の Web アプリ URL を貼り付けます。
- **スプレッドシート ID**: 自分の Google スプレッドシートに保存したい場合に入力します。
- **Notion DB ID** と **Notion トークン**: 自分の Notion データベースに保存したい場合に入力します。

**Notion Apps Script URL（保存用 URL）** は、Notion やスプレッドシートの URL ではありません。`apps-script/Code.gs` を Google Apps Script の Web アプリとしてデプロイしたときに発行される URL です。

スプレッドシート ID / Notion DB ID / Notion トークンが未入力の場合は、保存用 URL 側に設定されているデフォルトの保存先が使われます。

### Notion Apps Script URL（保存用 URL）について
この URL は管理者から提供されます。利用者が自分で作成する必要はありません。
受け取った URL をアプリ画面の **Notion Apps Script URL（保存用 URL）** 欄に貼り付けて「保存」してください。

### スプレッドシート ID の取得方法
1. [新しいスプレッドシート](https://sheets.new) を作成、または保存先にしたい既存のスプレッドシートを開く
2. ブラウザ上部の URL を確認
3. `/d/` と `/edit` の間にある長い文字列をコピー
4. アプリ画面の **スプレッドシート ID** 欄に貼り付け

URL の例:
`https://docs.google.com/spreadsheets/d/1abcDEFghiJKLMnopQRstuVWxyz/edit#gid=0`

この場合、スプレッドシート ID は `1abcDEFghiJKLMnopQRstuVWxyz` です。

スプレッドシートの共有設定は、通常は自分が編集できる状態であれば問題ありません。保存に失敗する場合は、保存用 URL を作成した Apps Script 側の権限設定を確認してください。

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
2. 自分で作成した **Notion Apps Script URL（保存用 URL）** を入力
3. 必要に応じて **スプレッドシート ID**、**Notion DB ID**、**Notion トークン** を入力
4. 「保存」をクリック
5. 「接続テスト」を押して、Notion またはスプレッドシートにテストデータが保存されることを確認

## 注意
- データはすべてブラウザのローカル (IndexedDB / localStorage) に保存されます。
- 外部送信は (1) Gemini API への要約リクエスト、(2) 指定した Apps Script Web App への送信、(3) Apps Script から Notion API / Google スプレッドシートへの保存、のみです。
- API キー、保存用 URL、スプレッドシート ID、Notion DB ID、Notion トークンは利用者ご自身のブラウザに保存されます。

---

## 管理者向け: Apps Script のセットアップ

利用者に **Notion Apps Script URL（保存用 URL）** を提供するための手順です。利用者側の操作ではありません。

1. [Google Apps Script](https://script.google.com/home) を開く
2. 「新しいプロジェクト」を作成
3. [`apps-script/Code.gs`](apps-script/Code.gs) の内容を全部コピーして、Apps Script の `Code.gs` に貼り付け
4. 上部の保存アイコン、または `Ctrl + S` で保存
5. 右上の「デプロイ」→「新しいデプロイ」をクリック
6. 種類の選択で **ウェブアプリ** を選ぶ
7. 次の設定にする
   - 次のユーザーとして実行: **自分**
   - アクセスできるユーザー: **全員**
8. 「デプロイ」をクリック
9. 初回は Google アカウントの権限確認が出るため、画面の案内に従って許可
10. 表示された **ウェブアプリ URL** を利用者に共有

コードを更新した場合は、「デプロイを管理」→ 対象デプロイの編集 →「新バージョン」→「デプロイ」で最新版を反映します。URL はそのまま使えます。

利用者ごとのスプレッドシート・Notion 保存先はブラウザの設定画面で利用者自身が入力するため、Apps Script のコード編集は不要です。
