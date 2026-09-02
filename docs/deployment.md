## Fork Deployment

How to run your own copy: the static site, the shared-session Worker, and the
map tiles.

Everything deployment-specific lives in `.env`, never in tracked files. That is
deliberate — this repo is a fork, and keeping `config/app.json` and `maps/*.json`
byte-identical to upstream means merges never conflict over one deployment's
URLs. A clone with no `.env` still builds a working, fully self-contained site.

```sh
cp env.example .env
```

`.env` is read by `npm run build`, `npm run dev` and `npm run sync-tiles`, so
development behaves like a deployed build. Real environment variables already
set take precedence, so CI and one-off overrides still win.

| Variable | Used by | Effect when unset |
|---|---|---|
| `COLLAB_URL` | build, dev | Shared sessions disable themselves entirely |
| `TILE_BASE_URL` | build, dev | Tiles are bundled into `dist/` |
| `ANALYTICS_WEBSITE_ID` | build, dev | Analytics are stripped from the built pages |
| `R2_*` | sync-tiles | Tile upload refuses to run |

Analytics are opt-in for the same reason: the Umami website id committed in the
page shells is upstream's, so a build that left the tracker in place would
report a fork's traffic into someone else's dashboard. See
[analytics](analytics.md).

### The tile problem

The tile pyramids are **~43,700 files and 1.4 GB**. That is over the limits of
most static hosts:

| Host | File limit | Result |
|---|---|---|
| Cloudflare Pages | 20,000 | Rejected |
| Workers Static Assets (free) | 20,000 | Rejected |
| Workers Static Assets (paid) | 100,000 | Fits, but re-uploads 1.4 GB per deploy |
| GitHub Pages | — | Over the documented 1 GB site cap |

Serving them from R2 sidesteps all of it, and R2 has **no egress fees**, so
tile traffic is free. `TILE_BASE_URL` drops the built site from 44,306 files to
**616**, and 1.6 GB to **260 MB**.

No client code changes are involved: tile URLs go through `resourceURL()`,
which is `new URL(path, BASE_PATH)`, and an absolute URL ignores the base.

#### Uploading tiles

Create an R2 bucket, add the `R2_*` credentials to `.env`, then:

```sh
npm run sync-tiles
```

It lists what the bucket already holds and uploads only what is missing or a
different size, so it is safe and cheap to re-run. After merging upstream
changes that add or regenerate tiles, run it again — it costs one listing pass
plus the genuinely new files, not another 43,000 uploads.

```sh
npm run sync-tiles -- --dry-run    # report what would change
npm run sync-tiles -- --prune      # also delete objects no longer present locally
npm run sync-tiles -- --force      # re-upload everything
npm run sync-tiles -- --untrack    # drop the tiles from git once the bucket has them
```

Then give the bucket a public custom domain (R2 → your bucket → Settings →
Custom domains) and point `TILE_BASE_URL` at it.

#### Keeping tiles out of the repository

`TILE_BASE_URL` keeps the tiles out of `dist/`, but if they are still committed
they are also still cloned. A Git-backed Pages build clones before it builds, so
1.4 GB of blobs costs minutes on **every deploy** even though the build then
ignores them.

`--untrack` closes that gap. It uploads, re-lists the bucket, checks every local
file is present at the right size, and only then runs `git rm -r --cached` on the
tile directory and adds it to `.gitignore`. The files stay on disk and the
removal is staged, not committed — nothing can leave the branch on the strength
of a partial upload.

```sh
npm run sync-tiles -- --untrack
git commit -m "chore: serve tiles from R2 instead of tracking them"
```

This diverges the fork from upstream, which is the one thing the rest of this
setup works hard to avoid — so it is opt-in. The trade is deliberate: a merge
only conflicts when upstream actually changes tiles, whereas the clone cost is
paid on every single deploy.

When upstream does change them, the resolution is always the same five steps —
take theirs, upload, untrack again:

```sh
git merge upstream/main                    # modify/delete conflicts on tiles
git checkout upstream/main -- maps/tiles   # take upstream's wholesale
npm run sync-tiles -- --untrack            # upload the new ones, re-untrack
git commit
```

### Shared-session Worker

```sh
cd sync
npm install
npx wrangler deploy
```

See [`sync/README.md`](../sync/README.md) for limits, cost, and the
`ALLOWED_ORIGINS` setting. Put its `wss://` URL in `COLLAB_URL`.

### Static site

Either direct upload:

```sh
npm run build
npx wrangler pages deploy dist --project-name <your-project>
```

`wrangler pages project create <name>` first, if it does not exist yet.

Or the dashboard's Git integration, which builds on push. Note that the two are
exclusive — a Git-backed project rejects direct uploads. A Git-backed project
needs, under Settings:

| Setting | Value |
|---|---|
| Build command | `npm run build` |
| Build output directory | `dist` |
| `TILE_BASE_URL` | your bucket's public URL, as a **Text** variable |
| `COLLAB_URL` | your Worker's `wss://` URL, as a **Text** variable |

`.env` is not committed, so Cloudflare cannot see it — the variables have to be
re-entered there or the deployed site builds with the features off. Set them on
**both** Production and Preview: without `TILE_BASE_URL` the build copies all
~43,700 tiles into `dist/` and the deploy is rejected by the 20,000-file cap.

Do not put `npm run sync-tiles` in the build command. It is an upload step, not
a build step — it needs write credentials in CI, produces nothing the build
consumes, and would re-list the whole bucket on every deploy to discover nothing
had changed.

Custom domains for Pages are added in the dashboard; `wrangler` has no command
for it.

### Local development

Two terminals:

```sh
npm run dev:sync    # the Worker, on :8799
npm run dev         # the site, on :8000
```

With `COLLAB_URL=ws://localhost:8799` in `.env`, shared sessions work locally
against the local Worker. The dev server prints what it is wired to on
startup. Leave `TILE_BASE_URL` unset in development so tiles are served
straight from disk.

### Tests

```sh
npm run test:scripts        # build/dev config plumbing, SigV4 signing
cd sync && npm run test:smoke      # Worker, against real workerd
cd sync && npm run test:browser    # two browsers in one room
cd sync && npm run test:disabled   # feature inert with COLLAB_URL unset
```
