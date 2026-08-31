## Shared Sessions

Real-time collaborative map planning. Several people open the same room and see
each other's drawings, markers, saved targets, artillery/target positions, and
weapon selection as they change.

**This feature is disabled by default.** It needs a companion service that
deploys separately from GitHub Pages, and it self-disables completely when that
service is not configured — no toolbar button, no network calls, no behaviour
change of any kind. See [`sync/README.md`](../sync/README.md) for the server.

### Enabling it

Put the service URL in `.env` (see `env.example`):

```sh
COLLAB_URL=wss://your-worker.example.com
```

This is read by both `npm run build` and `npm run dev`, so development behaves
like a deployed build. For a one-off build you can pass it inline instead:

```sh
COLLAB_URL=wss://your-worker.example.com npm run build
```

`config/app.json` deliberately keeps `collab.url: null` in the repository.
Committing a real URL would point every build of this repo — including anyone
else's fork — at one person's Cloudflare account. The value is injected into
the built copy only; the tracked file never changes.

See [Fork deployment](deployment.md) for the full setup.

Only `wss://` is accepted (`ws://` is allowed for `localhost` during
development). The room code travels inside this URL, and it is the only
credential — a plaintext endpoint would leak edit access to the room.

With `url` set to `null` or absent, `isCollabConfigured()` returns false and
every hook in `js/features/collab.js` returns immediately.

### Using it

The Shared Session tool appears in the Map Tools toolbar once configured.

- **Start a shared session** creates a room and shows a 12-character code.
  "Copy link" gives you a URL ending in `#room=<code>` to paste into voice chat.
- **Join** accepts either a bare code or a full share link.
- Both actions offer **Bring my drawings and targets**, which pushes your
  current content into the room. Leave it unchecked to join a room clean.
- **Leave session** disconnects and restores the map you had before joining.
- The panel lists **who is in the room**: one row per peer with the name they
  typed, the colour their live cursor draws in, and a health dot. Your own row
  is marked `you`. The list comes from the server, so an idle peer who has not
  touched their mouse is still listed.

There are no accounts. Anyone holding the code can edit everything, so treat the
link the way you would treat the room itself.

### What is shared, and what is not

| Shared | Local to you |
|---|---|
| Drawings | Zoom and pan |
| User markers | Layer toggles |
| Saved targets | Theme |
| Artillery and target position | Language |
| Weapon selection | Selected saved-target row |

### Behaviour worth knowing

**Your own map is never touched.** While you are in a session, the site stops
writing to `wardogs-map-tools` and `wardogs-saved-targets` entirely. Room content
lives in memory only. Leaving restores exactly what you had — and because nothing
was ever overwritten, so does closing a crashed tab.

**The room's map is fixed at creation.** The map selector is disabled during a
session. Saved targets carry no map ID, so switching maps under them would
silently misplace every target for every peer.

**Undo only undoes your own edits.** In a session the usual snapshot history is
replaced by a per-op, per-user history: undo reverses your last op and tells the
other peers, rather than restoring a whole document snapshot that would revert
their work too. Consecutive moves of the same point collapse into one undo step,
so undo steps back over a whole drag. Bulk imports and clears are not undoable.

**The roster is who the room is holding a socket for**, not who has moved
recently. Names travel as their own message, so a peer who joins and then sits
still is listed the whole time. Health is only what the client honestly knows:
every row reads connected, because the room lists nothing else, and the moment
your own link drops the whole list is greyed as last-known rather than going on
claiming everyone is live. There is no per-peer heartbeat — a peer's own client
is the only thing that can tell that a peer's own link died, and it has no way
to say so once it has.

**A roster is optional in the protocol.** A client talking to a server that
predates it sees only the peer count it always did, and never sends the name
message that server would reject. A server that keeps one still sends `count`,
so an older client is unaffected.

**The OBS overlay joins as a read-only viewer.** A browser source is a
separate process with its own profile, so the only way an overlay can see the
session is over the same WebSocket. `/obs/` connects with `?viewer=1` on the
room URL, and a viewer is held apart from the peers: it is left out of the
roster and the peer count, and it spends one of eight viewer slots rather than
one of the sixteen editing slots. A streamer's own overlay is not a phantom
"peer 2" in everyone's list. The overlay sends nothing — the client refuses
every op, name and cursor frame before it reaches the socket — and the room
refuses one anyway with `read-only` if a viewer ever sends one. See
[OBS overlay](features.md#obs-overlay) for the route and its options.

**The viewer flag is optional in both directions.** It travels as a query
parameter on the join, so a client talking to a server that predates it is
simply an ordinary peer that happens never to send anything, and a server that
honours it sees no difference in any client that does not pass it.

**Dropped connections retry** with backoff, then reload a fresh snapshot.
Anything you did while disconnected is discarded — the snapshot is authoritative.
After a reconnect your undo history starts empty, because the ops it held were
computed against a document that no longer exists.

**Pencil strokes broadcast once**, on pointerup, never per point.

### Limits

Enforced by the server, not the client:

| Limit | Value |
|---|---|
| Peers per room | 16 |
| Read-only viewers per room | 8 |
| Ops per second per peer | 20 sustained, 40 burst |
| Message size | 64 KB |
| Drawings / markers / targets | 2000 / 5000 / 500 |
| Room lifetime | 2 weeks after the last change |

### How it works

`js/features/collab.js` hooks into the existing mutators rather than replacing
them. `saveMapToolState()` and `persistSavedTargets()` gain a suppression check;
`pushMapToolHistory()`, `undoMapToolAction()` and `redoMapToolAction()` delegate
while in a session; the add/remove functions in `map-tools.js` and
`saved-targets.js` emit an op after they have already applied the change locally,
so drawing stays instant.

Artillery and target positions are the exception: they are written from six
different places, so instead of six hooks a single throttled diff runs from
`inputs()`, which every one of those paths already calls.

Items carry the unique IDs the client already generates, so concurrent adds and
removes from different peers merge with no conflict resolution.
