const CROSS_SECTION_SAMPLES = 192;
const CROSS_SECTION_MARGIN_SAMPLES = 10;

const CROSS_SECTION_TOTAL_SAMPLES =
    CROSS_SECTION_SAMPLES + CROSS_SECTION_MARGIN_SAMPLES * 2;

const CROSS_SECTION_GRAVITY = 9.81;
const CROSS_SECTION_TERRAIN_SHARE = 0.34;
const CROSS_SECTION_DETAIL_SHARE = 0.72;
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

function crossSectionElevationLimits(weapon, fit) {
    const offset = Number(fit?.angleOffsetDeg);
    const perMil = Number(fit?.anglePerMilDeg);
    const minMil = Number(weapon?.minElevationMil);
    const maxMil = Number(weapon?.maxElevationMil);

    if (
        !Number.isFinite(offset) ||
        !Number.isFinite(perMil) ||
        !Number.isFinite(minMil) ||
        !Number.isFinite(maxMil)
    ) {
        return null;
    }

    const shallow = offset + perMil * minMil;
    const steep = offset + perMil * maxMil;

    if (!(shallow > 0) || !(steep < 90) || shallow >= steep) {
        return null;
    }

    return {
        minTan: Math.tan(shallow * Math.PI / 180),
        maxTan: Math.tan(steep * Math.PI / 180)
    };
}

function crossSectionMaxRangeTan(muzzleVelocity, deltaZMeters) {
    const inner =
        muzzleVelocity * muzzleVelocity -
        2 * CROSS_SECTION_GRAVITY * deltaZMeters;

    if (inner <= 0) {
        return null;
    }

    return muzzleVelocity / Math.sqrt(inner);
}

function crossSectionShellHeight(tan, muzzleVelocity, xMeters) {
    return (
        xMeters * tan -
        CROSS_SECTION_GRAVITY *
        xMeters *
        xMeters *
        (1 + tan * tan) /
        (2 * muzzleVelocity * muzzleVelocity)
    );
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
            crossSectionShellHeight(
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

function crossSectionShot(weapon, arc, profile) {
    const fit = crossSectionFit(weapon.id, arc);
    const muzzleVelocity = Number(fit?.muzzleVelocity);

    if (!fit || !Number.isFinite(muzzleVelocity) || muzzleVelocity <= 0) {
        return null;
    }

    const firstIndex = crossSectionFirstIndex(profile);
    const crestIndex = crossSectionCrestIndex(profile, firstIndex);
    const limits = crossSectionElevationLimits(weapon, fit);

    const deltaZ =
        profile.ground[profile.targetIndex] -
        profile.ground[profile.gunIndex];

    const reachTan =
        typeof modelArcLaunchTan === 'function'
            ? modelArcLaunchTan(fit, profile.distanceMeters, deltaZ)
            : null;

    let reaches = reachTan !== null;
    let clampedTo = null;

    let tan = reachTan === null
        ? crossSectionMaxRangeTan(muzzleVelocity, deltaZ)
        : reachTan;

    if (tan === null) {
        return null;
    }

    if (limits && tan < limits.minTan) {
        reaches = false;
        clampedTo = 'min';
        tan = limits.minTan;
    } else if (limits && tan > limits.maxTan) {
        reaches = false;
        clampedTo = 'max';
        tan = limits.maxTan;
    }

    let march = crossSectionMarch(profile, tan, muzzleVelocity, firstIndex);

    if (!reaches && march.impactIndex > firstIndex) {
        const landing =
            profile.ground[march.impactIndex] -
            profile.ground[profile.gunIndex];

        let refined = crossSectionMaxRangeTan(muzzleVelocity, landing);

        if (refined !== null && limits) {
            refined = Math.min(
                limits.maxTan,
                Math.max(limits.minTan, refined)
            );
        }

        if (refined !== null) {
            march = crossSectionMarch(
                profile,
                refined,
                muzzleVelocity,
                firstIndex
            );
        }
    }

    const heights = march.heights;

    let kind = 'hit';
    let endIndex = profile.targetIndex;

    if (march.impactIndex >= 0) {
        kind = reaches ? 'blocked' : 'short';
        endIndex = march.impactIndex;
    } else if (!reaches) {
        kind = 'over';

        endIndex = march.landingIndex >= 0
            ? march.landingIndex
            : CROSS_SECTION_TOTAL_SAMPLES - 1;
    }

    const impactMeters =
        (endIndex - profile.gunIndex) * profile.stepMeters;

    return {
        arc,
        heights,
        kind,
        clampedTo,
        crestIndex,
        endIndex,
        impactMeters,
        shortfallMeters: profile.distanceMeters - impactMeters,
        clearance: heights[crestIndex] - profile.ground[crestIndex]
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

    const shots = CROSS_SECTION_ARC_ORDER
        .map(arc => crossSectionShot(weapon, arc, profile))
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
    if (shot.kind === 'blocked') {
        return tr('crossSectionBlocked')
            .replace('{metres}', Math.round(shot.impactMeters))
            .replace('{short}', Math.round(shot.shortfallMeters));
    }

    if (shot.kind === 'short') {
        return tr('crossSectionShort')
            .replace('{metres}', Math.round(shot.impactMeters))
            .replace('{short}', Math.round(shot.shortfallMeters));
    }

    if (shot.kind === 'over') {
        return shot.clampedTo === 'min'
            ? tr('crossSectionOver')
            : tr('crossSectionPasses');
    }

    return null;
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
    let flat = high;

    model.shots.forEach(shot => {
        for (
            let i = model.profile.gunIndex;
            i <= shot.endIndex;
            i += 1
        ) {
            if (shot.heights[i] > apex) {
                apex = shot.heights[i];
            }

            if (shot.arc !== 'high' && shot.heights[i] > flat) {
                flat = shot.heights[i];
            }
        }
    });

    const span = Math.max(apex - low, 30);
    const relief = Math.max(high - low, 20);
    const crest = high + relief * 0.12;

    return {
        base: low - relief * 0.06,
        ground: crest,
        detail: Math.max(crest, flat + relief * 0.12),
        top: apex + span * 0.12
    };
}

function crossSectionScale(range, top, bottom) {
    const plotHeight = bottom - top;
    const full = range.top - range.base;

    const linear = {
        toY: z => top + (range.top - z) / full * plotHeight,
        compressed: false,
        breakY: null
    };

    if (
        !(full > 0) ||
        !(range.ground > range.base) ||
        !(range.top > range.ground)
    ) {
        return linear;
    }

    const natural = (range.ground - range.base) / full;

    if (natural >= CROSS_SECTION_TERRAIN_SHARE) {
        return linear;
    }

    let breakZ = Math.min(range.detail, range.top);

    let share =
        CROSS_SECTION_TERRAIN_SHARE *
        (breakZ - range.base) /
        (range.ground - range.base);

    if (!(share <= CROSS_SECTION_DETAIL_SHARE)) {
        breakZ = range.ground;
        share = CROSS_SECTION_TERRAIN_SHARE;
    }

    if (!(range.top > breakZ)) {
        return linear;
    }

    const band = plotHeight * share;
    const breakY = bottom - band;

    return {
        toY: z => z <= breakZ
            ? bottom - (z - range.base) / (breakZ - range.base) * band
            : breakY -
                (z - breakZ) / (range.top - breakZ) *
                (plotHeight - band),
        compressed: true,
        breakY,
        breakZ
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

function drawCrossSectionShots(g, model, project, left, right) {
    const ground = model.profile.ground;
    const gunIndex = model.profile.gunIndex;
    const placed = [];

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

        let x = Math.min(right - 30, Math.max(left + 30, at.x));
        let y = at.y - 5;

        placed.forEach(spot => {
            if (Math.abs(spot.x - x) < 60 && Math.abs(spot.y - y) < 15) {
                y = spot.y + 15;
            }
        });

        placed.push({ x, y });

        g.font = '10px system-ui';
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        g.fillStyle = color;

        g.fillText(tr(labelKey), x, y);
    });
}

function drawCrossSectionScale(
    g,
    model,
    project,
    scale,
    left,
    right,
    top,
    bottom
) {
    const profile = model.profile;
    const zGun = profile.ground[profile.gunIndex];
    const gunLine = scale.toY(zGun);

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

    if (scale.compressed) {
        g.setLineDash([1, 3]);
        g.lineWidth = 1;
        g.strokeStyle = 'rgba(210,218,210,.3)';

        g.beginPath();
        g.moveTo(left, scale.breakY);
        g.lineTo(right, scale.breakY);
        g.stroke();

        g.setLineDash([]);

        g.fillStyle = cssVar('--muted', '#89959e');
        g.textAlign = 'left';
        g.textBaseline = 'bottom';

        g.fillText(
            `+${Math.round(scale.breakZ - zGun)} m`,
            left + 2,
            scale.breakY - 3
        );

        g.textAlign = 'right';
        g.textBaseline = 'top';

        g.fillText(
            tr('crossSectionCompressed'),
            right - 2,
            top
        );
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

    const scale = crossSectionScale(model.range, top, bottom);
    const toY = scale.toY;

    const project = (index, z) => ({
        x: left + (index / (ground.length - 1)) * plotWidth,
        y: toY(z)
    });

    g.save();
    g.beginPath();
    g.rect(left, top - 6, plotWidth, plotHeight + 6);
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

    drawCrossSectionShots(g, model, project, left, right);

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

    drawCrossSectionScale(
        g,
        model,
        project,
        scale,
        left,
        right,
        top,
        bottom
    );
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

    setText(button, collapsed ? '+' : '−');
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
