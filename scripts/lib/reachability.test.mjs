import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const model = {
    schema: 'wardogs-projectile-model-v1',
    weapons: {
        mortar: { single: { branch: 'high', muzzleVelocity: 86.7, angleOffsetDeg: 52.5, anglePerMilDeg: 0.0375 } },
        spg: {
            low: { branch: 'low', muzzleVelocity: 160.1, angleOffsetDeg: 12.75, anglePerMilDeg: 0.058 },
            high: { branch: 'high', muzzleVelocity: 160.4, angleOffsetDeg: 14.5, anglePerMilDeg: 0.048 }
        }
    }
};

const spg = {
    id: 'spg', minRange: 0.78, maxRange: 2.629, minElevationMil: 20, maxElevationMil: 1390,
    ballistics: { low: [[1181, 20], [2629, 600]], high: [[735, 1400], [2629, 610]] }
};

const mortar = {
    id: 'mortar', minRange: 0.132, maxRange: 0.684, minElevationMil: 150, maxElevationMil: 850,
    ballistics: { single: [[80, 950], [697, 120]] }
};

function ctxWith() {
    const ctx = loadRuntime(['js/ballistics/model.js', 'js/ballistics/reachability.js']);
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', model);
    setRuntimeGlobal(ctx, '__spg', spg);
    setRuntimeGlobal(ctx, '__mortar', mortar);
    return ctx;
}

test('arcDeclaredRange intersects the weapon gates with the table coverage', () => {
    const ctx = ctxWith();
    assert.deepEqual(JSON.parse(callRuntime(ctx, 'JSON.stringify(arcDeclaredRange(__spg, "low"))')), { minMeters: 1181, maxMeters: 2629 });
    assert.deepEqual(JSON.parse(callRuntime(ctx, 'JSON.stringify(arcDeclaredRange(__spg, "high"))')), { minMeters: 780, maxMeters: 2629 });
    assert.deepEqual(JSON.parse(callRuntime(ctx, 'JSON.stringify(arcDeclaredRange(__mortar, "single"))')), { minMeters: 132, maxMeters: 684 });
});

test('the 917 m SPG shot: low arc is tooClose, high arc hits', () => {
    const ctx = ctxWith();
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "low", 917, 0).status'), 'tooClose');
    const high = callRuntime(ctx, 'assessArc(__spg, "high", 917, 0)');
    assert.equal(high.status, 'hit');
    assert.equal(high.tableRow, true);
});

test('anchored gates shift with deltaZ', () => {
    const ctx = ctxWith();
    assert.equal(callRuntime(ctx, 'assessArc(__mortar, "single", 690, 0).status'), 'tooFar');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "high", 800, -200).status'), 'tooClose');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "high", 800, 100).status'), 'hit');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "high", 2600, 200).status'), 'tooFar');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "low", 2600, 200).status'), 'tooFar');
});

test('the table edge stays a hit and the beyond-table window is modelled', () => {
    const ctx = ctxWith();
    const edge = callRuntime(ctx, 'assessArc(__spg, "low", 2620, 0)');
    assert.equal(edge.status, 'hit');
    assert.equal(edge.tableRow, true);
    assert.equal(edge.ceilingCapped, true);
    assert.ok(Number.isFinite(edge.tan));
    assert.equal(edge.mil, null);
    const beyond = callRuntime(ctx, 'assessArc(__spg, "high", 2650, -100)');
    assert.equal(beyond.status, 'hit');
    assert.equal(beyond.tableRow, false);
    assert.ok(Number.isFinite(beyond.mil));
});

test('a table-covered row is never envelope-refused despite fit noise', () => {
    const ctx = ctxWith();
    const row = callRuntime(ctx, 'assessArc(__spg, "low", 1181, 0)');
    assert.equal(row.status, 'hit');
    assert.equal(row.tableRow, true);
});

test('a modelled mil outside the envelope is refused', () => {
    const ctx = ctxWith();
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', {
        schema: 'wardogs-projectile-model-v1',
        weapons: { toy: { low: { branch: 'low', muzzleVelocity: 100, angleOffsetDeg: 0, anglePerMilDeg: 0.05 } } }
    });
    setRuntimeGlobal(ctx, '__toy', { id: 'toy', minRange: 0.1, maxRange: 10, minElevationMil: 200, maxElevationMil: 1600, ballistics: {} });
    assert.equal(callRuntime(ctx, 'assessArc(__toy, "low", 200, 0).status'), 'belowMinElevation');
    assert.equal(callRuntime(ctx, 'assessArc(__toy, "low", 900, 0).status'), 'hit');
});

const flatField = (width, height, ridge = null) => {
    const heights = new Float32Array(width * height);
    if (ridge) {
        for (let j = 0; j < height; j += 1) {
            heights[j * width + ridge.column] = ridge.height;
        }
    }
    return { heights, width, height, originX: 0, originY: 0, stepGameUnits: 1, minZMeters: 0 };
};

function shotCtx(field) {
    const ctx = loadRuntime(
        ['js/map/heightfield.js', 'js/ballistics/model.js', 'js/ballistics/reachability.js'],
        {
            getCoordinateMetersPerUnit: () => 100
        }
    );
    setRuntimeGlobal(ctx, 'mapHasHeightfield', () => true);
    setRuntimeGlobal(ctx, 'ensureHeightfieldLoaded', () => {});
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', model);
    setRuntimeGlobal(ctx, '__spg', spg);
    setRuntimeGlobal(ctx, '__mortar', mortar);
    setRuntimeGlobal(ctx, '__field', field);
    setRuntimeGlobal(ctx, 'cachedHeightfield', () => field);
    callRuntime(ctx, `rangeRingSample = (field, x, y) => heightfieldSample(
        field,
        Math.min(field.originX + (field.width - 1) * field.stepGameUnits, Math.max(field.originX, x)),
        Math.min(field.originY + (field.height - 1) * field.stepGameUnits, Math.max(field.originY, y))
    )`);
    return ctx;
}

test('assessShot on flat ground: SPG 900 m is a plain hit, 2700 m is tooFar', () => {
    const ctx = shotCtx(flatField(40, 3));
    const near = callRuntime(ctx, 'assessShot(__spg, {x: 1, y: 1}, {x: 10, y: 1}, "m")');
    assert.equal(near.state, 'ready');
    assert.equal(near.deltaZ, 0);
    assert.equal(near.verdict, 'hit');
    assert.equal(near.arcs.low.status, 'tooClose');
    assert.equal(near.arcs.high.masked, false);
    const far = callRuntime(ctx, 'assessShot(__spg, {x: 1, y: 1}, {x: 28, y: 1}, "m")');
    assert.equal(far.verdict, 'tooFar');
});

test('assessShot marks a ridge-blocked mortar shot masked', () => {
    const ctx = shotCtx(flatField(9, 3, { column: 5, height: 250 }));
    const shot = callRuntime(ctx, 'assessShot(__mortar, {x: 0, y: 1}, {x: 6.5, y: 1}, "m")');
    assert.equal(shot.state, 'ready');
    assert.equal(shot.arcs.single.status, 'hit');
    assert.equal(shot.arcs.single.masked, true);
    assert.equal(shot.verdict, 'masked');
});

test('assessShot reports pending and offmap honestly', () => {
    const ctx = shotCtx(flatField(9, 3));
    setRuntimeGlobal(ctx, 'cachedHeightfield', () => null);
    assert.equal(callRuntime(ctx, 'assessShot(__spg, {x: 1, y: 1}, {x: 5, y: 1}, "m").state'), 'pending');
    const ctx2 = shotCtx(flatField(9, 3));
    assert.equal(callRuntime(ctx2, 'assessShot(__spg, {x: 1, y: 1}, {x: 100, y: 1}, "m").state'), 'offmap');
});
