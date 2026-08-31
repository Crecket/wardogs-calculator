/*
 * Per-target reachability badges.
 *
 *   PORT=8123 npm run dev        # in one shell
 *   node test/reach-badges.mjs   # in another
 */
import { launch, counter } from './helpers.mjs';

const PORT = process.env.PORT || '8123';
const URL = `http://127.0.0.1:${PORT}/`;
const state = counter();
const check = state.check;

const browser = await launch();
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto(URL, { waitUntil: 'load' });
await page.waitForTimeout(1200);

await page.evaluate(async () => {
    S.map = 'bakurani';
    S.weapon = 'spg';

    ensureHeightfieldLoaded('bakurani');

    for (let i = 0; i < 40 && !cachedHeightfield('bakurani'); i += 1) {
        await new Promise(r => setTimeout(r, 250));
    }
});

/*
 * The three fixtures are picked with the shipped solvers, so the test
 * asserts what the badge says about a case the ring and the dead-ground
 * pass already agree on, not a second opinion about the terrain.
 */
const fixture = await page.evaluate(() => {
    const gun = { position: { x: 78.5, y: 74.5 }, weapon: 'spg' };

    S.origin = gun.position;
    S.weapon = 'spg';

    const ring = terrainRangeRing(gun, 'bakurani');
    const dead = terrainDeadGround(gun, 'bakurani');

    const at = (bearing, metres) => {
        const angle = bearing * 2 * Math.PI / ring.radii.length;

        return {
            x: gun.position.x + Math.cos(angle) * metres / 100,
            y: gun.position.y + Math.sin(angle) * metres / 100
        };
    };

    let masked = null;
    let reachable = null;

    for (let b = 0; b < ring.radii.length && !masked; b += 1) {
        const intervals = dead.bearings[b];

        if (intervals.length) {
            masked = at(b, (intervals[0] + intervals[1]) / 2);
        }
    }

    for (let b = 0; b < ring.radii.length && !reachable; b += 1) {
        if (!dead.bearings[b].length) {
            reachable = at(b, ring.radii[b] * 0.7);
        }
    }

    const out = at(0, ring.radii[0] * 1.4);
    const close = at(0, Math.max(1, (ring.minRadii ? ring.minRadii[0] : 0) / 2));

    const points = { reachable, masked, out, close };

    savedTargets.length = 0;

    for (const [name, point] of Object.entries(points)) {
        savedTargets.push({
            id: `fixture-${name}`,
            name,
            x: point.x,
            y: point.y,
            saveArtillery: false,
            origin: { x: gun.position.x, y: gun.position.y }
        });
    }

    renderSavedTargets();

    return { minRange: ring.minRadii ? ring.minRadii[0] : 0 };
});

await page.waitForTimeout(1500);

const badges = await page.evaluate(() =>
    Object.fromEntries(
        Array.from(
            document.querySelectorAll('#savedTargetsList .saved-target')
        ).map(item => [
            item.querySelector('.saved-target-name').textContent,
            Array.from(
                item.querySelectorAll('.saved-target-reach-badge')
            ).map(badge => ({
                reach: badge.dataset.reach,
                glyph: badge.firstElementChild.textContent,
                title: badge.title,
                label: badge.getAttribute('aria-label')
            }))
        ])
    )
);

check(
    'a target every gun can reach reads all',
    badges.reachable?.[0]?.reach === 'all',
    JSON.stringify(badges.reachable)
);

check(
    'a target beyond the terrain ring reads none',
    badges.out?.[0]?.reach === 'none',
    JSON.stringify(badges.out)
);

check(
    'a target masked from the only gun also reads none',
    badges.masked?.[0]?.reach === 'none',
    JSON.stringify(badges.masked)
);

check(
    'reachable and unreachable do not share a glyph',
    badges.reachable?.[0]?.glyph !== badges.out?.[0]?.glyph,
    JSON.stringify([badges.reachable?.[0]?.glyph, badges.out?.[0]?.glyph])
);

check(
    'the tooltip breaks the verdict down per gun',
    /Gun 1/.test(badges.masked?.[0]?.title || '') &&
    /Masked by terrain/.test(badges.masked?.[0]?.title || '') &&
    badges.masked?.[0]?.label === badges.masked?.[0]?.title,
    badges.masked?.[0]?.title
);

/* --- one badge per target, counting the guns that can reach --- */

const summary = await page.evaluate(async () => {
    while (S.guns.length < 4) {
        addGun();
    }

    S.guns[1].position.x += 3;
    S.guns[2].position.y += 3;
    S.guns[3].position.x -= 3;

    renderSavedTargets();

    await new Promise(r => setTimeout(r, 2500));

    return Object.fromEntries(
        Array.from(
            document.querySelectorAll('#savedTargetsList .saved-target')
        ).map(item => [
            item.querySelector('.saved-target-name').textContent,
            {
                guns: S.guns.length,
                badges: item.querySelectorAll('.saved-target-reach-badge').length,
                reach: item.querySelector('.saved-target-reach-badge')?.dataset.reach,
                count: item.querySelector('.reach-count')?.textContent,
                lines: (item.querySelector('.saved-target-reach-badge')?.title || '')
                    .split('\n').length
            }
        ])
    );
});

check(
    'four guns still leave one badge on the row',
    Object.values(summary).every(row => row.badges === 1),
    JSON.stringify(summary)
);

check(
    'the badge counts the guns that can reach out of the total',
    Object.values(summary).every(
        row => /^\d+\/4$/.test(row.count || '')
    ),
    JSON.stringify(summary)
);

check(
    'the count agrees with the verdict',
    Object.values(summary).every(row => {
        const [reachable, total] = (row.count || '').split('/').map(Number);

        return row.reach === 'all'
            ? reachable === total
            : row.reach === 'none'
                ? reachable === 0
                : reachable > 0 && reachable < total;
    }),
    JSON.stringify(summary)
);

check(
    'the tooltip lists every gun',
    Object.values(summary).every(row => row.lines === row.guns + 1),
    JSON.stringify(summary)
);

/* --- the badge tracks the gun list, whatever changes --- */

const badgeRow = () => page.evaluate(() => {
    const row = document.querySelector('#savedTargetsList .saved-target');

    return {
        hosts: row.querySelectorAll('.saved-target-reach').length,
        badges: row.querySelectorAll('.saved-target-reach-badge').length,
        count: row.querySelector('.reach-count')?.textContent
    };
});

await page.evaluate(() => {
    while (S.guns.length > 1) {
        removeGun(S.guns[S.guns.length - 1].id);
    }
});

await page.waitForTimeout(900);

const single = await badgeRow();

check(
    'one gun drops the count and leaves the verdict',
    single.badges === 1 && single.count === '',
    JSON.stringify(single)
);

check('one badge host per row', single.hosts === 1, JSON.stringify(single));

await page.evaluate(() => {
    addGun();
    addGun();
});

await page.waitForTimeout(1500);

const three = await badgeRow();

check(
    'adding guns widens the count instead of adding badges',
    three.badges === 1 && /^\d+\/3$/.test(three.count || ''),
    JSON.stringify(three)
);

check('still one badge host per row', three.hosts === 1, JSON.stringify(three));

/* --- nodes are reused, not rebuilt --- */

const reuse = await page.evaluate(() => {
    const row = document.querySelector('#savedTargetsList .saved-target');
    const before = row.querySelector('.saved-target-reach-badge');

    for (let i = 0; i < 50; i += 1) {
        refreshSavedTargetHighlight();
    }

    return before === row.querySelector('.saved-target-reach-badge');
});

check('a repeated refresh keeps the same badge nodes', reuse);

/* --- the worst case, measured --- */

const timing = await page.evaluate(async () => {
    while (S.guns.length < 8) {
        addGun();
    }

    S.guns.forEach((gun, index) => {
        gun.position.x = 70 + index * 1.5;
        gun.position.y = 70 + (index % 3) * 1.5;
        gun.weapon = 'spg';
    });

    const first = savedTargets[0];

    savedTargets.length = 0;

    for (let i = 0; i < 500; i += 1) {
        savedTargets.push({
            id: `bulk-${i}`,
            name: `bulk ${i}`,
            x: first.x + (i % 20) * 0.2,
            y: first.y + Math.floor(i / 20) * 0.2,
            saveArtillery: false,
            origin: { x: S.origin.x, y: S.origin.y }
        });
    }

    renderSavedTargets();

    const solveStart = performance.now();

    S.guns.forEach(gun => {
        terrainDeadGround(gun, 'bakurani');
    });

    const solve = performance.now() - solveStart;

    const buildStart = performance.now();

    renderSavedTargetReachBadges(true);

    const build = performance.now() - buildStart;

    const start = performance.now();

    renderSavedTargetReachBadges(true);

    const warm = performance.now() - start;

    const skipStart = performance.now();

    for (let i = 0; i < 100; i += 1) {
        renderSavedTargetReachBadges(false);
    }

    const skip = (performance.now() - skipStart) / 100;

    const row = document.querySelector('#savedTargetsList .saved-target');

    return {
        solve,
        build,
        warm,
        skip,
        targets: savedTargets.length,
        guns: S.guns.length,
        badges: row.querySelectorAll('.saved-target-reach-badge').length
    };
});

console.log(
    `\n  ${timing.guns} guns x ${timing.targets} targets:` +
    ` cold solve ${timing.solve.toFixed(1)} ms,` +
    ` first badge pass ${timing.build.toFixed(1)} ms,` +
    ` repeat badge pass ${timing.warm.toFixed(1)} ms,` +
    ` unchanged pass ${timing.skip.toFixed(3)} ms\n`
);

check(
    'a full badge pass over the worst case stays under 40 ms',
    timing.warm < 40,
    `${timing.warm.toFixed(1)} ms`
);

check(
    'an unchanged pass costs next to nothing',
    timing.skip < 0.5,
    `${timing.skip.toFixed(3)} ms`
);

/* --- no terrain data, no badge --- */

const custom = await page.evaluate(async () => {
    S.map = 'custom';

    renderSavedTargets();

    await new Promise(r => setTimeout(r, 600));

    return document.querySelectorAll(
        '#savedTargetsList .saved-target-reach-badge'
    ).length;
});

check('a map without a heightfield shows no badge', custom === 0, String(custom));

check(
    'no page errors',
    errors.filter(e => !/maps\/tiles/.test(e)).length === 0,
    errors.join('; ')
);

console.log(`\n${state.pass} passed, ${state.fail} failed`);
await browser.close();
process.exit(state.fail ? 1 : 0);
