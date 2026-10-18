Reactions adds emoji reaction buttons (💗 🤔 😗 by default) to your posts.
Each reader picks **one reaction per post**: clicking it again removes it, clicking another one switches.

### Features

- Up to **6 buttons**, configured from the admin page (`key=emoji:label`).
- Optional labels next to each emoji, and optional public counts.
- An admin page that lists your **10 most-reacted posts**.
- The admin page follows the admin locale (English or Japanese).
- **No extra database**: data lives in the plugin's own EmDash storage.
- **No capabilities and no network access** requested.

### Privacy

- Readers are recognised by a SHA-256 hash of their IP address and User-Agent with a random per-site salt. The IP and User-Agent themselves are **never stored**.
- Stored per vote: post ID, the hash, the chosen reaction and a timestamp. **No cookies.**

> **Note:** the plugin does not render anything on its own. After installing it, add the `Reactions.astro` component to your post template (see *Installation*).

### Requirements

- EmDash 1.x on Cloudflare (D1)
- Workers Paid plan (sandboxed plugins run in the Worker Loader binding)
