const REACH_STATE_LABEL = {
    pending: 'reachPending',
    reachable: 'reachReachable',
    masked: 'reachMasked',
    out: 'reachOutOfRange',
    close: 'reachTooClose',
    unknown: 'reachUnknown'
};

const REACH_SUMMARY_CLASS = {
    pending: 'reach-pending',
    all: 'reach-ok',
    some: 'reach-partial',
    none: 'reach-out'
};

const REACH_SUMMARY_GLYPH = {
    pending: '·',
    all: '✓',
    some: '◐',
    none: '✕'
};

const REACH_SUMMARY_LABEL = {
    pending: 'reachPending',
    all: 'reachAll',
    some: 'reachSome',
    none: 'reachNone'
};

const REACH_UNAVAILABLE = new Set();

let reachSignature = null;

let reachSolvePending = false;

function reachClassify(solved, target) {
    const x = Number(target?.x);
    const y = Number(target?.y);

    if (!Number.isFinite(x) || !Number.isFinite(y)) {
        return null;
    }

    const weapon = WEAPONS[solved.gun.weapon];

    if (!weapon) {
        return null;
    }

    const shot = assessShot(weapon, solved.gun.position, { x, y }, S.map);

    if (shot.state === 'pending') {
        return 'pending';
    }

    if (shot.state !== 'ready') {
        return 'unknown';
    }

    if (shot.verdict === 'hit') {
        return 'reachable';
    }

    if (shot.verdict === 'masked') {
        return 'masked';
    }

    if (shot.verdict === 'tooClose') {
        return 'close';
    }

    return 'out';
}

function reachGunSolved(gun, key) {
    if (!RANGE_RING_CACHE.has(key)) {
        return false;
    }

    if (!deadGroundArcs(gun.weapon)) {
        return true;
    }

    return DEAD_GROUND_CACHE.has(key);
}

function reachUnsolvedGun() {
    for (const gun of S.guns) {
        const key = rangeRingMemoKey(gun, S.map);

        if (!reachGunSolved(gun, key) && !REACH_UNAVAILABLE.has(key)) {
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

    terrainDeadGround(gun, mapId);

    if (reachGunSolved(gun, key)) {
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

    if (!deadGroundSettled()) {
        reachSolvePending = true;

        setTimeout(() => {
            reachSolvePending = false;

            reachScheduleSolve();
        }, DEAD_GROUND_SETTLE_MS);

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

        if (reachGunSolved(gun, key) || REACH_UNAVAILABLE.has(key)) {
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

function reachBadgeHead(item) {
    const info =
        item.querySelector('.saved-target-info');

    if (!info) {
        return null;
    }

    const name =
        info.querySelector('.saved-target-name');

    if (!name) {
        return null;
    }

    let head = name.parentElement;

    if (!head.classList.contains('saved-target-head')) {
        head = document.createElement('div');

        head.className = 'saved-target-head';

        info.insertBefore(head, name);
        head.appendChild(name);
    }

    return head;
}

function reachBadgeHost(item) {
    const head = reachBadgeHead(item);

    if (!head) {
        return null;
    }

    let host =
        head.parentElement.querySelector('.saved-target-reach');

    if (!host) {
        host = document.createElement('div');

        host.className = 'saved-target-reach';

        host.setAttribute('role', 'group');
        host.setAttribute('aria-label', tr('reachBadges'));
    }

    if (head.lastElementChild !== host) {
        head.appendChild(host);
    }

    return host;
}

function reachBadgeNode(host) {
    let badge = host.firstElementChild;

    if (!badge) {
        badge = document.createElement('span');

        badge.className = 'saved-target-reach-badge';

        badge.setAttribute('role', 'img');

        const glyph = document.createElement('span');

        glyph.className = 'reach-glyph';

        const count = document.createElement('span');

        count.className = 'reach-count';

        badge.append(glyph, count);

        host.appendChild(badge);
    }

    return badge;
}

function reachSummarise(guns, target) {
    let reachable = 0;
    let counted = 0;
    let pending = 0;

    const detail = [];

    guns.forEach(entry => {
        const state = reachClassify(entry, target);

        if (!state) {
            return;
        }

        if (state === 'pending') {
            pending += 1;
        } else if (state !== 'unknown') {
            counted += 1;

            if (state === 'reachable') {
                reachable += 1;
            }
        }

        detail.push(
            `${entry.gun.name} · ${tr(REACH_STATE_LABEL[state])}`
        );
    });

    if (!counted && !pending) {
        return null;
    }

    if (!counted) {
        return { state: 'pending', reachable: 0, total: pending, detail };
    }

    const total = counted + pending;

    const state =
        reachable === 0
            ? 'none'
            : reachable === total
                ? 'all'
                : 'some';

    return { state, reachable, total, detail };
}

function reachApplyBadge(badge, summary) {
    const className =
        'saved-target-reach-badge ' +
        REACH_SUMMARY_CLASS[summary.state];

    if (badge.className !== className) {
        badge.className = className;
    }

    if (badge.dataset.reach !== summary.state) {
        badge.dataset.reach = summary.state;
    }

    const label = [
        tr(REACH_SUMMARY_LABEL[summary.state])
            .replace('{reachable}', String(summary.reachable))
            .replace('{total}', String(summary.total)),
        ...summary.detail
    ].join('\n');

    if (badge.title !== label) {
        badge.title = label;

        badge.setAttribute('aria-label', label);
    }

    setText(
        badge.firstElementChild,
        REACH_SUMMARY_GLYPH[summary.state]
    );

    setText(
        badge.lastElementChild,
        summary.total > 1
            ? `${summary.reachable}/${summary.total}`
            : ''
    );
}

function reachSolvedGuns() {
    const mapId = S.map;

    if (!mapHasHeightfield(mapId)) {
        return [];
    }

    const entries = [];

    S.guns.forEach((gun, index) => {
        const key = rangeRingMemoKey(gun, mapId);

        if (REACH_UNAVAILABLE.has(key)) {
            return;
        }

        if (!reachGunSolved(gun, key)) {
            entries.push({ gun, index, ring: null, dead: null });

            return;
        }

        entries.push({
            gun,
            index,
            ring: terrainRangeRing(gun, mapId),
            dead: DEAD_GROUND_CACHE.get(key) || null
        });
    });

    return entries;
}

function renderSavedTargetItemReach(item, target, guns) {
    const host = reachBadgeHost(item);

    if (!host) {
        return;
    }

    const summary = reachSummarise(guns, target);

    while (host.children.length > 1) {
        host.lastElementChild.remove();
    }

    if (summary) {
        reachApplyBadge(reachBadgeNode(host), summary);
    }

    if (host.hidden !== !summary) {
        host.hidden = !summary;
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

    savedTargets.forEach(target => {
        const item = rows.get(String(target.id));

        if (item) {
            renderSavedTargetItemReach(item, target, guns);
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

if (typeof renderGuns === 'function') {
    const renderGunsBase = renderGuns;

    renderGuns = function (...args) {
        const result =
            renderGunsBase.apply(this, args);

        renderSavedTargetReachBadges(false);

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
