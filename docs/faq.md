### The buttons don't appear on my site

1. Check that `Reactions.astro` is added to your post template. The plugin itself renders nothing.
2. Open the browser console. Failures are logged as `[reactions] state: HTTP 403 CSRF_REJECTED ...`.
3. If you copied `dist/` into your site instead of installing the package, check that `dist/index.mjs` contains `"routes"`. Without it, EmDash treats the public routes as private and rejects requests.

### Can I hide the counts?

Yes. Turn off **Show counts** in the admin page. Counts are then also left out of the public API, so they can't be read from the page. They keep being counted and stay visible to you in the admin page.

### Two people in my home/office count as one reader

Readers behind the same IP using the same browser are treated as one. This is a casual reaction button, not a voting system.

### Can people spam the button?

Each reader has one reaction per post, so repeated clicks only toggle it. The routes are public, though. If needed, add a Cloudflare Rate Limiting rule for `/_emdash/api/plugins/reactions/react`.

### Does it work in local development?

Yes. When no client IP is available, the browser sends a random ID kept in `localStorage` (`rx-visitor`) instead.
