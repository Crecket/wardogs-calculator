const BALLISTICS_GRAVITY = 9.81;

let PROJECTILE_MODEL = null;

function loadProjectileModel() {
    return fetch('data/ballistics/projectile-model.json')
        .then(response => response.ok ? response.json() : null)
        .then(model => {
            PROJECTILE_MODEL =
                model?.schema === 'wardogs-projectile-model-v1'
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

    return fit && Number.isFinite(Number(fit.muzzleVelocity))
        ? fit
        : null;
}

/*
 * solveTan's discriminant solved for R:
 * R = (v/g) * sqrt(v^2 - 2 g deltaZ). Mirrors maxRangeMeters in
 * scripts/lib/ballistics.mjs, which is where it is unit-tested.
 */
function modelMaxRange(muzzleVelocity, deltaZMeters) {
    const inner =
        muzzleVelocity * muzzleVelocity -
        2 * BALLISTICS_GRAVITY * deltaZMeters;

    if (inner <= 0) {
        return null;
    }

    return muzzleVelocity * Math.sqrt(inner) / BALLISTICS_GRAVITY;
}

function modelArcLaunchTan(fit, rangeMeters, deltaZMeters) {
    const muzzleVelocity = Number(fit?.muzzleVelocity);

    if (
        !Number.isFinite(muzzleVelocity) ||
        muzzleVelocity <= 0 ||
        !(rangeMeters > 0)
    ) {
        return null;
    }

    const vSquared = muzzleVelocity * muzzleVelocity;

    const discriminant =
        vSquared * vSquared -
        BALLISTICS_GRAVITY *
        (
            BALLISTICS_GRAVITY * rangeMeters * rangeMeters +
            2 * deltaZMeters * vSquared
        );

    if (discriminant < 0) {
        return null;
    }

    const root = Math.sqrt(discriminant);

    const tan =
        fit.branch === 'low'
            ? (vSquared - root) / (BALLISTICS_GRAVITY * rangeMeters)
            : (vSquared + root) / (BALLISTICS_GRAVITY * rangeMeters);

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

function modelRangeAtAngle(muzzleVelocity, theta, deltaZMeters) {
    const cos = Math.cos(theta);

    if (!(cos > 0)) {
        return null;
    }

    const tan = Math.tan(theta);

    const a =
        BALLISTICS_GRAVITY /
        (2 * muzzleVelocity * muzzleVelocity * cos * cos);

    const discriminant = tan * tan - 4 * a * deltaZMeters;

    if (discriminant < 0) {
        return null;
    }

    return (tan + Math.sqrt(discriminant)) / (2 * a);
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

function modelOptimalTan(muzzleVelocity, deltaZMeters) {
    const inner =
        muzzleVelocity * muzzleVelocity -
        2 * BALLISTICS_GRAVITY * deltaZMeters;

    return inner <= 0 ? null : muzzleVelocity / Math.sqrt(inner);
}

function modelShellHeight(tan, muzzleVelocity, xMeters) {
    return (
        xMeters * tan -
        BALLISTICS_GRAVITY *
        xMeters *
        xMeters *
        (1 + tan * tan) /
        (2 * muzzleVelocity * muzzleVelocity)
    );
}

function arcAngleStops(weapon, fit) {
    const offset = Number(fit?.angleOffsetDeg);
    const perMil = Number(fit?.anglePerMilDeg);
    const minMil = Number(weapon?.minElevationMil);
    const maxMil = Number(weapon?.maxElevationMil);

    if (
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
    const low = fit.branch === 'low';

    const from = Math.max(low ? shallow : Math.max(shallow, 45), 1e-6);
    const to = low ? Math.min(steep, 45) : Math.min(steep, 90 - 1e-6);

    if (!(from < to)) {
        return null;
    }

    return {
        minRadians: from * Math.PI / 180,
        maxRadians: to * Math.PI / 180
    };
}

function arcMaxRangeModel(weapon, fit, deltaZMeters) {
    const v = Number(fit?.muzzleVelocity);
    const stops = arcAngleStops(weapon, fit);

    if (!Number.isFinite(v) || v <= 0 || !stops) {
        return null;
    }

    const optimal = modelOptimalTan(v, deltaZMeters);

    if (optimal === null) {
        return null;
    }

    const theta = Math.min(
        stops.maxRadians,
        Math.max(stops.minRadians, Math.atan(optimal))
    );

    return modelRangeAtAngle(v, theta, deltaZMeters);
}

function arcMinRangeModel(weapon, fit, deltaZMeters) {
    const v = Number(fit?.muzzleVelocity);
    const stops = arcAngleStops(weapon, fit);

    if (!Number.isFinite(v) || v <= 0 || !stops) {
        return null;
    }

    const theta = fit.branch === 'low'
        ? stops.minRadians
        : stops.maxRadians;

    return modelRangeAtAngle(v, theta, deltaZMeters);
}
