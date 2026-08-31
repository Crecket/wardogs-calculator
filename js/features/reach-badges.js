const REACH_STATE_CLASS = {
    reachable: 'reach-ok',
    masked: 'reach-masked',
    out: 'reach-out',
    close: 'reach-close'
};

const REACH_STATE_GLYPH = {
    reachable: '✓',
    masked: '▲',
    out: '✕',
    close: '✕'
};

const REACH_STATE_LABEL = {
    reachable: 'reachReachable',
    masked: 'reachMasked',
    out: 'reachOutOfRange',
    close: 'reachTooClose'
};

const REACH_UNAVAILABLE = new Set();

let reachSignature = null;

let reachSolvePending = false;

function reachBearingIndex(bearings, dx, dy) {
    const step = 2 * Math.PI / bearings;

    const index =
        Math.round(
            Math.atan2(dy, dx) / step
        ) % bearings;

    return index < 0 ? index + bearings : index;
}

function reachIntervalHit(intervals, metres) {
    for (let i = 0; i < intervals.length; i += 2) {
        if (metres >= intervals[i] && metres <= intervals[i + 1]) {
            return true;
        }
    }

    return false;
}

function reachClassify(solved, target) {
    const x = Number(target?.x);
    const y = Number(target?.y);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }

    const ring = solved.ring;

    const dx = x - solved.gun.position.x;
    const dy = y - solved.gun.position.y;

    const metres =
        Math.hypot(dx, dy) * METRES_PER_GAME_UNIT_RING;

    const bearing =
        reachBearingIndex(ring.radii.length, dx, dy);

    if (metres > ring.radii[bearing]) {
        return 'out';
    }

    const minimum =
        ring.minRadii
            ? ring.minRadii[bearing]
            : ring.minRangeMeters ?? 0;

    if (metres < minimum) {
        return 'close';
    }

    return reachIntervalHit(solved.dead.bearings[bearing], metres)
        ? 'masked'
        : 'reachable';
}

function reachGunSolved(key) {
    return (
        RANGE_RING_CACHE.has(key) &&
        DEAD_GROUND_CACHE.has(key)
    );
}

function reachUnsolvedGun() {
    for (const gun of S.guns) {
        const key = rangeRingMemoKey(gun, S.map);

        if (!reachGunSolved(key) && !REACH_UNAVAILABLE.has(key)) {
            return gun;
        }
    }

    return null;
}

function reachSolveGun(gun) {
    const mapId = S.map;
    const key = rangeRingMemoKey(gun, mapId);

    if (!mapHasHeightfield(mapId)) {
        REACH_UNAVAILABLE.add(key);

        return;
    }

    if (terrainDeadGround(gun, mapId)) {
        return;
    }

    if (cachedHeightfield(mapId) && PROJECTILE_MODEL) {
        REACH_UNAVAILABLE.add(key);
    }
}

function reachWhenIdle(callback) {
    if (typeof requestIdleCallback === 'function') {
        requestIdleCallback(callback, { timeout: 400 });

        return;
    }

    setTimeout(callback, 32);
}

function reachScheduleSolve() {
    if (reachSolvePending) {
        return;
    }

    const gun = reachUnsolvedGun();

    if (!gun) {
        return;
    }

    reachSolvePending = true;

    reachWhenIdle(() => {
        reachSolvePending = false;

        reachSolveGun(gun);

        const key = rangeRingMemoKey(gun, S.map);

        if (reachGunSolved(key) || REACH_UNAVAILABLE.has(key)) {
            renderSavedTargetReachBadges(true);
            reachScheduleSolve();

            return;
        }

        reachSolvePending = true;

        setTimeout(() => {
            reachSolvePending = false;

            reachScheduleSolve();
        }, 400);
    });
}

function reachSignatureNow() {
    return [
        S.map,
        LANG,
        S.activeGunId,
        cachedHeightfield(S.map) ? 1 : 0,
        PROJECTILE_MODEL ? 1 : 0,
        S.guns
            .map(gun => rangeRingMemoKey(gun, S.map))
            .join(',')
    ].join('|');
}

function reachBadgeHost(item) {
    const info =
        item.querySelector('.saved-target-info');

    if (!info) {
        return null;
    }

    let host =
        info.querySelector('.saved-target-reach');

    if (!host) {
        host = document.createElement('div');

        host.className = 'saved-target-reach';

        host.setAttribute('role', 'group');
        host.setAttribute('aria-label', tr('reachBadges'));

        info.appendChild(host);
    }

    if (info.lastElementChild !== host) {
        info.appendChild(host);
    }

    return host;
}

function reachBadgeNode(host, index) {
    let badge = host.children[index];

    if (!badge) {
        badge = document.createElement('span');

        badge.className = 'saved-target-reach-badge';

        badge.setAttribute('role', 'img');

        const glyph = document.createElement('span');

        glyph.className = 'reach-glyph';

        const gun = document.createElement('span');

        gun.className = 'reach-gun';

        badge.append(glyph, gun);

        host.appendChild(badge);
    }

    return badge;
}

function reachApplyBadge(badge, gun, index, state, numbered) {
    const className =
        'saved-target-reach-badge ' +
        REACH_STATE_CLASS[state] +
        (gun.id === S.activeGunId ? ' active' : '');

    if (badge.className !== className) {
        badge.className = className;
    }

    if (badge.dataset.gunId !== gun.id) {
        badge.dataset.gunId = gun.id;
    }

    if (badge.dataset.reach !== state) {
        badge.dataset.reach = state;
    }

    const label =
        `${gun.name} · ${tr(REACH_STATE_LABEL[state])}`;

    if (badge.title !== label) {
        badge.title = label;

        badge.setAttribute('aria-label', label);
    }

    setText(
        badge.firstElementChild,
        REACH_STATE_GLYPH[state]
    );

    setText(
        badge.lastElementChild,
        numbered ? String(index + 1) : ''
    );
}

function reachSolvedGuns() {
    const mapId = S.map;

    const solved = [];

    S.guns.forEach((gun, index) => {
        if (!reachGunSolved(rangeRingMemoKey(gun, mapId))) {
            return;
        }

        const ring = terrainRangeRing(gun, mapId);
        const dead = terrainDeadGround(gun, mapId);

        if (ring && dead) {
            solved.push({ gun, index, ring, dead });
        }
    });

    return solved;
}

function renderSavedTargetItemReach(item, target, guns, numbered) {
    const host = reachBadgeHost(item);

    if (!host) {
        return;
    }

    let shown = 0;

    guns.forEach(entry => {
        const state = reachClassify(entry, target);

        if (!state) {
            return;
        }

        reachApplyBadge(
            reachBadgeNode(host, shown),
            entry.gun,
            entry.index,
            state,
            numbered
        );

        shown += 1;
    });

    while (host.children.length > shown) {
        host.lastElementChild.remove();
    }

    if (host.hidden !== (shown === 0)) {
        host.hidden = shown === 0;
    }
}

function renderSavedTargetReachBadges(force) {
    const container = $('savedTargetsList');

    if (!container || !Array.isArray(savedTargets)) {
        return;
    }

    const signature = reachSignatureNow();

    if (!force && signature === reachSignature) {
        return;
    }

    reachSignature = signature;

    reachScheduleSolve();

    const rows = new Map();

    container
        .querySelectorAll('.saved-target')
        .forEach(item => {
            rows.set(item.dataset.targetId, item);
        });

    if (!rows.size) {
        return;
    }

    const guns = reachSolvedGuns();
    const numbered = S.guns.length > 1;

    savedTargets.forEach(target => {
        const item = rows.get(String(target.id));

        if (item) {
            renderSavedTargetItemReach(
                item,
                target,
                guns,
                numbered
            );
        }
    });
}

if (typeof renderSavedTargets === 'function') {
    const renderSavedTargetsBase = renderSavedTargets;

    renderSavedTargets = function (...args) {
        const result =
            renderSavedTargetsBase.apply(this, args);

        renderSavedTargetReachBadges(true);

        return result;
    };
}

if (typeof refreshSavedTargetHighlight === 'function') {
    const refreshSavedTargetHighlightBase =
        refreshSavedTargetHighlight;

    refreshSavedTargetHighlight = function (...args) {
        const result =
            refreshSavedTargetHighlightBase.apply(this, args);

        renderSavedTargetReachBadges(false);

        return result;
    };
}
