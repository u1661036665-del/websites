# Base44 dev environment notes

## Stack

One repository, five runnable pieces:

| Directory | What it is | Dev command |
| --- | --- | --- |
| `www` | VuePress 1.x site (rikka.app) | `vuepress dev www` |
| `appops` | VuePress 1.x site | `vuepress dev appops` |
| `shizuku` | VuePress 1.x site | `vuepress dev shizuku` |
| `storage_redirect` | VuePress 1.x site | `vuepress dev storage_redirect` |
| `chat/` | Friends chat: Express + Socket.IO + vanilla JS front end | `node --watch server.js` |
| `webhooks/` | Cloudflare cache-purge deploy hook, not part of the dev stack | — |

`docker-compose.base44.yml` runs all of it from the cloned source (bind mounts +
dev servers). Host ports: `chat` on 3000 (main preview entry), `www` on 3005,
`appops` 3001, `shizuku` 3002, `storage_redirect` 3003.

## Gotchas worth knowing

- **Node 20 + webpack 4:** VuePress 1.x hashes with md4, which OpenSSL 3 only
  offers through `NODE_OPTIONS=--openssl-legacy-provider`. Without it every
  `vuepress dev`/`build` dies with `ERR_OSSL_EVP_UNSUPPORTED`.
- **No lockfile:** the repo has no `package-lock.json`/`yarn.lock` (`yarn.lock`
  is gitignored). Dependencies are installed with
  `npm install --no-package-lock` so the checkout stays clean, once per stack
  start by the one-shot `deps` service into the shared `node_modules` volume.
  All four VuePress sites share the root `package.json`.
- **Chat is self-contained:** `chat/` has its own `package.json`, installs into
  the `chat_node_modules` volume on container start, and keeps rooms/messages in
  `chat/data/store.json` (the `chat_data` volume, capped at 500 messages per
  room). Invite links are `/r/<CODE>`; the client reads the code from the path,
  so `/r/<CODE>` is served the same SPA shell.
- **Socket.IO origin:** the preview proxy forwards the public `Origin` while
  `Host` is the sandbox host, so the server reflects the request origin
  (`cors: { origin: true }`) instead of enforcing same-origin.
- **`webhooks/` needs real Cloudflare credentials** (`webhooks/config.json`:
  `port`, `secret`, `sites`, `cf_email`, `cf_key`, `cf_zone_id`) and shells out
  to `git pull` + `vuepress build` + cache purge. It is a production deploy hook
  and is intentionally not in the compose file.

## Verifying

- `docker compose -f docker-compose.base44.yml up -d deps chat www`
- `curl http://localhost:3000/` → chat landing; `curl http://localhost:3005/` →
  rikka.app docs.
- Chat real-time behaviour needs two clients: two browser tabs, or a second
  `io()` client in the devtools console joining the same room code.
- VuePress healthchecks wait up to 4 minutes for the first webpack compile.

## Tests

The repository ships no test suite or linter; verification is the dev servers
serving their pages and the chat flow (create room → invite link → join →
messages → online status) working in the browser.
