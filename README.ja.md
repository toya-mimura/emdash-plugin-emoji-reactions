# reactions — EmDash リアクションボタン プラグイン

[English](./README.md)

記事ページに 💗 🤔 😗 のようなリアクションボタンを置くサンドボックス型プラグインです。
読者は1記事につき1つだけ選べます（もう一度押すと取り消し、別のを押すと付け替え）。

- 追加のD1は不要（EmDashのDBにプラグイン専用領域として保存）
- IPアドレスはそのまま保存せず、サイト固有の塩付きハッシュで「同じ人」を判定
- ボタンの種類・数（最大6個）は管理画面から変更可能
- 管理画面に「よく押された記事 Top 10」を表示

> **プラグインを入れただけではボタンは表示されません。** インストール後に、記事テンプレートへ
> `Reactions.astro` を追加してください（[3. 記事テンプレートにボタンを置く](#3-記事テンプレートにボタンを置く)）。

必要なもの: EmDash 1.x（Cloudflare / D1）、Workers Paid プラン（サンドボックスで使う Worker Loader のため）

## フォルダ構成

```
reactions/
├── emdash-plugin.jsonc      # マニフェスト（権限・storage・管理ページの宣言）
├── src/plugin.ts            # 本体（state / react / admin の3ルート）
├── tests/plugin.test.ts     # Worker Loader上で動くテスト
└── site-snippets/
    └── Reactions.astro      # サイト側に置くボタンのコンポーネント
```

## 1. プラグインをビルド

```bash
cd reactions
pnpm install
pnpm run test     # 任意：本番と同じサンドボックスで動作確認（最後に build も走る）
pnpm run build    # dist/ ができる
```

> **注意:** テストの途中では `dist/index.mjs` が一時的にルート一覧（`"routes"`）抜きで書き出されます。
> `pnpm run test` は最後に build し直すので通常は問題ありませんが、テストを途中で止めたときなどは
> サイトに組み込む前に `dist/index.mjs` に `"routes"` が入っているか確認してください。
> 抜けていると公開ルートが管理者専用扱いになり、`state` が `CSRF_REJECTED` を返してボタンが表示されません。

## 2. EmDash サイトに登録

サイトのフォルダで（reactions と同じ階層に置いた場合）:

```bash
pnpm add file:../reactions
```

`astro.config.mjs`:

```js
import { d1, r2, sandbox } from "@emdash-cms/cloudflare";
import reactions from "reactions";

emdash({
  database: d1({ binding: "DB" }),
  storage: r2({ binding: "MEDIA" }),
  sandboxRunner: sandbox(),
  sandboxed: [reactions],
});
```

`wrangler.jsonc`（Workers Paid が必要。テンプレートではコメントアウトされている）:

```jsonc
"worker_loaders": [{ "binding": "LOADER" }]
```

`src/worker.ts` で `PluginBridge` を export していることも確認してください（`*-cloudflare` テンプレートなら既に入っています）。

## 3. 記事テンプレートにボタンを置く

`site-snippets/Reactions.astro` をサイトの `src/components/` にコピーして、記事ページで:

```astro
---
import Reactions from "../../components/Reactions.astro";
// post は getEmDashEntry などで取得済みの記事
---
<article>
  ...本文...
  <Reactions contentId={post.data.id} heading="良かったらリアクションをどうぞ！" />
</article>
```

`post.id`（スラッグ）ではなく `post.data.id`（データベースのID）を渡してください。スラッグは記事名を変えると変わり、翻訳記事では `/` を含むためプラグインに弾かれます。

Props: `contentId`（必須）、`heading`（空文字で非表示）、`label`（ボタン群の読み上げ名）。CSS で `--rx-accent` を指定するとサイトのアクセントカラーに合わせられます。

ボタンが表示されないときは、ブラウザのコンソールに `[reactions] state: HTTP 403 CSRF_REJECTED ...` のような理由が出ます。

## 4. ボタンを変える

管理画面サイドバーの **Reactions** を開き、「リアクション」欄を編集して保存します。

初期値は英語ラベル（`love=💗:Love, hmm=🤔:Hmm, whistle=😗:Whoa`）です。日本語にするなら例えば:

```
love=💗:すき, hmm=🤔:ふむ, whistle=😗:ほー
```

`key=絵文字:ラベル` をカンマ区切り。key は英小文字で始める（集計のIDになるので、後から変えると別のボタン扱いになります）。管理画面の文言は管理画面の言語設定（日本語／英語）に合わせて切り替わります。

入力欄の下の2つのスイッチで、サイト上の見た目を切り替えられます。

- **ラベルを表示**（既定: オフ）: 絵文字の横にラベルを出す。オフでも、ラベルはツールチップとスクリーンリーダーの読み上げに使われます。
- **件数を表示**（既定: オン）: 押された件数を出す。オフにすると公開APIの応答からも件数を外すので、ページから件数を読み取ることはできません。集計自体は続き、管理画面では見られます。

## API

| ルート | メソッド | 入力 | 説明 |
|---|---|---|---|
| `/_emdash/api/plugins/reactions/state` | GET | `contentId` | 集計と自分の選択 |
| `/_emdash/api/plugins/reactions/react` | POST | `{ contentId, reaction }` | 押す／付け替え／取り消し |

## プライバシー

- 「同じ人」の判定には、IPアドレスとUser-Agentをサイトごとのランダムな塩と一緒にハッシュ化（SHA-256を短縮）した値を使います。IPアドレスやUser-Agentそのものは保存しません。
- IPが取れない環境（ローカル開発など）では、ブラウザの `localStorage`（`rx-visitor`）に置いたランダムなIDを代わりに使います。
- 1票ごとに保存するのは、記事ID・ハッシュ・選んだリアクション・日時だけです。Cookieは使いません。

## 注意

- 同じIP＋同じブラウザ(UA)は「同じ人」扱いです。家族やオフィスで同じIP・同じブラウザだと1票になります。厳密な投票システムではなく、気軽な反応ボタン用です。
- 公開ルートなので誰でも叩けます。気になる場合は Cloudflare の Rate Limiting ルールで `/_emdash/api/plugins/reactions/react` に制限をかけてください。
- `publisher` は仮の値です。自分のサイトで使うだけならそのままで構いません。レジストリに公開する場合は Atmosphere アカウントの DID に置き換えてください。
