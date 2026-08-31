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

function crossSectionBranch(weaponId, arc) {
    const fit =
        typeof projectileModelArc === 'function'
            ? projectileModelArc(weaponId, arc)
            : null;

    return fit?.branch === 'low' ? 'low' : 'high';
}

function crossSectionLaunch(weaponId, arc, distanceMeters, deltaZMeters) {
    const fit =
        typeof projectileModelArc === 'function'
            ? projectileModelArc(weaponId, arc)
            : null;

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
        crossSectionBranch(weaponId, arc) === 'low'
            ? (vSquared - root) /
                (CROSS_SECTION_GRAVITY * distanceMeters)
            : (vSquared + root) /
                (CROSS_SECTION_GRAVITY * distanceMeters);

    if (!Number.isFinite(tan) || tan <= 0) {
        return null;
    }

    return {
        tan,
        muzzleVelocity
    };
}

function crossSectionShellHeight(launch, xMeters) {
    return (
        xMeters * launch.tan -
        CROSS_SECTION_GRAVITY *
        xMeters *
        xMeters *
        (1 + launch.tan * launch.tan) /
        (2 * launch.muzzleVelocity * launch.muzzleVelocity)
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

function crossSectionShot(weaponId, arc, profile) {
    const launch = crossSectionLaunch(
        weaponId,
        arc,
        profile.distanceMeters,
        profile.ground[profile.ground.length - 1] - profile.ground[0]
    );

    if (!launch) {
        return null;
    }

    const zGun = profile.ground[0];
    const heights = new Float64Array(CROSS_SECTION_SAMPLES);

    const firstIndex = crossSectionFirstIndex(profile);
    const crestIndex = crossSectionCrestIndex(profile, firstIndex);

    let blockedIndex = -1;

    for (let i = 0; i < CROSS_SECTION_SAMPLES; i += 1) {
        const x = i * profile.stepMeters;

        heights[i] = zGun + crossSectionShellHeight(launch, x);

        if (i < firstIndex || i === CROSS_SECTION_SAMPLES - 1) {
            continue;
        }

        if (
            blockedIndex < 0 &&
            heights[i] < profile.ground[i]
        ) {
            blockedIndex = i;
        }
    }

    return {
        arc,
        heights,
        blockedIndex,
        crestIndex,
        clearance:
            heights[crestIndex] - profile.ground[crestIndex],
        impactIndex:
            blockedIndex < 0
                ? CROSS_SECTION_SAMPLES - 1
                : blockedIndex,
        impactMeters:
            blockedIndex < 0
                ? profile.distanceMeters
                : blockedIndex * profile.stepMeters
    };
}

function crossSectionModel(weapon, distanceMeters, solutions) {
    if (typeof ensureHeightfieldLoaded === 'function') {
        ensureHeightfieldLoaded(S.map);
    }

    const field =
        typeof cachedHeightfield === 'function'
            ? cachedHeightfield(S.map)
            : null;

    if (!field || !(distanceMeters > 0)) {
        return {
            profile: null,
            shots: []
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
            shots: []
        };
    }

    const shots = CROSS_SECTION_ARC_ORDER
        .filter(arc => solutions?.[arc])
        .map(arc =>
            crossSectionShot(
                weapon.id,
                arc,
                profile
            )
        )
        .filter(Boolean);

    return {
        profile,
        crestIndex: crossSectionCrestIndex(
            profile,
            crossSectionFirstIndex(profile)
        ),
        shots
    };
}

function crossSectionCaption(model) {
    if (!model.profile) {
        return tr('crossSectionNoTerrain');
    }

    if (!model.shots.length) {
        return tr('noFiringSolution');
    }

    return model.shots
        .map(shot => {
            const state =
                shot.blockedIndex < 0
                    ? tr('crossSectionClears').replace(
                        '{metres}',
                        Math.max(0, Math.round(shot.clearance))
                    )
                    : tr('crossSectionBlocked').replace(
                        '{metres}',
                        Math.round(shot.impactMeters)
                    );

            const labelKey = CROSS_SECTION_ARC_LABELS[shot.arc];

            return labelKey
                ? `${tr(labelKey)}: ${state}`
                : state;
        })
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
        for (let i = 0; i <= shot.impactIndex; i += 1) {
            if (shot.heights[i] > apex) {
                apex = shot.heights[i];
            }
        }
    });

    const span = Math.max(high - low, 20);

    const top = Math.min(
        apex + span * 0.1,
        high + Math.max(span * 1.6, 60)
    );

    return {
        base: low - span * 0.1,
        top: Math.max(top, high + span * 0.1)
    };
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

function drawCrossSection(surface, model) {
    const { g, width, height } = surface;

    const left = 8;
    const right = width - 8;
    const top = 6;
    const bottom = height - 6;

    const plotWidth = right - left;
    const plotHeight = bottom - top;

    if (plotWidth <= 0 || plotHeight <= 0) {
        return;
    }

    const ground = model.profile.ground;
    const range = crossSectionVerticalRange(model);

    const project = (index, z) => ({
        x: left + (index / (ground.length - 1)) * plotWidth,
        y:
            top +
            (range.top - z) /
            (range.top - range.base) *
            plotHeight
    });

    g.save();
    g.beginPath();
    g.rect(left - 4, top - 2, plotWidth + 8, plotHeight + 4);
    g.clip();

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

    g.lineWidth = 1.2;
    g.strokeStyle = 'rgba(196,206,196,.8)';
    g.stroke();

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

    model.shots.forEach(shot => {
        const blocked = shot.blockedIndex >= 0;

        g.lineWidth = 1.5;
        g.setLineDash(shot.arc === 'high' ? [4, 3] : []);
        g.strokeStyle = blocked
            ? 'rgba(216,102,102,.95)'
            : 'rgba(130,197,150,.95)';

        crossSectionTracePath(g, shot, project, shot.impactIndex);

        g.setLineDash([]);

        const impact = project(
            shot.impactIndex,
            blocked
                ? ground[shot.impactIndex]
                : shot.heights[shot.impactIndex]
        );

        g.beginPath();
        g.arc(impact.x, impact.y, 2.6, 0, Math.PI * 2);
        g.fillStyle = blocked
            ? 'rgba(216,102,102,.95)'
            : 'rgba(130,197,150,.95)';
        g.fill();
    });

    const gun = project(0, ground[0]);
    const target = project(
        ground.length - 1,
        ground[ground.length - 1]
    );

    g.lineWidth = 1.2;
    g.strokeStyle = 'rgba(226,232,226,.75)';

    g.beginPath();
    g.moveTo(gun.x, gun.y - 6);
    g.lineTo(gun.x, gun.y + 2);
    g.moveTo(target.x, target.y - 8);
    g.lineTo(target.x, target.y + 2);
    g.moveTo(target.x - 4, target.y - 3);
    g.lineTo(target.x + 4, target.y - 3);
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

    setText(
        $('crossSectionCaption'),
        crossSectionCaption(model)
    );

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
