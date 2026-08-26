/* =========================
   RESULT
   ========================= */

function formatMilSolution(solution) {
    if (!solution) {
        return null;
    }

    const minMil = Math.round(solution.minMil);
    const maxMil = Math.round(solution.maxMil);

    if (minMil !== maxMil) {
        return `${minMil}–${maxMil}`;
    }

    return `${Math.round(solution.mil ?? minMil)}`;
}

function resolveElevationSolutions(
    weapon,
    distanceMeters,
    solutions
) {
    if (
        typeof getTerrainBallisticSolutions !==
        'function'
    ) {
        return {
            solutions,
            terrainMeta: null
        };
    }

    try {
        const resolved =
            getTerrainBallisticSolutions({
                weapon,
                distanceMeters,
                solutions,
                mapId: S.map,
                origin: S.origin,
                target: S.target
            });

        return {
            solutions:
                resolved?.solutions ??
                solutions,
            terrainMeta:
                resolved?.meta ??
                null
        };
    } catch (error) {
        console.warn(
            '[terrain-ballistics] Failed to resolve terrain firing solution; using flat-table fallback.',
            error
        );

        return {
            solutions,
            terrainMeta: null
        };
    }
}

function formatTerrainBallisticDetail(meta) {
    if (
        typeof formatTerrainBallisticsStatus !==
        'function'
    ) {
        return '';
    }

    return formatTerrainBallisticsStatus(meta);
}

/*
 * Which of the note's four looks to wear. The text itself already says all
 * of this; the state only drives colour, so an unknown meta falls through to
 * the neutral default rather than guessing.
 */
function terrainNoteState(meta) {
    if (meta?.pendingTerrain) {
        return 'loading';
    }

    if (!meta?.applied) {
        return 'uncorrected';
    }

    return meta.arcsUncorrected?.length
        ? 'mixed'
        : 'corrected';
}

function renderTerrainNote(meta, text) {
    const note = $('terrainNote');

    if (!note) {
        return;
    }

    note.textContent = text;
    note.hidden = !text;

    if (text) {
        note.dataset.state = terrainNoteState(meta);
    } else {
        delete note.dataset.state;
    }
}

function renderElevationResult(weapon, distanceMeters) {
    const value = $('mil');
    const detail = $('milAlt');

    if (!value) {
        return;
    }

    const flatSolutions =
        getWeaponElevationSolutions(
            weapon,
            distanceMeters
        );

    const resolved =
        resolveElevationSolutions(
            weapon,
            distanceMeters,
            flatSolutions
        );

    const solutions =
        resolved.solutions;

    const terrainDetail =
        formatTerrainBallisticDetail(
            resolved.terrainMeta
        );

    let primary = '—';
    let secondary = '';

    if (solutions.single) {
        primary = formatMilSolution(solutions.single);
    } else if (solutions.low && solutions.high) {
        primary =
            `${formatMilSolution(solutions.low)} / ` +
            `${formatMilSolution(solutions.high)}`;
        secondary = `${tr('lowArc')} / ${tr('highArc')}`;
    } else if (solutions.low) {
        primary = formatMilSolution(solutions.low);
        secondary = tr('lowArc');
    } else if (solutions.high) {
        primary = formatMilSolution(solutions.high);
        secondary = tr('highArc');
    } else if (solutions.inRange) {
        secondary = tr('noFiringSolution');
    }

    renderTerrainNote(
        resolved.terrainMeta,
        terrainDetail
    );

    value.textContent = primary;

    if (detail) {
        detail.textContent = secondary;
        detail.hidden = !secondary;
    }
}

function result() {

    const weapon = WEAPONS[S.weapon];

    if (!weapon) {
        return;
    }

    const dx =
        S.target.x -
        S.origin.x;

    const dy =
        S.target.y -
        S.origin.y;

    const dWorld =
        Math.hypot(
            dx,
            dy
        );

    const dMeters =
        worldDistanceToMeters(dWorld);

    const d =
        dMeters / 1000;

    let a =
        Math.atan2(
            dx,
            dy
        ) *
        180 /
        Math.PI;

    if (
        a <
        0
    ) {
        a +=
            360;
    }

    $('angle').textContent =
        a.toFixed(
            1
        ) +
        '°';

    $('dist').textContent =
        d.toFixed(
            2
        ) +
        ' km';

    $('distm').textContent =
        Math.round(
            d *
            1000
        ) +
        ' m';

    $('dx').textContent =
        (
            dx >=
            0
                ? '+'
                : '-'
        ) +
        Math.round(
            Math.abs(
                worldDistanceToMeters(dx)
            )
        ) +
        ' m';

    $('dy').textContent =
        (
            dy >=
            0
                ? '+'
                : '-'
        ) +
        Math.round(
            Math.abs(
                worldDistanceToMeters(dy)
            )
        ) +
        ' m';

    renderElevationResult(
        weapon,
        dMeters
    );

    if (
        typeof syncSphLevelWarning ===
        'function'
    ) {
        syncSphLevelWarning();
    }

    const minRange =
        weapon.minRange ??
        0;

    const maxRange =
        weapon.maxRange ??
        weapon.range;

    const inRange =
        d + 1e-9 >= minRange &&
        d <= maxRange + 1e-9;

    $('range').textContent =
        minRange > 0
            ? `${Math.round(minRange * 1000)}–${Math.round(maxRange * 1000)} m`
            : `${Math.round(maxRange * 1000)} m`;

    $('rangeStatus').textContent =
        inRange
            ? tr('inRange')
            : tr('outRange');

    $('rangeStatus').style.color =
        inRange
            ? '#82c596'
            : '#d86666';

    const mapName =
        S.map ===
        'custom'
            ? tr('customMap')
            : MAPS[S.map]?.name ||
            S.map;

    $('status').textContent =
        `${getWeaponName(weapon)} · ` +
        `${mapName} · ` +
        `${tr('artillery')}: ` +
        `${formatGameCoordinate(S.origin.x)}, ` +
        `${formatGameCoordinate(S.origin.y)} · ` +
        `${tr('target')}: ` +
        `${formatGameCoordinate(S.target.x)}, ` +
        `${formatGameCoordinate(S.target.y)}`;

    if (
        typeof trackCalculationState ===
        'function'
    ) {
        trackCalculationState(
            inRange
        );
    }
}
