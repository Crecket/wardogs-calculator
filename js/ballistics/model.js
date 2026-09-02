const BALLISTICS_GRAVITY = 9.81;

const PROJECTILE_MODEL_SCHEMA = 'wardogs-projectile-model-v2';

const TRAJECTORY_STEP_SECONDS = 0.1;
const TRAJECTORY_SUBSTEPS = 2;
const TRAJECTORY_FLOOR_METERS = -3000;
const TRAJECTORY_LIMIT_SECONDS = 300;

const FAMILY_MIN_DEGREES = 0.25;
const FAMILY_MAX_DEGREES = 89.75;
const FAMILY_STEP_DEGREES = 0.25;
const FAMILY_DELTA_Z_STEP_METERS = 1;
const FAMILY_OPTIMUM_SEARCH_NODES = 8;
const FAMILY_SOLVE_ITERATIONS = 40;

let PROJECTILE_MODEL = null;

function loadProjectileModel() {
    return fetchJSON('data/ballistics/projectile-model.json')
        .then(model => {
            PROJECTILE_MODEL =
                model?.schema === PROJECTILE_MODEL_SCHEMA
                    ? model
                    : null;

            if (
                PROJECTILE_MODEL &&
                Number.isFinite(Number(PROJECTILE_MODEL.gravity)) &&
                Number(PROJECTILE_MODEL.gravity) !== BALLISTICS_GRAVITY
            ) {
                console.warn(
                    '[ballistics] projectile-model.json gravity ' +
                    `${PROJECTILE_MODEL.gravity} differs from runtime ` +
                    `${BALLISTICS_GRAVITY}; the runtime constant is used.`
                );
            }
        })
        .catch(error => {
            console.warn(
                '[ballistics] No projectile model; ' +
                'every range, reach, and dead-ground verdict falls back to its declared table value.',
                error
            );

            PROJECTILE_MODEL = null;
        });
}

/*
 * The one copy of the fit. The flight-time readout reads the same arcs, and
 * fetching the file twice would be two copies free to disagree about which
 * load succeeded.
 */
function projectileModelArc(weaponId, arc) {
    const fit = PROJECTILE_MODEL?.weapons?.[weaponId]?.[arc];
    const muzzleVelocity = Number(fit?.muzzleVelocity);
    const drag = Number(fit?.dragPerMeter);

    return (
        fit &&
        Number.isFinite(muzzleVelocity) &&
        muzzleVelocity > 0 &&
        Number.isFinite(drag) &&
        drag >= 0
    )
        ? fit
        : null;
}

function integrateTrajectory(muzzleVelocity, drag, radians) {
    const dt = TRAJECTORY_STEP_SECONDS / TRAJECTORY_SUBSTEPS;
    const limit = Math.ceil(TRAJECTORY_LIMIT_SECONDS / TRAJECTORY_STEP_SECONDS);

    const xs = [0];
    const ys = [0];

    let x = 0;
    let y = 0;
    let vx = muzzleVelocity * Math.cos(radians);
    let vy = muzzleVelocity * Math.sin(radians);
    let apex = 0;

    for (let step = 1; step <= limit; step += 1) {
        for (let sub = 0; sub < TRAJECTORY_SUBSTEPS; sub += 1) {
            const s1 = Math.sqrt(vx * vx + vy * vy);
            const ax1 = -drag * s1 * vx;
            const ay1 = -BALLISTICS_GRAVITY - drag * s1 * vy;

            const vx2 = vx + ax1 * dt / 2;
            const vy2 = vy + ay1 * dt / 2;
            const s2 = Math.sqrt(vx2 * vx2 + vy2 * vy2);
            const ax2 = -drag * s2 * vx2;
            const ay2 = -BALLISTICS_GRAVITY - drag * s2 * vy2;

            const vx3 = vx + ax2 * dt / 2;
            const vy3 = vy + ay2 * dt / 2;
            const s3 = Math.sqrt(vx3 * vx3 + vy3 * vy3);
            const ax3 = -drag * s3 * vx3;
            const ay3 = -BALLISTICS_GRAVITY - drag * s3 * vy3;

            const vx4 = vx + ax3 * dt;
            const vy4 = vy + ay3 * dt;
            const s4 = Math.sqrt(vx4 * vx4 + vy4 * vy4);
            const ax4 = -drag * s4 * vx4;
            const ay4 = -BALLISTICS_GRAVITY - drag * s4 * vy4;

            x += dt * (vx + 2 * vx2 + 2 * vx3 + vx4) / 6;
            y += dt * (vy + 2 * vy2 + 2 * vy3 + vy4) / 6;
            vx += dt * (ax1 + 2 * ax2 + 2 * ax3 + ax4) / 6;
            vy += dt * (ay1 + 2 * ay2 + 2 * ay3 + ay4) / 6;
        }

        xs.push(x);
        ys.push(y);

        if (y > ys[apex]) {
            apex = step;
        }

        if (y < TRAJECTORY_FLOOR_METERS) {
            break;
        }
    }

    return {
        x: Float64Array.from(xs),
        y: Float64Array.from(ys),
        apex
    };
}

function trajectoryDescentIndex(path, deltaZMeters) {
    const y = path.y;
    const last = y.length - 1;

    if (!(y[path.apex] >= deltaZMeters) || y[last] > deltaZMeters) {
        return null;
    }

    let lo = path.apex;
    let hi = last;

    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;

        if (y[mid] > deltaZMeters) {
            lo = mid;
        } else {
            hi = mid;
        }
    }

    const span = y[lo] - y[hi];

    return span > 0 ? lo + (y[lo] - deltaZMeters) / span : hi;
}

function trajectoryRangeAt(path, deltaZMeters) {
    const index = trajectoryDescentIndex(path, deltaZMeters);

    if (index === null) {
        return null;
    }

    const lo = Math.floor(index);
    const hi = Math.min(lo + 1, path.x.length - 1);

    return path.x[lo] + (path.x[hi] - path.x[lo]) * (index - lo);
}

function trajectoryTimeAt(path, deltaZMeters) {
    const index = trajectoryDescentIndex(path, deltaZMeters);

    return index === null ? null : index * TRAJECTORY_STEP_SECONDS;
}

function trajectoryHeightAt(path, xMeters) {
    const x = path.x;
    const last = x.length - 1;

    if (!(xMeters >= 0) || xMeters > x[last]) {
        return null;
    }

    let lo = 0;
    let hi = last;

    while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;

        if (x[mid] <= xMeters) {
            lo = mid;
        } else {
            hi = mid;
        }
    }

    const span = x[hi] - x[lo];
    const t = span > 0 ? (xMeters - x[lo]) / span : 0;

    return path.y[lo] + (path.y[hi] - path.y[lo]) * t;
}

const TRAJECTORY_FAMILIES = new Map();
const TRAJECTORY_FAMILY_BY_FIT = new WeakMap();

function familyOptimumTable(paths) {
    let apexMax = -Infinity;

    for (const path of paths) {
        apexMax = Math.max(apexMax, path.y[path.apex]);
    }

    const count = Math.max(
        1,
        Math.floor((apexMax - TRAJECTORY_FLOOR_METERS) / FAMILY_DELTA_Z_STEP_METERS) + 1
    );

    const nodes = new Int32Array(count);
    const ranges = new Float64Array(count);

    let previous = -1;
    let filled = 0;

    for (let j = 0; j < count; j += 1) {
        const dz = TRAJECTORY_FLOOR_METERS + j * FAMILY_DELTA_Z_STEP_METERS;

        const from = previous < 0 ? 0 : Math.max(0, previous - FAMILY_OPTIMUM_SEARCH_NODES);
        const to = previous < 0 ? paths.length - 1 : Math.min(paths.length - 1, previous + FAMILY_OPTIMUM_SEARCH_NODES);

        let best = -1;
        let bestRange = -Infinity;

        for (let i = from; i <= to; i += 1) {
            const range = trajectoryRangeAt(paths[i], dz);

            if (range !== null && range > bestRange) {
                best = i;
                bestRange = range;
            }
        }

        if (best < 0 && previous >= 0) {
            for (let i = 0; i < paths.length; i += 1) {
                const range = trajectoryRangeAt(paths[i], dz);

                if (range !== null && range > bestRange) {
                    best = i;
                    bestRange = range;
                }
            }
        }

        if (best < 0) {
            break;
        }

        nodes[j] = best;
        ranges[j] = bestRange;
        previous = best;
        filled = j + 1;
    }

    return {
        nodes: nodes.subarray(0, filled),
        ranges: ranges.subarray(0, filled)
    };
}

function trajectoryFamily(fit) {
    const memo = fit === null || typeof fit !== 'object'
        ? undefined
        : TRAJECTORY_FAMILY_BY_FIT.get(fit);

    if (memo) {
        return memo;
    }

    const muzzleVelocity = Number(fit?.muzzleVelocity);
    const drag = Number(fit?.dragPerMeter);

    if (
        !Number.isFinite(muzzleVelocity) ||
        muzzleVelocity <= 0 ||
        !Number.isFinite(drag) ||
        drag < 0
    ) {
        return null;
    }

    const key = `${muzzleVelocity}|${drag}`;
    const cached = TRAJECTORY_FAMILIES.get(key);

    if (cached) {
        TRAJECTORY_FAMILY_BY_FIT.set(fit, cached);

        return cached;
    }

    const count = Math.round(
        (FAMILY_MAX_DEGREES - FAMILY_MIN_DEGREES) / FAMILY_STEP_DEGREES
    ) + 1;

    const radians = new Float64Array(count);
    const paths = new Array(count);

    for (let i = 0; i < count; i += 1) {
        radians[i] = (FAMILY_MIN_DEGREES + i * FAMILY_STEP_DEGREES) * Math.PI / 180;
        paths[i] = integrateTrajectory(muzzleVelocity, drag, radians[i]);
    }

    const optimum = familyOptimumTable(paths);
    const levelIndex = Math.round(-TRAJECTORY_FLOOR_METERS / FAMILY_DELTA_Z_STEP_METERS);

    const family = {
        radians,
        paths,
        optimum,
        minRadians: radians[0],
        maxRadians: radians[count - 1],
        levelOptimumRadians: radians[optimum.nodes[levelIndex]]
    };

    TRAJECTORY_FAMILIES.set(key, family);
    TRAJECTORY_FAMILY_BY_FIT.set(fit, family);

    return family;
}

function familyLocate(family, radians) {
    if (
        !Number.isFinite(radians) ||
        radians < family.minRadians - 1e-12 ||
        radians > family.maxRadians + 1e-12
    ) {
        return null;
    }

    const step = FAMILY_STEP_DEGREES * Math.PI / 180;
    const position = (radians - family.minRadians) / step;
    const last = family.paths.length - 1;
    const index = Math.min(last - 1, Math.max(0, Math.floor(position)));

    return {
        index,
        weight: Math.min(1, Math.max(0, position - index))
    };
}

function familyBlend(family, radians, sample, argument) {
    const at = familyLocate(family, radians);

    if (!at) {
        return null;
    }

    const a = sample(family.paths[at.index], argument);
    const b = sample(family.paths[at.index + 1], argument);

    if (a === null || b === null) {
        return null;
    }

    return a + (b - a) * at.weight;
}

function familyRange(family, radians, deltaZMeters) {
    return familyBlend(family, radians, trajectoryRangeAt, deltaZMeters);
}

function familyTime(family, radians, deltaZMeters) {
    return familyBlend(family, radians, trajectoryTimeAt, deltaZMeters);
}

function familyHeight(family, radians, xMeters) {
    return familyBlend(family, radians, trajectoryHeightAt, xMeters);
}

function familyOptimum(family, deltaZMeters) {
    const position = (deltaZMeters - TRAJECTORY_FLOOR_METERS) / FAMILY_DELTA_Z_STEP_METERS;
    const last = family.optimum.nodes.length - 1;

    if (!Number.isFinite(position) || position < 0 || position > last) {
        return null;
    }

    const lo = Math.min(last, Math.floor(position));
    const hi = Math.min(last, lo + 1);
    const t = position - lo;

    const nodeLo = family.optimum.nodes[lo];
    const nodeHi = family.optimum.nodes[hi];

    return {
        radians: family.radians[nodeLo] + (family.radians[nodeHi] - family.radians[nodeLo]) * t,
        range: family.optimum.ranges[lo] + (family.optimum.ranges[hi] - family.optimum.ranges[lo]) * t
    };
}

function familySolve(family, rangeMeters, deltaZMeters, branch) {
    const optimum = familyOptimum(family, deltaZMeters);

    if (!optimum || !(rangeMeters > 0) || rangeMeters > optimum.range) {
        return null;
    }

    const low = branch === 'low';

    let inside = optimum.radians;
    let outside = low ? family.minRadians : family.maxRadians;

    for (let i = 0; i < FAMILY_SOLVE_ITERATIONS; i += 1) {
        const middle = (inside + outside) / 2;
        const range = familyRange(family, middle, deltaZMeters);

        if (range !== null && range >= rangeMeters) {
            inside = middle;
        } else {
            outside = middle;
        }
    }

    return (inside + outside) / 2;
}

function modelArcLaunchTan(fit, rangeMeters, deltaZMeters) {
    const family = trajectoryFamily(fit);

    if (!family || !(rangeMeters > 0)) {
        return null;
    }

    const dz = Number.isFinite(deltaZMeters) ? deltaZMeters : 0;

    const radians = familySolve(
        family,
        rangeMeters,
        dz,
        fit.branch === 'low' ? 'low' : 'high'
    );

    if (radians === null) {
        return null;
    }

    const tan = Math.tan(radians);

    return Number.isFinite(tan) && tan > 0 ? tan : null;
}

function modelArcMil(fit, tan) {
    const offset = Number(fit?.angleOffsetDeg);
    const perMil = Number(fit?.anglePerMilDeg);

    if (
        !Number.isFinite(offset) ||
        !Number.isFinite(perMil) ||
        perMil === 0
    ) {
        return null;
    }

    const degrees = Math.atan(tan) * 180 / Math.PI;
    const mil = (degrees - offset) / perMil;

    return Number.isFinite(mil) ? mil : null;
}

function modelArcElevationFits(weapon, mil) {
    const minMil = Number(weapon?.minElevationMil);
    const maxMil = Number(weapon?.maxElevationMil);

    if (Number.isFinite(minMil) && mil < minMil) {
        return false;
    }

    return !(Number.isFinite(maxMil) && mil > maxMil);
}

function modelRangeAtAngle(fit, theta, deltaZMeters) {
    const family = trajectoryFamily(fit);

    if (!family) {
        return null;
    }

    const dz = Number.isFinite(deltaZMeters) ? deltaZMeters : 0;

    return familyRange(family, theta, dz);
}

function modelFlightTime(fit, tan, deltaZMeters) {
    const family = trajectoryFamily(fit);

    if (!family || !Number.isFinite(tan)) {
        return null;
    }

    const dz = Number.isFinite(deltaZMeters) ? deltaZMeters : 0;

    return familyTime(family, Math.atan(tan), dz);
}

function modelArcTanForMil(fit, mil) {
    const offset = Number(fit?.angleOffsetDeg);
    const perMil = Number(fit?.anglePerMilDeg);

    if (
        !Number.isFinite(offset) ||
        !Number.isFinite(perMil) ||
        !Number.isFinite(mil)
    ) {
        return null;
    }

    const degrees = offset + perMil * mil;

    return degrees > 0 && degrees < 90
        ? Math.tan(degrees * Math.PI / 180)
        : null;
}

function modelOptimalTan(fit, deltaZMeters) {
    const family = trajectoryFamily(fit);

    if (!family) {
        return null;
    }

    const dz = Number.isFinite(deltaZMeters) ? deltaZMeters : 0;
    const optimum = familyOptimum(family, dz);

    return optimum ? Math.tan(optimum.radians) : null;
}

function modelShellHeight(fit, tan, xMeters) {
    const family = trajectoryFamily(fit);

    if (!family || !Number.isFinite(tan)) {
        return TRAJECTORY_FLOOR_METERS;
    }

    const height = familyHeight(family, Math.atan(tan), xMeters);

    return height === null ? TRAJECTORY_FLOOR_METERS : height;
}

const ARC_ANGLE_STOPS_BY_FIT = new WeakMap();

function arcAngleStops(weapon, fit) {
    const memo = fit === null || typeof fit !== 'object'
        ? undefined
        : ARC_ANGLE_STOPS_BY_FIT.get(fit);

    if (
        memo &&
        memo.weapon === weapon &&
        memo.minElevationMil === weapon?.minElevationMil &&
        memo.maxElevationMil === weapon?.maxElevationMil
    ) {
        return memo.stops;
    }

    const stops = arcAngleStopsUncached(weapon, fit);

    if (fit !== null && typeof fit === 'object') {
        ARC_ANGLE_STOPS_BY_FIT.set(
            fit,
            {
                weapon,
                minElevationMil: weapon?.minElevationMil,
                maxElevationMil: weapon?.maxElevationMil,
                stops
            }
        );
    }

    return stops;
}

function arcAngleStopsUncached(weapon, fit) {
    const offset = Number(fit?.angleOffsetDeg);
    const perMil = Number(fit?.anglePerMilDeg);
    const minMil = Number(weapon?.minElevationMil);
    const maxMil = Number(weapon?.maxElevationMil);
    const family = trajectoryFamily(fit);

    if (
        !family ||
        !Number.isFinite(offset) ||
        !Number.isFinite(perMil) ||
        !Number.isFinite(minMil) ||
        !Number.isFinite(maxMil) ||
        perMil <= 0
    ) {
        return null;
    }

    const shallow = offset + perMil * minMil;
    const steep = offset + perMil * maxMil;
    const split = family.levelOptimumRadians * 180 / Math.PI;
    const low = fit.branch === 'low';

    const from = Math.max(low ? shallow : Math.max(shallow, split), FAMILY_MIN_DEGREES);
    const to = low ? Math.min(steep, split) : Math.min(steep, FAMILY_MAX_DEGREES);

    if (!(from < to)) {
        return null;
    }

    return {
        minRadians: from * Math.PI / 180,
        maxRadians: to * Math.PI / 180
    };
}

function arcMaxRangeModel(weapon, fit, deltaZMeters) {
    const stops = arcAngleStops(weapon, fit);

    if (!stops) {
        return null;
    }

    const optimal = modelOptimalTan(fit, deltaZMeters);

    if (optimal === null) {
        return null;
    }

    const theta = Math.min(
        stops.maxRadians,
        Math.max(stops.minRadians, Math.atan(optimal))
    );

    return modelRangeAtAngle(fit, theta, deltaZMeters);
}

function arcMinRangeModel(weapon, fit, deltaZMeters) {
    const stops = arcAngleStops(weapon, fit);

    if (!stops) {
        return null;
    }

    const theta = fit.branch === 'low'
        ? stops.minRadians
        : stops.maxRadians;

    return modelRangeAtAngle(fit, theta, deltaZMeters);
}
