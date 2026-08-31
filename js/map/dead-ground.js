const DEAD_GROUND_CLEARANCE_METRES = 0;
const DEAD_GROUND_CACHE_LIMIT = 256;

const DEAD_GROUND_CACHE = new Map();

function deadGroundArcs(weaponId) {
    const arcs = PROJECTILE_MODEL?.weapons?.[weaponId];

    if (!arcs) {
        return null;
    }

    const usable = [];

    for (const arc of Object.values(arcs)) {
        const v = Number(arc?.muzzleVelocity);

        if (!Number.isFinite(v) || v <= 0 || arc.branch !== 'low') {
            continue;
        }

        usable.push({ muzzleVelocity: v });
    }

    return usable.length ? usable : null;
}

function deadGroundLaunchTan(muzzleVelocity, rangeMeters, deltaZMeters) {
    if (!(rangeMeters > 0)) {
        return null;
    }

    const vSquared = muzzleVelocity * muzzleVelocity;

    const discriminant =
        vSquared * vSquared -
        RANGE_RING_GRAVITY *
        (
            RANGE_RING_GRAVITY * rangeMeters * rangeMeters +
            2 * deltaZMeters * vSquared
        );

    if (discriminant < 0) {
        return null;
    }

    const root = Math.sqrt(discriminant);

    return (vSquared - root) / (RANGE_RING_GRAVITY * rangeMeters);
}

function deadGroundGrazingTan(muzzleVelocity, xMeters, zMeters) {
    return deadGroundLaunchTan(
        muzzleVelocity,
        xMeters,
        zMeters - DEAD_GROUND_CLEARANCE_METRES
    );
}

function deadGroundBearingIntervals(
    arcs,
    ranges,
    deltas,
    count,
    minRange
) {
    const intervals = [];

    if (count < 2) {
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

    const required = new Float64Array(arcs.length).fill(-Infinity);

    let runStart = -1;

    for (let i = 0; i < count; i += 1) {
        let dead = ranges[i] >= minRange;

        for (let a = 0; a < arcs.length; a += 1) {
            const arc = arcs[a];

            const tanTheta = deadGroundLaunchTan(
                arc.muzzleVelocity,
                ranges[i],
                deltas[i]
            );

            if (tanTheta !== null && tanTheta >= required[a]) {
                dead = false;
            }

            const graze = deadGroundGrazingTan(
                arc.muzzleVelocity,
                ranges[i],
                deltas[i]
            );

            if (graze !== null && graze > required[a]) {
                required[a] = graze;
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

    if (!field || !arcs) {
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

    for (let b = 0; b < bearings; b += 1) {
        const angle = b * 2 * Math.PI / bearings;

        const stepX =
            Math.cos(angle) / METRES_PER_GAME_UNIT_RING;

        const stepY =
            Math.sin(angle) / METRES_PER_GAME_UNIT_RING;

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
            arcs,
            ranges,
            deltas,
            count,
            ring.minRadii ? ring.minRadii[b] : ring.minRangeMeters ?? 0
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

    if (pattern && typeof DOMMatrix === 'function') {
        pattern.setTransform(new DOMMatrix([1 / d, 0, 0, 1 / d, 0, 0]));
    }

    DEAD_GROUND_HATCH = pattern;
    DEAD_GROUND_HATCH_SCALE = d;

    return pattern;
}

function traceDeadGroundWedge(at, scale, angle, half, startMetres, endMetres) {
    const inner = metersToWorldDistance(startMetres) * scale;
    const outer = metersToWorldDistance(endMetres) * scale;

    const a0 = angle - half;
    const a1 = angle + half;

    ctx.moveTo(
        at.x + Math.cos(a0) * inner,
        at.y - Math.sin(a0) * inner
    );

    ctx.lineTo(
        at.x + Math.cos(a0) * outer,
        at.y - Math.sin(a0) * outer
    );

    ctx.lineTo(
        at.x + Math.cos(a1) * outer,
        at.y - Math.sin(a1) * outer
    );

    ctx.lineTo(
        at.x + Math.cos(a1) * inner,
        at.y - Math.sin(a1) * inner
    );

    ctx.closePath();
}

function drawDeadGround(at, scale) {
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

    const bearings = solved.bearings.length;
    const half = Math.PI / bearings;

    ctx.beginPath();

    for (let b = 0; b < bearings; b += 1) {
        const intervals = solved.bearings[b];
        const angle = b * 2 * Math.PI / bearings;

        for (let i = 0; i < intervals.length; i += 2) {
            traceDeadGroundWedge(
                at,
                scale,
                angle,
                half,
                intervals[i],
                intervals[i + 1]
            );
        }
    }

    ctx.fillStyle = 'rgba(10,12,16,.5)';
    ctx.fill();

    ctx.fillStyle = deadGroundHatch();
    ctx.fill();
}
