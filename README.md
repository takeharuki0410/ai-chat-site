# AI Chat（GitHub Pages + Cloudflare Workers）

純粋なHTML/CSS/JavaScriptで作ったAIチャットです。フロントエンドはGitHub Pages、API中継はCloudflare Workersで動かします。

```text
ブラウザ（GitHub Pages） → Cloudflare Workers → OpenAI Responses API
          履歴を保存             APIキーを保持
```

APIキーはブラウザやGitHubリポジトリに置きません。ニックネームと履歴はブラウザの`localStorage`だけに保存され、Workers側では保存しません。OpenAIへのリクエストにも`store: false`を指定しています。

## ファイルを置く場所

| 公開先 | ファイル |
|---|---|
| GitHub Pages | `index.html`、`style.css`、`script.js`、`README.md` |
| Cloudflare Workers | `worker.js`のコード |

ソースコード内で公開前に必ず変更するのは、`script.js`先頭の`API_ENDPOINT`だけです。別途、Cloudflare Workers側でSecretの`OPENAI_API_KEY`を設定する必要があります。`ALLOWED_ORIGIN`は任意ですが、公開後の利用元をGitHub Pagesに絞るため設定を推奨します。

## 1. GitHub Pagesで公開する

1. この5ファイルをGitHubリポジトリのルートへ置き、pushします。
2. GitHubのリポジトリを開き、**Settings → Pages**へ進みます。
3. **Build and deployment**のSourceで「Deploy from a branch」を選びます。
4. Branchを`main`、フォルダを`/(root)`にして保存します。
5. 数分後、表示された`https://ユーザー名.github.io/リポジトリ名/`を開きます。

先にWorkersを公開し、`script.js`のURLを変更してからGitHub Pagesを公開すると、そのまま会話できます。

## 2. Cloudflare Workersにworker.jsを置く

Cloudflareダッシュボードを使う簡単な方法です。

1. [Cloudflare Dashboard](https://dash.cloudflare.com/)へログインします。
2. **Workers & Pages → Create application → Create Worker**へ進みます。
3. Worker名を決めて作成し、コード編集画面を開きます。
4. 初期コードをすべて削除し、このリポジトリの`worker.js`を貼り付けます。
5. **Deploy**を押します。
6. 表示された`https://○○.workers.dev`のURLを控えます。

`worker.js`冒頭の`MODEL`はAIモデルの指定です。アカウントで利用できない場合は、利用可能なResponses API対応モデルへ変更してください。

## 3. OPENAI_API_KEYを設定する

1. 作成したWorkerの **Settings → Variables and Secrets** を開きます。
2. **Add**を押し、種類は必ず暗号化される**Secret**を選びます。
3. 名前を`OPENAI_API_KEY`、値を自分のOpenAI APIキーにします。
4. 保存後、Workerを再デプロイします。

公開サイト以外からの利用を防ぎたい場合は、同じ画面で通常の環境変数`ALLOWED_ORIGIN`も追加し、値をGitHub Pagesのオリジン（例：`https://example.github.io`、末尾の`/`なし）にします。未設定時はすべてのオリジンをCORSで許可します。

## 4. API_ENDPOINTを変更する

`script.js`先頭の次の1行を、手順2で控えたWorkers URLへ変更します。

```js
const API_ENDPOINT = "https://あなたのWorker名.あなたのサブドメイン.workers.dev";
```

変更後にGitHubへpushし直します。URLの末尾に余分なパスは不要です。

## 5. APIキーをフロントエンドに書いてはいけない理由

HTMLやJavaScriptは、サイトを見た人のブラウザへそのまま配信されます。開発者ツールやソース表示から誰でも内容を確認できるため、APIキーを書くと盗まれ、不正利用や高額請求につながります。GitHubリポジトリを非公開にしても、GitHub Pagesで配信されたJavaScript内のキーは見えてしまいます。

APIキーは必ずCloudflare WorkersのSecretとして保存してください。誤ってGitHubへpushした場合は、ファイルから消すだけでは不十分です。OpenAI側でそのキーを直ちに無効化し、新しいキーを発行してください。


## セキュリティ上の補足
- このサンプルのWorkersは会話をDBやKVへ保存しません。ただし、運用時のCloudflare/OpenAI側のログやデータ取り扱いは各サービスの設定・ポリシーも確認してください。
