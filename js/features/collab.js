/* =========================
   COLLABORATION ROOMS
   ========================= */

/*
 * Realtime shared map sessions, backed by the Worker in sync/.
 *
 * The whole feature is inert unless config/app.json sets collab.url, so a
 * fork of this site that does not run the sync service behaves exactly as
 * it did before: isCollabConfigured() is false, the toolbar button never
 * appears, and every collabOn*() hook below returns immediately.
 *
 * Two invariants drive most of the design:
 *
 * 1. Local storage is never touched while in a room. saveMapToolState()
 *    and persistSavedTargets() are suppressed, so your solo map survives
 *    a session untouched and comes back verbatim when you leave — even if
 *    the tab crashes mid-session, since nothing overwrote it.
 *
 * 2. Ops carry the ids the client already generates, so concurrent adds
 *    and removes merge with no conflict logic at all.
 */

const COLLAB_HASH_KEY = 'room';

/*
 * Trailing-edge throttle for origin/target/weapon. Dragging a point fires
 * continuously; peers only need the value it settles on, plus enough
 * intermediate frames to read as live.
 */
const COLLAB_SHARED_INTERVAL = 100;

const COLLAB_RECONNECT_BASE = 1000;
const COLLAB_RECONNECT_MAX = 15000;
const COLLAB_RECONNECT_ATTEMPTS = 8;

const COLLAB = {
    socket: null,

    /* off | connecting | online | reconnecting | error */
    status: 'off',

    roomCode: null,
    clientId: null,
    peers: 0,
    mapId: null,

    /*
     * Set while a remote op is being applied, so the mutators that op
     * drives do not turn around and broadcast it back.
     */
    applying: false,

    /* Undo/redo of your OWN ops only, while in a room. */
    ownOps: [],
    redoOps: [],

    /* Everything local that the room replaced, restored on leave. */
    solo: null,

    lastShared: {
        origin: null,
        target: null,
        weapon: null,

        /* id -> { x, y } of what was last sent for each gun. */
        guns: {}
    },

    sharedTimer: null,

    reconnectAttempt: 0,
    reconnectTimer: null,
    leaving: false,
    pendingPush: false,

    /* Set when the room's snapshot had no guns and ours must seed it. */
    pendingGunSeed: false,

    /*
     * Set once a snapshot has arrived. Distinguishes "this room rejected
     * us" from "we lost a room we were in", which need opposite handling.
     */
    everConnected: false,

    throttleTimer: null,

    statusKey: null,
    statusIsError: false,
    copied: false
};

/* =========================
   STATE PREDICATES
   ========================= */

function collabIsOnline() {
    return (
        COLLAB.status === 'online' &&
        COLLAB.socket?.readyState === WebSocket.OPEN
    );
}

/*
 * True from the moment a join starts until the moment it fully unwinds,
 * including while reconnecting. Persistence suppression and the history
 * takeover both key off this rather than off collabIsOnline(), so a
 * dropped connection cannot briefly leak room content into local storage.
 */
function collabInSession() {
    return (
        COLLAB.status === 'connecting' ||
        COLLAB.status === 'online' ||
        COLLAB.status === 'reconnecting'
    );
}

function collabSuppressesLocalPersistence() {
    return collabInSession();
}

function collabHandlesHistory() {
    return collabInSession();
}

function collabCanUndo() {
    return COLLAB.ownOps.length > 0;
}

function collabCanRedo() {
    return COLLAB.redoOps.length > 0;
}

/* =========================
   TRANSPORT
   ========================= */

function collabHttpBase() {
    return getCollabServiceUrl()
        .replace(/^ws:/, 'http:')
        .replace(/^wss:/, 'https:');
}

function collabRoomUrl(code) {
    return `${getCollabServiceUrl()}/room/${encodeURIComponent(code)}`;
}

function collabShareLink() {
    if (!COLLAB.roomCode) {
        return '';
    }

    const url = new URL(window.location.href);
    url.hash = `${COLLAB_HASH_KEY}=${COLLAB.roomCode}`;

    return url.href;
}

function collabSend(op) {
    if (!collabIsOnline()) {
        return false;
    }

    try {
        COLLAB.socket.send(
            JSON.stringify(op)
        );
        return true;
    } catch (error) {
        console.warn('Failed to send collab op:', error);
        return false;
    }
}

/*
 * Emits an op and records how to undo it. `inverse` is null for ops that
 * are not undoable (weapon changes, clears) — those still broadcast, they
 * just do not enter your own-op history.
 */
function collabEmit(op, inverse = null) {
    if (!collabIsOnline() || COLLAB.applying) {
        return false;
    }

    if (!collabSend(op)) {
        return false;
    }

    if (inverse) {
        COLLAB.ownOps.push({ op, inverse });

        if (COLLAB.ownOps.length > 100) {
            COLLAB.ownOps.shift();
        }

        COLLAB.redoOps = [];
        updateMapToolHistoryUI();
    }

    return true;
}

/* =========================
   LOCAL SNAPSHOT
   ========================= */

function collabCaptureSolo() {
    return {
        map: S.map,
        drawings: structuredClone(MAP_TOOL_STATE.drawings),
        markers: structuredClone(MAP_TOOL_STATE.markers),
        savedTargets: structuredClone(savedTargets),
        guns: structuredClone(S.guns),
        origin: structuredClone(S.origin),
        target: structuredClone(S.target),
        weapon: S.weapon
    };
}

function collabRestoreSolo() {
    const solo = COLLAB.solo;

    if (!solo) {
        return;
    }

    COLLAB.applying = true;

    try {
        MAP_TOOL_STATE.drawings = structuredClone(solo.drawings);
        MAP_TOOL_STATE.markers = structuredClone(solo.markers);
        savedTargets = structuredClone(solo.savedTargets);

        if (Array.isArray(solo.guns) && solo.guns.length) {
            S.guns = structuredClone(solo.guns);
            S.activeGunId = S.guns[0].id;
        }

        S.origin = structuredClone(solo.origin);
        S.target = structuredClone(solo.target);
        S.weapon = solo.weapon;

        if (solo.map !== S.map) {
            collabApplyMapId(solo.map);
        }

        clamp(S.origin);
        clamp(S.target);

        MAP_TOOL_STATE.hoverPathId = null;
        MAP_TOOL_STATE.hoverDeletePoint = null;
        MAP_TOOL_STATE.hoverMarkerId = null;
    } finally {
        COLLAB.applying = false;
    }

    COLLAB.solo = null;

    /*
     * Suppression has already been lifted by the caller, so these two
     * write the restored solo state back out — which is a no-op against
     * what is already there, and the point at which normal saving resumes.
     */
    saveMapToolState();
    persistSavedTargets();

    inputs();
    renderSavedTargets();
    draw();
}

/*
 * A room's map is fixed at creation. Saved targets carry no map id, so
 * switching maps mid-session would silently misplace every one of them.
 */
function collabApplyMapId(mapId) {
    if (!mapId || mapId === S.map) {
        return true;
    }

    /*
     * Staying on our own map would be worse than failing: every room
     * drawing would be filtered out of rendering by its mapId, and every
     * op we sent would be stamped with a map the others do not have, so
     * both sides would see an empty room and no error.
     */
    if (mapId !== 'custom' && !MAPS[mapId]) {
        console.warn('Room uses an unknown map:', mapId);
        return false;
    }

    S.map = mapId;

    if (mapId !== 'custom') {
        S.w = MAPS[mapId].w;
        S.h = MAPS[mapId].h;
    }

    const select = $('mapSelect');

    if (select) {
        select.value = mapId;
    }

    clamp(S.origin);
    clamp(S.target);

    if (typeof updatePresetLock === 'function') {
        updatePresetLock();
    }

    return true;
}

function collabUpdateMapLock() {
    const select = $('mapSelect');

    if (!select) {
        return;
    }

    const locked = collabInSession();

    select.disabled = locked;
    select.title = locked
        ? tr('collabMapLocked')
        : '';
}

/* =========================
   APPLYING REMOTE STATE
   ========================= */

function collabValidMarker(marker) {
    const asset = getMarkerAsset(marker?.icon);

    return Boolean(asset && asset.placeable);
}

/* =========================
   GUNS
   ========================= */

/*
 * Guns travel flat, like markers and targets. `visible` is omitted on the
 * way out and forced true on the way in: which guns you have hidden is how
 * you are looking at the map, not room content.
 */
function collabGunWire(gun) {
    return {
        id: gun.id,
        name: gun.name,
        x: gun.position.x,
        y: gun.position.y,
        weapon: gun.weapon || null
    };
}

function collabGunFromWire(entry) {
    const gun = createGun({
        x: entry.x,
        y: entry.y,
        weapon: entry.weapon || null,
        name: entry.name
    });

    gun.id = entry.id;
    gun.visible = true;

    return gun;
}

function collabSendGunAdd(gun) {
    if (!collabIsOnline() || COLLAB.applying) {
        return;
    }

    collabSend({ op: 'gun.add', gun: collabGunWire(gun) });
}

function collabSendGunRemove(id) {
    if (!collabIsOnline() || COLLAB.applying) {
        return;
    }

    collabSend({ op: 'gun.remove', id });
}

function collabApplySnapshot(doc) {
    COLLAB.applying = true;

    /*
     * A room starts with no guns and the first client in seeds it. Flagged
     * here and sent by the snapshot handler, which is where the status
     * finally goes online — collabSend refuses to emit before that.
     */
    COLLAB.pendingGunSeed = !(Array.isArray(doc.guns) && doc.guns.length);

    try {
        COLLAB.mapId = doc.mapId;

        if (!collabApplyMapId(doc.mapId)) {
            return false;
        }

        MAP_TOOL_STATE.drawings = Array.isArray(doc.drawings)
            ? doc.drawings
            : [];

        /*
         * Icons are validated as safe slugs server-side but not checked
         * against maps/assets.json — the server has no knowledge of it.
         * Unknown icons are dropped here rather than rendered as gaps.
         */
        MAP_TOOL_STATE.markers = Array.isArray(doc.markers)
            ? doc.markers.filter(collabValidMarker)
            : [];

        savedTargets = Array.isArray(doc.savedTargets)
            ? doc.savedTargets
            : [];

        /*
         * Before doc.origin: the origin setter writes through activeGun(),
         * so the list has to be settled first.
         */
        if (Array.isArray(doc.guns) && doc.guns.length) {
            S.guns = doc.guns
                .slice(0, GUN_LIMIT)
                .map(collabGunFromWire);

            S.activeGunId = S.guns[0].id;

            S.guns.forEach(gun => clamp(gun.position));
        }

        if (doc.origin) {
            S.origin = { x: doc.origin.x, y: doc.origin.y };
            clamp(S.origin);
        }

        if (doc.target) {
            S.target = { x: doc.target.x, y: doc.target.y };
            clamp(S.target);
        }

        if (doc.weapon && WEAPONS[doc.weapon]) {
            S.weapon = doc.weapon;
        }

        COLLAB.lastShared = {
            /*
             * The legacy origin mirrors gun 1, so that is what the diff
             * has to be seeded from — not the selected gun.
             */
            origin: structuredClone(S.guns[0].position),
            target: structuredClone(S.target),
            weapon: S.weapon,
            /*
             * Seeded from the room's guns, not this client's. A room that
             * has none must leave the diff empty so the next flush emits a
             * gun.add for each local gun — seeding from S.guns would mark
             * them already-sent and the battery would never reach anyone.
             */
            guns: Object.fromEntries(
                S.guns.map(gun => [
                    gun.id,
                    { x: gun.position.x, y: gun.position.y }
                ])
            )
        };

        MAP_TOOL_STATE.hoverPathId = null;
        MAP_TOOL_STATE.hoverDeletePoint = null;
        MAP_TOOL_STATE.hoverMarkerId = null;
    } finally {
        COLLAB.applying = false;
    }

    inputs();
    renderSavedTargets();
    renderGuns();
    buildMapLayers();
    draw();

    return true;
}

function collabApplyOp(op) {
    COLLAB.applying = true;

    try {
        switch (op.op) {
            case 'drawing.add':
                MAP_TOOL_STATE.drawings =
                    MAP_TOOL_STATE.drawings
                        .filter(item => item.id !== op.drawing.id)
                        .concat(op.drawing);
                break;

            case 'drawing.remove':
                MAP_TOOL_STATE.drawings =
                    MAP_TOOL_STATE.drawings.filter(
                        item => item.id !== op.id
                    );
                break;

            case 'marker.add':
                if (!collabValidMarker(op.marker)) {
                    break;
                }

                MAP_TOOL_STATE.markers =
                    MAP_TOOL_STATE.markers
                        .filter(item => item.id !== op.marker.id)
                        .concat(op.marker);
                break;

            case 'marker.remove':
                MAP_TOOL_STATE.markers =
                    MAP_TOOL_STATE.markers.filter(
                        item => item.id !== op.id
                    );
                break;

            case 'target.add':
                savedTargets = savedTargets
                    .filter(item => item.id !== op.target.id)
                    .concat(op.target);
                break;

            case 'target.remove':
                savedTargets = savedTargets.filter(
                    item => item.id !== op.id
                );
                break;

            case 'target.rename': {
                const target = savedTargets.find(
                    item => item.id === op.id
                );

                if (target) {
                    target.name = op.name;
                }
                break;
            }

            case 'gun.add': {
                const existing = gunById(op.gun.id);

                if (existing) {
                    existing.name = op.gun.name;
                    existing.weapon = op.gun.weapon;
                    existing.position.x = op.gun.x;
                    existing.position.y = op.gun.y;
                } else if (S.guns.length < GUN_LIMIT) {
                    S.guns.push(collabGunFromWire(op.gun));
                }

                COLLAB.lastShared.guns[op.gun.id] = {
                    x: op.gun.x,
                    y: op.gun.y
                };

                renderGuns();
                break;
            }

            case 'gun.move': {
                const gun = gunById(op.id);

                if (gun) {
                    gun.position.x = op.x;
                    gun.position.y = op.y;
                    clamp(gun.position);
                }

                COLLAB.lastShared.guns[op.id] = { x: op.x, y: op.y };

                renderGuns();
                break;
            }

            case 'gun.remove': {
                /*
                 * S.guns.length >= 1 is an invariant. A peer removing its
                 * last-but-one gun must not empty this client's list.
                 */
                if (S.guns.length > 1) {
                    S.guns = S.guns.filter(gun => gun.id !== op.id);

                    if (!gunById(S.activeGunId)) {
                        S.activeGunId = S.guns[0].id;
                    }
                }

                delete COLLAB.lastShared.guns[op.id];

                renderGuns();
                break;
            }

            case 'point.set': {
                /*
                 * The legacy origin is gun 1, not the selected gun — the
                 * mirror in collabFlushShared sends it that way, so an
                 * incoming one has to land there too.
                 */
                const destination = op.point === 'origin'
                    ? S.guns[0].position
                    : S.target;

                destination.x = op.x;
                destination.y = op.y;
                clamp(destination);

                /*
                 * Record what we just adopted, so the diff in
                 * collabFlushShared does not read it as a local edit
                 * and bounce it straight back to the sender.
                 */
                COLLAB.lastShared[op.point] =
                    structuredClone(destination);

                if (op.point === 'origin') {
                    COLLAB.lastShared.guns[S.guns[0].id] = {
                        x: destination.x,
                        y: destination.y
                    };
                }
                break;
            }

            case 'weapon.set':
                if (op.weapon && WEAPONS[op.weapon]) {
                    S.weapon = op.weapon;

                    const select = $('weapon');

                    if (select) {
                        select.value = op.weapon;
                    }
                }

                COLLAB.lastShared.weapon = S.weapon;
                break;

            case 'clear':
                if (op.scope === 'all' || op.scope === 'drawings') {
                    MAP_TOOL_STATE.drawings = [];
                }

                if (op.scope === 'all' || op.scope === 'markers') {
                    MAP_TOOL_STATE.markers = [];
                }

                if (op.scope === 'all' || op.scope === 'targets') {
                    savedTargets = [];
                }
                break;

            case 'push': {
                const drawingIds = new Set(
                    op.drawings.map(item => item.id)
                );

                const markerIds = new Set(
                    op.markers.map(item => item.id)
                );

                const targetIds = new Set(
                    op.targets.map(item => item.id)
                );

                MAP_TOOL_STATE.drawings =
                    MAP_TOOL_STATE.drawings
                        .filter(item => !drawingIds.has(item.id))
                        .concat(op.drawings);

                MAP_TOOL_STATE.markers =
                    MAP_TOOL_STATE.markers
                        .filter(item => !markerIds.has(item.id))
                        .concat(op.markers.filter(collabValidMarker));

                savedTargets = savedTargets
                    .filter(item => !targetIds.has(item.id))
                    .concat(op.targets);

                /*
                 * Upsert rather than concat: a push carrying this client's
                 * own battery must not duplicate the guns it already has.
                 */
                for (const entry of op.guns || []) {
                    const existing = gunById(entry.id);

                    if (existing) {
                        existing.name = entry.name;
                        existing.weapon = entry.weapon;
                        existing.position.x = entry.x;
                        existing.position.y = entry.y;
                    } else if (S.guns.length < GUN_LIMIT) {
                        S.guns.push(collabGunFromWire(entry));
                    }

                    COLLAB.lastShared.guns[entry.id] = {
                        x: entry.x,
                        y: entry.y
                    };
                }
                break;
            }

            default:
                break;
        }
    } finally {
        COLLAB.applying = false;
    }

    inputs();
    renderSavedTargets();
    renderGuns();
    draw();
}

/* =========================
   OUTBOUND HOOKS
   ========================= */

function collabOnDrawingAdded(drawing) {
    collabEmit(
        { op: 'drawing.add', drawing },
        { op: 'drawing.remove', id: drawing.id }
    );
}

function collabOnDrawingRemoved(drawing) {
    if (!drawing) {
        return;
    }

    collabEmit(
        { op: 'drawing.remove', id: drawing.id },
        { op: 'drawing.add', drawing }
    );
}

function collabOnMarkerAdded(marker) {
    collabEmit(
        { op: 'marker.add', marker },
        { op: 'marker.remove', id: marker.id }
    );
}

/*
 * Editing an existing marker rides on `marker.add`, which replaces by id.
 * The inverse is the marker as it stood before the edit — not a removal,
 * which is what undoing a freshly placed marker means.
 */
function collabOnMarkerEdited(marker, previous) {
    if (!marker || !previous) {
        return;
    }

    collabEmit(
        { op: 'marker.add', marker },
        { op: 'marker.add', marker: previous }
    );
}

function collabOnMarkerRotated(marker, previous) {
    collabOnMarkerEdited(marker, previous);
}

function collabOnMarkerMoved(marker, previous) {
    collabOnMarkerEdited(marker, previous);
}

function collabOnMarkerRemoved(marker) {
    if (!marker) {
        return;
    }

    collabEmit(
        { op: 'marker.remove', id: marker.id },
        { op: 'marker.add', marker }
    );
}

function collabOnTargetAdded(target) {
    collabEmit(
        { op: 'target.add', target },
        { op: 'target.remove', id: target.id }
    );
}

function collabOnTargetRemoved(target) {
    if (!target) {
        return;
    }

    collabEmit(
        { op: 'target.remove', id: target.id },
        { op: 'target.add', target }
    );
}

function collabOnTargetRenamed(id, previousName, nextName) {
    collabEmit(
        { op: 'target.rename', id, name: nextName },
        { op: 'target.rename', id, name: previousName }
    );
}

/*
 * Bulk import (file import, or "include my map" on join). Sent as one op
 * so it cannot be split by the rate limiter and lands atomically for peers.
 * Not undoable: an import is a deliberate bulk action, and inverting it
 * would mean removing items other peers may already have built on.
 */
function collabOnBulkAdd({
    drawings = [],
    markers = [],
    targets = [],
    guns = []
}) {
    /*
     * `guns` is deliberately out of the emptiness guard: a battery is
     * always non-empty, and pushing it into a room that has none is the
     * whole point of "include my map".
     */
    if (
        !drawings.length &&
        !markers.length &&
        !targets.length &&
        !guns.length
    ) {
        return;
    }

    collabEmit({
        op: 'push',
        drawings,
        markers,
        targets,
        guns
    });
}

/*
 * Called from inputs() and the weapon change handler. Diffs the shared
 * scalars against what was last sent and emits only real changes, so the
 * six different places that write S.origin / S.target need no hooks of
 * their own and a drag collapses into a throttled stream.
 */
function collabSyncShared() {
    if (!collabIsOnline() || COLLAB.applying) {
        return;
    }

    if (COLLAB.sharedTimer) {
        return;
    }

    COLLAB.sharedTimer = setTimeout(() => {
        COLLAB.sharedTimer = null;
        collabFlushShared();
    }, COLLAB_SHARED_INTERVAL);
}

function collabSamePoint(a, b) {
    return Boolean(
        a &&
        b &&
        a.x === b.x &&
        a.y === b.y
    );
}

/*
 * Consecutive moves of the same point coalesce into one undo entry, so
 * undo steps back over a whole drag rather than each throttled frame.
 */
function collabRecordPointMove(point, previous, next) {
    const last = COLLAB.ownOps[COLLAB.ownOps.length - 1];

    /*
     * Only coalesce into the entry if it is still the newest thing that
     * happened. Merging into an older point move — one that some undone
     * op sits behind — would make a single undo jump back over both
     * drags, and would leave a redo entry that reapplies work out of order.
     */
    if (
        last &&
        last.op.op === 'point.set' &&
        last.op.point === point &&
        !COLLAB.redoOps.length
    ) {
        last.op = { op: 'point.set', point, x: next.x, y: next.y };
        return;
    }

    COLLAB.ownOps.push({
        op: { op: 'point.set', point, x: next.x, y: next.y },
        inverse: previous
            ? { op: 'point.set', point, x: previous.x, y: previous.y }
            : null
    });

    COLLAB.redoOps = [];
    updateMapToolHistoryUI();
}

function collabFlushShared() {
    if (!collabIsOnline() || COLLAB.applying) {
        return;
    }

    /*
     * Gun 1 also mirrors to the legacy `point.set origin` op below, so a
     * client that predates guns still tracks a real artillery position.
     */
    for (const gun of S.guns) {
        const previous = COLLAB.lastShared.guns[gun.id];

        const moved =
            !previous ||
            previous.x !== gun.position.x ||
            previous.y !== gun.position.y;

        if (!moved) {
            continue;
        }

        const sent = previous
            ? collabSend({
                op: 'gun.move',
                id: gun.id,
                x: gun.position.x,
                y: gun.position.y
            })
            : collabSend({
                op: 'gun.add',
                gun: collabGunWire(gun)
            });

        if (sent) {
            COLLAB.lastShared.guns[gun.id] = {
                x: gun.position.x,
                y: gun.position.y
            };
        }
    }

    ['origin', 'target'].forEach(point => {
        /*
         * The legacy origin is gun 1, not the selected gun. A peer running
         * a build that predates guns would otherwise watch the shared
         * origin teleport every time somebody changed their selection.
         */
        const current = point === 'origin'
            ? S.guns[0].position
            : S.target;

        const previous = COLLAB.lastShared[point];

        if (collabSamePoint(current, previous)) {
            return;
        }

        const op = {
            op: 'point.set',
            point,
            x: current.x,
            y: current.y
        };

        if (collabSend(op)) {
            collabRecordPointMove(point, previous, current);
            COLLAB.lastShared[point] = structuredClone(current);
        }
    });

    if (S.weapon !== COLLAB.lastShared.weapon) {
        if (collabSend({ op: 'weapon.set', weapon: S.weapon })) {
            COLLAB.lastShared.weapon = S.weapon;
        }
    }
}

/* =========================
   UNDO / REDO
   ========================= */

function collabUndo() {
    if (!COLLAB.ownOps.length) {
        return false;
    }

    const entry = COLLAB.ownOps.pop();

    if (!entry.inverse) {
        updateMapToolHistoryUI();
        return false;
    }

    COLLAB.redoOps.push(entry);

    collabApplyOp(entry.inverse);
    collabSend(entry.inverse);
    collabSyncAfterHistory(entry.inverse);

    updateMapToolHistoryUI();

    return true;
}

function collabRedo() {
    if (!COLLAB.redoOps.length) {
        return false;
    }

    const entry = COLLAB.redoOps.pop();

    COLLAB.ownOps.push(entry);

    collabApplyOp(entry.op);
    collabSend(entry.op);
    collabSyncAfterHistory(entry.op);

    updateMapToolHistoryUI();

    return true;
}

/*
 * collabApplyOp deliberately does not update lastShared for locally
 * originated ops, so a point move undone here must be recorded or the
 * next flush would treat the reverted position as a fresh local edit.
 */
function collabSyncAfterHistory(op) {
    if (op.op === 'point.set') {
        COLLAB.lastShared[op.point] = { x: op.x, y: op.y };
    }
}

/* =========================
   CONNECTION LIFECYCLE
   ========================= */

function collabSetStatus(status, key = null, isError = false) {
    COLLAB.status = status;
    COLLAB.statusKey = key;
    COLLAB.statusIsError = isError;

    collabUpdateMapLock();
    collabRender();
    updateMapToolsUI();
    updateMapToolHistoryUI();
}

async function collabCreateRoom(includeMine) {
    if (!isCollabConfigured()) {
        return;
    }

    /*
     * Custom maps carry their size in S.w/S.h, which the room document has
     * no field for — a joiner would default to their own dimensions and
     * every shared coordinate would land in a different frame, silently.
     * Rooms are preset-map only until the document carries w/h.
     */
    if (S.map === 'custom') {
        collabSetStatus('error', 'collabErrorCustomMap', true);
        return;
    }

    collabSetStatus('connecting', 'collabStatusConnecting');

    try {
        const response = await fetch(
            `${collabHttpBase()}/room`,
            {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    mapId: S.map
                })
            }
        );

        if (!response.ok) {
            throw new Error(`Create failed: ${response.status}`);
        }

        const room = await response.json();

        collabConnect(room.code, includeMine);

        if (typeof trackAnalytics === 'function') {
            trackAnalytics('collab-room-created', { map: S.map });
        }
    } catch (error) {
        console.warn('Failed to create collab room:', error);
        collabSetStatus('error', 'collabErrorCreate', true);
    }
}

function collabConnect(code, includeMine = false) {
    if (!isCollabConfigured() || !code) {
        return;
    }

    /*
     * Captured before the first snapshot replaces anything, and only on
     * the initial connect — a reconnect must not overwrite the solo state
     * with the room content it is about to re-fetch.
     */
    if (!COLLAB.solo) {
        COLLAB.solo = collabCaptureSolo();
    }

    COLLAB.roomCode = code;
    COLLAB.leaving = false;
    COLLAB.pendingPush = includeMine;

    collabSetStatus(
        COLLAB.reconnectAttempt ? 'reconnecting' : 'connecting',
        COLLAB.reconnectAttempt
            ? 'collabStatusReconnecting'
            : 'collabStatusConnecting'
    );

    let socket;

    try {
        socket = new WebSocket(
            collabRoomUrl(code)
        );
    } catch (error) {
        console.warn('Failed to open collab socket:', error);
        collabSetStatus('error', 'collabErrorJoin', true);
        return;
    }

    COLLAB.socket = socket;

    socket.addEventListener('message', event => {
        /*
         * A socket replaced by a leave-then-rejoin can still be draining
         * frames. Without this guard a late snapshot from the old room
         * would overwrite the new room's document wholesale.
         */
        if (COLLAB.socket !== socket) {
            return;
        }

        let message;

        try {
            message = JSON.parse(event.data);
        } catch {
            return;
        }

        collabHandleMessage(message);
    });

    socket.addEventListener('close', event => {
        if (COLLAB.socket !== socket) {
            return;
        }

        COLLAB.socket = null;

        if (COLLAB.leaving) {
            return;
        }

        /*
         * A close before any snapshot means the join itself was refused:
         * a bad code, an expired room, a full room. The server answers
         * those by declining the upgrade, which reaches the browser as a
         * generic 1006 — indistinguishable from a network blip by code
         * alone, but not by whether we ever got in. Retrying for 75
         * seconds before admitting a typo is the wrong answer, so fail fast.
         */
        if (!COLLAB.everConnected) {
            collabAbandon('collabErrorJoin');
            return;
        }

        collabScheduleReconnect();
    });

    socket.addEventListener('error', () => {
        /* 'close' always follows; reconnect is handled there. */
    });
}

function collabHandleMessage(message) {
    switch (message.type) {
        case 'snapshot':
            COLLAB.clientId = message.you;
            COLLAB.peers = message.peers || 1;
            COLLAB.reconnectAttempt = 0;
            COLLAB.everConnected = true;

            if (!collabApplySnapshot(message.doc)) {
                collabAbandon('collabErrorMap');
                return;
            }

            /*
             * Own-op history does not survive a reconnect: the ops it
             * holds were computed against a document this snapshot has
             * just replaced, so undoing them could remove items that are
             * no longer yours or resurrect ones a peer deleted.
             */
            COLLAB.ownOps = [];
            COLLAB.redoOps = [];

            collabSetStatus('online', 'collabStatusOnline');
            collabWriteHash();

            /*
             * Immediately, not via the throttled shared-scalar flush: two
             * clients joining an empty room inside the throttle window
             * would each still be holding their own battery when the
             * other's snapshot was served, and both would seed it.
             */
            if (COLLAB.pendingGunSeed) {
                COLLAB.pendingGunSeed = false;

                for (const gun of S.guns) {
                    collabSendGunAdd(gun);
                }
            }

            if (COLLAB.pendingPush) {
                COLLAB.pendingPush = false;
                collabPushSolo();
            }
            break;

        case 'op':
            collabApplyOp(message.op);
            break;

        case 'peers':
            COLLAB.peers = message.count;
            collabRender();
            break;

        case 'error':
            console.warn('Collab op rejected:', message.code);

            if (message.code === 'rate-limited') {
                collabShowThrottled();
                break;
            }

            /*
             * The op was applied locally before it was sent, but the room
             * refused it — a full room document, or a shape the server
             * would not take. Without reconciling, that edit sits on screen
             * looking shared while no peer has it and the next snapshot
             * silently deletes it. Pull the authoritative document instead.
             */
            collabSetStatus('online', 'collabErrorRejected', true);
            collabSend({ type: 'sync' });
            break;

        case 'ack':
        case 'pong':
            break;

        default:
            break;
    }
}

/*
 * A burst of rejections would otherwise re-render the panel per message
 * and leave the warning up forever. Show it once, clear it once things
 * are moving again.
 */
function collabShowThrottled() {
    if (COLLAB.throttleTimer) {
        return;
    }

    collabSetStatus('online', 'collabStatusThrottled', true);

    COLLAB.throttleTimer = setTimeout(() => {
        COLLAB.throttleTimer = null;

        if (collabIsOnline()) {
            collabSetStatus('online', 'collabStatusOnline');
        }
    }, 3000);
}

/*
 * "Include my current map" — pushes the drawings, markers and targets you
 * had before joining into the room, without disturbing the room's own
 * content or your local storage.
 */
function collabPushSolo() {
    const solo = COLLAB.solo;

    if (!solo) {
        return;
    }

    /*
     * Re-stamp with the room's map: your content may have been drawn on a
     * different map, and the room's is fixed.
     */
    const mapId = S.map;

    const payload = {
        drawings: solo.drawings.map(drawing => ({ ...drawing, mapId })),
        markers: solo.markers.map(marker => ({ ...marker, mapId })),
        targets: structuredClone(solo.savedTargets),
        guns: (solo.guns || []).map(collabGunWire)
    };

    collabOnBulkAdd(payload);

    /*
     * The server broadcasts to peers but never echoes back to the sender,
     * so the push has to be applied locally as well.
     */
    collabApplyOp({
        op: 'push',
        ...payload
    });
}

function collabScheduleReconnect() {
    if (COLLAB.reconnectAttempt >= COLLAB_RECONNECT_ATTEMPTS) {
        collabAbandon('collabErrorLost');
        return;
    }

    const delay = Math.min(
        COLLAB_RECONNECT_MAX,
        COLLAB_RECONNECT_BASE * Math.pow(2, COLLAB.reconnectAttempt)
    );

    COLLAB.reconnectAttempt += 1;

    collabSetStatus('reconnecting', 'collabStatusReconnecting');

    COLLAB.reconnectTimer = setTimeout(() => {
        COLLAB.reconnectTimer = null;
        collabConnect(COLLAB.roomCode, false);
    }, delay);
}

/*
 * Give up on the room and put the user back on their own map, rather than
 * leaving them editing a document nobody else will ever receive.
 */
function collabAbandon(messageKey) {
    const hadSolo = Boolean(COLLAB.solo);

    /*
     * Abandon can be reached with the socket still open (a room whose map
     * we cannot use), not only from the close handler. Tear it down
     * explicitly, and mark the intent so the close it triggers does not
     * start a reconnect.
     */
    COLLAB.leaving = true;

    if (COLLAB.socket) {
        try {
            COLLAB.socket.close(1000, 'abandoned');
        } catch {
            /* Already closed. */
        }

        COLLAB.socket = null;
    }

    COLLAB.status = 'off';

    if (hadSolo) {
        collabRestoreSolo();
    }

    collabResetSession();
    collabClearHash();
    collabSetStatus('error', messageKey, true);
}

function collabResetSession() {
    if (COLLAB.reconnectTimer) {
        clearTimeout(COLLAB.reconnectTimer);
        COLLAB.reconnectTimer = null;
    }

    if (COLLAB.sharedTimer) {
        clearTimeout(COLLAB.sharedTimer);
        COLLAB.sharedTimer = null;
    }

    if (COLLAB.throttleTimer) {
        clearTimeout(COLLAB.throttleTimer);
        COLLAB.throttleTimer = null;
    }

    COLLAB.everConnected = false;
    COLLAB.roomCode = null;
    COLLAB.clientId = null;
    COLLAB.peers = 0;
    COLLAB.mapId = null;
    COLLAB.ownOps = [];
    COLLAB.redoOps = [];
    COLLAB.reconnectAttempt = 0;
    COLLAB.pendingPush = false;
    COLLAB.pendingGunSeed = false;
    COLLAB.copied = false;

    COLLAB.lastShared = {
        origin: null,
        target: null,
        weapon: null,
        guns: {}
    };
}

function collabLeave() {
    COLLAB.leaving = true;

    if (COLLAB.socket) {
        try {
            COLLAB.socket.close(1000, 'left');
        } catch {
            /* Already closed. */
        }

        COLLAB.socket = null;
    }

    /*
     * Status drops out of the session BEFORE restoring, so the
     * persistence suppression is lifted and the restored solo map is
     * written back to local storage.
     */
    COLLAB.status = 'off';

    collabRestoreSolo();
    collabResetSession();
    collabClearHash();

    resetMapToolHistory();
    collabSetStatus('off');

    if (typeof trackAnalytics === 'function') {
        trackAnalytics('collab-room-left');
    }
}

/* =========================
   SHARE LINK
   ========================= */

function collabReadHash() {
    const hash = window.location.hash.replace(/^#/, '');

    if (!hash) {
        return null;
    }

    const params = new URLSearchParams(hash);
    const code = params.get(COLLAB_HASH_KEY);

    /*
     * Lower-cased to match the server's alphabet: Durable Object names are
     * case-sensitive, and share links get upper-cased by chat clients and
     * by people retyping them.
     */
    return code && /^[a-z0-9]{6,32}$/i.test(code)
        ? code.toLowerCase()
        : null;
}

function collabWriteHash() {
    if (!COLLAB.roomCode) {
        return;
    }

    history.replaceState(
        null,
        '',
        `#${COLLAB_HASH_KEY}=${COLLAB.roomCode}`
    );
}

function collabClearHash() {
    if (!window.location.hash) {
        return;
    }

    history.replaceState(
        null,
        '',
        window.location.pathname + window.location.search
    );
}

async function collabCopyLink() {
    const link = collabShareLink();

    if (!link) {
        return;
    }

    try {
        await navigator.clipboard.writeText(link);
        COLLAB.copied = true;
        collabRender();

        setTimeout(() => {
            COLLAB.copied = false;
            collabRender();
        }, 2000);
    } catch (error) {
        console.warn('Failed to copy share link:', error);
    }
}

/* =========================
   PANEL
   ========================= */

function collabButton(labelKey, className, onClick) {
    const button = document.createElement('button');

    button.type = 'button';
    button.className = className;
    button.textContent = tr(labelKey);

    button.addEventListener('click', event => {
        event.stopPropagation();
        onClick(button);
    });

    return button;
}

function collabBuildIdlePanel(container) {
    const includeRow = document.createElement('label');
    includeRow.className = 'collab-include';

    const includeBox = document.createElement('input');
    includeBox.type = 'checkbox';
    includeBox.id = 'collabIncludeMine';
    includeBox.checked = true;

    const includeText = document.createElement('span');
    includeText.textContent = tr('collabIncludeMine');

    includeRow.append(includeBox, includeText);

    const start = collabButton(
        'collabStart',
        'collab-primary',
        () => collabCreateRoom(includeBox.checked)
    );

    const divider = document.createElement('div');
    divider.className = 'collab-divider';
    divider.textContent = tr('collabOr');

    const joinRow = document.createElement('div');
    joinRow.className = 'collab-join-row';

    const input = document.createElement('input');
    input.type = 'text';
    input.id = 'collabCodeInput';
    input.placeholder = tr('collabCodePlaceholder');
    input.autocomplete = 'off';
    input.spellcheck = false;
    input.maxLength = 40;

    const join = collabButton(
        'collabJoin',
        'collab-join',
        () => collabJoinFromInput(input, includeBox.checked)
    );

    input.addEventListener('keydown', event => {
        if (event.key === 'Enter') {
            event.preventDefault();
            collabJoinFromInput(input, includeBox.checked);
        }
    });

    joinRow.append(input, join);

    container.append(includeRow, start, divider, joinRow);
}

/*
 * Accepts a bare code or a full share link, because people paste whichever
 * one they were given.
 */
function collabJoinFromInput(input, includeMine) {
    const raw = input.value.trim();

    if (!raw) {
        return;
    }

    let code = raw;

    if (raw.includes('#')) {
        const params = new URLSearchParams(
            raw.slice(raw.indexOf('#') + 1)
        );

        code = params.get(COLLAB_HASH_KEY) || '';
    }

    code = code.trim().toLowerCase();

    if (!/^[a-z0-9]{6,32}$/.test(code)) {
        /*
         * Written straight into the status line rather than through
         * collabSetStatus, which re-renders the panel and would wipe the
         * code being corrected — a one-character typo should not cost the
         * user all twelve.
         */
        COLLAB.status = 'error';
        COLLAB.statusKey = 'collabErrorCode';
        COLLAB.statusIsError = true;

        const status = document.querySelector('#collabPopover .collab-status');

        if (status) {
            status.textContent = tr('collabErrorCode');
            status.classList.add('error');
        }

        input.focus();
        input.select();
        return;
    }

    collabConnect(code, includeMine);
}

function collabBuildActivePanel(container) {
    const codeRow = document.createElement('div');
    codeRow.className = 'collab-code-row';

    const code = document.createElement('code');
    code.className = 'collab-code';
    code.textContent = COLLAB.roomCode || '';

    codeRow.append(code);

    const copy = collabButton(
        COLLAB.copied
            ? 'collabCopied'
            : 'collabCopyLink',
        'collab-primary',
        () => collabCopyLink()
    );

    const peers = document.createElement('div');
    peers.className = 'collab-peers';
    peers.textContent = tr('collabPeers').replace(
        '{count}',
        String(COLLAB.peers || 1)
    );

    const leave = collabButton(
        'collabLeave',
        'collab-leave',
        () => collabLeave()
    );

    container.append(codeRow, copy, peers, leave);
}

function collabRender() {
    const container = $('collabPopover');

    if (!container) {
        return;
    }

    container.innerHTML = '';

    const title = document.createElement('div');
    title.className = 'map-tool-popover-title';
    title.textContent = tr('collabTitle');

    const hint = document.createElement('div');
    hint.className = 'collab-hint';
    hint.textContent = tr('collabHint');

    container.append(title, hint);

    if (collabInSession()) {
        collabBuildActivePanel(container);
    } else {
        collabBuildIdlePanel(container);
    }

    const status = document.createElement('div');
    status.className = 'collab-status';
    status.classList.toggle('error', COLLAB.statusIsError);
    status.textContent = COLLAB.statusKey
        ? tr(COLLAB.statusKey)
        : '';

    container.append(status);
}

/* =========================
   INIT
   ========================= */

function initCollab() {
    if (!isCollabConfigured()) {
        return;
    }

    const button = $('mapToolCollab');

    if (button) {
        button.hidden = false;
    }

    const code = collabReadHash();

    if (code) {
        collabConnect(code, false);
    }

    window.addEventListener('beforeunload', () => {
        if (collabInSession()) {
            COLLAB.leaving = true;
        }
    });
}
