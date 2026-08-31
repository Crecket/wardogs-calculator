import { launch, counter } from './helpers.mjs';

const PORT = process.env.PORT || '8123';
const URL = `http://127.0.0.1:${PORT}/`;
const state = counter();
const check = state.check;

const browser = await launch();
const context = await browser.newContext({
    viewport: { width: 1440, height: 900 }
});
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

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

    return {
        fromLeft: panel.left - map.left,
        fromBottom: map.bottom - panel.bottom,
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

const masked = await page.evaluate(() => {
    const gun = { x: 29.83, y: 45.34 };

    S.origin.x = gun.x;
    S.origin.y = gun.y;

    const solved = terrainDeadGround(
        { weapon: 'spg', position: gun },
        'bakurani'
    );

    const rows = [];

    for (let b = 0; b < 360; b += 5) {
        const intervals = solved.bearings[b];
        const angle = b * Math.PI / 180;

        for (let i = 0; i < intervals.length; i += 2) {
            const metres = (intervals[i] + intervals[i + 1]) / 2;

            if (metres < 300 || metres > 2400) {
                continue;
            }

            S.target.x = gun.x + Math.cos(angle) * metersToWorldDistance(metres);
            S.target.y = gun.y + Math.sin(angle) * metersToWorldDistance(metres);

            clamp(S.target);
            result();

            rows.push(
                document.getElementById('crossSectionCaption').textContent
            );

            break;
        }
    }

    return rows;
});

const lowArcRows = masked.filter(row => row.startsWith('Low arc'));

check(
    'dead ground reads as a blocked low arc',
    lowArcRows.length > 5 &&
        lowArcRows.every(row => row.startsWith('Low arc: blocked')),
    lowArcRows.filter(row => !row.startsWith('Low arc: blocked'))[0] ?? ''
);

const sweep = await page.evaluate(() => {
    const gun = { x: 29.83, y: 45.34 };

    S.origin.x = gun.x;
    S.origin.y = gun.y;

    const rows = [];

    for (let b = 0; b < 360; b += 15) {
        const angle = b * Math.PI / 180;
        const r = metersToWorldDistance(1800);

        S.target.x = gun.x + Math.cos(angle) * r;
        S.target.y = gun.y + Math.sin(angle) * r;

        clamp(S.target);
        result();

        rows.push(
            document.getElementById('crossSectionCaption').textContent
        );
    }

    return rows;
});

check(
    'some bearings clear the ridge',
    sweep.some(row => /clears the ridge by \d+ m/.test(row))
);

check(
    'some bearings are blocked',
    sweep.some(row => /blocked at \d+ m/.test(row))
);

check(
    'both arcs are reported when both have a solution',
    sweep.some(row => /Low arc/.test(row) && /High arc/.test(row))
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
    'an unsupported map reports no terrain profile',
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
