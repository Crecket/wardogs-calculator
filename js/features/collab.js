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
        weapon: null
    },

    sharedTimer: null,

    reconnectAttempt: 0,
    reconnectTimer: null,
    leaving: false,
    pendingPush: false,

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

        selectedSavedTargetId = null;
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
        return;
    }

    if (mapId !== 'custom' && !MAPS[mapId]) {
        console.warn('Room uses an unknown map:', mapId);
        return;
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

function collabApplySnapshot(doc) {
    COLLAB.applying = true;

    try {
        COLLAB.mapId = doc.mapId;
        collabApplyMapId(doc.mapId);

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
            origin: structuredClone(S.origin),
            target: structuredClone(S.target),
            weapon: S.weapon
        };

        MAP_TOOL_STATE.hoverPathId = null;
        MAP_TOOL_STATE.hoverDeletePoint = null;
        MAP_TOOL_STATE.hoverMarkerId = null;

        selectedSavedTargetId = null;
    } finally {
        COLLAB.applying = false;
    }

    inputs();
    renderSavedTargets();
    buildMapLayers();
    draw();
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

                if (selectedSavedTargetId === op.id) {
                    selectedSavedTargetId = null;
                }
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

            case 'point.set':
                S[op.point] = { x: op.x, y: op.y };
                clamp(S[op.point]);

                /*
                 * Record what we just adopted, so the diff in
                 * collabFlushShared does not read it as a local edit
                 * and bounce it straight back to the sender.
                 */
                COLLAB.lastShared[op.point] =
                    structuredClone(S[op.point]);
                break;

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
                    selectedSavedTargetId = null;
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
function collabOnBulkAdd({ drawings = [], markers = [], targets = [] }) {
    if (
        !drawings.length &&
        !markers.length &&
        !targets.length
    ) {
        return;
    }

    collabEmit({
        op: 'push',
        drawings,
        markers,
        targets
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

    if (
        last &&
        last.op.op === 'point.set' &&
        last.op.point === point
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

    ['origin', 'target'].forEach(point => {
        const current = S[point];
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

            collabApplySnapshot(message.doc);

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
            }
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
        targets: structuredClone(solo.savedTargets)
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
    COLLAB.copied = false;

    COLLAB.lastShared = {
        origin: null,
        target: null,
        weapon: null
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

    return code && /^[a-z0-9]{6,32}$/i.test(code)
        ? code
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
        collabSetStatus('error', 'collabErrorCode', true);
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
