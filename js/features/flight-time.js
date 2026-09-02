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
 * The mortar's seconds are interpolated straight from the timings measured
 * at the firing range on 2026-09-02 (measuredFlightTimes in the same file),
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

function measuredFlightTimeSeconds(fit, mil) {
    const samples = Array.isArray(fit?.measuredFlightTimes)
        ? fit.measuredFlightTimes
            .map(pair => [Number(pair?.[0]), Number(pair?.[1])])
            .filter(pair => pair.every(Number.isFinite))
            .sort((a, b) => a[0] - b[0])
        : [];

    if (!samples.length) {
        return null;
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
