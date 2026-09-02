/*
 * Node-side access to the runtime projectile model.
 *
 * The trajectory integrator lives in js/ballistics/model.js so that every
 * surface in the app reads one implementation; this module loads that file
 * into a VM context and re-exports the pieces the build scripts and tests
 * need, rather than keeping a second copy of the physics here.
 *
 * Nothing here is used to produce a MIL directly. Callers take the
 * DIFFERENCE between two points on the same model curve, so most of the
 * model's absolute error cancels and flat ground is corrected by exactly zero.
 *
 * fitArc is the one thing that is not a runtime re-export: a least-squares
 * vacuum fit used only for arcs whose source is "vacuum-fit".
 */

import { loadRuntime, callRuntime } from './runtime-globals.mjs';

const runtime = loadRuntime(['js/ballistics/model.js']);

const fromRuntime = name => callRuntime(runtime, name);

export const GRAVITY = fromRuntime('BALLISTICS_GRAVITY');
export const MODEL_SCHEMA = fromRuntime('PROJECTILE_MODEL_SCHEMA');

const modelArcLaunchTan = fromRuntime('modelArcLaunchTan');
const modelArcMil = fromRuntime('modelArcMil');
const modelArcTanForMil = fromRuntime('modelArcTanForMil');
const modelRangeAtAngle = fromRuntime('modelRangeAtAngle');
const modelOptimalTan = fromRuntime('modelOptimalTan');
const modelFlightTime = fromRuntime('modelFlightTime');

const DEG = 180 / Math.PI;

export function launchTan(arcModel, rangeMeters, deltaZMeters) {
    return modelArcLaunchTan(arcModel, rangeMeters, deltaZMeters);
}

export function rangeAtMil(arcModel, mil, deltaZMeters = 0) {
    const tan = modelArcTanForMil(arcModel, mil);

    return tan === null
        ? null
        : modelRangeAtAngle(arcModel, Math.atan(tan), deltaZMeters);
}

export function flightTimeAtMil(arcModel, mil, deltaZMeters = 0) {
    const tan = modelArcTanForMil(arcModel, mil);

    return tan === null
        ? null
        : modelFlightTime(arcModel, tan, deltaZMeters);
}

export function maxRangeMeters(arcModel, deltaZMeters) {
    if (!Number.isFinite(deltaZMeters)) {
        return null;
    }

    const optimal = modelOptimalTan(arcModel, deltaZMeters);

    return optimal === null
        ? null
        : modelRangeAtAngle(arcModel, Math.atan(optimal), deltaZMeters);
}

export function milFromTan(arcModel, tanTheta) {
    return modelArcMil(arcModel, tanTheta);
}

/*
 * Mil to ADD to the flat-table value. Zero on flat ground by construction.
 */
export function milCorrection(arcModel, rangeMeters, deltaZMeters) {
    const aimed = launchTan(arcModel, rangeMeters, deltaZMeters);
    const flat = launchTan(arcModel, rangeMeters, 0);

    if (aimed === null || flat === null) {
        return null;
    }

    return milFromTan(arcModel, aimed) - milFromTan(arcModel, flat);
}

/*
 * How far short (positive) or long (negative) the UNCORRECTED shot lands:
 * where the flat-aimed trajectory descends through altitude deltaZMeters.
 * This is what the suppression threshold gates on, because metres of miss
 * is the quantity a player can act on and mil-per-metre is not.
 */
export function missMeters(arcModel, rangeMeters, deltaZMeters) {
    const flat = launchTan(arcModel, rangeMeters, 0);

    if (flat === null) {
        return null;
    }

    const landing = modelRangeAtAngle(arcModel, Math.atan(flat), deltaZMeters);

    return landing === null ? null : rangeMeters - landing;
}

export function rangeForTan(muzzleVelocity, tanTheta) {
    const sin2Theta = 2 * tanTheta / (1 + tanTheta * tanTheta);

    return muzzleVelocity * muzzleVelocity * sin2Theta / GRAVITY;
}

/*
 * Least squares over the affine mil mapping, in vacuum. The two angle
 * parameters are searched on a grid; muzzle velocity is solved in closed
 * form for each candidate, because for fixed angles R = (v^2/g) sin(2 theta)
 * is linear in v^2/g and the optimum is a ratio of sums.
 */
const ANGLE_OFFSET_MIN_DEG = -90;
const ANGLE_OFFSET_MAX_DEG = 90;
const ANGLE_OFFSET_STEP_DEG = 0.25;
const ANGLE_PER_MIL_MIN_DEG = 0.0005;
const ANGLE_PER_MIL_MAX_DEG = 0.2;
const ANGLE_PER_MIL_STEP_DEG = 0.0005;

export function fitArc(rows, branch) {
    const samples = rows
        .map(([distance, mil]) => [Number(distance), Number(mil)])
        .filter(pair => pair.every(Number.isFinite));

    if (samples.length < 3) {
        throw new Error('fitArc needs at least three table rows');
    }

    let best = null;

    for (
        let offset = ANGLE_OFFSET_MIN_DEG;
        offset <= ANGLE_OFFSET_MAX_DEG;
        offset += ANGLE_OFFSET_STEP_DEG
    ) {
        for (
            let perMil = ANGLE_PER_MIL_MIN_DEG;
            perMil <= ANGLE_PER_MIL_MAX_DEG;
            perMil += ANGLE_PER_MIL_STEP_DEG
        ) {
            let numerator = 0;
            let denominator = 0;
            let usable = true;

            for (const [distance, mil] of samples) {
                const theta = (offset + perMil * mil) / DEG;
                const sin2Theta = Math.sin(2 * theta);

                if (sin2Theta <= 1e-6) {
                    usable = false;
                    break;
                }

                numerator += distance * sin2Theta;
                denominator += sin2Theta * sin2Theta;
            }

            if (!usable || denominator <= 0) {
                continue;
            }

            /* k = v^2 / g */
            const k = numerator / denominator;

            let squared = 0;

            for (const [distance, mil] of samples) {
                const theta = (offset + perMil * mil) / DEG;
                const predicted = k * Math.sin(2 * theta);

                squared += (distance - predicted) ** 2;
            }

            const rms = Math.sqrt(squared / samples.length);

            if (!best || rms < best.rmsMeters) {
                best = {
                    branch,
                    muzzleVelocity: Math.sqrt(k * GRAVITY),
                    dragPerMeter: 0,
                    angleOffsetDeg: offset,
                    anglePerMilDeg: perMil,
                    rmsMeters: rms
                };
            }
        }
    }

    if (!best) {
        throw new Error('fitArc found no usable parameters');
    }

    return best;
}
