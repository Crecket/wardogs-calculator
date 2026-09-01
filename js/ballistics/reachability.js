const REACH_ARCS = ['single', 'low', 'high'];

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

        if (levelMax !== null) {
            if (shiftedMax === null) {
                return { status: 'tooFar', mil: null, tan: null, tableRow };
            }

            const anchoredMax = declared.maxMeters + (shiftedMax - levelMax);

            if (distanceMeters > anchoredMax + 1e-6) {
                return { status: 'tooFar', mil: null, tan: null, tableRow };
            }
        }

        const levelMin = arcMinRangeModel(weapon, fit, 0);
        const shiftedMin = arcMinRangeModel(weapon, fit, dz);

        if (levelMin !== null && shiftedMin !== null) {
            const anchoredMin = declared.minMeters + (shiftedMin - levelMin);

            if (distanceMeters + 1e-6 < anchoredMin) {
                return { status: 'tooClose', mil: null, tan: null, tableRow };
            }
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

    if (!tableRow && mil !== null && !modelArcElevationFits(weapon, mil)) {
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

    return { status: 'hit', mil, tan, tableRow };
}
