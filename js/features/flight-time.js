/* =========================
   TIME OF FLIGHT
   ========================= */

/*
 * How long the shell is in the air, per arc.
 *
 * The SPH-2's seconds come from the drag model in
 * data/ballistics/projectile-model.json: the MIL on screen gives the launch
 * angle, theta = angleOffsetDeg + anglePerMilDeg * mil, and the integrated
 * trajectory gives the time at which it descends through the target's
 * height, dz being target minus gun as in the terrain correction.
 *
 * The mortar's seconds come from a least-squares quadratic through the
 * timings measured at the firing range on 2026-09-02 (measuredFlightTimes
 * in the same file). The timings are good to about ±0.4 s and their
 * dial-to-dial slope alternates well outside that, so a curve smooth and
 * monotone across the dial describes the weapon better than joining the
 * five points; it sits within 0.39 s of every one of them,
 * because no physical model fits that weapon and its range table needs
 * none — see docs/firing-range-measurements.md. Those measurements were
 * taken without a known height difference, so dz does not move them.
 *
 * The angle comes from the MIL actually on screen rather than from the
 * distance, so the printed time always belongs to the number above it —
 * including when the terrain correction has moved that number.
 *
 * Everything is printed with a ≈: the SPH-2 model reproduces its three
 * timed shots within 0.35 s, and the mortar timings are good to ±0.4 s.
 */

/*
 * A distance that lands on a table row carrying several mils has no single
 * angle, so the band's midpoint stands in for it. The spread is a few mils
 * and the answer is printed to the second with a ≈ in front of it.
 */
function flightTimeMil(solution) {
    if (!solution) {
        return null;
    }

    const mil = Number(solution.mil);

    if (Number.isFinite(mil)) {
        return mil;
    }

    const min = Number(solution.minMil);
    const max = Number(solution.maxMil);

    return Number.isFinite(min) && Number.isFinite(max)
        ? (min + max) / 2
        : null;
}

const FLIGHT_TIME_CURVES = new WeakMap();

function flightTimeCurve(fit) {
    if (FLIGHT_TIME_CURVES.has(fit)) {
        return FLIGHT_TIME_CURVES.get(fit);
    }

    const samples = Array.isArray(fit?.measuredFlightTimes)
        ? fit.measuredFlightTimes
            .map(pair => [Number(pair?.[0]), Number(pair?.[1])])
            .filter(pair => pair.every(Number.isFinite))
            .sort((a, b) => a[0] - b[0])
        : [];

    let curve = null;

    if (samples.length >= 3) {
        const moment = power => samples.reduce((sum, [mil]) => sum + Math.pow(mil, power), 0);
        const weighted = power => samples.reduce((sum, [mil, seconds]) => sum + Math.pow(mil, power) * seconds, 0);
        const matrix = [
            [moment(0), moment(1), moment(2), weighted(0)],
            [moment(1), moment(2), moment(3), weighted(1)],
            [moment(2), moment(3), moment(4), weighted(2)]
        ];

        for (let col = 0; col < 3; col += 1) {
            let pivot = col;

            for (let row = col + 1; row < 3; row += 1) {
                if (Math.abs(matrix[row][col]) > Math.abs(matrix[pivot][col])) {
                    pivot = row;
                }
            }

            [matrix[col], matrix[pivot]] = [matrix[pivot], matrix[col]];

            if (Math.abs(matrix[col][col]) < 1e-12) {
                curve = null;
                break;
            }

            for (let row = 0; row < 3; row += 1) {
                if (row === col) {
                    continue;
                }

                const factor = matrix[row][col] / matrix[col][col];

                for (let c = col; c < 4; c += 1) {
                    matrix[row][c] -= factor * matrix[col][c];
                }
            }

            if (col === 2) {
                curve = [matrix[0][3] / matrix[0][0], matrix[1][3] / matrix[1][1], matrix[2][3] / matrix[2][2]];
            }
        }
    }

    const result = { samples, curve };

    FLIGHT_TIME_CURVES.set(fit, result);

    return result;
}

function measuredFlightTimeSeconds(fit, mil) {
    const { samples, curve } = flightTimeCurve(fit);

    if (!samples.length) {
        return null;
    }

    if (curve) {
        return curve[0] + curve[1] * mil + curve[2] * mil * mil;
    }

    if (mil <= samples[0][0]) {
        return samples[0][1];
    }

    const last = samples[samples.length - 1];

    if (mil >= last[0]) {
        return last[1];
    }

    for (let i = 0; i < samples.length - 1; i += 1) {
        const [milA, secondsA] = samples[i];
        const [milB, secondsB] = samples[i + 1];

        if (mil >= milA && mil <= milB) {
            return milB === milA
                ? secondsA
                : secondsA + (secondsB - secondsA) * (mil - milA) / (milB - milA);
        }
    }

    return null;
}

/*
 * Seconds for one arc at one MIL. Exposed on its own so the derivation can
 * be tested without going through the panel.
 */
function flightTimeSecondsForMil(weaponId, arc, mil, deltaZMeters = 0) {
    const fit =
        typeof projectileModelArc === 'function'
            ? projectileModelArc(weaponId, arc)
            : null;

    if (!fit || !Number.isFinite(mil)) {
        return null;
    }

    const measured = measuredFlightTimeSeconds(fit, mil);

    if (measured !== null) {
        return measured > 0 ? measured : null;
    }

    const tan = modelArcTanForMil(fit, mil);

    if (tan === null) {
        return null;
    }

    const dz = Number.isFinite(deltaZMeters) ? deltaZMeters : 0;
    const seconds = modelFlightTime(fit, tan, dz);

    return seconds !== null && seconds > 0 ? seconds : null;
}

/*
 * Seconds for an arc at a distance, taking the MIL from the flat table.
 * The panel does not use this — it already holds the solutions, corrected
 * or not — but it is what makes the derivation checkable by hand.
 */
function flightTimeSeconds(weaponId, arc, distanceMeters, deltaZMeters = 0) {
    const weapon = WEAPONS?.[weaponId];

    if (!weapon) {
        return null;
    }

    const solutions =
        getWeaponElevationSolutions(weapon, distanceMeters);

    return flightTimeSecondsForMil(
        weaponId,
        arc,
        flightTimeMil(solutions?.[arc]),
        deltaZMeters
    );
}

function formatFlightTime(seconds) {
    return `≈ ${Math.round(seconds)} s`;
}

/*
 * Which label an arc wears on its badge. `single` has none — there is no
 * other arc to tell it apart from, so the mortar shows one unlabelled
 * badge under the row's own heading.
 */
const FLIGHT_TIME_ARC_LABELS = {
    low: 'lowArcShort',
    high: 'highArcShort',
    single: null
};

/*
 * One badge per arc the panel is showing, in the order it shows them.
 * An empty list means nothing to say — the mortar, an out-of-range target,
 * or a model that failed to load — and the row is hidden rather than blank.
 */
function flightTimeBadges(weapon, solutions, deltaZMeters = 0) {
    if (!weapon || !solutions) {
        return [];
    }

    const badges = ['low', 'high', 'single']
        .filter(arc => solutions[arc])
        .map(arc => ({
            arc,
            labelKey: FLIGHT_TIME_ARC_LABELS[arc],
            seconds: flightTimeSecondsForMil(
                weapon.id,
                arc,
                flightTimeMil(solutions[arc]),
                deltaZMeters
            )
        }));

    return badges.some(badge => badge.seconds === null)
        ? []
        : badges;
}
