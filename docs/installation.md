### 1. Install the plugin

Install Reactions from this page with **Open in EmDash**, or build it from source:

```sh
pnpm install
pnpm run build   # dist/
```

### 2. Enable the plugin sandbox

Sandboxed plugins need the Worker Loader binding. In `wrangler.jsonc` (commented out in the templates):

```jsonc
"worker_loaders": [{ "binding": "LOADER" }]
```

Make sure `src/worker.ts` exports `PluginBridge` (the `*-cloudflare` templates already do), and that `astro.config.mjs` sets `sandboxRunner: sandbox()`.

### 3. Add the buttons to your post template (required)

Copy [`site-snippets/Reactions.astro`](https://github.com/toya-mimura/emdash-plugin-emoji-reactions/tree/main/site-snippets) into `src/components/` and place it on your post page:

```astro
---
import Reactions from "../../components/Reactions.astro";
// `post` comes from getEmDashEntry()
---
<Reactions contentId={post.data.id} heading="Leave a reaction" />
```

Use `post.data.id` (the database ID), **not** `post.id` (the slug). Slugs change when a post is renamed, and translated slugs contain `/`, which the plugin rejects.

Props: `contentId` (required), `heading` (empty string hides it), `label` (accessible name of the button group). Set `--rx-accent` in your CSS to match your accent colour.

### 4. Choose your buttons

Open **Reactions** in the admin sidebar and edit the field, e.g.:

```
love=💗:Love, hmm=🤔:Hmm, whistle=😗:Whoa
```

Up to 6 entries. Keys start with a lowercase letter. Counts are stored per key: renaming a key starts a new button; removing one hides it but keeps its counts.
