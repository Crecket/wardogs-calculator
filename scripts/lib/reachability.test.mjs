import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const model = {
    schema: 'wardogs-projectile-model-v2',
    weapons: {
        mortar: { single: { branch: 'high', muzzleVelocity: 86.7, dragPerMeter: 0, angleOffsetDeg: 52.5, anglePerMilDeg: 0.0375 } },
        spg: {
            low: { branch: 'low', muzzleVelocity: 262.4, dragPerMeter: 0.00039, angleOffsetDeg: 2.254, anglePerMilDeg: 0.05625 },
            high: { branch: 'high', muzzleVelocity: 262.4, dragPerMeter: 0.00039, angleOffsetDeg: 2.254, anglePerMilDeg: 0.05625 }
        }
    }
};

const spg = {
    id: 'spg', minRange: 0.78, maxRange: 2.629, minElevationMil: 35, maxElevationMil: 1390,
    ballistics: { low: [[822, 35], [2639, 630]], high: [[815, 1390], [2638, 640]] }
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
    assert.deepEqual(JSON.parse(callRuntime(ctx, 'JSON.stringify(arcDeclaredRange(__spg, "low"))')), { minMeters: 822, maxMeters: 2629 });
    assert.deepEqual(JSON.parse(callRuntime(ctx, 'JSON.stringify(arcDeclaredRange(__spg, "high"))')), { minMeters: 815, maxMeters: 2629 });
    assert.deepEqual(JSON.parse(callRuntime(ctx, 'JSON.stringify(arcDeclaredRange(__mortar, "single"))')), { minMeters: 132, maxMeters: 684 });
});

test('the 800 m SPG shot is tooClose on both arcs; 917 m hits on both', () => {
    const ctx = ctxWith();
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "low", 800, 0).status'), 'tooClose');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "high", 800, 0).status'), 'tooClose');
    const low = callRuntime(ctx, 'assessArc(__spg, "low", 917, 0)');
    assert.equal(low.status, 'hit');
    assert.equal(low.tableRow, true);
    assert.ok(low.mil > 35 && low.mil < 60, String(low.mil));
    const high = callRuntime(ctx, 'assessArc(__spg, "high", 917, 0)');
    assert.equal(high.status, 'hit');
    assert.equal(high.tableRow, true);
    assert.ok(high.mil > 1360 && high.mil < 1390, String(high.mil));
});

test('anchored gates shift with deltaZ', () => {
    const ctx = ctxWith();
    assert.equal(callRuntime(ctx, 'assessArc(__mortar, "single", 690, 0).status'), 'tooFar');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "high", 800, -200).status'), 'tooClose');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "high", 820, -200).status'), 'tooClose');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "high", 850, -100).status'), 'hit');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "high", 850, 100).status'), 'hit');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "high", 2600, 200).status'), 'tooFar');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "low", 2600, 200).status'), 'tooFar');
});

test('the table edge stays a hit and the beyond-table window is modelled', () => {
    const ctx = ctxWith();
    const edge = callRuntime(ctx, 'assessArc(__spg, "low", 2629, 0)');
    assert.equal(edge.status, 'hit');
    assert.equal(edge.tableRow, true);
    assert.equal(edge.ceilingCapped, undefined);
    assert.ok(Number.isFinite(edge.mil));
    const beyond = callRuntime(ctx, 'assessArc(__spg, "high", 2650, -100)');
    assert.equal(beyond.status, 'hit');
    assert.equal(beyond.tableRow, false);
    assert.ok(Number.isFinite(beyond.mil));
});

test('a table row the model cannot reach is capped at the arc stop, not refused', () => {
    const ctx = ctxWith();
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', {
        schema: 'wardogs-projectile-model-v2',
        weapons: { toy: { low: { branch: 'low', muzzleVelocity: 100, dragPerMeter: 0, angleOffsetDeg: 0, anglePerMilDeg: 0.05 } } }
    });
    setRuntimeGlobal(ctx, '__toy', {
        id: 'toy', minRange: 0.1, maxRange: 1.1, minElevationMil: 200, maxElevationMil: 1600,
        ballistics: { low: [[100, 200], [1100, 800]] }
    });
    const capped = callRuntime(ctx, 'assessArc(__toy, "low", 1050, 0)');
    assert.equal(capped.status, 'hit');
    assert.equal(capped.tableRow, true);
    assert.equal(capped.ceilingCapped, true);
    assert.ok(Math.abs(capped.tan - 1) < 1e-6);
    assert.equal(capped.mil, null);
});

test('a table-covered row is never envelope-refused despite fit noise', () => {
    const ctx = ctxWith();
    const row = callRuntime(ctx, 'assessArc(__spg, "low", 822, 0)');
    assert.equal(row.status, 'hit');
    assert.equal(row.tableRow, true);
});

test('a modelled mil outside the envelope is refused', () => {
    const ctx = ctxWith();
    setRuntimeGlobal(ctx, 'PROJECTILE_MODEL', {
        schema: 'wardogs-projectile-model-v2',
        weapons: { toy: { low: { branch: 'low', muzzleVelocity: 100, dragPerMeter: 0, angleOffsetDeg: 0, anglePerMilDeg: 0.05 } } }
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
    assert.equal(near.arcs.low.status, 'hit');
    assert.equal(near.arcs.low.masked, false);
    assert.equal(near.arcs.high.masked, false);
    const close = callRuntime(ctx, 'assessShot(__spg, {x: 1, y: 1}, {x: 9, y: 1}, "m")');
    assert.equal(close.verdict, 'tooClose');
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

test('no arc ever hits outside its anchored envelope, and no gate ever vanishes', () => {
    const ctx = ctxWith();

    const report = JSON.parse(callRuntime(ctx, `(() => {
        const out = {
            levelOutsideDeclared: [],
            downhillBelowDeclaredMin: [],
            uphillAboveDeclaredMax: [],
            gateVanished: [],
            outsideArcStops: []
        };

        for (const arc of ['low', 'high']) {
            const fit = projectileModelArc('spg', arc);
            const declared = arcDeclaredRange(__spg, arc);
            const stops = arcAngleStops(__spg, fit);
            const levelMin = arcMinRangeModel(__spg, fit, 0);
            const levelMax = arcMaxRangeModel(__spg, fit, 0);

            for (let d = 50; d <= 3200; d += 25) {
                for (let dz = -800; dz <= 800; dz += 25) {
                    const assessed = assessArc(__spg, arc, d, dz);

                    if (assessed.status !== 'hit') {
                        continue;
                    }

                    const where = arc + ' d=' + d + ' dz=' + dz;
                    const shiftedMin = arcMinRangeModel(__spg, fit, dz);
                    const shiftedMax = arcMaxRangeModel(__spg, fit, dz);

                    if (dz === 0 && (d < declared.minMeters || d > declared.maxMeters)) {
                        out.levelOutsideDeclared.push(where);
                    }

                    if (dz <= 0 && d < declared.minMeters) {
                        out.downhillBelowDeclaredMin.push(where);
                    }

                    if (dz >= 0 && d > declared.maxMeters) {
                        out.uphillAboveDeclaredMax.push(where);
                    }

                    if ((levelMin === null || shiftedMin === null) && d < declared.minMeters) {
                        out.gateVanished.push('min ' + where);
                    }

                    if ((levelMax === null || shiftedMax === null) && d > declared.maxMeters) {
                        out.gateVanished.push('max ' + where);
                    }

                    if (!assessed.tableRow && assessed.tan !== null && stops) {
                        const radians = Math.atan(assessed.tan);

                        if (
                            radians < stops.minRadians - 1e-9 ||
                            radians > stops.maxRadians + 1e-9
                        ) {
                            out.outsideArcStops.push(where);
                        }
                    }
                }
            }
        }

        return JSON.stringify(out);
    })()`));

    assert.deepEqual(report.levelOutsideDeclared, []);
    assert.deepEqual(report.downhillBelowDeclaredMin, []);
    assert.deepEqual(report.uphillAboveDeclaredMax, []);
    assert.deepEqual(report.gateVanished, []);
    assert.deepEqual(report.outsideArcStops, []);
});

test('an uphill low-arc shot inside minimum range stays tooClose', () => {
    const ctx = ctxWith();
    assert.equal(callRuntime(ctx, 'arcMinRangeModel(__spg, projectileModelArc("spg", "low"), 200)'), null);
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "low", 300, 200).status'), 'tooClose');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "low", 100, 200).status'), 'tooClose');
    assert.equal(callRuntime(ctx, 'assessArc(__spg, "low", 200, 600).status'), 'tooClose');
});
