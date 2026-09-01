import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const SIDE = 511;

function buildManifest() {
    return {
        format: 'wardogs-landscape-collision-u16-v1',
        verticesPerSide: SIDE,
        chunkQuads: 510,
        mapId: 'testmap',
        globalQuadOffsetX: 0,
        globalQuadOffsetY: 0,
        gameUnitsToLandscapeQuadsX: 1,
        gameUnitsToLandscapeQuadsY: 1,
        chunkXMin: 0,
        chunkXMax: 0,
        chunkYMin: 0,
        chunkYMax: 0,
        coverage: { gameXMin: -1000, gameXMax: 1000, gameYMin: -1000, gameYMax: 1000 },
        worldZOffsetMeters: 0,
        worldZScaleMetersPerLocalUnit: 2,
        chunks: {
            '0,0': {
                file: 'chunk_0_0.bin',
                bytes: SIDE * SIDE * 2,
                minLocalZ: 0,
                maxLocalZ: 65535
            }
        }
    };
}

function buildChunkBuffer() {
    const buffer = new ArrayBuffer(SIDE * SIDE * 2);
    const view = new DataView(buffer);

    for (let y = 0; y < SIDE; y += 1) {
        for (let x = 0; x < SIDE; x += 1) {
            view.setUint16((y * SIDE + x) * 2, x, true);
        }
    }

    return buffer;
}

function buildConfig() {
    return {
        schema: 'wardogs-terrain-ballistics-v1',
        terrainMaps: { testmap: 'manifest.json' },
        releasePolicy: {
            automaticMilCorrection: true,
            correctedMaps: ['testmap'],
            suppressionMissMeters: 10,
            heightCorrection: 'height-correction.json'
        }
    };
}

function buildCorrectionGrid() {
    return {
        schema: 'wardogs-height-correction-v1',
        modelSource: 'test',
        weapons: {
            testgun: {
                low: {
                    distancesMeters: [400, 600],
                    deltaZMeters: [-800, -400, 0, 400, 800],
                    milCorrections: [
                        [0, 0],
                        [0, 0],
                        [50, 50],
                        [0, 0],
                        [0, 0]
                    ],
                    missMeters: [
                        [80, 80],
                        [80, 80],
                        [80, 80],
                        [80, 80],
                        [80, 80]
                    ]
                }
            }
        }
    };
}

function mockFetch(responses) {
    return async url => {
        const key = String(url);
        const entry = responses[key];

        if (!entry) {
            throw new Error(`unexpected fetch: ${key}`);
        }

        return {
            ok: true,
            status: 200,
            statusText: 'OK',
            json: async () => entry.json,
            arrayBuffer: async () => entry.buffer
        };
    };
}

function ctxWith() {
    const responses = {
        'data/ballistics/terrain-context.json': { json: buildConfig() },
        'height-correction.json': { json: buildCorrectionGrid() },
        'http://test.local/manifest.json': { json: buildManifest() },
        'http://test.local/chunk_0_0.bin': { buffer: buildChunkBuffer() }
    };

    return loadRuntime(['js/features/terrain-ballistics.js'], {
        URL,
        fetch: mockFetch(responses),
        setTimeout,
        document: {
            baseURI: 'http://test.local/',
            getElementById: () => null,
            querySelector: () => null,
            body: { classList: { contains: () => false } },
            head: { appendChild: () => {} }
        },
        requestAnimationFrame: () => {},
        $: () => null,
        $q: () => null,
        S: {},
        LANG: 'en'
    });
}

const weapon = { id: 'testgun', minElevationMil: 20, maxElevationMil: 1390 };

function solutionsFixture() {
    return {
        inRange: true,
        single: null,
        low: { mil: 1380, minMil: 1350, maxMil: 1390 },
        high: null
    };
}

async function initialized(ctx) {
    await callRuntime(ctx, 'window.initTerrainBallistics()');
}

async function probe(ctx, { origin, target, distanceMeters }) {
    setRuntimeGlobal(ctx, '__probeArgs', {
        weapon,
        distanceMeters,
        solutions: solutionsFixture(),
        mapId: 'testmap',
        origin,
        target
    });

    return callRuntime(ctx, `
        (async () => {
            window.getTerrainBallisticSolutions({ ...__probeArgs, prime: true });

            for (let i = 0; i < 40; i += 1) {
                const again = window.getTerrainBallisticSolutions({ ...__probeArgs, prime: false });

                if (again.meta && !again.meta.pendingTerrain) {
                    return again;
                }

                await new Promise(r => setTimeout(r, 5));
            }

            return null;
        })()
    `);
}

test('the ΔZ axis is never clamped: a 900 m height difference stays uncorrected, not widened onto the 800 m grid edge', async () => {
    const ctx = ctxWith();
    await initialized(ctx);

    const result = await probe(ctx, {
        origin: { x: 0, y: 0 },
        target: { x: 450, y: 0 },
        distanceMeters: 500
    });

    assert.ok(result, 'the probe resolved instead of staying pending');
    assert.equal(result.meta.correctionDeltaZ, 900);
    assert.equal('deltaZ' in result.meta, false);
    assert.equal(result.meta.arcsCorrected.includes('low'), false);
    assert.equal(result.meta.arcsUncorrected.includes('low'), true);
    assert.equal(result.solutions.low.mil, 1380);
    assert.equal(result.solutions.low.minMil, 1350);
    assert.equal(result.solutions.low.maxMil, 1390);
});

test('envelopeClamped fires, and clamps mil/minMil/maxMil, when a correction would push past the elevation stop', async () => {
    const ctx = ctxWith();
    await initialized(ctx);

    const result = await probe(ctx, {
        origin: { x: 0, y: 0 },
        target: { x: 0, y: 0 },
        distanceMeters: 500
    });

    assert.ok(result, 'the probe resolved instead of staying pending');
    assert.equal(result.meta.correctionDeltaZ, 0);
    assert.equal(result.meta.arcsCorrected.includes('low'), true);
    assert.equal(result.meta.envelopeClamped, true);
    assert.equal(result.solutions.low.envelopeClamped, true);
    assert.equal(result.solutions.low.mil, weapon.maxElevationMil);
    assert.equal(result.solutions.low.minMil, weapon.maxElevationMil);
    assert.equal(result.solutions.low.maxMil, weapon.maxElevationMil);
});
