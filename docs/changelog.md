### 0.2.1 — 2026-10-18

- Added the registry icon.

### 0.2.0 — 2026-10-15

First release on the EmDash plugin registry.

- **Show labels** and **Show counts** switches in the admin page. Labels are hidden by default and kept as tooltips and screen-reader text. With counts hidden, the public API leaves them out too.
- Requires EmDash 1.x. Button settings move to `ctx.settings`; buttons saved in 0.1.x carry over.
- The admin page follows the admin locale (English or Japanese). Default labels are now English (`Love` / `Hmm` / `Whoa`); keys are unchanged, so existing counts stay attached.
- `Reactions.astro`: logs failures to the browser console instead of hiding silently, adds a `label` prop and the `--rx-accent` CSS variable, and documents passing `post.data.id`.
- `pnpm run test` now ends with a build, so `dist/` always includes the public route declarations.

### 0.1.0

- Initial version (not published to the registry).
