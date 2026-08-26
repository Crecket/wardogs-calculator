## Shared Sessions

Real-time collaborative map planning. Several people open the same room and see
each other's drawings, markers, saved targets, artillery/target positions, and
weapon selection as they change.

**This feature is disabled by default.** It needs a companion service that
deploys separately from GitHub Pages, and it self-disables completely when that
service is not configured — no toolbar button, no network calls, no behaviour
change of any kind. See [`sync/README.md`](../sync/README.md) for the server.

### Enabling it

Set the service URL in `config/app.json`:

```json
{
  "collab": {
    "url": "wss://wardogs-sync.example.workers.dev"
  }
}
```

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
| Ops per second per peer | 20 sustained, 40 burst |
| Message size | 64 KB |
| Drawings / markers / targets | 2000 / 5000 / 500 |
| Room lifetime | 12 hours after the last change |

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
