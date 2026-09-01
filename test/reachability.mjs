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

const PROBE_DISTANCE = 2620;

const result = await page.evaluate(async probeDistance => {
    ensureHeightfieldLoaded('bakurani');

    for (let i = 0; i < 40 && !cachedHeightfield('bakurani'); i += 1) {
        await new Promise(r => setTimeout(r, 250));
    }

    const grid = await fetch('data/ballistics/height-correction.json')
        .then(r => r.json());

    const lastAxisDistance =
        grid.weapons.spg.low.distancesMeters.at(-1);

    const origin = { x: 30, y: 60 };
    const target = { x: 30 + 26.2, y: 60 };
    const weapon = WEAPONS.spg;

    getTerrainBallisticSolutions({
        weapon,
        distanceMeters: probeDistance,
        solutions: getWeaponElevationSolutions(weapon, probeDistance),
        mapId: 'bakurani',
        origin,
        target,
        prime: true
    });

    let edge = null;

    for (let i = 0; i < 40; i += 1) {
        const again = getTerrainBallisticSolutions({
            weapon,
            distanceMeters: probeDistance,
            solutions: getWeaponElevationSolutions(weapon, probeDistance),
            mapId: 'bakurani',
            origin,
            target,
            prime: false
        });

        if (again.meta && !again.meta.pendingTerrain) {
            edge = again.meta;
            break;
        }

        await new Promise(r => setTimeout(r, 250));
    }

    return { lastAxisDistance, edge };
});

const { lastAxisDistance, edge } = result;

check(
    `probe distance ${PROBE_DISTANCE} m sits past spg.low's grid axis end`,
    Number.isFinite(lastAxisDistance) && PROBE_DISTANCE > lastAxisDistance,
    `lastAxisDistance=${lastAxisDistance}`
);

check(
    'the probe resolved a ΔZ instead of timing out pending',
    Boolean(edge),
    JSON.stringify(edge)
);

check(
    'the probe sits on the negative side of the ΔZ column, where the grid cell is finite',
    Number.isFinite(edge?.correctionDeltaZ) && edge.correctionDeltaZ < 0,
    `correctionDeltaZ=${edge?.correctionDeltaZ}`
);

check(
    'a correction was actually applied to the solutions',
    edge?.applied === true,
    JSON.stringify(edge)
);

check(
    '2620 m sits past the grid axis yet is corrected via the clamp',
    Boolean(edge) && Array.isArray(edge.arcsCorrected) && edge.arcsCorrected.includes('low'),
    JSON.stringify(edge)
);

check('no page errors', errors.length === 0, errors.join('; '));

await browser.close();
process.exit(state.fail ? 1 : 0);
