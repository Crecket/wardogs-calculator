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
 * Which look the note wears. It only ever renders as a warning now, so there
 * is no "all good" state: when nothing is wrong the caption is empty and the
 * note is hidden entirely.
 */
function terrainNoteState(meta) {
    if (meta?.pendingTerrain) {
        return 'loading';
    }

    return meta?.applied ? 'mixed' : 'uncorrected';
}

function renderTerrainNote(meta, text) {
    const note = $('terrainNote');

    if (!note) {
        return;
    }

    setText(note, text);

    if (note.hidden !== !text) {
        note.hidden = !text;
    }

    if (text) {
        note.dataset.state = terrainNoteState(meta);
    } else {
        delete note.dataset.state;
    }
}

/*
 * One badge per arc, below the metric grid rather than inside the MIL card:
 * at the sub-line's 8 px the seconds were unreadable, and this is a value in
 * its own right rather than a footnote to the MIL.
 *
 * Built with the DOM rather than innerHTML — the arc labels are translated
 * strings and the numbers are computed, but the row is rebuilt on every
 * pointer move, so there is no reason to parse markup that often either.
 */
function renderFlightTime(weapon, solutions, terrainMeta) {
    const row = $('flightTimes');
    const host = $('flightTimeBadges');

    if (!row || !host) {
        return;
    }

    const badges =
        typeof flightTimeBadges === 'function'
            ? flightTimeBadges(
                weapon,
                solutions,
                Number(terrainMeta?.deltaZ) || 0
            )
            : [];

    row.hidden = !badges.length;
    host.textContent = '';

    badges.forEach(badge => {
        const pill = document.createElement('span');
        pill.className = 'flight-badge';

        if (badge.labelKey) {
            const label = document.createElement('span');
            label.className = 'flight-badge-arc';
            label.textContent = tr(badge.labelKey);
            pill.appendChild(label);
        }

        const value = document.createElement('strong');
        value.className = 'flight-badge-value';
        value.textContent = formatFlightTime(badge.seconds);
        pill.appendChild(value);

        host.appendChild(pill);
    });
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

    renderFlightTime(
        weapon,
        solutions,
        resolved.terrainMeta
    );

    setText(
        value,
        primary
    );

    if (detail) {
        setText(
            detail,
            secondary
        );
        if (detail.hidden !== !secondary) {
            detail.hidden = !secondary;
        }
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

    setText(
        $('angle'),
        a.toFixed(
            1
        ) +
        '°'
    );

    setText(
        $('dist'),
        d.toFixed(
            2
        ) +
        ' km'
    );

    setText(
        $('distm'),
        Math.round(
            d *
            1000
        ) +
        ' m'
    );

    setText(
        $('dx'),
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
        ' m'
    );

    setText(
        $('dy'),
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
        ' m'
    );

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

    setText(
        $('range'),
        minRange > 0
            ? `${Math.round(minRange * 1000)}–${Math.round(maxRange * 1000)} m`
            : `${Math.round(maxRange * 1000)} m`
    );

    setText(
        $('rangeStatus'),
        inRange
            ? tr('inRange')
            : tr('outRange')
    );

    setStyle(
        $('rangeStatus'),
        'color',
        inRange
            ? '#82c596'
            : '#d86666'
    );

    const mapName =
        S.map ===
        'custom'
            ? tr('customMap')
            : MAPS[S.map]?.name ||
            S.map;

    setText(
        $('status'),
        `${getWeaponName(weapon)} · ` +
        `${mapName} · ` +
        `${tr('artillery')}: ` +
        `${formatGameCoordinate(S.origin.x)}, ` +
        `${formatGameCoordinate(S.origin.y)} · ` +
        `${tr('target')}: ` +
        `${formatGameCoordinate(S.target.x)}, ` +
        `${formatGameCoordinate(S.target.y)}`
    );

    if (
        typeof trackCalculationState ===
        'function'
    ) {
        trackCalculationState(
            inRange
        );
    }
}
