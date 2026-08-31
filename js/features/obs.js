const OBS_CAMERA_MS = 700;
const OBS_CAMERA_EPSILON = 0.004;
const OBS_ZOOM_EPSILON = 0.002;
const OBS_MIN_SPAN = 0.05;
const OBS_LOCAL_RELOAD_MS = 120;
const OBS_TEXT_BASE = 0.62;

const OBS_DEFAULTS = {
    bg: 'transparent',
    panel: 'full',
    corner: 'bl',
    frame: 'pair',
    cursors: 'on',
    scale: 1,
    textSize: 10,
    padding: 90,
    maxZoom: 20
};

const OBS_CODE_PATTERN = /^[a-z0-9]{6,32}$/i;

const OBS = {
    active: false,
    options: null,
    gunId: null,
    signatures: new Map(),
    view: null,
    target: null,
    camera: null,
    frame: 0,
    syncing: false,
    localTimer: null
};

function isObsMode() {
    return document.documentElement.dataset.obs === '1';
}

function obsChoice(params, key, allowed, fallback) {
    const value = (params.get(key) || '').toLowerCase();

    return allowed.includes(value)
        ? value
        : fallback;
}

function obsNumber(params, key, min, max, fallback) {
    const raw = params.get(key);

    if (raw === null || raw.trim() === '') {
        return fallback;
    }

    const value = Number(raw);

    if (!Number.isFinite(value)) {
        return fallback;
    }

    return Math.min(max, Math.max(min, value));
}

function obsRoomCode(params) {
    const fromQuery = params.get('room');

    if (fromQuery && OBS_CODE_PATTERN.test(fromQuery)) {
        return fromQuery.toLowerCase();
    }

    return typeof collabReadHash === 'function'
        ? collabReadHash()
        : null;
}

function obsReadOptions() {
    const params = new URLSearchParams(window.location.search);

    return {
        bg: obsChoice(params, 'bg', ['transparent', 'opaque'], OBS_DEFAULTS.bg),
        panel: obsChoice(params, 'panel', ['full', 'compact', 'none'], OBS_DEFAULTS.panel),
        corner: obsChoice(params, 'corner', ['tl', 'tr', 'bl', 'br'], OBS_DEFAULTS.corner),
        frame: obsChoice(
            params,
            'frame',
            ['pair', 'map', 'target'],
            OBS_DEFAULTS.frame
        ),
        cursors: obsChoice(params, 'cursors', ['on', 'off'], OBS_DEFAULTS.cursors),
        scale: obsNumber(params, 'scale', 0.5, 3, OBS_DEFAULTS.scale),
        textSize: obsNumber(params, 'textsize', 1, 40, OBS_DEFAULTS.textSize),
        padding: obsNumber(
            params,
            'padding',
            0,
            600,
            obsNumber(params, 'pad', 0, 600, OBS_DEFAULTS.padding)
        ),
        maxZoom: obsNumber(params, 'maxzoom', 1, 24, OBS_DEFAULTS.maxZoom),
        room: obsRoomCode(params)
    };
}

function obsApplyOptions() {
    const overlay = $('obsOverlay');

    document.documentElement.dataset.obsBg = OBS.options.bg;
    document.body.style.setProperty('--obs-scale', String(OBS.options.scale));

    document.body.style.setProperty(
        '--obs-base-scale',
        String(OBS.options.scale)
    );

    document.body.style.setProperty(
        '--obs-text-scale',
        String(
            OBS_TEXT_BASE *
            OBS.options.textSize /
            OBS_DEFAULTS.textSize
        )
    );

    if (typeof invalidateCssVarCache === 'function') {
        invalidateCssVarCache();
    }

    if (!overlay) {
        return;
    }

    overlay.dataset.panel = OBS.options.panel;
    overlay.dataset.corner = OBS.options.corner;
    overlay.hidden = false;
}

function obsReducedMotion() {
    return Boolean(
        window.matchMedia &&
        window.matchMedia('(prefers-reduced-motion: reduce)').matches
    );
}


function obsGunSignature(gun) {
    return `${gun.position.x}|${gun.position.y}|${gun.weapon || ''}`;
}

function obsTrackGuns() {
    let moved = null;

    for (const gun of S.guns) {
        const signature = obsGunSignature(gun);

        if (
            OBS.signatures.has(gun.id) &&
            OBS.signatures.get(gun.id) !== signature
        ) {
            moved = gun.id;
        }

        OBS.signatures.set(gun.id, signature);
    }

    for (const id of Array.from(OBS.signatures.keys())) {
        if (!gunById(id)) {
            OBS.signatures.delete(id);
        }
    }

    if (moved) {
        OBS.gunId = moved;
    }

    if (!OBS.gunId || !gunById(OBS.gunId)) {
        OBS.gunId = S.guns[0].id;
    }

    if (S.activeGunId !== OBS.gunId) {
        selectGun(OBS.gunId);
    }
}


function obsSourceText(id) {
    const element = $(id);

    return element
        ? element.textContent.trim()
        : '';
}

function obsGunLine() {
    const gun = activeGun();
    const weapon = WEAPONS[gun.weapon];

    const parts = [gun.name];

    if (weapon) {
        parts.push(getWeaponName(weapon));
    }

    if (S.guns.length > 1) {
        parts.push(
            `${S.guns.indexOf(gun) + 1}/${S.guns.length}`
        );
    }

    return parts.filter(Boolean).join(' · ');
}

function obsFlightText() {
    const row = $('flightTimes');
    const host = $('flightTimeBadges');

    if (!row || !host || row.hidden) {
        return '';
    }

    return Array.from(host.children)
        .map(badge => {
            const arc = badge.querySelector('.flight-badge-arc');
            const value = badge.querySelector('.flight-badge-value');

            return [
                arc ? arc.textContent.trim() : '',
                value ? value.textContent.trim() : ''
            ].filter(Boolean).join(' ');
        })
        .filter(Boolean)
        .join('  ·  ');
}

function obsRenderReadout() {
    setText($('obsGun'), obsGunLine());
    setText($('obsMil'), obsSourceText('mil') || '—');

    const arc = $('milAlt');

    setText(
        $('obsMilArc'),
        arc && !arc.hidden
            ? arc.textContent.trim()
            : ''
    );

    setText($('obsAzimuth'), obsSourceText('angle') || '—');
    setText($('obsRange'), obsSourceText('distm') || '—');

    const status = $('obsRangeStatus');
    const text = obsSourceText('rangeStatus');

    setText(status, text);

    if (status) {
        status.dataset.state = text === tr('inRange')
            ? 'in'
            : 'out';
    }

    const flight = $('obsFlight');
    const values = obsFlightText();

    setText($('obsFlightValues'), values);

    if (flight && flight.hidden !== !values) {
        flight.hidden = !values;
    }
}

function obsStatusKey() {
    if (
        typeof COLLAB === 'undefined' ||
        !OBS.options.room ||
        COLLAB.status === 'off' ||
        COLLAB.status === 'online'
    ) {
        return null;
    }

    return COLLAB.statusKey;
}

function obsRenderStatus() {
    const element = $('obsStatus');

    if (!element) {
        return;
    }

    const key = obsStatusKey();

    setText(element, key ? tr(key) : '');

    if (element.hidden !== !key) {
        element.hidden = !key;
    }
}


function obsMapView() {
    const v = view();

    return {
        cx: (v.bounds.minX + v.bounds.maxX) / 2,
        cy: (v.bounds.minY + v.bounds.maxY) / 2,
        zoom: 1
    };
}

function obsReadoutExtent() {

    if (OBS.options.panel === 'none') {
        return 0;
    }

    const readout = $q('.obs-readout');

    if (!readout) {
        return 0;
    }

    const height = readout.getBoundingClientRect().height;

    return height
        ? height + OBS.options.padding
        : 0;
}

function obsReadoutShift(zoom) {

    const reserved = obsReadoutExtent();

    if (!reserved) {
        return 0;
    }

    const v = view();
    const base = v.scale / S.zoom;

    const shift = reserved / 2 / (base * zoom);

    return (
        OBS.options.corner === 'tl' ||
        OBS.options.corner === 'tr'
    )
        ? shift
        : -shift;
}

function obsTargetView() {

    const zoom = Math.max(
        MIN_ZOOM,
        OBS.options.maxZoom
    );

    return {
        cx: S.target.x,
        cy: S.target.y + obsReadoutShift(zoom),
        zoom
    };
}

function obsDesiredView() {
    if (OBS.options.frame === 'map') {
        return obsMapView();
    }

    if (OBS.options.frame === 'target') {
        return obsTargetView();
    }

    const v = view();
    const gun = activeGun().position;

    const base = v.scale / S.zoom;

    const reserved = obsReadoutExtent();

    const available = {
        width: Math.max(
            1,
            wrap.clientWidth - OBS.options.padding * 2
        ),
        height: Math.max(
            1,
            wrap.clientHeight -
                OBS.options.padding * 2 -
                reserved
        )
    };

    const spanX = Math.max(
        OBS_MIN_SPAN,
        Math.abs(S.target.x - gun.x)
    );

    const spanY = Math.max(
        OBS_MIN_SPAN,
        Math.abs(S.target.y - gun.y)
    );

    const fit = Math.min(
        available.width / spanX,
        available.height / spanY
    );

    const zoom = Math.min(
        OBS.options.maxZoom,
        Math.max(MIN_ZOOM, fit / base)
    );

    return {
        cx: (gun.x + S.target.x) / 2,
        cy: (gun.y + S.target.y) / 2 +
            obsReadoutShift(zoom),
        zoom
    };
}

function obsSameView(a, b) {
    return (
        Math.abs(a.cx - b.cx) < OBS_CAMERA_EPSILON &&
        Math.abs(a.cy - b.cy) < OBS_CAMERA_EPSILON &&
        Math.abs(a.zoom - b.zoom) < OBS_ZOOM_EPSILON
    );
}

function obsApplyView(state) {
    const v = view();

    const base = v.scale / S.zoom;
    const scale = base * state.zoom;

    S.zoom = state.zoom;

    S.panX =
        v.worldWidth * scale / 2 -
        (state.cx - v.bounds.minX) * scale;

    S.panY =
        v.worldHeight * scale / 2 -
        (v.bounds.maxY - state.cy) * scale;

    OBS.view = state;

    draw();
}

function obsEase(t) {
    return t < 0.5
        ? 4 * t * t * t
        : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

function obsStepCamera(now) {
    OBS.frame = 0;

    const move = OBS.camera;

    if (!move) {
        return;
    }

    const t = Math.min(
        1,
        (now - move.start) / OBS_CAMERA_MS
    );

    const eased = obsEase(t);

    obsApplyView({
        cx: move.from.cx + (move.to.cx - move.from.cx) * eased,
        cy: move.from.cy + (move.to.cy - move.from.cy) * eased,
        zoom: move.from.zoom * Math.pow(
            move.to.zoom / move.from.zoom,
            eased
        )
    });

    if (t < 1) {
        obsStartCamera();
        return;
    }

    OBS.camera = null;
}

function obsStartCamera() {
    if (OBS.frame) {
        return;
    }

    OBS.frame = requestAnimationFrame(obsStepCamera);
}

function obsUpdateCamera() {
    const desired = obsDesiredView();

    if (!OBS.view) {
        OBS.target = desired;
        obsApplyView(desired);
        return;
    }

    if (OBS.target && obsSameView(OBS.target, desired)) {
        return;
    }

    OBS.target = desired;

    if (obsReducedMotion()) {
        OBS.camera = null;
        obsApplyView(desired);
        return;
    }

    OBS.camera = {
        from: { ...OBS.view },
        to: desired,
        start: performance.now()
    };

    obsStartCamera();
}


function obsSync() {
    if (!OBS.active || OBS.syncing) {
        return;
    }

    OBS.syncing = true;

    try {
        obsTrackGuns();
        obsRenderReadout();
        obsRenderStatus();
        obsUpdateCamera();
    } finally {
        OBS.syncing = false;
    }
}

function obsReloadLocal() {
    if (typeof loadMapPoints === 'function') {
        loadMapPoints();
    }

    if (typeof loadMapToolState === 'function') {
        loadMapToolState();
    }

    if (typeof loadSavedTargets === 'function') {
        loadSavedTargets();
    }

    inputs();
    renderGuns();
    renderSavedTargets();
    buildMapLayers();
    draw();
}

function obsQueueLocalReload() {
    if (OBS.localTimer) {
        return;
    }

    OBS.localTimer = setTimeout(
        () => {
            OBS.localTimer = null;
            obsReloadLocal();
        },
        OBS_LOCAL_RELOAD_MS
    );
}

function obsWatchLocalState() {
    const keys = [
        MAP_POINTS_KEY,
        MAP_TOOLS_STORAGE_KEY,
        SAVED_TARGETS_KEY
    ];

    window.addEventListener('storage', event => {
        if (
            !event.key ||
            !keys.includes(event.key) ||
            (
                typeof collabInSession === 'function' &&
                collabInSession()
            )
        ) {
            return;
        }

        obsQueueLocalReload();
    });
}

function obsJoinRoom() {
    if (
        !OBS.options.room ||
        typeof isCollabConfigured !== 'function' ||
        !isCollabConfigured()
    ) {
        return;
    }

    if (
        typeof collabInSession === 'function' &&
        collabInSession()
    ) {
        return;
    }

    if (typeof collabConnect === 'function') {
        collabConnect(OBS.options.room, false);
    }
}

function obsInstallHooks() {
    const resultBase = result;

    result = function (...args) {
        const value = resultBase.apply(this, args);

        obsSync();

        return value;
    };

    if (
        OBS.options.cursors === 'off' &&
        typeof drawCollabCursors === 'function'
    ) {
        drawCollabCursors = function () {};
    }
}

function initObs() {
    if (!isObsMode()) {
        return;
    }

    OBS.active = true;
    OBS.options = obsReadOptions();

    obsApplyOptions();
    obsInstallHooks();
    obsWatchLocalState();
    obsJoinRoom();

    resize();
    obsSync();
}
