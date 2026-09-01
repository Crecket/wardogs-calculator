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

function extendModelledSolutions(
    weapon,
    distanceMeters,
    solutions,
    origin,
    target
) {
    if (
        solutions.single ||
        solutions.low ||
        solutions.high ||
        typeof modelledElevationSolution !== 'function'
    ) {
        return solutions;
    }

    const sampled =
        typeof terrainDeltaZMeters === 'function'
            ? terrainDeltaZMeters(S.map, origin, target)
            : null;

    const deltaZ = Number.isFinite(sampled) ? sampled : 0;

    const modelled = {
        ...solutions,
        single: modelledElevationSolution(
            weapon,
            'single',
            distanceMeters,
            deltaZ
        ),
        low: modelledElevationSolution(
            weapon,
            'low',
            distanceMeters,
            deltaZ
        ),
        high: modelledElevationSolution(
            weapon,
            'high',
            distanceMeters,
            deltaZ
        )
    };

    return modelled.single || modelled.low || modelled.high
        ? modelled
        : solutions;
}

function formatMilValue(solution) {
    const text = formatMilSolution(solution);

    return solution?.modelled ? `≈ ${text}` : text;
}

function resolveElevationSolutions(
    weapon,
    distanceMeters,
    solutions,
    origin,
    target,
    prime
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
                origin,
                target,
                prime
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

function firingGeometry(origin, target) {
    const dx =
        target.x -
        origin.x;

    const dy =
        target.y -
        origin.y;

    const dWorld =
        Math.hypot(
            dx,
            dy
        );

    const dMeters =
        worldDistanceToMeters(dWorld);

    let bearing =
        Math.atan2(
            dx,
            dy
        ) *
        180 /
        Math.PI;

    if (
        bearing <
        0
    ) {
        bearing +=
            360;
    }

    return {
        dx,
        dy,
        dWorld,
        dMeters,
        bearing
    };
}

function solveFiringElevation(
    weapon,
    distanceMeters,
    origin,
    target,
    prime
) {
    const flatSolutions =
        getWeaponElevationSolutions(
            weapon,
            distanceMeters
        );

    const resolved =
        resolveElevationSolutions(
            weapon,
            distanceMeters,
            flatSolutions,
            origin,
            target,
            prime
        );

    const solutions =
        extendModelledSolutions(
            weapon,
            distanceMeters,
            resolved.solutions,
            origin,
            target
        );

    return {
        solutions,

        terrainMeta:
        resolved.terrainMeta,

        solved: Boolean(
            solutions.single ||
            solutions.low ||
            solutions.high
        ),

        modelled: Boolean(
            solutions.single?.modelled ||
            solutions.low?.modelled ||
            solutions.high?.modelled
        )
    };
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

function flightBadgeNode(host, index) {
    const existing = host.children[index];

    if (existing) {
        return existing;
    }

    const pill = document.createElement('span');
    pill.className = 'flight-badge';

    const label = document.createElement('span');
    label.className = 'flight-badge-arc';
    pill.appendChild(label);

    const value = document.createElement('strong');
    value.className = 'flight-badge-value';
    pill.appendChild(value);

    host.appendChild(pill);

    return pill;
}

/*
 * One badge per arc, below the metric grid rather than inside the MIL card:
 * at the sub-line's 8 px the seconds were unreadable, and this is a value in
 * its own right rather than a footnote to the MIL.
 *
 * Built with the DOM rather than innerHTML — the arc labels are translated
 * strings and the numbers are computed. The row re-runs on every pointer
 * move, so the pills are reused and only their text is rewritten.
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

    if (row.hidden !== !badges.length) {
        row.hidden = !badges.length;
    }

    const heading = row.querySelector('.solution-flight-label');

    if (heading) {
        setText(
            heading,
            badges.length > 1
                ? tr('flightTimePerArc')
                : tr('flightTime')
        );
    }

    const arcs = String(badges.length);

    if (host.dataset.arcs !== arcs) {
        host.dataset.arcs = arcs;
    }

    while (host.children.length > badges.length) {
        host.lastElementChild.remove();
    }

    badges.forEach((badge, index) => {
        const pill = flightBadgeNode(host, index);
        const label = pill.firstElementChild;
        const value = pill.lastElementChild;

        setText(label, badge.labelKey ? tr(badge.labelKey) : '');

        if (label.hidden !== !badge.labelKey) {
            label.hidden = !badge.labelKey;
        }

        setText(value, formatFlightTime(badge.seconds));
    });
}

function renderElevationResult(weapon, distanceMeters) {
    const value = $('mil');
    const detail = $('milAlt');

    if (!value) {
        return {
            solved: false,
            modelled: false
        };
    }

    const resolved =
        solveFiringElevation(
            weapon,
            distanceMeters,
            S.origin,
            S.target
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
        primary = formatMilValue(solutions.single);
    } else if (solutions.low && solutions.high) {
        primary =
            `${formatMilValue(solutions.low)} / ` +
            `${formatMilValue(solutions.high)}`;
        secondary = `${tr('lowArc')} / ${tr('highArc')}`;
    } else if (solutions.low) {
        primary = formatMilValue(solutions.low);
        secondary = tr('lowArc');
    } else if (solutions.high) {
        primary = formatMilValue(solutions.high);
        secondary = tr('highArc');
    }

    const solved =
        resolved.solved;

    const modelled =
        resolved.modelled;

    if (!solved) {
        secondary = tr('noFiringSolution');
    } else if (modelled) {
        secondary = secondary
            ? `${secondary} · ${tr('milModelled')}`
            : tr('milModelled');
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

    if (typeof renderCrossSection === 'function') {
        renderCrossSection(
            weapon,
            distanceMeters
        );
    }

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

        if (modelled) {
            detail.dataset.modelled = 'true';
        } else {
            delete detail.dataset.modelled;
        }
    }

    return {
        solved,
        modelled
    };
}

function result() {

    const weapon = WEAPONS[S.weapon];

    if (!weapon) {
        return;
    }

    const geometry =
        firingGeometry(
            S.origin,
            S.target
        );

    const dx =
        geometry.dx;

    const dy =
        geometry.dy;

    const dMeters =
        geometry.dMeters;

    const d =
        dMeters / 1000;

    const a =
        geometry.bearing;

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

    const elevation =
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

    setText(
        $('range'),
        minRange > 0
            ? `${Math.round(minRange * 1000)}–${Math.round(maxRange * 1000)} m`
            : `${Math.round(maxRange * 1000)} m`
    );

    setText(
        $('rangeStatus'),
        elevation.solved
            ? (
                elevation.modelled
                    ? tr('inRangeModelled')
                    : tr('inRange')
            )
            : tr('outRange')
    );

    setStyle(
        $('rangeStatus'),
        'color',
        elevation.solved
            ? (
                elevation.modelled
                    ? '#f0b24a'
                    : '#82c596'
            )
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
            elevation.solved
        );
    }
}


let savedTargetSummaryRefreshTimer = null;
let savedTargetSummaryState = '';

function getSavedTargetEffectiveOrigin(target) {
    const hasSavedOrigin =
        Boolean(
            target?.saveArtillery &&
            target?.origin &&
            Number.isFinite(
                Number(target.origin.x)
            ) &&
            Number.isFinite(
                Number(target.origin.y)
            )
        );

    if (hasSavedOrigin) {
        return {
            x: Number(target.origin.x),
            y: Number(target.origin.y)
        };
    }

    return {
        x: Number(S.origin.x),
        y: Number(S.origin.y)
    };
}

function getSavedTargetElevationSummary(
    weapon,
    distanceMeters,
    origin,
    targetPoint
) {
    const firing =
        solveFiringElevation(
            weapon,
            distanceMeters,
            origin,
            targetPoint
        );

    const extended =
        firing.solutions;

    let primary =
        '—';

    let secondary =
        '';

    if (extended.single) {
        primary =
            formatMilValue(
                extended.single
            );

    } else if (
        extended.low &&
        extended.high
    ) {
        primary =
            `${formatMilValue(extended.low)} / ` +
            `${formatMilValue(extended.high)}`;

        secondary =
            `${tr('lowArc')} / ${tr('highArc')}`;

    } else if (extended.low) {
        primary =
            formatMilValue(
                extended.low
            );

        secondary =
            tr('lowArc');

    } else if (extended.high) {
        primary =
            formatMilValue(
                extended.high
            );

        secondary =
            tr('highArc');
    }

    const solved =
        firing.solved;

    const modelled =
        firing.modelled;

    if (!solved) {
        secondary =
            tr('outRange');
    } else if (modelled) {
        secondary =
            secondary
                ? `${secondary} · ${tr('milModelled')}`
                : tr('milModelled');
    }

    return {
        primary,
        secondary,
        inRange: solved
    };
}

function getSavedTargetFiringInfo(target) {
    const weapon =
        WEAPONS[S.weapon];

    if (
        !weapon ||
        !target ||
        !Number.isFinite(
            Number(target.x)
        ) ||
        !Number.isFinite(
            Number(target.y)
        )
    ) {
        return null;
    }

    const origin =
        getSavedTargetEffectiveOrigin(
            target
        );

    const targetPoint = {
        x: Number(target.x),
        y: Number(target.y)
    };

    const dx =
        targetPoint.x -
        origin.x;

    const dy =
        targetPoint.y -
        origin.y;

    const distanceMeters =
        worldDistanceToMeters(
            Math.hypot(
                dx,
                dy
            )
        );

    let azimuth =
        Math.atan2(
            dx,
            dy
        ) *
        180 /
        Math.PI;

    if (azimuth < 0) {
        azimuth += 360;
    }

    const elevation =
        getSavedTargetElevationSummary(
            weapon,
            distanceMeters,
            origin,
            targetPoint
        );

    return {
        origin,
        target:
            targetPoint,
        distanceMeters,
        distanceKm:
            distanceMeters /
            1000,
        azimuth,
        dxMeters:
            worldDistanceToMeters(
                dx
            ),
        dyMeters:
            worldDistanceToMeters(
                dy
            ),
        mil:
            elevation.primary,
        milDetail:
            elevation.secondary,
        inRange:
            elevation.inRange
    };
}

function formatSavedTargetSignedMeters(value) {
    return (
        (
            value >= 0
                ? '+'
                : '-'
        ) +
        Math.round(
            Math.abs(value)
        ) +
        ' m'
    );
}

function createSavedTargetMetric(
    label,
    value,
    detail = '',
    extraClass = ''
) {
    const metric =
        document.createElement(
            'div'
        );

    metric.className =
        `saved-target-metric ${extraClass}`
            .trim();

    const labelElement =
        document.createElement(
            'span'
        );

    labelElement.className =
        'saved-target-metric-label';

    labelElement.textContent =
        label;

    const valueElement =
        document.createElement(
            'strong'
        );

    valueElement.className =
        'saved-target-metric-value';

    valueElement.textContent =
        value;

    metric.append(
        labelElement,
        valueElement
    );

    if (detail) {
        const detailElement =
            document.createElement(
                'span'
            );

        detailElement.className =
            'saved-target-metric-detail';

        detailElement.textContent =
            detail;

        metric.appendChild(
            detailElement
        );
    }

    return metric;
}

function renderSavedTargetFiringInfo(
    item,
    target
) {
    const info =
        item.querySelector(
            '.saved-target-info'
        );

    if (!info) {
        return;
    }

    info
        .querySelector(
            '.saved-target-origin'
        )
        ?.remove();

    item
        .querySelector(
            '.saved-target-solution'
        )
        ?.remove();

    const targetCoords =
        info.querySelector(
            '.saved-target-coords'
        );

    if (targetCoords) {
        targetCoords.textContent =
            `${tr('target')}: ` +
            `X ${formatGameCoordinate(target.x)} · ` +
            `Y ${formatGameCoordinate(target.y)}`;
    }

    const firingInfo =
        getSavedTargetFiringInfo(
            target
        );

    if (!firingInfo) {
        return;
    }

    const originCoords =
        document.createElement(
            'span'
        );

    originCoords.className =
        'saved-target-origin';

    originCoords.textContent =
        `${tr('artillery')}: ` +
        `X ${formatGameCoordinate(firingInfo.origin.x)} · ` +
        `Y ${formatGameCoordinate(firingInfo.origin.y)}`;

    const solution =
        document.createElement(
            'div'
        );

    solution.className =
        'saved-target-solution';

    const distanceMetric =
        createSavedTargetMetric(
            tr('distance'),
            `${Math.round(firingInfo.distanceMeters)} m`
        );

    const azimuthMetric =
        createSavedTargetMetric(
            tr('azimuth'),
            `${firingInfo.azimuth.toFixed(1)}°`
        );

    const milMetric =
        createSavedTargetMetric(
            tr('mil'),
            firingInfo.mil,
            firingInfo.milDetail,
            'saved-target-metric-mil'
        );

    const delta =
        document.createElement(
            'div'
        );

    delta.className =
        'saved-target-delta';

    delta.textContent =
        `ΔX ${formatSavedTargetSignedMeters(firingInfo.dxMeters)} · ` +
        `ΔY ${formatSavedTargetSignedMeters(firingInfo.dyMeters)}`;

    solution.append(
        distanceMetric,
        azimuthMetric,
        milMetric,
        delta
    );

    info.append(
        originCoords
    );

    item.append(
        solution
    );

    item.classList.toggle(
        'out-of-range',
        !firingInfo.inRange
    );
}

function refreshSavedTargetFiringInfo() {
    const container =
        $('savedTargetsList');

    if (
        !container ||
        !Array.isArray(savedTargets)
    ) {
        return;
    }

    const rows =
        new Map();

    container
        .querySelectorAll(
            '.saved-target'
        )
        .forEach(
            item => {
                rows.set(
                    item.dataset.targetId,
                    item
                );
            }
        );

    savedTargets.forEach(
        target => {
            const item =
                rows.get(
                    String(target.id)
                );

            if (item) {
                renderSavedTargetFiringInfo(
                    item,
                    target
                );
            }
        }
    );
}

function getSavedTargetSummaryState() {
    return [
        S.map,
        S.weapon,
        S.origin?.x,
        S.origin?.y,
        LANG,
        Boolean(
            WEAPONS[S.weapon]
        )
    ].join('|');
}

function scheduleSavedTargetFiringInfoRefresh() {
    const nextState =
        getSavedTargetSummaryState();

    if (
        nextState ===
        savedTargetSummaryState
    ) {
        return;
    }

    if (
        savedTargetSummaryRefreshTimer
    ) {
        clearTimeout(
            savedTargetSummaryRefreshTimer
        );
    }

    savedTargetSummaryRefreshTimer =
        setTimeout(
            () => {
                savedTargetSummaryRefreshTimer =
                    null;

                savedTargetSummaryState =
                    getSavedTargetSummaryState();

                refreshSavedTargetFiringInfo();
            },
            80
        );
}

/*
 * saved-targets.js is loaded before results.js.
 * Wrap its two public render/update functions here
 * so the existing target-list behavior stays intact
 * while every row gains a live firing solution.
 */
if (
    typeof renderSavedTargets ===
    'function'
) {
    const renderSavedTargetsBase =
        renderSavedTargets;

    renderSavedTargets =
        function (...args) {
            const result =
                renderSavedTargetsBase.apply(
                    this,
                    args
                );

            savedTargetSummaryState =
                getSavedTargetSummaryState();

            refreshSavedTargetFiringInfo();

            return result;
        };
}

if (
    typeof refreshSavedTargetHighlight ===
    'function'
) {
    const refreshSavedTargetHighlightBase =
        refreshSavedTargetHighlight;

    refreshSavedTargetHighlight =
        function (...args) {
            const result =
                refreshSavedTargetHighlightBase.apply(
                    this,
                    args
                );

            scheduleSavedTargetFiringInfoRefresh();

            return result;
        };
}
