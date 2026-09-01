/*
 * Unified reachability: the correction layer clamps into the grid's
 * distance axis instead of refusing a table-covered shot.
 *
 *   PORT=8123 npm run dev        # in one shell
 *   node test/reachability.mjs   # in another
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

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

const edge = await page.evaluate(async () => {
    ensureHeightfieldLoaded('bakurani');

    for (let i = 0; i < 40 && !cachedHeightfield('bakurani'); i += 1) {
        await new Promise(r => setTimeout(r, 250));
    }

    const origin = { x: 30, y: 60 };
    const target = { x: 30 + 26.2, y: 60 };
    const weapon = WEAPONS.spg;

    getTerrainBallisticSolutions({
        weapon,
        distanceMeters: 2620,
        solutions: getWeaponElevationSolutions(weapon, 2620),
        mapId: 'bakurani',
        origin,
        target,
        prime: true
    });

    for (let i = 0; i < 40; i += 1) {
        const again = getTerrainBallisticSolutions({
            weapon,
            distanceMeters: 2620,
            solutions: getWeaponElevationSolutions(weapon, 2620),
            mapId: 'bakurani',
            origin,
            target,
            prime: false
        });

        if (again.meta && !again.meta.pendingTerrain) {
            return again.meta;
        }

        await new Promise(r => setTimeout(r, 250));
    }

    return null;
});

check('2620 m sits past the grid axis yet is corrected via the clamp', Boolean(edge) && edge.arcsCorrected.includes('low'), JSON.stringify(edge));
check('no page errors', errors.length === 0, errors.join('; '));

await browser.close();
process.exit(state.fail ? 1 : 0);
