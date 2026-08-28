/*
 * Time of flight, derived rather than measured.
 *
 * The expected seconds come from docs/ideas-research/08-time-of-flight.md
 * section 2, which computed them from the same vacuum fit this reads. They
 * are a regression fence on the derivation, not evidence about the game —
 * nobody has held a stopwatch to a real shell yet.
 *
 *   PORT=8123 npm run dev       # in one shell
 *   node test/flight-time.mjs   # in another
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

/* --- the derivation itself --- */

const derived = await page.evaluate(() => ({
    low: flightTimeSeconds('spg', 'low', 1800),
    high: flightTimeSeconds('spg', 'high', 1800),
    mortar: flightTimeSeconds('mortar', 'single', 400)
}));

check(
    'SPG low arc at 1800 m is about 12 s',
    Math.abs(derived.low - 12.1) < 1.5,
    derived.low
);

check(
    'SPG high arc at 1800 m is about 30 s',
    Math.abs(derived.high - 30.3) < 1.5,
    derived.high
);

check(
    'the mortar derives too, even though it is not displayed',
    Math.abs(derived.mortar - 16.9) < 1.5,
    derived.mortar
);

/*
 * A gun above its target keeps flying after it would have landed level.
 * Sign matters more than magnitude here: deltaZ is target minus origin,
 * so a negative one is a target below the gun.
 */
const slope = await page.evaluate(() => ({
    below: flightTimeSeconds('spg', 'low', 1800, -200),
    above: flightTimeSeconds('spg', 'low', 1800, 200),
    level: flightTimeSeconds('spg', 'low', 1800, 0)
}));

check('a lower target lengthens the flight', slope.below > slope.level);
check('a higher target shortens it', slope.above < slope.level);

/* --- what reaches the panel --- */

async function readPanel(weapon, distanceMeters) {
    return page.evaluate(([id, metres]) => {
        S.weapon = id;
        S.origin = { x: 50, y: 50 };
        S.target = { x: 50 + metres / 100, y: 50 };

        result();

        const line = document.getElementById('milFlight');

        return {
            hidden: line.hidden,
            text: line.textContent,
            mil: document.getElementById('mil').textContent
        };
    }, [weapon, distanceMeters]);
}

const mortar = await readPanel('mortar', 400);
check('the mortar shows no flight time', mortar.hidden, mortar.text);

const spg = await readPanel('spg', 1800);
check('the SPG shows one time per arc', /≈.*\/.*≈/.test(spg.text), spg.text);
check('the SPG line is visible', spg.hidden === false);

/*
 * Below 1181 m the low table has no coverage, so the high arc is the only
 * option and the line must not print a phantom second value.
 */
const highOnly = await readPanel('spg', 1000);
check(
    'a single arc prints a single time',
    highOnly.hidden === false &&
    !highOnly.text.includes('/'),
    highOnly.text
);
check(
    'and it agrees with the single MIL shown',
    !highOnly.mil.includes('/'),
    highOnly.mil
);

const outOfRange = await readPanel('spg', 4000);
check('out of range shows nothing', outOfRange.hidden, outOfRange.text);

/* --- the times track the arcs they sit under --- */

const ordering = await page.evaluate(() => {
    S.weapon = 'spg';
    S.origin = { x: 50, y: 50 };
    S.target = { x: 68, y: 50 };

    result();

    return document
        .getElementById('milFlight')
        .textContent
        .split('/')
        .map(part => Number(part.replace(/[^0-9.]/g, '')));
});

check(
    'the low arc is printed first and is the faster one',
    ordering.length === 2 && ordering[0] < ordering[1],
    ordering.join(' / ')
);

check('no page errors', errors.length === 0, errors.join('; '));

console.log(`\n${state.pass} passed, ${state.fail} failed`);
await browser.close();
process.exit(state.fail ? 1 : 0);
