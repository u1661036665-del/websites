# Base44 dev environment notes

## Stack

VuePress **1.x** documentation monorepo. One repository, four independent sites
that share the root `package.json`, plus a deploy hook that is not part of dev:

| Directory | Site | Dev command | Port in use |
| --- | --- | --- | --- |
| `www` | rikka.app — **main entry** | `npm start` / `npm run www:dev` | 3000 |
| `appops` | App Ops docs | `npm run appops:dev` | 3001 |
| `shizuku` | Shizuku docs | `npm run shizuku:dev` | 3002 |
| `storage_redirect` | Storage Isolation docs | `npm run sr:dev` | 3003 |
| `webhooks/` | Cloudflare cache-purge deploy hook | — | — |

`docker-compose.base44.yml` runs **only `www` on host port 3000** (the preview
entry) plus a one-shot `deps` service that installs into the shared
`web_node_modules` volume. The other sites are the same kind of server; run one
on demand when you need it:

```sh
docker compose -f docker-compose.base44.yml exec web npm run shizuku:dev -- --port 3002 --host 0.0.0.0
```

## Gotchas worth knowing

- **The startup failure was a missing entry point.** `package.json` only had
  per-site scripts (`www:dev`, `appops:dev`, …), so `npm start` and `npm run dev`
  both died with `Missing script: start` and nothing ever listened on port 3000.
  `start` and `dev` now serve the main `www` site on port 3000 bound to `0.0.0.0`.
- **Never run two VuePress dev/build processes at once on the shared
  dependencies.** VuePress 1 uses `cache-loader` inside `node_modules/.cache`,
  and the four sites have different webpack configs, so concurrent servers
  corrupt that cache: the log says `Compiled with some errors` and the page
  renders blank behind the dev server's error overlay. Fix is
  `rm -rf node_modules/.cache` and restart a single server. This is why the
  compose file exposes one site at a time.
- **VuePress 1.x needs an older Node.** It is webpack 4 based; the compose file
  pins `node:16-bullseye-slim`. Do not move the services to the newest LTS
  without re-testing `vuepress dev` and `vuepress build`.
- **There is no lockfile in the repo** (`yarn.lock` is gitignored).
  Dependencies are installed with `npm install --no-package-lock` by the
  one-shot `deps` service into the shared volume, so the checkout stays clean
  and no two installers race on the same directory.
- **`webhooks/` cannot run from a fresh clone.** `index.js` does
  `require(`${process.cwd()}/config.json`)`, and `config.json` is gitignored; it
  needs `port`, `secret`, `sites`, `cf_email`, `cf_key`, `cf_zone_id`, then
  shells out to `git pull`, `vuepress build` and a Cloudflare cache purge. It is
  a production deploy hook and is intentionally not in the compose file.
- **Config quirk:** the sitemap `dateFormatter` in each `.vuepress/config.js` is
  `(time) => { timestampCache[time] }`, which returns `undefined`. Builds still
  succeed; sitemap entries just have no `<lastmod>`.

## Verifying

```sh
docker compose -f docker-compose.base44.yml up -d
docker compose -f docker-compose.base44.yml ps          # web healthy
curl -s -o /dev/null -w '%{http_code}\n' http://localhost:3000/   # 200
```

- The dev server serves only the SPA shell (`/assets/js/app.js`), so curl alone
  proves nothing about the page. Check the rendered DOM in a browser, and watch
  the log line `Compiled successfully` — `Compiled with some errors` means a
  blank page (see the cache note above).
- Static builds must work too: `npm run www:build`, `appops:build`,
  `shizuku:build`, `sr:build`. Output lands in `<site>/.vuepress/dist`
  (gitignored); `clean-urls` turns `foo.md` into `foo/index.html`.
- Markdown and theme edits are picked up by the webpack watcher on the bind
  mount; `.vuepress/config.js` changes restart the site's dev server (watch the
  container logs).
- VuePress compiles on first request, so healthchecks allow up to 2 minutes.

## Tests

The repository ships no test suite and no linter. Verification is the sites
serving their pages and `vuepress build` succeeding for each site.
