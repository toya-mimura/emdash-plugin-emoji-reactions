# reactions — EmDash リアクションボタン プラグイン

記事ページに 💗 🤔 😗 のようなリアクションボタンを置くサンドボックス型プラグインです。
読者は1記事につき1つだけ選べます（もう一度押すと取り消し、別のを押すと付け替え）。

- 追加のD1は不要（EmDashのDBにプラグイン専用領域として保存）
- IPアドレスはそのまま保存せず、サイト固有の塩付きハッシュで「同じ人」を判定
- ボタンの種類・数（最大6個）は管理画面から変更可能
- 管理画面に「よく押された記事 Top 10」を表示

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
pnpm run test     # 任意：本番と同じサンドボックスで動作確認
pnpm run build    # dist/ ができる
```

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
  <Reactions contentId={post.id} />
</article>
```

## 4. ボタンを変える

管理画面サイドバーの **Reactions** を開き、「リアクション」欄を編集して保存します。

```
love=💗:すき, hmm=🤔:ふむ, whistle=😗:ほー
```

`key=絵文字:ラベル` をカンマ区切り。key は英小文字で始める（集計のIDになるので、後から変えると別のボタン扱いになります）。

## API

| ルート | メソッド | 入力 | 説明 |
|---|---|---|---|
| `/_emdash/api/plugins/reactions/state` | GET | `contentId` | 集計と自分の選択 |
| `/_emdash/api/plugins/reactions/react` | POST | `{ contentId, reaction }` | 押す／付け替え／取り消し |

## 注意

- 同じIP＋同じブラウザ(UA)は「同じ人」扱いです。家族やオフィスで同じIP・同じブラウザだと1票になります。厳密な投票システムではなく、気軽な反応ボタン用です。
- 公開ルートなので誰でも叩けます。気になる場合は Cloudflare の Rate Limiting ルールで `/_emdash/api/plugins/reactions/react` に制限をかけてください。
- `publisher` は仮の値です。自分のサイトで使うだけならそのままで構いません。レジストリに公開する場合は Atmosphere アカウントの DID に置き換えてください。
