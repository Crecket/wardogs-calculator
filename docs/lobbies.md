# Collaborative lobbies

Collaborative lobbies synchronise pencil drawings, zones, polygons and user markers. A room can optionally start with the creator's saved targets. The map is fixed for the room, while every participant keeps a personal artillery point, target and selected weapon. Teammates see each other's labelled artillery-to-target overlays, but only the owner sees their weapon range circles. Camera position, zoom, active tool, layer visibility, point locks, theme and language remain local.

The feature is disabled by default. When disabled, its browser runtime is not loaded, no lobby menu is rendered and no request is sent to the sync service.

The implementation was informed by the prototype in [Crecket's `feat/collab-rooms` branch](https://github.com/Crecket/wardogs-calculator/tree/feat/collab-rooms). This version uses an independent operation-based protocol, conflict checks, hibernating WebSockets and explicit resource limits.

## Configuration

All product limits live in `config/app.json` under `collab`:

| Setting | Default | Effect |
| --- | ---: | --- |
| `enabled` | `false` | Master switch used by both the site and Worker |
| `serverUrl` | empty | Deployed Worker URL; an empty value also prevents browser loading |
| `maxParticipants` | `8` | Concurrent WebSockets allowed in one room, server-enforced (1–32) |
| `roomLifetimeHours` | `6` | Fixed room lifetime (1–24); activity does not extend it |
| `maxRoomsPerDay` | `250` | Global UTC-day room creation budget |
| `maxChangeBatchesPerDay` | `20000` | Global UTC-day accepted change batches |
| `maxChangeBatchesPerRoom` | `1000` | Accepted change batches in one room |
| `batchDelayMs` | `300` | Browser batching and presence delay (clamped to 0.25–5 seconds) |
| `allowedOrigins` | production and local origins | Exact browser origins allowed by the Worker |

The Worker imports this file at build time. After changing a server-enforced limit or `enabled`, deploy the Worker again. Rebuild and deploy the static site after changing browser settings.

For an emergency stop, set the Worker environment variable `LOBBIES_DISABLED` to `true` in the Cloudflare dashboard. This overrides `enabled: true`. Also set `enabled` to `false` in the repository and deploy both parts when the incident is over.

## First deployment

Prerequisites: a Cloudflare account, Node.js 22 or newer and the existing static-site deployment.

1. In `config/app.json`, set `collab.enabled` to `true`. Keep the static site unpublished for now.
2. Add every real frontend origin to `allowedOrigins`. Origins contain scheme and host, but no path or trailing slash. Add `https://www.wardogs-artillery.com` only if that hostname actually serves the app.
3. Open a terminal in `sync` and install the pinned dependencies:

   ```powershell
   npm ci
   npx wrangler login
   ```

4. Generate a secret locally. Do not post it, commit it or reuse a password:

   ```powershell
   $roomSecret = node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   $roomSecret | npx wrangler secret put ROOM_SECRET
   Remove-Variable roomSecret
   ```

5. Deploy the Worker:

   ```powershell
   npm run deploy
   ```

6. Copy the resulting HTTPS Worker address to `collab.serverUrl` (without `/rooms`), run `npm run build` from the repository root, then deploy the static site as usual.

For lobby protocol updates, deploy the Worker first and publish the static site immediately afterwards. Existing participants should reload and create a new room after this particular personal-position update; no new Durable Object migration or secret is required.

The first deployment creates two SQLite-backed Durable Object classes via the migration in `sync/wrangler.jsonc`. The two rate-limit namespace numbers only need to be unique within the Cloudflare account; change them if another Worker already uses `73101` or `73102`.

## Local test

Create `sync/.dev.vars` from `.dev.vars.example` and replace its placeholder secret. Keep this file local. Set the site config temporarily to:

```json
"enabled": true,
"serverUrl": "http://localhost:8799"
```

Then run the two processes:

```powershell
# terminal 1, repository root
npm run dev

# terminal 2
cd sync
npm ci
npm run dev
```

Open `http://localhost:8000`. Restore the production URL (or disable the feature) before committing.

## Cost controls and 4,000 daily visitors

Page views do not create lobby traffic. A visitor contacts the Worker only after pressing Create or Join. Changes are sent after a gesture finishes and are coalesced for the configured delay; cursors, pointer movement, camera movement and layer changes are never synchronised. Personal artillery and target positions are ephemeral WebSocket presence data: they disappear when a participant disconnects and do not consume the durable room-change quota. WebSockets use Durable Object hibernation and their one-minute ping/pong is configured as an automatic response.

The defaults are deliberately conservative:

- At most 250 new rooms and 20,000 accepted edit batches can be created per UTC day.
- Each room stores one current document, has a six-hour fixed lifetime and writes one row per accepted batch.
- Daily write credits are reserved in groups of 32. This saves global budget writes but can leave some reserved credits unused; therefore the cap may stop slightly below 20,000 actual edits.
- A room document is limited to 96 KiB, with separate limits for drawings and other objects. Messages, operations and coordinates are validated server-side.
- Signed, expiring invitation codes are checked before a room object is opened. Per-IP entry/create rate limits and per-socket message limits reduce cheap abuse.

With 4,000 visits/day, cost depends on lobby adoption rather than page views. For example, 10% adoption with 30 edit batches per participant is about 12,000 edit batches/day and fits the application cap. If every visitor uses a lobby for 10 batches, demand is about 40,000 and the application will stop accepting edits at 20,000. These are planning examples, not a billing guarantee; inspect Cloudflare usage during the beta before raising limits.

Cloudflare's current Free-plan limits and billing model can change. Before launch, verify the official [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), [WebSocket hibernation guidance](https://developers.cloudflare.com/durable-objects/best-practices/websockets/) and [Workers rate-limit binding documentation](https://developers.cloudflare.com/workers/runtime-apis/bindings/rate-limit/).

## Behaviour and recovery

- Anyone holding an invitation can edit; this is a shared secret, not account authentication.
- Artillery position, active target and selected weapon are personal. Other connected participants receive only the two labelled positions; their range circles are never rendered.
- Player positions live only in WebSocket attachments. They are not stored in the room document or recovery export and disappear when that player disconnects.
- Only the creating browser receives the owner key that can close the room for everyone. It is held in memory and is lost on reload.
- The URL fragment `#room=...` prefills the menu but never auto-joins. This keeps navigation, reloads and analytics from silently opening connections.
- There is no automatic reconnect. After a disconnect, editing is frozen until the user explicitly reconnects or leaves.
- Rejected/unconfirmed local work can be downloaded from the menu as `wardogs-lobby-recovery.json`.
- Entering a room takes an in-memory backup of the personal workspace. Leaving restores the original map, weapon, points, drawings, saved targets, camera and history. Room data is not written to personal `localStorage`.

## Verification

From `sync`:

```powershell
npm ci
npm test
npx wrangler deploy --dry-run
```

From the repository root:

```powershell
npm run build
npm run test:scripts
```

The suite covers validation limits, signed invitations, create/join/cap/close flows in a local Workers runtime, ephemeral player presence, labelled no-range peer rendering, concurrent annotation edits, safe undo, browser batching, disconnect behaviour and personal-state restoration.
