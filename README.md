# Reactions — emoji reaction buttons for EmDash

[日本語](./README.ja.md)

A sandboxed EmDash plugin that adds emoji reaction buttons (💗 🤔 😗 by default) to your posts.
Each reader picks one reaction per post: clicking it again removes it, clicking another one switches.

- No extra database: data lives in the plugin's own EmDash storage.
- No raw IPs stored (see [Privacy](#privacy)).
- Up to 6 buttons, configurable from the admin page.
- Admin page shows the 10 most-reacted posts.
- No capabilities and no network access.

> **The plugin does not render anything on its own.** After installing it, add the
> `Reactions.astro` component to your post template ([step 3](#3-add-the-buttons-to-your-post-template)).
> Without it, the plugin runs but readers see no buttons.

## Requirements

- EmDash 1.x on Cloudflare (D1)
- Workers Paid plan, for the Worker Loader binding that sandboxed plugins run in

## 1. Build

```bash
pnpm install
pnpm run test    # validate + tests in the production sandbox, then build
pnpm run build   # dist/
```

## 2. Register the plugin in your site

From your site's folder (with this repo checked out next to it):

```bash
pnpm add file:../emdash-plugin-reactions
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

`wrangler.jsonc` (commented out in the templates):

```jsonc
"worker_loaders": [{ "binding": "LOADER" }]
```

Also make sure `src/worker.ts` exports `PluginBridge` (the `*-cloudflare` templates already do).

> If you copy `dist/` into your site instead of installing the package, check that
> `dist/index.mjs` contains `"routes"`. Without it EmDash treats the public routes as
> private, `state` answers `CSRF_REJECTED`, and the buttons stay hidden.

## 3. Add the buttons to your post template

Copy `site-snippets/Reactions.astro` to your site's `src/components/` and use it on the post page:

```astro
---
import Reactions from "../../components/Reactions.astro";
// `post` comes from getEmDashEntry()
---
<article>
  ...body...
  <Reactions contentId={post.data.id} heading="Leave a reaction" />
</article>
```

Use `post.data.id` (the database ID), not `post.id` (the slug): the slug changes when a post is
renamed, and translated slugs contain `/`, which the plugin rejects.

Props: `contentId` (required), `heading` (empty string hides it), `label` (accessible name of the
button group). Set `--rx-accent` in your CSS to match your site's accent colour.

If the buttons don't show up, open the browser console: failures are logged as
`[reactions] state: HTTP 403 CSRF_REJECTED ...`.

## 4. Change the buttons

Open **Reactions** in the admin sidebar and edit the "Reactions" field:

```
love=💗:Love, hmm=🤔:Hmm, whistle=😗:Whoa
```

Comma-separated `key=emoji:label`, up to 6. Keys start with a lowercase letter. Counts are stored
per key, so renaming a key starts a new button; removing a key hides it but keeps its counts.
The admin page follows the admin locale (Japanese or English).

Two switches below the field control how the buttons look on your site:

- **Show labels** (off by default): show the label next to each emoji. When off, the label is still
  used as the tooltip and read out by screen readers.
- **Show counts** (on by default): show how many readers picked each reaction. When off, the counts
  are also left out of the public API, so they can't be read from the page. They keep being
  counted and stay visible in the admin page.

## API

| Route | Method | Input | Description |
|---|---|---|---|
| `/_emdash/api/plugins/reactions/state` | GET | `contentId` | Counts and the reader's own choice |
| `/_emdash/api/plugins/reactions/react` | POST | `{ contentId, reaction }` | Add / switch / remove |

Both routes are public. `contentId` must match `[A-Za-z0-9_\-:.]{1,128}`.

## Privacy

- The plugin identifies "the same reader" by hashing their IP address and User-Agent with a random
  per-site salt (SHA-256, truncated). The IP address and User-Agent themselves are never stored.
- When no client IP is available (local development), the browser sends a random ID kept in
  `localStorage` (`rx-visitor`) instead.
- Stored per vote: post ID, the hash, the chosen reaction, and a timestamp. No cookies.

## Limitations

- Readers behind the same IP using the same browser count as one. This is a casual reaction
  button, not a voting system.
- The routes are public. If you need to, add a Cloudflare Rate Limiting rule for
  `/_emdash/api/plugins/reactions/react`.

## License

MIT
