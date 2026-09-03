const DEAD_GROUND_CACHE_LIMIT = 256;

const DEAD_GROUND_CACHE = new Map();

function deadGroundArcs(weaponId) {
    const name = lowArcName(weaponId);
    const fit = projectileModelArc(weaponId, name);

    if (!fit) {
        return null;
    }

    return [{ name, fit }];
}

function deadGroundShellHeight(family, node, weight, xMeters) {
    const a = trajectoryHeightAt(family.paths[node], xMeters);
    const b = trajectoryHeightAt(family.paths[node + 1], xMeters);

    if (a === null || b === null) {
        return TRAJECTORY_FLOOR_METERS;
    }

    return a + (b - a) * weight;
}

function deadGroundTrajectoryClears(fit, tan, ranges, deltas, index) {
    const family = trajectoryFamily(fit);
    const position = family ? familyLocate(family, Math.atan(tan)) : NaN;

    if (Number.isNaN(position)) {
        const chord = TRAJECTORY_FLOOR_METERS / ranges[index];

        for (let j = 0; j < index; j += 1) {
            if (
                deltas[j] > chord * ranges[j] &&
                TRAJECTORY_FLOOR_METERS < deltas[j]
            ) {
                return false;
            }
        }

        return true;
    }

    const node = familyIndex(position);
    const weight = familyWeight(position);

    const chord =
        deadGroundShellHeight(family, node, weight, ranges[index]) / ranges[index];

    for (let j = 0; j < index; j += 1) {
        if (
            deltas[j] > chord * ranges[j] &&
            deadGroundShellHeight(family, node, weight, ranges[j]) < deltas[j]
        ) {
            return false;
        }
    }

    return true;
}

function deadGroundBearingIntervals(
    weapon,
    arcs,
    ranges,
    deltas,
    count,
    minRange
) {
    const intervals = [];

    if (count < 2 || !arcs?.length) {
        return intervals;
    }

    const edgeBefore = index =>
        Math.max(
            minRange,
            index === 0
                ? ranges[0]
                : (ranges[index - 1] + ranges[index]) / 2
        );

    const edgeAfter = index =>
        index === count - 1
            ? ranges[index]
            : (ranges[index] + ranges[index + 1]) / 2;

    let runStart = -1;

    for (let i = 0; i < count; i += 1) {
        let dead = ranges[i] >= minRange;

        for (let a = 0; dead && a < arcs.length; a += 1) {
            const assessed = assessArc(weapon, arcs[a].name, ranges[i], deltas[i]);

            if (assessed.status !== 'hit' || assessed.tan === null || assessed.ceilingCapped) {
                continue;
            }

            if (deadGroundTrajectoryClears(arcs[a].fit, assessed.tan, ranges, deltas, i)) {
                dead = false;
            }
        }

        if (dead && runStart < 0) {
            runStart = i;
        }

        if (!dead && runStart >= 0) {
            intervals.push(edgeBefore(runStart), edgeAfter(i - 1));
            runStart = -1;
        }
    }

    if (runStart >= 0) {
        intervals.push(edgeBefore(runStart), edgeAfter(count - 1));
    }

    return intervals;
}

function rememberDeadGround(key, solved) {
    if (DEAD_GROUND_CACHE.size >= DEAD_GROUND_CACHE_LIMIT) {
        DEAD_GROUND_CACHE.delete(
            DEAD_GROUND_CACHE.keys().next().value
        );
    }

    DEAD_GROUND_CACHE.set(key, solved);
}

function terrainDeadGround(gun, mapId) {
    const ring = terrainRangeRing(gun, mapId);

    if (!ring) {
        return null;
    }

    const field = cachedHeightfield(mapId);
    const arcs = deadGroundArcs(gun.weapon);
    const weapon = WEAPONS[gun.weapon];

    if (!field || !arcs || !weapon) {
        return null;
    }

    const key = rangeRingMemoKey(gun, mapId);
    const memo = DEAD_GROUND_CACHE.get(key);

    if (memo) {
        return memo;
    }

    const zGun = heightfieldSample(
        field,
        gun.position.x,
        gun.position.y
    );

    if (zGun === null) {
        return null;
    }

    const bearings = ring.radii.length;
    const wedges = new Array(bearings);

    const capacity = Math.max(
        2,
        Math.ceil(
            Math.max(...ring.radii) / RANGE_RING_MARCH_METRES
        ) + 1
    );

    const ranges = new Float64Array(capacity);
    const deltas = new Float64Array(capacity);

    let any = false;

    const metresPerUnit = getCoordinateMetersPerUnit();

    for (let b = 0; b < bearings; b += 1) {
        const angle = b * 2 * Math.PI / bearings;

        const stepX =
            Math.cos(angle) / metresPerUnit;

        const stepY =
            Math.sin(angle) / metresPerUnit;

        const limit = ring.radii[b];

        let count = 0;

        for (
            let r = RANGE_RING_MARCH_METRES;
            r <= limit && count < capacity;
            r += RANGE_RING_MARCH_METRES
        ) {
            const z = rangeRingSample(
                field,
                gun.position.x + stepX * r,
                gun.position.y + stepY * r
            );

            if (z === null) {
                break;
            }

            ranges[count] = r;
            deltas[count] = z - zGun;
            count += 1;
        }

        const intervals = deadGroundBearingIntervals(
            weapon,
            arcs,
            ranges,
            deltas,
            count,
            ring.minRangeMeters ?? 0
        );

        if (intervals.length) {
            any = true;
        }

        wedges[b] = intervals;
    }

    const solved = {
        bearings: wedges,
        any
    };

    rememberDeadGround(key, solved);

    return solved;
}

const DEAD_GROUND_SETTLE_MS = 250;

const DEAD_GROUND_FADE_MS = 220;

const DEAD_GROUND_REVEAL = {
    signature: null,
    timer: 0,
    settled: false,
    fadeStart: 0
};

function deadGroundSignature() {
    const guns = Array.isArray(S.guns) && S.guns.length
        ? S.guns
        : [{ weapon: S.weapon, position: S.origin }];

    let signature = S.map;

    for (const gun of guns) {
        signature += '/' + rangeRingMemoKey(gun, S.map);
    }

    return signature;
}

function deadGroundSettled() {
    const signature = deadGroundSignature();

    if (signature !== DEAD_GROUND_REVEAL.signature) {
        DEAD_GROUND_REVEAL.signature = signature;
        DEAD_GROUND_REVEAL.settled = false;
        DEAD_GROUND_REVEAL.fadeStart = 0;

        if (DEAD_GROUND_REVEAL.timer) {
            clearTimeout(DEAD_GROUND_REVEAL.timer);
        }

        DEAD_GROUND_REVEAL.timer = setTimeout(
            () => {
                DEAD_GROUND_REVEAL.timer = 0;
                DEAD_GROUND_REVEAL.settled = true;

                draw();
            },
            DEAD_GROUND_SETTLE_MS
        );
    }

    return DEAD_GROUND_REVEAL.settled;
}

function deadGroundRevealAlpha() {
    if (!DEAD_GROUND_REVEAL.fadeStart) {
        DEAD_GROUND_REVEAL.fadeStart = performance.now();

        return 0;
    }

    const t = Math.min(
        1,
        (performance.now() - DEAD_GROUND_REVEAL.fadeStart) / DEAD_GROUND_FADE_MS
    );

    return 1 - (1 - t) * (1 - t);
}

const DEAD_GROUND_HATCH_STEP = 7;

let DEAD_GROUND_HATCH = null;
let DEAD_GROUND_HATCH_SCALE = 0;

function deadGroundHatch() {
    const d = renderScale();

    if (DEAD_GROUND_HATCH && DEAD_GROUND_HATCH_SCALE === d) {
        return DEAD_GROUND_HATCH;
    }

    const size = DEAD_GROUND_HATCH_STEP * d;

    const tile = document.createElement('canvas');

    tile.width = size;
    tile.height = size;

    const g = tile.getContext('2d');

    g.strokeStyle = 'rgba(240,116,116,.55)';
    g.lineWidth = 1.25 * d;
    g.lineCap = 'square';

    for (const offset of [-size, 0, size]) {
        g.beginPath();
        g.moveTo(offset, size);
        g.lineTo(offset + size, 0);
        g.stroke();
    }

    const pattern = ctx.createPattern(tile, 'repeat');

    DEAD_GROUND_HATCH = pattern;
    DEAD_GROUND_HATCH_SCALE = d;

    return pattern;
}

function traceDeadGroundWedge(path, angle, half, startMetres, endMetres) {
    const inner = metersToWorldDistance(startMetres);
    const outer = metersToWorldDistance(endMetres);

    const a0 = angle - half;
    const a1 = angle + half;

    path.moveTo(
        Math.cos(a0) * inner,
        -Math.sin(a0) * inner
    );

    path.lineTo(
        Math.cos(a0) * outer,
        -Math.sin(a0) * outer
    );

    path.lineTo(
        Math.cos(a1) * outer,
        -Math.sin(a1) * outer
    );

    path.lineTo(
        Math.cos(a1) * inner,
        -Math.sin(a1) * inner
    );

    path.closePath();
}

let DEAD_GROUND_PATH = null;
let DEAD_GROUND_PATH_SOLVED = null;

function deadGroundPath(solved) {
    if (DEAD_GROUND_PATH && DEAD_GROUND_PATH_SOLVED === solved) {
        return DEAD_GROUND_PATH;
    }

    const bearings = solved.bearings.length;
    const half = Math.PI / bearings;
    const path = new Path2D();

    for (let b = 0; b < bearings; b += 1) {
        const intervals = solved.bearings[b];
        const angle = b * 2 * Math.PI / bearings;

        for (let i = 0; i < intervals.length; i += 2) {
            traceDeadGroundWedge(
                path,
                angle,
                half,
                intervals[i],
                intervals[i + 1]
            );
        }
    }

    DEAD_GROUND_PATH = path;
    DEAD_GROUND_PATH_SOLVED = solved;

    return path;
}

function drawDeadGround(at, scale) {
    if (!deadGroundSettled()) {
        return;
    }

    const solved = terrainDeadGround(
        {
            weapon: S.weapon,
            position: S.origin
        },
        S.map
    );

    if (!solved || !solved.any) {
        return;
    }

    const alpha = deadGroundRevealAlpha();

    if (alpha < 1) {
        draw();
    }

    if (alpha <= 0) {
        return;
    }

    const path = deadGroundPath(solved);
    const hatch = deadGroundHatch();

    if (hatch && typeof DOMMatrix === 'function') {
        const inverse = 1 / (renderScale() * scale);

        hatch.setTransform(new DOMMatrix([inverse, 0, 0, inverse, 0, 0]));
    }

    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.translate(at.x, at.y);
    ctx.scale(scale, scale);

    ctx.fillStyle = 'rgba(10,12,16,.5)';
    ctx.fill(path);

    ctx.fillStyle = hatch;
    ctx.fill(path);

    ctx.restore();
}
