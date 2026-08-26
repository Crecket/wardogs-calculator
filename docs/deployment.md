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

`.env` is read by **both** `npm run build` and `npm run dev`, so development
behaves like a deployed build.

| Variable | Used by | Effect when unset |
|---|---|---|
| `COLLAB_URL` | build, dev | Shared sessions disable themselves entirely |
| `TILE_BASE_URL` | build, dev | Tiles are bundled into `dist/` |
| `R2_*` | `npm run sync-tiles` | Tile upload refuses to run |

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
```

Then give the bucket a public custom domain (R2 → your bucket → Settings →
Custom domains) and point `TILE_BASE_URL` at it.

### Shared-session Worker

```sh
cd sync
npm install
npx wrangler deploy
```

See [`sync/README.md`](../sync/README.md) for limits, cost, and the
`ALLOWED_ORIGINS` setting. Put its `wss://` URL in `COLLAB_URL`.

### Static site

```sh
npm run build
npx wrangler pages deploy dist --project-name <your-project>
```

`wrangler pages project create <name>` first, if it does not exist yet. Use
direct upload rather than the dashboard's Git integration: a Git-backed
project rejects direct uploads, and it would need `COLLAB_URL` and
`TILE_BASE_URL` re-entered as build environment variables on Cloudflare's side
or the deployed site builds with the features off.

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
