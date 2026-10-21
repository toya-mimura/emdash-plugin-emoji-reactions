### Reporting a vulnerability

Please report security issues privately through
[GitHub private vulnerability reporting](https://github.com/toya-mimura/emdash-plugin-emoji-reactions/security/advisories/new),
not in public issues.

### What the plugin can access

- **No capabilities and no network access.** The plugin can't read or change your content, media, users or settings outside its own storage, and it can't call other services.
- It stores data only in its own EmDash storage: per-post counts, one record per vote, and its button settings.

### Data stored about readers

- A truncated SHA-256 hash of the reader's IP address and User-Agent, combined with a random per-site salt. The IP address and User-Agent themselves are never stored.
- Per vote: post ID, that hash, the chosen reaction and a timestamp. No cookies.

### Public routes

`state` (GET) and `react` (POST) are public. Both validate their input: `contentId` must match `[A-Za-z0-9_\-:.]{1,128}`, reactions must be a configured key, and request bodies are capped at 1 KB. The admin route is private. To limit abuse, add a Cloudflare Rate Limiting rule for `/_emdash/api/plugins/reactions/react`.
