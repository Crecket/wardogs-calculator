const REACH_ARCS = ['single', 'low', 'high'];

/*
 * Dead ground answers a narrower question than the reach verdict
 * does: not "can this gun hit that ground at all", but "can it hit it
 * on the flat arc" — the shot a crew reaches for when time to target
 * matters. The map layer is named "Dead ground (low arc)" and this is
 * what makes that true. The rings stay whole-weapon.
 *
 * Branch, not elevation fraction, decides: a fit is the low arc when
 * it solves the shallow root, which arcAngleStops caps at the model's
 * own maximum-range angle. Weapons whose every arc is a high-branch fit
 * (the mortar) have no low arc and so cast no dead ground.
 */
function lowArcName(weaponId) {
    for (const arc of REACH_ARCS) {
        if (projectileModelArc(weaponId, arc)?.branch === 'low') {
            return arc;
        }
    }

    return null;
}

function arcDeclaredRange(weapon, arc) {
    const weaponMin = (weapon?.minRange ?? 0) * 1000;
    const weaponMax = (weapon?.maxRange ?? weapon?.range ?? 0) * 1000;

    if (!(weaponMax > 0)) {
        return null;
    }

    const rows = weapon?.ballistics?.[arc];

    if (!Array.isArray(rows) || !rows.length) {
        return { minMeters: weaponMin, maxMeters: weaponMax };
    }

    let first = Infinity;
    let last = -Infinity;

    for (const row of rows) {
        const d = Number(row?.[0]);

        if (Number.isFinite(d)) {
            first = Math.min(first, d);
            last = Math.max(last, d);
        }
    }

    if (!Number.isFinite(first) || !(last > 0)) {
        return { minMeters: weaponMin, maxMeters: weaponMax };
    }

    return {
        minMeters: Math.max(weaponMin, first),
        maxMeters: Math.min(weaponMax, last)
    };
}

function assessArc(weapon, arc, distanceMeters, deltaZMeters) {
    const fit = projectileModelArc(weapon?.id, arc);

    if (!fit) {
        return { status: 'noModel', mil: null, tan: null, tableRow: false };
    }

    const declared = arcDeclaredRange(weapon, arc);
    const dz = Number.isFinite(deltaZMeters) ? deltaZMeters : 0;

    const rows = weapon?.ballistics?.[arc];

    const tableRow = Boolean(
        declared &&
        Array.isArray(rows) &&
        rows.length &&
        distanceMeters + 1e-6 >= declared.minMeters &&
        distanceMeters <= declared.maxMeters + 1e-6
    );

    if (declared) {
        const levelMax = arcMaxRangeModel(weapon, fit, 0);
        const shiftedMax = arcMaxRangeModel(weapon, fit, dz);

        if (levelMax !== null && shiftedMax === null) {
            return { status: 'tooFar', mil: null, tan: null, tableRow };
        }

        const anchoredMax = levelMax !== null && shiftedMax !== null
            ? declared.maxMeters + (shiftedMax - levelMax)
            : declared.maxMeters;

        if (distanceMeters > anchoredMax + 1e-6) {
            return { status: 'tooFar', mil: null, tan: null, tableRow };
        }

        const levelMin = arcMinRangeModel(weapon, fit, 0);
        const shiftedMin = arcMinRangeModel(weapon, fit, dz);

        const anchoredMin = levelMin !== null && shiftedMin !== null
            ? declared.minMeters + (shiftedMin - levelMin)
            : declared.minMeters;

        if (distanceMeters + 1e-6 < anchoredMin) {
            return { status: 'tooClose', mil: null, tan: null, tableRow };
        }
    }

    const tan = modelArcLaunchTan(fit, distanceMeters, dz);

    if (tan === null) {
        if (tableRow) {
            const stops = arcAngleStops(weapon, fit);

            const capped = stops === null
                ? null
                : Math.tan(
                    fit.branch === 'low'
                        ? stops.maxRadians
                        : stops.minRadians
                );

            return {
                status: 'hit',
                mil: null,
                tan: capped,
                tableRow,
                ceilingCapped: true
            };
        }

        return { status: 'tooFar', mil: null, tan: null, tableRow };
    }

    const mil = modelArcMil(fit, tan);

    if (!tableRow) {
        if (mil !== null && !modelArcElevationFits(weapon, mil)) {
            const minMil = Number(weapon?.minElevationMil);

            return {
                status: Number.isFinite(minMil) && mil < minMil
                    ? 'belowMinElevation'
                    : 'aboveMaxElevation',
                mil,
                tan,
                tableRow
            };
        }

        const stops = arcAngleStops(weapon, fit);

        if (stops) {
            const radians = Math.atan(tan);

            if (radians < stops.minRadians - 1e-9) {
                return { status: 'belowMinElevation', mil, tan, tableRow };
            }

            if (radians > stops.maxRadians + 1e-9) {
                return { status: 'aboveMaxElevation', mil, tan, tableRow };
            }
        }
    }

    return { status: 'hit', mil, tan, tableRow };
}

const REACH_PROFILE_STEP_METRES = 25;

const REACH_VERDICT_PRIORITY = ['hit', 'masked', 'tooClose', 'tooFar', 'unreachable'];

function reachabilityProfile(field, origin, target, distanceMeters) {
    const samples = Math.max(
        2,
        Math.min(256, Math.ceil(distanceMeters / REACH_PROFILE_STEP_METRES) + 1)
    );

    const ground = new Float64Array(samples);

    for (let i = 0; i < samples; i += 1) {
        const t = i / (samples - 1);

        const z = rangeRingSample(
            field,
            origin.x + (target.x - origin.x) * t,
            origin.y + (target.y - origin.y) * t
        );

        if (z === null) {
            return null;
        }

        ground[i] = z;
    }

    return { ground, stepMeters: distanceMeters / (samples - 1) };
}

function trajectoryClearsProfile(fit, tan, profile) {
    const ground = profile.ground;
    const last = ground.length - 1;
    const zGun = ground[0];

    const firstIndex = Math.min(
        last,
        Math.max(1, Math.ceil(REACH_PROFILE_STEP_METRES / profile.stepMeters))
    );

    for (let i = firstIndex; i < last; i += 1) {
        if (zGun + modelShellHeight(fit, tan, i * profile.stepMeters) < ground[i]) {
            return false;
        }
    }

    return true;
}

function reachabilityVerdict(arcs) {
    let best = null;
    let bestRank = Infinity;

    for (const arc of REACH_ARCS) {
        const assessed = arcs[arc];

        if (!assessed || assessed.status === 'noModel') {
            continue;
        }

        let label;

        if (assessed.status === 'hit') {
            label = assessed.masked ? 'masked' : 'hit';
        } else if (assessed.status === 'tooClose' || assessed.status === 'tooFar') {
            label = assessed.status;
        } else {
            label = 'unreachable';
        }

        const rank = REACH_VERDICT_PRIORITY.indexOf(label);

        if (rank < bestRank) {
            bestRank = rank;
            best = label;
        }
    }

    return best;
}

const ASSESS_SHOT_MEMO_LIMIT = 50000;

const ASSESS_SHOT_MEMO = new WeakMap();

function assessShotMemoFor(field) {
    let memo = ASSESS_SHOT_MEMO.get(field);

    if (!memo) {
        memo = new Map();
        ASSESS_SHOT_MEMO.set(field, memo);
    }

    return memo;
}

function assessShotMemoKey(mapId, weaponId, origin, target) {
    return `${mapId}|${weaponId}|${origin.x},${origin.y}|${target.x},${target.y}`;
}

function assessShot(weapon, origin, target, mapId) {
    const result = {
        state: 'nodata',
        distanceMeters: null,
        deltaZ: null,
        arcs: { single: null, low: null, high: null },
        verdict: null
    };

    if (
        !weapon ||
        !origin ||
        !target ||
        !Number.isFinite(Number(origin.x)) ||
        !Number.isFinite(Number(origin.y)) ||
        !Number.isFinite(Number(target.x)) ||
        !Number.isFinite(Number(target.y))
    ) {
        return result;
    }

    result.distanceMeters =
        Math.hypot(target.x - origin.x, target.y - origin.y) *
        getCoordinateMetersPerUnit();

    if (typeof mapHasHeightfield !== 'function' || !mapHasHeightfield(mapId)) {
        return result;
    }

    ensureHeightfieldLoaded(mapId);

    const field = cachedHeightfield(mapId);

    if (!field) {
        result.state = 'pending';
        return result;
    }

    const memo = assessShotMemoFor(field);
    const memoKey = assessShotMemoKey(mapId, weapon.id, origin, target);
    const memoised = memo.get(memoKey);

    if (memoised) {
        return memoised;
    }

    const zGun = heightfieldSample(field, origin.x, origin.y);
    const zTarget = heightfieldSample(field, target.x, target.y);

    if (zGun === null || zTarget === null) {
        result.state = 'offmap';
        return result;
    }

    result.state = 'ready';
    result.deltaZ = zTarget - zGun;

    let profile;

    for (const arc of REACH_ARCS) {
        const assessed = assessArc(weapon, arc, result.distanceMeters, result.deltaZ);

        assessed.masked = false;

        if (assessed.status === 'hit' && assessed.tan !== null && !assessed.ceilingCapped) {
            if (profile === undefined) {
                profile = reachabilityProfile(field, origin, target, result.distanceMeters);
            }

            if (profile) {
                assessed.masked = !trajectoryClearsProfile(
                    projectileModelArc(weapon.id, arc),
                    assessed.tan,
                    profile
                );
            }
        }

        result.arcs[arc] = assessed;
    }

    result.verdict = reachabilityVerdict(result.arcs);

    if (PROJECTILE_MODEL) {
        if (memo.size >= ASSESS_SHOT_MEMO_LIMIT) {
            memo.delete(memo.keys().next().value);
        }

        memo.set(memoKey, result);
    }

    return result;
}
