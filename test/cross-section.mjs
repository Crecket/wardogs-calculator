import { launch, counter } from './helpers.mjs';

const PORT = process.env.PORT || '8123';
const URL = `http://127.0.0.1:${PORT}/`;
const state = counter();
const check = state.check;

const browser = await launch();
const context = await browser.newContext({
    viewport: { width: 1600, height: 950 }
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

const caption = () => page.evaluate(() => {
    const el = document.getElementById('crossSectionCaption');

    return el.hidden ? '' : el.textContent;
});

const shots = () => page.evaluate(() => {
    const weapon = WEAPONS[S.weapon];

    const distance = worldDistanceToMeters(
        Math.hypot(S.target.x - S.origin.x, S.target.y - S.origin.y)
    );

    const model = crossSectionModel(weapon, distance);

    return model.shots.map(shot => `${shot.arc}:${shot.kind}`);
});

const aim = (weapon, gun, bearing, metres) => page.evaluate(
    ({ weapon, gun, bearing, metres }) => {
        S.weapon = weapon;
        S.origin.x = gun.x;
        S.origin.y = gun.y;

        const angle = bearing * Math.PI / 180;

        S.target.x = gun.x + Math.cos(angle) * metersToWorldDistance(metres);
        S.target.y = gun.y + Math.sin(angle) * metersToWorldDistance(metres);

        clamp(S.target);
        result();

        return worldDistanceToMeters(
            Math.hypot(S.target.x - S.origin.x, S.target.y - S.origin.y)
        );
    },
    { weapon, gun, bearing, metres }
);

check(
    'the panel starts hidden',
    await page.evaluate(() => document.getElementById('crossSection').hidden)
);

const ready = await page.evaluate(async () => {
    S.map = 'bakurani';
    S.weapon = 'spg';

    ensureHeightfieldLoaded('bakurani');

    for (let i = 0; i < 40 && !cachedHeightfield('bakurani'); i += 1) {
        await new Promise(r => setTimeout(r, 250));
    }

    setMapLayerVisible('crossSection', true);

    return Boolean(cachedHeightfield('bakurani')) && Boolean(PROJECTILE_MODEL);
});

check('the heightfield and the projectile model are loaded', ready);

check(
    'enabling the layer shows the panel',
    await page.evaluate(() => !document.getElementById('crossSection').hidden)
);

const box = await page.evaluate(() => {
    const panel = document.getElementById('crossSection').getBoundingClientRect();
    const map = document.querySelector('.map').getBoundingClientRect();
    const legend = document.querySelector('.legend').getBoundingClientRect();
    const header = document.querySelector('.cross-section-header');
    const canvas = document.getElementById('crossSectionCanvas');

    return {
        fromLeft: panel.left - map.left,
        fromBottom: map.bottom - panel.bottom,
        width: panel.width,
        header: header.getBoundingClientRect().height,
        chart: canvas.getBoundingClientRect().height,
        overlapsLegend: !(
            panel.bottom <= legend.top ||
            panel.top >= legend.bottom
        )
    };
});

check(
    'the panel is anchored to the bottom left of the map',
    box.fromLeft < 16 && box.fromBottom > 0 && box.fromBottom < 120
);

check('the panel does not cover the legend', !box.overlapsLegend);

check(
    'the chart gets the space, not the header',
    box.width >= 360 && box.chart >= 200 && box.header <= 20,
    JSON.stringify(box)
);

const valley = { x: 29.83, y: 45.34 };

await aim('spg', valley, 255, 1800);

check(
    'a clear shot says nothing',
    (await caption()) === '',
    await caption()
);

check(
    'a clear shot still draws both arcs',
    (await shots()).join(',') === 'low:hit,high:hit',
    (await shots()).join(',')
);

await aim('spg', valley, 120, 1800);

const masked = await caption();

check(
    'a masked low arc reports its impact and shortfall',
    /^Low arc: hits the ridge at \d+ m, \d+ m short$/.test(masked),
    masked
);

check(
    'the clear high arc is drawn but not captioned',
    (await shots()).join(',') === 'low:blocked,high:hit' &&
        !/High arc/.test(masked),
    (await shots()).join(',')
);

await aim('spg', valley, 0, 4200);

const short = await caption();

check(
    'an unreachable target reports where the round lands',
    /falls short at \d+ m, \d+ m short/.test(short),
    short
);

check(
    'the low arc is drawn even when it cannot reach',
    (await shots()).some(entry => entry.startsWith('low:')),
    (await shots()).join(',')
);

check(
    'arcs that collapse onto one trajectory share a single clause',
    /^Low arc \/ High arc: falls short at \d+ m, \d+ m short$/.test(short),
    short
);

const surfaces = () => page.evaluate(() => ({
    mil: document.getElementById('mil').textContent,
    milDetail: document.getElementById('milAlt').textContent,
    status: document.getElementById('rangeStatus').textContent,
    caption: document.getElementById('crossSectionCaption').hidden
        ? ''
        : document.getElementById('crossSectionCaption').textContent
}));

const beyondTable = await page.evaluate(() => {
    const gun = { x: 51.67, y: 113.74 };
    const ring = terrainRangeRing({ position: gun, weapon: 'spg' }, 'bakurani');

    let best = { bearing: 0, radius: 0 };

    for (let b = 0; b < 360; b += 1) {
        if (ring.radii[b] > best.radius) {
            best = { bearing: b, radius: ring.radii[b] };
        }
    }

    const metres = (ring.maxRangeMeters + best.radius) / 2;
    const angle = best.bearing * Math.PI / 180;

    S.weapon = 'spg';
    S.origin.x = gun.x;
    S.origin.y = gun.y;
    S.target.x = gun.x + Math.cos(angle) * metersToWorldDistance(metres);
    S.target.y = gun.y + Math.sin(angle) * metersToWorldDistance(metres);

    clamp(S.target);
    result();

    const distance = worldDistanceToMeters(
        Math.hypot(S.target.x - S.origin.x, S.target.y - S.origin.y)
    );

    return {
        distance,
        flatMax: ring.maxRangeMeters,
        insideRing: distance <= best.radius,
        mil: document.getElementById('mil').textContent,
        caption: document.getElementById('crossSectionCaption').textContent
    };
});

check(
    'the test target is past the flat max but inside the terrain ring',
    beyondTable.distance > beyondTable.flatMax && beyondTable.insideRing,
    JSON.stringify(beyondTable)
);

const extended = await surfaces();

check(
    'a target past the table gets a modelled MIL, not a dash',
    /^≈ \d+ \/ ≈ \d+$/.test(extended.mil),
    extended.mil
);

check(
    'the modelled MIL is marked as modelled',
    /modelled, beyond the firing table/.test(extended.milDetail),
    extended.milDetail
);

check(
    'the range status agrees with the MIL card',
    extended.status === 'In range (modelled)',
    extended.status
);

check(
    'the cross-section stays silent when the shot works',
    extended.caption === '' && (await shots()).length === 2,
    `${extended.caption} | ${(await shots()).join(',')}`
);

await aim('spg', valley, 0, 4200);

const unreachable = await surfaces();

check(
    'an unreachable target reports no solution on every surface',
    unreachable.mil === '—' &&
        unreachable.status === 'OUT OF RANGE' &&
        /falls short/.test(unreachable.caption),
    JSON.stringify(unreachable)
);

const painted = await page.evaluate(() => {
    const canvas = document.getElementById('crossSectionCanvas');
    const pixels = canvas
        .getContext('2d')
        .getImageData(0, 0, canvas.width, canvas.height)
        .data;

    let opaque = 0;

    for (let i = 3; i < pixels.length; i += 4) {
        if (pixels[i] > 8) {
            opaque += 1;
        }
    }

    return opaque / (pixels.length / 4);
});

check('the chart is painted', painted > 0.05, String(painted));

const memo = await page.evaluate(() => {
    const before = CROSS_SECTION_STATE.key;

    result();
    result();

    const stable = CROSS_SECTION_STATE.key === before;

    S.target.x += 0.05;
    result();

    return {
        stable,
        changed: CROSS_SECTION_STATE.key !== before
    };
});

check('an unchanged solution is not redrawn', memo.stable);
check('a moved target is redrawn', memo.changed);

const collapsed = await page.evaluate(() => {
    document.getElementById('crossSectionToggle').click();

    const state = {
        collapsed: document.getElementById('crossSection').dataset.collapsed,
        chartHeight: document.getElementById('crossSectionCanvas').clientHeight,
        hidden: document.getElementById('crossSection').hidden
    };

    document.getElementById('crossSectionToggle').click();

    return {
        state,
        expanded: document.getElementById('crossSection').dataset.collapsed
    };
});

check(
    'collapsing hides the chart and keeps the panel',
    collapsed.state.collapsed === 'true' &&
        collapsed.state.chartHeight === 0 &&
        !collapsed.state.hidden
);

check('expanding brings the chart back', collapsed.expanded === 'false');

const unsupported = await page.evaluate(() => {
    S.map = 'custom';
    result();

    return document.getElementById('crossSectionCaption').textContent;
});

check(
    'a map without a heightfield says so',
    unsupported === 'No terrain profile for this map',
    unsupported
);

const hidden = await page.evaluate(() => {
    setMapLayerVisible('crossSection', false);
    result();

    return document.getElementById('crossSection').hidden;
});

check('hiding the layer hides the panel', hidden);

check('no page errors', errors.length === 0, errors.join(' | '));

console.log(`\n${state.pass} passed, ${state.fail} failed`);

await browser.close();
process.exit(state.fail ? 1 : 0);
