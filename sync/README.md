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

`wrangler.jsonc` declares a `wardogs-map-sync.olm.pet` custom domain. Because
that zone is on Cloudflare, Wrangler creates the DNS record itself. Delete the
`routes` block to use the free `wardogs-sync.<subdomain>.workers.dev` hostname
instead.

Then build the site against it — the URL is supplied at build time so the
repository never carries one deployment's address:

```sh
cd .. && COLLAB_URL=wss://wardogs-map-sync.olm.pet npm run build
```

A `workers.dev` hostname handles WebSockets fine, so the custom domain is only
worth it when the zone is already on your Cloudflare account — otherwise
Wrangler cannot create the record and you would be managing DNS by hand.

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
| Room lifetime | 14d after last activity |

The caps are what keep a leaked room code from becoming a bill. Cloudflare has
no hard spend limit for Workers, so also set a billing notification.

## Testing

```sh
npm run dev          # one shell
npm run test:smoke   # another
```

`test:smoke` runs against real `workerd` rather than mocks, covering room
creation, op relay, late-joiner snapshots, exactly-once removal, every
validation rejection, canonical rebroadcast, the ping auto-response, and rate
limiting.

`npm run test:guns` covers the gun collection, including that a client
predating it still works against a room that has one.

Two browser tests cover the client half. They need a built site
(`npm run build` in the repo root) plus Chromium:

```sh
npm install --no-save playwright-core
npx playwright install chromium
```

- `npm run test:browser` — two real browsers in one room, with the worker
  running. Covers strokes, markers, targets and point moves syncing both
  ways, per-user undo, the map lock, and that leaving restores your own map
  with local storage untouched throughout.
- `npm run test:disabled` — no worker needed. Asserts the feature is inert
  with `collab.url` unset, on desktop, a locale page, and mobile. This is
  the one to run before sending anything upstream.

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

**Heartbeats never wake the room.** The client pings every 30 s; the room
registers that exact frame with `setWebSocketAutoResponse`, so the runtime
answers it without unhibernating and without billable duration. A pong still
outstanding when the next ping is due means the path is dead — a socket
dropped by a NAT or a proxy stops carrying frames without ever closing, and
the client would otherwise go on believing it was online. The `{"type":"ping"}`
handler in `webSocketMessage` remains for pings that carry extra fields, since
the auto-response matches byte for byte.

**The idle deadline lags on purpose.** Room lifetime is 14 days from the last
op, but recording that time on *every* op would be two durable writes on the
hottest path there is — dragging a gun emits ten ops a second. `touch()` keeps
the stored deadline in memory and only rewrites it once it is five minutes
stale, so a room can expire up to five minutes early out of those fourteen
days.
