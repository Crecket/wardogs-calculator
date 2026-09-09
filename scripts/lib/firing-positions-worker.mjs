/*
 * One worker's share of the clearance filter.
 *
 * The filter is a terrain march per aim point, roughly 1.7 million of them
 * for Bakurani, and it is the whole cost of the bake: ordering the aim
 * points buys nothing, because 99% of the cells that reach this stage pass,
 * so there is almost never a failure for an early exit to catch. The work
 * is irreducible. What is reducible is doing it on one core.
 *
 * Each worker builds its own vm context over the same shipped reachability
 * code the browser runs, so parallelism costs nothing in agreement: every
 * verdict here still comes from assessShot itself.
 *
 * Cells are handed out by stride rather than in blocks. A block of adjacent
 * cells is uniformly cheap or uniformly expensive — they see the same
 * terrain — so blocks leave some workers idle while one grinds. Striding
 * interleaves them and the load evens out on its own.
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parentPort, workerData } from 'node:worker_threads';

import { callRuntime, loadRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const {
    root,
    heightfield,
    aims,
    aimsPerTower,
    lowTowersRequired,
    lowRule,
    weaponId,
    xs,
    ys,
    stride,
    offset
} = workerData;

const METRES_PER_GAME_UNIT = 100;

const field = {
    heights: new Float32Array(heightfield.heights),
    width: heightfield.width,
    height: heightfield.height,
    originX: heightfield.originX,
    originY: heightfield.originY,
    stepGameUnits: heightfield.stepGameUnits
};

const context = loadRuntime(
    [
        'js/map/heightfield.js',
        'js/map/range-ring.js',
        'js/ballistics/model.js',
        'js/ballistics/reachability.js',
        'js/features/weapons.js'
    ],
    {
        getCoordinateMetersPerUnit: () => METRES_PER_GAME_UNIT,
        fetchJSON: () => {},
        document: {},
        draw: () => {},
        localStorage: { getItem: () => null, setItem: () => {} }
    }
);

const readJson = path => JSON.parse(readFileSync(path, 'utf8'));

setRuntimeGlobal(
    context,
    'PROJECTILE_MODEL',
    readJson(join(root, 'data', 'ballistics', 'projectile-model.json'))
);

const weapons = readJson(join(root, 'data', 'weapons.json'));
const raw = weapons.weapons.find(entry => entry.id === weaponId);

setRuntimeGlobal(context, '__rawWeapon', raw);
setRuntimeGlobal(context, '__field', field);
setRuntimeGlobal(context, '__aims', aims);
setRuntimeGlobal(context, '__aimsPerTower', aimsPerTower);
setRuntimeGlobal(context, '__lowTowersRequired', lowTowersRequired);
setRuntimeGlobal(context, '__lowNeedsEveryPoint', lowRule === 'every-point');

callRuntime(
    context,
    'mapHasHeightfield = () => true;' +
    'ensureHeightfieldLoaded = () => {};' +
    'cachedHeightfield = () => __field;' +
    'var __weapon = normalizeWeapon(__rawWeapon);'
);

/*
 * The aim points come grouped by tower, centre first and then its ring.
 * The any-arc verdict wants every point with either arc and bails on the
 * first miss. The low-arc verdict has two readings: the go-to tier counts
 * towers whose centre has a clean low lane and passes when enough of them
 * do, because a 600 m corridor of flat lanes in every direction is a thing
 * no wooded valley has; the fallback tier keeps the original rule and asks
 * for every point.
 */
const reaches = callRuntime(context, `(function (gunX, gunY) {
    var lowTowers = 0;
    var lowEverywhere = true;

    for (var i = 0; i < __aims.length; i += 1) {
        var shot = assessShot(
            __weapon,
            { x: gunX, y: gunY },
            __aims[i],
            'build'
        );

        var lowHits =
            shot.arcs.low &&
            shot.arcs.low.status === 'hit' &&
            !shot.arcs.low.masked;

        var highHits =
            shot.arcs.high &&
            shot.arcs.high.status === 'hit' &&
            !shot.arcs.high.masked;

        if (!lowHits && !highHits) {
            return [false, false];
        }

        if (!lowHits) {
            lowEverywhere = false;
        }

        if (lowHits && i % __aimsPerTower === 0) {
            lowTowers += 1;
        }
    }

    if (__lowNeedsEveryPoint) {
        return [lowEverywhere, true];
    }

    return [lowTowers >= __lowTowersRequired, true];
})`);

const gunX = new Float64Array(xs);
const gunY = new Float64Array(ys);

const low = new Uint8Array(gunX.length);
const any = new Uint8Array(gunX.length);

for (let i = offset; i < gunX.length; i += stride) {
    const verdict = reaches(gunX[i], gunY[i]);

    if (verdict[1]) {
        any[i] = 1;
    }

    if (verdict[0]) {
        low[i] = 1;
    }
}

parentPort.postMessage({ low, any }, [low.buffer, any.buffer]);
