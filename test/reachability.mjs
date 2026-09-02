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
}, PROBE_DISTANCE);

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

const scenarios = await page.evaluate(() => {
    const weapon = WEAPONS.spg;
    const gun = { x: 51.67, y: 113.74 };
    const at = metres => ({ x: gun.x + metres / getCoordinateMetersPerUnit(), y: gun.y });

    const near = assessShot(weapon, gun, at(917), 'bakurani');
    const far = assessShot(weapon, gun, at(2700), 'bakurani');
    const mortarShot = assessShot(WEAPONS.mortar, gun, at(690), 'bakurani');

    const mortarPure = mortarShot.state === 'ready'
        ? assessArc(WEAPONS.mortar, 'single', mortarShot.distanceMeters, mortarShot.deltaZ)
        : null;

    const farLowPure = far.state === 'ready'
        ? assessArc(weapon, 'low', far.distanceMeters, far.deltaZ)
        : null;

    const farHighPure = far.state === 'ready'
        ? assessArc(weapon, 'high', far.distanceMeters, far.deltaZ)
        : null;

    const ceil2620Low = assessArc(weapon, 'low', 2620, 0);
    const ceil2620High = assessArc(weapon, 'high', 2620, 0);

    return {
        nearState: near.state,
        nearLow: near.arcs.low.status,
        nearHigh: near.arcs.high.status,
        nearVerdict: near.verdict,
        nearHighTableRow: near.arcs.high.tableRow,
        deltaZFinite: Number.isFinite(near.deltaZ),
        farState: far.state,
        farLowStatus: far.state === 'ready' ? far.arcs.low.status : null,
        farHighStatus: far.state === 'ready' ? far.arcs.high.status : null,
        farLowPureStatus: farLowPure ? farLowPure.status : null,
        farHighPureStatus: farHighPure ? farHighPure.status : null,
        mortarWired: mortarPure !== null && mortarShot.arcs.single.status === mortarPure.status,
        pure: {
            near917Low: assessArc(weapon, 'low', 917, 0).status,
            near917High: assessArc(weapon, 'high', 917, 0).status,
            mortar690: assessArc(WEAPONS.mortar, 'single', 690, 0).status,
            ceil2620LowStatus: ceil2620Low.status,
            ceil2620LowCapped: Boolean(ceil2620Low.ceilingCapped),
            ceil2620HighStatus: ceil2620High.status,
            ceil2620HighCapped: Boolean(ceil2620High.ceilingCapped),
            tooClose800NegHigh: assessArc(weapon, 'high', 800, -200).status,
            hit800PosHigh: assessArc(weapon, 'high', 800, 100).status,
            dangerous2600Low: assessArc(weapon, 'low', 2600, 200).status,
            dangerous2600High: assessArc(weapon, 'high', 2600, 200).status
        }
    };
});

check('assessShot resolves on live Bakurani terrain', scenarios.nearState === 'ready' && scenarios.deltaZFinite, JSON.stringify(scenarios));
check('917 m: low arc refused, high arc live', scenarios.nearLow === 'tooClose' && scenarios.nearHigh === 'hit', JSON.stringify(scenarios));
check('assessShot wires the same verdict assessArc computes at the sampled deltaZ', scenarios.mortarWired === true, JSON.stringify(scenarios));

check(
    '2700 m: assessShot resolves, and its per-arc verdicts match assessArc computed independently at the same sampled distance and deltaZ',
    scenarios.farState === 'ready' &&
        scenarios.farLowStatus === scenarios.farLowPureStatus &&
        scenarios.farHighStatus === scenarios.farHighPureStatus,
    JSON.stringify(scenarios)
);

check(
    'SPG @ 917 m ΔZ 0: low arc tooClose (917 < 1181), high arc hit — §4.2 worked verdict',
    scenarios.pure.near917Low === 'tooClose' && scenarios.pure.near917High === 'hit',
    JSON.stringify(scenarios.pure)
);

check(
    'Mortar @ 690 m ΔZ 0: tooFar (690 > 684)',
    scenarios.pure.mortar690 === 'tooFar',
    scenarios.pure.mortar690
);

check(
    'SPG @ 2620 m ΔZ 0: both arcs hit, low arc ceiling-capped at its 2612.8 m vacuum ceiling',
    scenarios.pure.ceil2620LowStatus === 'hit' &&
        scenarios.pure.ceil2620LowCapped === true &&
        scenarios.pure.ceil2620HighStatus === 'hit' &&
        scenarios.pure.ceil2620HighCapped === false,
    JSON.stringify(scenarios.pure)
);

check(
    'SPG @ 800 m high arc: ΔZ -200 is tooClose (anchored min ≈ 810 m), ΔZ +100 is hit (anchored min ≈ 764 m)',
    scenarios.pure.tooClose800NegHigh === 'tooClose' && scenarios.pure.hit800PosHigh === 'hit',
    JSON.stringify({ neg200: scenarios.pure.tooClose800NegHigh, pos100: scenarios.pure.hit800PosHigh })
);

check(
    "SPG @ 2600 m ΔZ +200: both arcs tooFar (anchored max ≈ 2421 m) — the audit's most dangerous row",
    scenarios.pure.dangerous2600Low === 'tooFar' && scenarios.pure.dangerous2600High === 'tooFar',
    JSON.stringify({ low: scenarios.pure.dangerous2600Low, high: scenarios.pure.dangerous2600High })
);

const RANGE_STATUS_TEXT = {
    reachMasked: 'Masked by terrain',
    reachTooClose: 'Too close — inside minimum range',
    outRange: 'OUT OF RANGE',
    inRange: 'In range',
    inRangeModelled: 'In range (modelled)'
};

function expectedRangeStatusText(verdict, tableRow) {
    if (verdict === 'masked') {
        return RANGE_STATUS_TEXT.reachMasked;
    }

    if (verdict === 'tooClose') {
        return RANGE_STATUS_TEXT.reachTooClose;
    }

    if (verdict === 'tooFar' || verdict === 'unreachable') {
        return RANGE_STATUS_TEXT.outRange;
    }

    if (verdict === 'hit') {
        return tableRow ? RANGE_STATUS_TEXT.inRange : RANGE_STATUS_TEXT.inRangeModelled;
    }

    return RANGE_STATUS_TEXT.outRange;
}

const expectedPanelStatus = expectedRangeStatusText(scenarios.nearVerdict, scenarios.nearHighTableRow);

const panel = await page.evaluate(() => {
    S.weapon = 'spg';
    S.origin = { x: 51.67, y: 113.74 };
    S.target = { x: 51.67 + 9.17, y: 113.74 };
    result();

    return {
        status: document.getElementById('rangeStatus')?.textContent,
        note: document.getElementById('terrainNote')?.hidden === false
            ? document.getElementById('terrainNote').textContent
            : ''
    };
});

check(
    'panel status is the exact text for the verdict assessShot computed at the same shot',
    panel.status === expectedPanelStatus,
    JSON.stringify({ panel, expectedPanelStatus, verdict: scenarios.nearVerdict, tableRow: scenarios.nearHighTableRow })
);

check('no page errors', errors.length === 0, errors.join('; '));

await browser.close();
process.exit(state.fail ? 1 : 0);
