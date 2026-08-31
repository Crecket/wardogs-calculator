const CROSS_SECTION_SAMPLES = 192;
const CROSS_SECTION_GRAVITY = 9.81;
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
    const ground = new Float64Array(CROSS_SECTION_SAMPLES);

    for (let i = 0; i < CROSS_SECTION_SAMPLES; i += 1) {
        const t = i / (CROSS_SECTION_SAMPLES - 1);

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
        distanceMeters,
        stepMeters: distanceMeters / (CROSS_SECTION_SAMPLES - 1)
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

function crossSectionReachTan(fit, distanceMeters, deltaZMeters) {
    const muzzleVelocity = Number(fit?.muzzleVelocity);

    if (
        !Number.isFinite(muzzleVelocity) ||
        muzzleVelocity <= 0 ||
        !(distanceMeters > 0)
    ) {
        return null;
    }

    const vSquared = muzzleVelocity * muzzleVelocity;

    const discriminant =
        vSquared * vSquared -
        CROSS_SECTION_GRAVITY *
        (
            CROSS_SECTION_GRAVITY * distanceMeters * distanceMeters +
            2 * deltaZMeters * vSquared
        );

    if (discriminant < 0) {
        return null;
    }

    const root = Math.sqrt(discriminant);

    const tan =
        fit.branch === 'low'
            ? (vSquared - root) / (CROSS_SECTION_GRAVITY * distanceMeters)
            : (vSquared + root) / (CROSS_SECTION_GRAVITY * distanceMeters);

    return Number.isFinite(tan) && tan > 0 ? tan : null;
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
    const last = ground.length - 1;

    let crest = firstIndex;
    let intrusion = -Infinity;

    for (let i = firstIndex; i < last; i += 1) {
        const sight =
            ground[0] +
            (ground[last] - ground[0]) * (i / last);

        if (ground[i] - sight > intrusion) {
            intrusion = ground[i] - sight;
            crest = i;
        }
    }

    return crest;
}

function crossSectionFirstIndex(profile) {
    return Math.min(
        CROSS_SECTION_SAMPLES - 2,
        Math.max(
            1,
            Math.ceil(RANGE_RING_MARCH_METRES / profile.stepMeters)
        )
    );
}

function crossSectionMarch(profile, tan, muzzleVelocity, firstIndex) {
    const zGun = profile.ground[0];
    const heights = new Float64Array(CROSS_SECTION_SAMPLES);

    let impactIndex = -1;

    for (let i = 0; i < CROSS_SECTION_SAMPLES; i += 1) {
        heights[i] =
            zGun +
            crossSectionShellHeight(
                tan,
                muzzleVelocity,
                i * profile.stepMeters
            );

        if (
            impactIndex < 0 &&
            i >= firstIndex &&
            i < CROSS_SECTION_SAMPLES - 1 &&
            heights[i] < profile.ground[i]
        ) {
            impactIndex = i;
        }
    }

    return {
        heights,
        impactIndex
    };
}

function crossSectionShot(weapon, arc, profile) {
    const fit = crossSectionFit(weapon.id, arc);
    const muzzleVelocity = Number(fit?.muzzleVelocity);

    if (!fit || !Number.isFinite(muzzleVelocity) || muzzleVelocity <= 0) {
        return null;
    }

    const last = CROSS_SECTION_SAMPLES - 1;
    const firstIndex = crossSectionFirstIndex(profile);
    const crestIndex = crossSectionCrestIndex(profile, firstIndex);
    const limits = crossSectionElevationLimits(weapon, fit);

    const deltaZ = profile.ground[last] - profile.ground[0];

    const reachTan = crossSectionReachTan(
        fit,
        profile.distanceMeters,
        deltaZ
    );

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
            profile.ground[march.impactIndex] - profile.ground[0];

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
    let impactIndex = march.impactIndex;

    if (impactIndex >= 0) {
        kind = reaches ? 'blocked' : 'short';
    } else {
        impactIndex = last;

        if (!reaches) {
            kind = 'over';
        }
    }

    const impactMeters = impactIndex * profile.stepMeters;

    return {
        arc,
        heights,
        kind,
        crestIndex,
        impactIndex,
        impactMeters,
        clampedTo,
        shortfallMeters: profile.distanceMeters - impactMeters,
        clearance: heights[crestIndex] - profile.ground[crestIndex],
        tabulated: false
    };
}

function crossSectionMergeShots(shots) {
    if (shots.length < 2) {
        return shots;
    }

    const identical = shots.every(shot =>
        shot.kind === shots[0].kind &&
        shot.kind !== 'hit' &&
        Math.abs(shot.impactIndex - shots[0].impactIndex) <= 1
    );

    if (!identical) {
        return shots;
    }

    const merged = shots.reduce((best, shot) =>
        shot.impactMeters > best.impactMeters ? shot : best
    );

    merged.merged = true;

    return [merged];
}

function crossSectionModel(weapon, distanceMeters, solutions) {
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

    const shots = crossSectionMergeShots(
        CROSS_SECTION_ARC_ORDER
            .map(arc => {
                const shot = crossSectionShot(weapon, arc, profile);

                if (shot) {
                    shot.tabulated = Boolean(solutions?.[arc]);
                }

                return shot;
            })
            .filter(Boolean)
    );

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

function crossSectionArcLabel(shot) {
    return shot.merged
        ? null
        : CROSS_SECTION_ARC_LABELS[shot.arc];
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

    let marked = false;

    const clauses = [];

    model.shots.forEach(shot => {
        const state = crossSectionShotCaption(shot);

        if (!state) {
            return;
        }

        const labelKey = crossSectionArcLabel(shot);

        if (!labelKey) {
            clauses.push(state);

            return;
        }

        if (!shot.tabulated) {
            marked = true;
        }

        clauses.push(
            `${tr(labelKey)}${shot.tabulated ? '' : '*'}: ${state}`
        );
    });

    if (model.shots.some(shot => !shot.tabulated)) {
        clauses.push(
            `${marked ? '* ' : ''}${tr('crossSectionNoTable')}`
        );
    }

    return clauses.join(' · ');
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
        for (let i = 0; i <= shot.impactIndex; i += 1) {
            if (shot.heights[i] > apex) {
                apex = shot.heights[i];
            }
        }
    });

    const span = Math.max(apex - low, 30);

    return {
        base: low - span * 0.06,
        top: apex + span * 0.12
    };
}

function crossSectionApexIndex(shot) {
    let apex = 0;

    for (let i = 1; i <= shot.impactIndex; i += 1) {
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

function crossSectionTracePath(g, shot, project, upTo) {
    g.beginPath();

    for (let i = 0; i <= upTo; i += 1) {
        const point = project(i, shot.heights[i]);

        if (i === 0) {
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

    model.shots.forEach(shot => {
        const missed = shot.kind !== 'hit';
        const color = crossSectionArcColor(missed);

        g.lineWidth = 1.7;
        g.setLineDash(shot.arc === 'high' ? [5, 4] : []);
        g.strokeStyle = color;

        crossSectionTracePath(g, shot, project, shot.impactIndex);

        g.setLineDash([]);

        const impact = project(
            shot.impactIndex,
            shot.kind === 'blocked' || shot.kind === 'short'
                ? ground[shot.impactIndex]
                : shot.heights[shot.impactIndex]
        );

        g.beginPath();
        g.arc(impact.x, impact.y, 3, 0, Math.PI * 2);
        g.fillStyle = color;
        g.fill();

        const labelKey = crossSectionArcLabel(shot);

        if (!labelKey) {
            return;
        }

        const apex = crossSectionApexIndex(shot);
        const at = project(apex, shot.heights[apex]);

        g.font = '10px system-ui';
        g.textAlign = 'center';
        g.textBaseline = 'bottom';
        g.fillStyle = color;

        g.fillText(
            tr(labelKey),
            Math.min(right - 30, Math.max(left + 30, at.x)),
            at.y - 5
        );
    });
}

function drawCrossSectionScale(g, model, toY, left, right, top, bottom) {
    const zGun = model.profile.ground[0];
    const gunLine = toY(zGun);

    g.setLineDash([2, 4]);
    g.lineWidth = 1;
    g.strokeStyle = 'rgba(210,218,210,.28)';

    g.beginPath();
    g.moveTo(left, gunLine);
    g.lineTo(right, gunLine);
    g.stroke();

    g.setLineDash([]);

    g.font = '10px system-ui';
    g.fillStyle = cssVar('--muted', '#89959e');
    g.textAlign = 'right';
    g.textBaseline = 'middle';

    g.fillText(
        `+${Math.round(model.range.top - zGun)} m`,
        left - 6,
        top + 5
    );

    if (gunLine - top > 18) {
        g.fillText('0 m', left - 6, gunLine);
    }

    g.textBaseline = 'top';
    g.textAlign = 'left';
    g.fillText('0', left, bottom + 4);

    g.textAlign = 'right';

    g.fillText(
        crossSectionRangeLabel(model.profile.distanceMeters),
        right,
        bottom + 4
    );
}

function drawCrossSection(surface, model) {
    const { g, width, height } = surface;

    const left = 58;
    const right = width - 14;
    const top = 14;
    const bottom = height - 18;

    const plotWidth = right - left;
    const plotHeight = bottom - top;

    if (plotWidth <= 0 || plotHeight <= 0) {
        return;
    }

    const ground = model.profile.ground;

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

    drawCrossSectionScale(g, model, toY, left, right, top, bottom);

    g.save();
    g.beginPath();
    g.rect(left, top - 8, plotWidth, plotHeight + 8);
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

    const gun = project(0, ground[0]);
    const target = project(
        ground.length - 1,
        ground[ground.length - 1]
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
}

function crossSectionKey(weapon, distanceMeters, solutions) {
    const arcs = CROSS_SECTION_ARC_ORDER
        .filter(arc => solutions?.[arc])
        .join(',');

    const canvas = $('crossSectionCanvas');

    return [
        S.map,
        weapon.id,
        Math.round(S.origin.x * 100),
        Math.round(S.origin.y * 100),
        Math.round(S.target.x * 100),
        Math.round(S.target.y * 100),
        Math.round(distanceMeters),
        arcs,
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

function renderCrossSection(weapon, distanceMeters, solutions) {
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

    const key = crossSectionKey(weapon, distanceMeters, solutions);

    if (key === CROSS_SECTION_STATE.key) {
        return;
    }

    const model = crossSectionModel(
        weapon,
        distanceMeters,
        solutions
    );

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
