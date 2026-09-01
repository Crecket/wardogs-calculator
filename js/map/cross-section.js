const CROSS_SECTION_SAMPLES = 192;
const CROSS_SECTION_MARGIN_SAMPLES = 10;

const CROSS_SECTION_TOTAL_SAMPLES =
    CROSS_SECTION_SAMPLES + CROSS_SECTION_MARGIN_SAMPLES * 2;

const CROSS_SECTION_ARC_ORDER = ['low', 'high', 'single'];

const CROSS_SECTION_ARC_LABELS = {
    low: 'lowArc',
    high: 'highArc',
    single: null
};

const CROSS_SECTION_STATE = {
    collapsed: false,
    bound: false,
    key: ''
};

function crossSectionPanelVisible() {
    return (
        Boolean($('crossSection')) &&
        typeof isMapLayerVisible === 'function' &&
        isMapLayerVisible('crossSection')
    );
}

function crossSectionProfile(field, origin, target, distanceMeters) {
    const ground = new Float64Array(CROSS_SECTION_TOTAL_SAMPLES);
    const gunIndex = CROSS_SECTION_MARGIN_SAMPLES;
    const span = CROSS_SECTION_SAMPLES - 1;

    for (let i = 0; i < CROSS_SECTION_TOTAL_SAMPLES; i += 1) {
        const t = (i - gunIndex) / span;

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

    return {
        ground,
        gunIndex,
        targetIndex: gunIndex + span,
        distanceMeters,
        stepMeters: distanceMeters / span
    };
}

function crossSectionFit(weaponId, arc) {
    return typeof projectileModelArc === 'function'
        ? projectileModelArc(weaponId, arc)
        : null;
}

function crossSectionCrestIndex(profile, firstIndex) {
    const ground = profile.ground;
    const span = profile.targetIndex - profile.gunIndex;

    let crest = firstIndex;
    let intrusion = -Infinity;

    for (let i = firstIndex; i < profile.targetIndex; i += 1) {
        const sight =
            ground[profile.gunIndex] +
            (ground[profile.targetIndex] - ground[profile.gunIndex]) *
            ((i - profile.gunIndex) / span);

        if (ground[i] - sight > intrusion) {
            intrusion = ground[i] - sight;
            crest = i;
        }
    }

    return crest;
}

function crossSectionFirstIndex(profile) {
    return Math.min(
        profile.targetIndex - 1,
        profile.gunIndex +
        Math.max(
            1,
            Math.ceil(RANGE_RING_MARCH_METRES / profile.stepMeters)
        )
    );
}

function crossSectionMarch(profile, tan, muzzleVelocity, firstIndex) {
    const zGun = profile.ground[profile.gunIndex];
    const heights = new Float64Array(CROSS_SECTION_TOTAL_SAMPLES);

    let impactIndex = -1;
    let landingIndex = -1;

    for (let i = profile.gunIndex; i < CROSS_SECTION_TOTAL_SAMPLES; i += 1) {
        heights[i] =
            zGun +
            modelShellHeight(
                tan,
                muzzleVelocity,
                (i - profile.gunIndex) * profile.stepMeters
            );

        if (i < firstIndex || heights[i] >= profile.ground[i]) {
            continue;
        }

        if (landingIndex < 0) {
            landingIndex = i;
        }

        if (impactIndex < 0 && i < profile.targetIndex) {
            impactIndex = i;
        }
    }

    return {
        heights,
        impactIndex,
        landingIndex
    };
}

function crossSectionStopTan(weapon, fit, status) {
    const stops = arcAngleStops(weapon, fit);

    if (!stops) {
        return null;
    }

    let radians;

    if (status === 'belowMinElevation') {
        radians = stops.minRadians;
    } else if (status === 'aboveMaxElevation') {
        radians = stops.maxRadians;
    } else if (status === 'tooClose') {
        radians = fit.branch === 'low' ? stops.minRadians : stops.maxRadians;
    } else {
        radians = fit.branch === 'low' ? stops.maxRadians : stops.minRadians;
    }

    return Math.tan(radians);
}

function crossSectionShot(weapon, arc, profile, shared) {
    const fit = crossSectionFit(weapon.id, arc);
    const muzzleVelocity = Number(fit?.muzzleVelocity);

    if (!fit || !Number.isFinite(muzzleVelocity) || muzzleVelocity <= 0) {
        return null;
    }

    const deltaZ =
        profile.ground[profile.targetIndex] -
        profile.ground[profile.gunIndex];

    const authority =
        shared && shared.status !== 'noModel' && typeof shared.masked === 'boolean'
            ? shared
            : null;

    const assessed =
        authority ?? assessArc(weapon, arc, profile.distanceMeters, deltaZ);

    if (assessed.status === 'noModel') {
        return null;
    }

    const firstIndex = crossSectionFirstIndex(profile);
    const crestIndex = crossSectionCrestIndex(profile, firstIndex);

    const tan = assessed.status === 'hit'
        ? assessed.tan
        : crossSectionStopTan(weapon, fit, assessed.status);

    if (tan === null) {
        return null;
    }

    const march = crossSectionMarch(profile, tan, muzzleVelocity, firstIndex);

    const capped = assessed.ceilingCapped === true;
    const clean = assessed.status === 'hit' && !capped;

    const masked = clean && (
        authority
            ? authority.masked === true
            : march.impactIndex >= 0
    );

    let kind = 'hit';
    let endIndex = profile.targetIndex;
    let impactMeters = profile.distanceMeters;

    if (clean) {
        if (masked && march.impactIndex >= 0) {
            kind = 'blocked';
            endIndex = march.impactIndex;
            impactMeters = (endIndex - profile.gunIndex) * profile.stepMeters;
        } else if (masked) {
            kind = 'blocked';
        }
    } else if (march.impactIndex >= 0) {
        kind = 'short';
        endIndex = march.impactIndex;
        impactMeters = (endIndex - profile.gunIndex) * profile.stepMeters;
    } else if (assessed.status !== 'hit') {
        kind = 'over';

        endIndex = march.landingIndex >= 0
            ? march.landingIndex
            : CROSS_SECTION_TOTAL_SAMPLES - 1;

        impactMeters = (endIndex - profile.gunIndex) * profile.stepMeters;
    } else if (capped) {
        const modelImpactMeters = modelRangeAtAngle(muzzleVelocity, Math.atan(tan), deltaZ);

        if (modelImpactMeters !== null && modelImpactMeters < profile.distanceMeters - 1e-6) {
            kind = 'short';
            impactMeters = modelImpactMeters;

            endIndex = Math.min(
                profile.targetIndex,
                Math.max(
                    profile.gunIndex,
                    profile.gunIndex + Math.round(modelImpactMeters / profile.stepMeters)
                )
            );
        }
    }

    return {
        arc,
        status: assessed.status,
        masked,
        ceilingCapped: capped,
        heights: march.heights,
        kind,
        crestIndex,
        endIndex,
        impactMeters,
        shortfallMeters: profile.distanceMeters - impactMeters,
        clearance: march.heights[crestIndex] - profile.ground[crestIndex]
    };
}

function crossSectionModel(weapon, distanceMeters) {
    if (typeof ensureHeightfieldLoaded === 'function') {
        ensureHeightfieldLoaded(S.map);
    }

    if (!(distanceMeters > 0)) {
        return {
            profile: null,
            shots: [],
            reason: 'distance'
        };
    }

    const field =
        typeof cachedHeightfield === 'function'
            ? cachedHeightfield(S.map)
            : null;

    if (!field) {
        return {
            profile: null,
            shots: [],
            reason:
                typeof mapHasHeightfield === 'function' &&
                mapHasHeightfield(S.map)
                    ? 'loading'
                    : 'terrain'
        };
    }

    const profile = crossSectionProfile(
        field,
        S.origin,
        S.target,
        distanceMeters
    );

    if (!profile) {
        return {
            profile: null,
            shots: [],
            reason: 'terrain'
        };
    }

    const shot = typeof assessShot === 'function'
        ? assessShot(weapon, S.origin, S.target, S.map)
        : null;

    const arcs = shot?.state === 'ready' ? shot.arcs : null;

    const shots = CROSS_SECTION_ARC_ORDER
        .map(arc => crossSectionShot(weapon, arc, profile, arcs?.[arc] ?? null))
        .filter(Boolean);

    return {
        profile,
        crestIndex: crossSectionCrestIndex(
            profile,
            crossSectionFirstIndex(profile)
        ),
        shots,
        reason: shots.length ? null : 'model'
    };
}

function crossSectionShotCaption(shot) {
    if (shot.masked || shot.kind === 'blocked') {
        return tr('crossSectionBlocked')
            .replace('{metres}', Math.round(shot.impactMeters))
            .replace('{short}', Math.round(shot.shortfallMeters));
    }

    if (shot.status === 'hit') {
        return shot.ceilingCapped && shot.kind === 'short'
            ? tr('crossSectionShort')
                .replace('{metres}', Math.round(shot.impactMeters))
                .replace('{short}', Math.round(shot.shortfallMeters))
            : null;
    }

    if (shot.status === 'belowMinElevation') {
        return tr('crossSectionBelowMin');
    }

    if (shot.status === 'aboveMaxElevation') {
        return tr('crossSectionAboveMax');
    }

    if (shot.status === 'tooClose') {
        return tr('crossSectionOver');
    }

    return tr('crossSectionShort')
        .replace('{metres}', Math.round(shot.impactMeters))
        .replace('{short}', Math.round(shot.shortfallMeters));
}

function crossSectionCaption(model) {
    if (!model.profile) {
        if (model.reason === 'loading') {
            return tr('crossSectionLoadingTerrain');
        }

        if (model.reason === 'distance') {
            return tr('crossSectionNoDistance');
        }

        return tr('crossSectionNoTerrain');
    }

    if (!model.shots.length) {
        return tr('crossSectionNoModel');
    }

    const clauses = [];

    model.shots.forEach(shot => {
        const state = crossSectionShotCaption(shot);

        if (!state) {
            return;
        }

        const labelKey = CROSS_SECTION_ARC_LABELS[shot.arc];
        const label = labelKey ? tr(labelKey) : '';
        const sibling = clauses.find(clause => clause.state === state);

        if (sibling && label && sibling.labels.length) {
            sibling.labels.push(label);

            return;
        }

        clauses.push({
            state,
            labels: label ? [label] : []
        });
    });

    return clauses
        .map(clause =>
            clause.labels.length
                ? `${clause.labels.join(' / ')}: ${clause.state}`
                : clause.state
        )
        .join(' · ');
}

function crossSectionSurface(canvas) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (!width || !height) {
        return null;
    }

    const d = renderScale();

    const pixelWidth = Math.round(width * d);
    const pixelHeight = Math.round(height * d);

    if (
        canvas.width !== pixelWidth ||
        canvas.height !== pixelHeight
    ) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
    }

    const g = canvas.getContext('2d');

    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, width, height);

    return {
        g,
        width,
        height
    };
}

function crossSectionVerticalRange(model) {
    const ground = model.profile.ground;

    let low = Infinity;
    let high = -Infinity;

    for (let i = 0; i < ground.length; i += 1) {
        if (ground[i] < low) {
            low = ground[i];
        }

        if (ground[i] > high) {
            high = ground[i];
        }
    }

    let apex = high;

    model.shots.forEach(shot => {
        for (
            let i = model.profile.gunIndex;
            i <= shot.endIndex;
            i += 1
        ) {
            if (shot.heights[i] > apex) {
                apex = shot.heights[i];
            }
        }
    });

    const relief = Math.max(high - low, 20);
    const base = low - relief * 0.06;

    const top = apex + Math.max(apex - low, 30) * 0.18;

    return {
        base,
        top,
        apex
    };
}

function crossSectionApexIndex(shot, gunIndex) {
    let apex = gunIndex;

    for (let i = gunIndex + 1; i <= shot.endIndex; i += 1) {
        if (shot.heights[i] > shot.heights[apex]) {
            apex = i;
        }
    }

    return apex;
}

function crossSectionRangeLabel(metres) {
    return metres >= 1000
        ? `${(metres / 1000).toFixed(2)} km`
        : `${Math.round(metres)} m`;
}

function crossSectionArcColor(missed) {
    return missed
        ? 'rgba(216,102,102,.95)'
        : 'rgba(130,197,150,.95)';
}

function crossSectionTracePath(g, shot, project, from, to) {
    g.beginPath();

    for (let i = from; i <= to; i += 1) {
        const point = project(i, shot.heights[i]);

        if (i === from) {
            g.moveTo(point.x, point.y);
        } else {
            g.lineTo(point.x, point.y);
        }
    }

    g.stroke();
}

function drawCrossSectionGround(g, model, project, left, right, bottom) {
    const ground = model.profile.ground;

    g.beginPath();
    g.moveTo(left, bottom);

    for (let i = 0; i < ground.length; i += 1) {
        const point = project(i, ground[i]);

        g.lineTo(point.x, point.y);
    }

    g.lineTo(right, bottom);
    g.closePath();

    g.fillStyle = 'rgba(122,134,124,.34)';
    g.fill();

    g.beginPath();

    for (let i = 0; i < ground.length; i += 1) {
        const point = project(i, ground[i]);

        if (i === 0) {
            g.moveTo(point.x, point.y);
        } else {
            g.lineTo(point.x, point.y);
        }
    }

    g.lineWidth = 1.3;
    g.strokeStyle = 'rgba(196,206,196,.8)';
    g.stroke();
}

function drawCrossSectionShots(g, model, project, left, right, top) {
    const ground = model.profile.ground;
    const gunIndex = model.profile.gunIndex;
    const zGun = ground[gunIndex];
    const placed = [];
    const labels = [];

    model.shots.forEach(shot => {
        const missed = shot.kind !== 'hit';
        const color = crossSectionArcColor(missed);

        g.lineWidth = 1.7;
        g.setLineDash(shot.arc === 'high' ? [5, 4] : []);
        g.strokeStyle = color;

        crossSectionTracePath(
            g,
            shot,
            project,
            gunIndex,
            shot.endIndex
        );

        g.setLineDash([]);

        const landed =
            shot.kind === 'blocked' ||
            shot.kind === 'short' ||
            shot.kind === 'over';

        const impact = project(
            shot.endIndex,
            landed && shot.endIndex !== model.profile.targetIndex
                ? ground[shot.endIndex]
                : shot.heights[shot.endIndex]
        );

        g.beginPath();
        g.arc(impact.x, impact.y, 3, 0, Math.PI * 2);
        g.fillStyle = color;
        g.fill();

        const labelKey = CROSS_SECTION_ARC_LABELS[shot.arc];

        if (!labelKey) {
            return;
        }

        const apex = crossSectionApexIndex(shot, gunIndex);
        const at = project(apex, shot.heights[apex]);

        labels.push({
            text: tr(labelKey),
            x: Math.min(right - 30, Math.max(left + 30, at.x)),
            y: at.y - 7,
            color
        });
    });

    g.font = '10px system-ui';
    g.textAlign = 'center';
    g.textBaseline = 'bottom';

    labels
        .forEach(label => {
            let y = label.y;

            placed.forEach(spot => {
                if (
                    Math.abs(spot.x - label.x) < 70 &&
                    Math.abs(spot.y - y) < 15
                ) {
                    y = spot.y + 15;
                }
            });

            placed.push({ x: label.x, y });

            g.fillStyle = label.color;
            g.fillText(label.text, label.x, y);
        });
}

function drawCrossSectionScale(g, model, project, toY, left, top, bottom) {
    const profile = model.profile;
    const zGun = profile.ground[profile.gunIndex];
    const gunLine = toY(zGun);

    g.setLineDash([2, 4]);
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(210,218,210,.28)';

    g.beginPath();
    g.moveTo(project(0, zGun).x, gunLine);
    g.lineTo(project(profile.ground.length - 1, zGun).x, gunLine);
    g.stroke();

    g.setLineDash([]);

    g.font = '10px system-ui';
    g.fillStyle = cssVar('--muted', '#89959e');
    g.textAlign = 'left';
    g.textBaseline = 'top';

    g.fillText(
        `+${Math.round(model.range.top - zGun)} m`,
        left + 2,
        top
    );

    if (gunLine - top > 26) {
        g.textBaseline = 'bottom';
        g.fillText('0 m', left + 2, gunLine - 3);
    }

    g.textBaseline = 'top';

    g.fillText(
        '0',
        project(profile.gunIndex, zGun).x - 2,
        bottom + 2
    );

    g.textAlign = 'right';

    g.fillText(
        crossSectionRangeLabel(profile.distanceMeters),
        project(profile.targetIndex, zGun).x + 2,
        bottom + 2
    );
}

function drawCrossSection(surface, model) {
    const { g, width, height } = surface;

    const left = 6;
    const right = width - 6;
    const top = 8;
    const bottom = height - 13;

    const plotWidth = right - left;
    const plotHeight = bottom - top;

    if (plotWidth <= 0 || plotHeight <= 0) {
        return;
    }

    const profile = model.profile;
    const ground = profile.ground;

    model.range = crossSectionVerticalRange(model);

    const toY = z =>
        top +
        (model.range.top - z) /
        (model.range.top - model.range.base) *
        plotHeight;

    const project = (index, z) => ({
        x: left + (index / (ground.length - 1)) * plotWidth,
        y: toY(z)
    });

    g.save();
    g.beginPath();
    g.rect(left, top, plotWidth, plotHeight);
    g.clip();

    drawCrossSectionGround(g, model, project, left, right, bottom);

    const crest = project(
        model.crestIndex,
        ground[model.crestIndex]
    );

    g.setLineDash([2, 3]);
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(210,218,210,.4)';

    g.beginPath();
    g.moveTo(crest.x, crest.y);
    g.lineTo(crest.x, top);
    g.stroke();

    g.setLineDash([]);

    drawCrossSectionShots(g, model, project, left, right, top);

    const gun = project(profile.gunIndex, ground[profile.gunIndex]);

    const target = project(
        profile.targetIndex,
        ground[profile.targetIndex]
    );

    g.lineWidth = 1.3;
    g.strokeStyle = 'rgba(226,232,226,.75)';

    g.beginPath();
    g.moveTo(gun.x, gun.y - 8);
    g.lineTo(gun.x, gun.y + 2);
    g.moveTo(target.x, target.y - 10);
    g.lineTo(target.x, target.y + 2);
    g.moveTo(target.x - 5, target.y - 4);
    g.lineTo(target.x + 5, target.y - 4);
    g.stroke();

    g.restore();

    drawCrossSectionScale(g, model, project, toY, left, top, bottom);
}

function crossSectionKey(weapon, distanceMeters) {
    const canvas = $('crossSectionCanvas');

    return [
        S.map,
        weapon.id,
        Math.round(S.origin.x * 100),
        Math.round(S.origin.y * 100),
        Math.round(S.target.x * 100),
        Math.round(S.target.y * 100),
        Math.round(distanceMeters),
        LANG,
        canvas ? canvas.clientWidth : 0,
        canvas ? canvas.clientHeight : 0,
        typeof cachedHeightfield === 'function' && cachedHeightfield(S.map)
            ? 1
            : 0
    ].join('|');
}

function toggleCrossSection() {
    const panel = $('crossSection');

    if (!panel) {
        return;
    }

    CROSS_SECTION_STATE.collapsed = !CROSS_SECTION_STATE.collapsed;
    CROSS_SECTION_STATE.key = '';

    syncCrossSectionToggle(panel);

    draw();
}

function bindCrossSection() {
    if (CROSS_SECTION_STATE.bound) {
        return;
    }

    const button = $('crossSectionToggle');

    if (!button) {
        return;
    }

    button.addEventListener('click', toggleCrossSection);

    CROSS_SECTION_STATE.bound = true;
}

function syncCrossSectionToggle(panel) {
    const button = $('crossSectionToggle');

    if (!button) {
        return;
    }

    const collapsed = CROSS_SECTION_STATE.collapsed;

    const label = collapsed
        ? tr('crossSectionExpand')
        : tr('crossSectionCollapse');

    panel.dataset.collapsed = collapsed ? 'true' : 'false';

    button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    button.setAttribute('aria-label', label);
    button.title = label;

    setText(button, collapsed ? '▾' : '▴');
}

function renderCrossSection(weapon, distanceMeters) {
    const panel = $('crossSection');

    if (!panel) {
        return;
    }

    const visible = crossSectionPanelVisible();

    if (panel.hidden !== !visible) {
        panel.hidden = !visible;
    }

    if (!visible || !weapon) {
        return;
    }

    bindCrossSection();
    syncCrossSectionToggle(panel);

    if (CROSS_SECTION_STATE.collapsed) {
        return;
    }

    const key = crossSectionKey(weapon, distanceMeters);

    if (key === CROSS_SECTION_STATE.key) {
        return;
    }

    const model = crossSectionModel(weapon, distanceMeters);

    const caption = $('crossSectionCaption');
    const text = crossSectionCaption(model);

    setText(caption, text);

    if (caption && caption.hidden !== !text) {
        caption.hidden = !text;
    }

    const canvas = $('crossSectionCanvas');
    const surface = canvas ? crossSectionSurface(canvas) : null;

    if (!surface) {
        CROSS_SECTION_STATE.key = '';

        return;
    }

    CROSS_SECTION_STATE.key = key;

    if (model.profile) {
        drawCrossSection(surface, model);
    }
}
