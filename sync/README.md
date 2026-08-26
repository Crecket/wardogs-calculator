# wardogs-sync

Realtime room server for the map collaboration feature. A Cloudflare Worker
plus one Durable Object per room.

This deploys **separately** from the site itself — the site is static and lives
on GitHub Pages, this is a Worker on your own Cloudflare account. The site only
talks to it if `collab.url` is set in `config/app.json`; with that key absent or
null, the collaboration UI never appears and nothing here is contacted.

## What it does

- `POST /room` `{"mapId": "bakurani"}` → `201 {"code": "...", "mapId": ..., "expiresInMs": ...}`
- `GET /room/<code>` with `Upgrade: websocket` → joins that room
- `GET /health` → `{"ok": true}`

The room code **is** the credential. There are no accounts; anyone holding a
code can edit everything in that room. Codes are 12 characters from a 31-symbol
alphabet (~59 bits), minted server-side with `crypto.getRandomValues`, and never
derived from anything a caller supplies. The alphabet omits `i`, `l`, `o`, `0`
and `1` because codes get read aloud over voice chat.

An unknown or malformed code returns 404 rather than creating a room, so a typo
surfaces as a failed join instead of silently stranding you in an empty room of
your own.

## Cost

Comfortably inside the Workers Paid ($5/mo) included allowances, and viable on
the free plan for personal use:

- **Duration** is the one that would normally hurt, since rooms hold sockets
  open for hours. The Hibernation API (`ctx.acceptWebSocket`, not `ws.accept`)
  means duration charges stop while a room is idle. Using the non-hibernating
  API here would change the cost profile completely.
- **Requests** get a 20:1 discount on inbound WebSocket messages, so the 1M/mo
  included is effectively 20M messages.
- **Storage** is SQLite-backed — required on the free plan, and the only backend
  where a room's drawings can exceed the 128 KiB per-value cap that key-value
  storage imposes.

## Deploying

```sh
cd sync
npm install
npx wrangler login
npm run deploy
```

That prints a `https://wardogs-sync.<your-subdomain>.workers.dev` URL. Put its
`wss://` form in the site's `config/app.json`:

```json
{ "collab": { "url": "wss://wardogs-sync.<your-subdomain>.workers.dev" } }
```

A `workers.dev` hostname handles WebSockets fine — a custom domain is optional
and only worth it if the domain is already on your Cloudflare account. To use
one, add to `wrangler.jsonc`:

```jsonc
"routes": [
    { "pattern": "sync.example.com", "custom_domain": true }
]
```

### Locking down who can create rooms

`ALLOWED_ORIGINS` in `wrangler.jsonc` defaults to `*`. Set it to your site's
origin so other sites cannot mint rooms on your account:

```jsonc
"vars": { "ALLOWED_ORIGINS": "https://wardogs-artillery.com,http://localhost:4173" }
```

This gates room *creation* only. Joining is a WebSocket upgrade, which browsers
do not subject to CORS — joining is gated by the room code itself.

## Limits (all enforced server-side)

| Limit | Value |
|---|---|
| Peers per room | 16 |
| Ops per socket | 20/sec sustained, 40 burst |
| Message size | 64 KB |
| Drawings / markers / targets | 2000 / 5000 / 500 |
| Room lifetime | 12h after last activity |

The caps are what keep a leaked room code from becoming a bill. Cloudflare has
no hard spend limit for Workers, so also set a billing notification.

## Testing

```sh
npm run dev          # one shell
npm run test:smoke   # another
```

The smoke test runs against real `workerd` rather than mocks, covering room
creation, op relay, late-joiner snapshots, exactly-once removal, every
validation rejection, canonical rebroadcast, and rate limiting.

## Design notes

**Ops, not documents.** Peers exchange small ops (`drawing.add`, `marker.remove`,
`point.set`, …) rather than whole-document broadcasts. The DO holds the
authoritative copy, validates each op, and rebroadcasts the canonical form it
produced itself — never the caller's object, so one peer cannot smuggle extra
fields to the others. New joiners get one full snapshot on connect.

**No conflict resolution, by design.** Every item already carries a unique
client-generated id, so concurrent adds and removes merge without it. `insert`
uses `INSERT OR REPLACE` and does not count an existing id against the cap,
which is what lets undo re-add its own item.

**The server knows nothing about maps.** Marker icons and map IDs are validated
as safe short slugs only; the client rejects ones it does not recognise when it
applies the op. `maps/assets.json` stays a client-only concern.

**Pencil strokes broadcast once on pointerup**, never per point.
