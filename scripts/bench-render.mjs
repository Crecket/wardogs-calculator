import { readFile, writeFile } from 'node:fs/promises';
import { chromium } from 'playwright-core';

const DEFAULT_URL = 'http://127.0.0.1:8000/';
const DEFAULT_THROTTLE = '1,4,6';
const DEFAULT_PAGES = 'desktop,mobile';
const DEFAULT_STEPS = 120;

const VIEWPORTS = {
    desktop: { width: 1900, height: 1000 },
    mobile: { width: 390, height: 844 }
};

const SCENARIO = {
    weapon: 'spg',
    origin: { x: 92.53, y: 84.88 },
    target: { x: 81.03, y: 71.36 }
};

function getArgument(name) {
    const index = process.argv.indexOf(name);

    return index >= 0 ? process.argv[index + 1] : null;
}

function hasFlag(name) {
    return process.argv.includes(name);
}

function parseList(value) {
    return String(value)
        .split(',')
        .map(item => item.trim())
        .filter(Boolean);
}

function pageURL(base, page) {
    const url = new URL(base);

    if (page === 'mobile' && !url.pathname.endsWith('/mobile/')) {
        url.pathname = `${url.pathname.replace(/\/$/, '')}/mobile/`;
    }

    return url.href;
}

async function launchBrowser() {
    try {
        return await chromium.launch({ channel: 'chrome' });
    } catch {
        return chromium.launch();
    }
}

/*
 * Everything below runs inside the page. The app is classic scripts sharing
 * one global scope, so every solver is a writable global and can be wrapped
 * in place; the wrapper keeps a call stack so a parent's time excludes what
 * its children spent, which is the only attribution that adds up to the
 * frame.
 */
const PAGE_HELPERS = String.raw`
    window.__bench = (() => {
        const wait = ms => new Promise(resolve => setTimeout(resolve, ms));

        const TRACKED = [
            'drawTileMap',
            'drawHillshade',
            'drawContours',
            'drawGrid',
            'drawCoordinateLabels',
            'drawPresetZones',
            'drawPresetPolygons',
            'drawMainZone',
            'drawFobBuildAreas',
            'drawMapToolDrawings',
            'drawDeadGround',
            'drawSavedTargets',
            'drawGuns',
            'drawPresetMarkers',
            'drawMapToolMarkers',
            'drawMapToolTransient',
            'result',
            'renderCrossSection',
            'crossSectionModel',
            'assessShot',
            'terrainRangeRing',
            'terrainDeadGround',
            'flightTimeBadges',
            'refreshSavedTargetFiringInfo'
        ];

        const COUNTED = [
            'trajectoryFamily',
            'integrateTrajectory',
            'modelShellHeight',
            'weaponReachRange',
            'heightfieldSample'
        ];

        const stats = new Map();
        const counts = new Map();
        const stack = [];
        let instrumented = false;

        function reset() {
            stats.clear();
            counts.clear();
        }

        function record(name, self, inclusive) {
            const entry = stats.get(name) || { calls: 0, self: 0, inclusive: 0 };

            entry.calls += 1;
            entry.self += self;
            entry.inclusive += inclusive;
            stats.set(name, entry);
        }

        function instrument(withCounts) {
            if (instrumented) {
                return;
            }

            instrumented = true;

            for (const name of withCounts ? COUNTED : []) {
                const original = window[name];

                if (typeof original !== 'function') {
                    continue;
                }

                window[name] = function () {
                    counts.set(name, (counts.get(name) || 0) + 1);

                    return original.apply(this, arguments);
                };
            }

            for (const name of TRACKED) {
                const original = window[name];

                if (typeof original !== 'function') {
                    continue;
                }

                window[name] = function () {
                    const frame = { child: 0 };
                    const started = performance.now();

                    stack.push(frame);

                    try {
                        return original.apply(this, arguments);
                    } finally {
                        stack.pop();

                        const inclusive = performance.now() - started;

                        record(name, inclusive - frame.child, inclusive);

                        if (stack.length) {
                            stack[stack.length - 1].child += inclusive;
                        }
                    }
                };
            }
        }

        function snapshot(frames) {
            const rows = [];

            for (const [name, entry] of stats) {
                rows.push({
                    fn: name,
                    calls: entry.calls,
                    selfMsPerFrame: +(entry.self / frames).toFixed(3),
                    inclusiveMsPerFrame: +(entry.inclusive / frames).toFixed(3)
                });
            }

            rows.sort((a, b) => b.selfMsPerFrame - a.selfMsPerFrame);

            return rows;
        }

        function callsPerFrame(frames) {
            const rows = {};

            for (const [name, count] of counts) {
                rows[name] = Math.round(count / frames);
            }

            return rows;
        }

        function summarise(samples) {
            const sorted = samples.slice().sort((a, b) => a - b);
            const at = q => sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))];
            const mean = sorted.reduce((sum, value) => sum + value, 0) / sorted.length;

            return {
                frames: sorted.length,
                median: +at(0.5).toFixed(2),
                p95: +at(0.95).toFixed(2),
                max: +sorted[sorted.length - 1].toFixed(2),
                mean: +mean.toFixed(2),
                over16ms: sorted.filter(value => value > 16.7).length
            };
        }

        function clearSolverCaches() {
            RANGE_RING_CACHE.clear();
            DEAD_GROUND_CACHE.clear();

            const field = cachedHeightfield(S.map);

            if (field && ASSESS_SHOT_MEMO.get(field)) {
                ASSESS_SHOT_MEMO.get(field).clear();
            }

            if (typeof CROSS_SECTION_STATE === 'object') {
                CROSS_SECTION_STATE.key = '';
            }
        }

        function clearFamilies() {
            TRAJECTORY_FAMILIES.clear();

            for (const weapon of Object.values(PROJECTILE_MODEL?.weapons || {})) {
                for (const fit of Object.values(weapon)) {
                    if (fit && typeof fit === 'object') {
                        TRAJECTORY_FAMILY_BY_FIT.delete(fit);
                    }
                }
            }
        }

        async function setup(scenario, withCounts) {
            S.weapon = scenario.weapon;
            S.origin = { x: scenario.origin.x, y: scenario.origin.y };
            S.target = { x: scenario.target.x, y: scenario.target.y };

            for (const layer of Object.keys(MAP_TOOL_STATE.layers)) {
                MAP_TOOL_STATE.layers[layer] = true;
            }

            ensureHeightfieldLoaded(S.map);

            for (let i = 0; i < 400; i += 1) {
                if (cachedHeightfield(S.map) && PROJECTILE_MODEL) {
                    break;
                }

                await wait(50);
            }

            drawNow();
            await wait(1500);
            drawNow();
            await wait(500);

            instrument(withCounts);

            return {
                heightfield: Boolean(cachedHeightfield(S.map)),
                contours: Boolean(cachedContours(S.map)),
                hillshade: Boolean(cachedHillshade(S.map)),
                model: Boolean(PROJECTILE_MODEL),
                metresPerUnit: getCoordinateMetersPerUnit(),
                layers: Object.keys(MAP_TOOL_STATE.layers).filter(isMapLayerVisible)
            };
        }

        function runFrames(steps, mutate) {
            const samples = [];

            reset();

            for (let i = 0; i < steps; i += 1) {
                mutate(i);

                const started = performance.now();

                drawNow();

                samples.push(performance.now() - started);
            }

            return {
                ...summarise(samples),
                attribution: snapshot(steps),
                callsPerFrame: callsPerFrame(steps)
            };
        }

        function metresPerStep() {
            return 3 / getCoordinateMetersPerUnit();
        }

        function scenarioPan(steps) {
            const panX = S.panX;
            const panY = S.panY;

            const out = runFrames(steps, i => {
                S.panX = panX + Math.sin(i / 10) * 260;
                S.panY = panY + Math.cos(i / 10) * 180;
            });

            S.panX = panX;
            S.panY = panY;

            return out;
        }

        function scenarioZoom(steps) {
            const zoom = S.zoom;

            const out = runFrames(steps, i => {
                S.zoom = zoom * (1 + 0.5 * Math.abs(Math.sin(i / 15)));
            });

            S.zoom = zoom;

            return out;
        }

        function scenarioDrag(point, steps, lane) {
            const start = { x: S[point].x, y: S[point].y };
            const step = metresPerStep();

            clearSolverCaches();

            const out = runFrames(steps, i => {
                S[point] = {
                    x: start.x - i * step,
                    y: start.y + lane * step * 4 + Math.sin(i / 7) * step * 2
                };
            });

            S[point] = start;

            return out;
        }

        function scenarioStill(steps) {
            return runFrames(steps, () => {});
        }

        function time(fn) {
            const started = performance.now();

            fn();

            return performance.now() - started;
        }

        function median(values) {
            const sorted = values.slice().sort((a, b) => a - b);

            return +sorted[Math.floor(sorted.length / 2)].toFixed(2);
        }

        function shuffle(items) {
            for (let i = items.length - 1; i > 0; i -= 1) {
                const j = Math.floor(Math.random() * (i + 1));

                [items[i], items[j]] = [items[j], items[i]];
            }

            return items;
        }

        function solverSnapshot() {
            const positions = [
                { x: 92.53, y: 84.88 },
                { x: 81.03, y: 71.36 },
                { x: 60.5, y: 100.25 },
                { x: 110.1, y: 40.7 },
                { x: 45.3, y: 55.9 },
                { x: 128.7, y: 120.4 }
            ];

            const out = [];

            for (const position of positions) {
                const gun = { weapon: S.weapon, position };

                clearSolverCaches();

                const ring = terrainRangeRing(gun, S.map);
                const dead = terrainDeadGround(gun, S.map);

                out.push({
                    position,
                    radii: ring ? Array.from(ring.radii) : null,
                    wedges: dead ? dead.bearings.map(intervals => Array.from(intervals)) : null
                });
            }

            clearSolverCaches();

            return out;
        }

        function microbench(repetitions) {
            const weapon = WEAPONS[S.weapon];
            const fit = projectileModelArc(S.weapon, lowArcName(S.weapon));
            const distance = Math.hypot(S.target.x - S.origin.x, S.target.y - S.origin.y) * getCoordinateMetersPerUnit();

            const gunAt = i => ({ weapon: S.weapon, position: { x: 70 + i * 1.7, y: 70 + i * 1.3 } });
            const targetAt = i => ({ x: 80 + i * 0.37, y: 72 + i * 0.29 });

            const tasks = {
                'terrainRangeRing (fresh gun)': i => {
                    clearSolverCaches();

                    return time(() => terrainRangeRing(gunAt(i), S.map));
                },
                'terrainDeadGround (fresh gun, ring cached)': i => {
                    clearSolverCaches();
                    terrainRangeRing(gunAt(i), S.map);

                    return time(() => terrainDeadGround(gunAt(i), S.map));
                },
                'assessShot (fresh target)': i => {
                    clearSolverCaches();

                    return time(() => assessShot(weapon, S.origin, targetAt(i), S.map));
                },
                'crossSectionModel (fresh, shot cached)': i => {
                    clearSolverCaches();
                    assessShot(weapon, S.origin, S.target, S.map);

                    return time(() => crossSectionModel(weapon, distance + i));
                },
                'trajectoryFamily (cold build)': () => {
                    clearFamilies();

                    return time(() => trajectoryFamily(fit));
                },
                'contour raster rebuild': () => {
                    const data = cachedContours(S.map);

                    if (!data) {
                        return 0;
                    }

                    data.raster = null;

                    return time(() => drawContours(getCurrentMap()));
                },
                'drawNow (all caches warm)': () => {
                    drawNow();

                    return time(() => drawNow());
                }
            };

            if (typeof crossSectionModel !== 'function') {
                delete tasks['crossSectionModel (fresh, shot cached)'];
            }

            const results = {};

            for (const name of Object.keys(tasks)) {
                results[name] = [];
            }

            for (const name of Object.keys(tasks)) {
                tasks[name](-1);
            }

            for (let repetition = 0; repetition < repetitions; repetition += 1) {
                for (const name of shuffle(Object.keys(tasks))) {
                    results[name].push(tasks[name](repetition));
                }
            }

            clearSolverCaches();
            drawNow();

            return Object.entries(results).map(([name, samples]) => ({
                task: name,
                medianMs: median(samples),
                minMs: +Math.min(...samples).toFixed(2),
                maxMs: +Math.max(...samples).toFixed(2),
                runs: samples.length
            }));
        }

        return {
            setup,
            scenarioPan,
            scenarioZoom,
            scenarioDrag,
            scenarioStill,
            microbench,
            solverSnapshot,
            clearSolverCaches,
            wait
        };
    })();
`;

async function runScenarios(page, steps) {
    return page.evaluate(async steps => {
        const bench = window.__bench;
        const out = {};

        const settle = async () => {
            drawNow();
            await bench.wait(400);
        };

        await settle();
        out.still = bench.scenarioStill(steps);
        await settle();
        out.pan = bench.scenarioPan(steps);
        await settle();
        out.zoom = bench.scenarioZoom(steps);
        await settle();
        out.originDrag = bench.scenarioDrag('origin', steps, 0);
        await settle();
        out.targetDrag = bench.scenarioDrag('target', steps, 1);

        return out;
    }, steps);
}

async function runInputPan(page, steps) {
    const box = await page.locator('canvas').first().boundingBox();

    if (!box) {
        return null;
    }

    await page.evaluate(() => {
        window.__benchFrames = [];
        window.__benchMoves = 0;

        const original = window.drawNow;

        window.__benchDrawNow = original;

        window.drawNow = function () {
            const started = performance.now();

            try {
                return original.apply(this, arguments);
            } finally {
                window.__benchFrames.push(performance.now() - started);
            }
        };

        window.addEventListener('mousemove', () => {
            window.__benchMoves += 1;
        });
    });

    const centreX = box.x + box.width / 2;
    const centreY = box.y + box.height / 2;

    await page.mouse.move(centreX, centreY);
    await page.mouse.down({ button: 'right' });

    const started = Date.now();

    for (let i = 0; i < steps; i += 1) {
        await page.mouse.move(
            centreX + Math.sin(i / 6) * 260,
            centreY + Math.cos(i / 6) * 180
        );

        await page.waitForTimeout(8);
    }

    await page.mouse.up({ button: 'right' });

    const elapsed = Date.now() - started;

    return page.evaluate(elapsed => {
        const frames = window.__benchFrames;

        window.drawNow = window.__benchDrawNow;

        const sorted = frames.slice().sort((a, b) => a - b);

        return {
            elapsedMs: elapsed,
            mousemoves: window.__benchMoves,
            drawNowCalls: frames.length,
            medianFrameMs: sorted.length ? +sorted[Math.floor(sorted.length / 2)].toFixed(2) : null,
            p95FrameMs: sorted.length ? +sorted[Math.floor(sorted.length * 0.95)].toFixed(2) : null
        };
    }, elapsed);
}

async function profileDrag(page, cdp, steps) {
    await cdp.send('Profiler.enable');
    await cdp.send('Profiler.setSamplingInterval', { interval: 100 });
    await cdp.send('Profiler.start');

    await page.evaluate(steps => window.__bench.scenarioDrag('origin', steps, 2), steps);

    const { profile } = await cdp.send('Profiler.stop');
    await cdp.send('Profiler.disable');

    const byId = new Map(profile.nodes.map(node => [node.id, node]));
    const self = new Map();

    for (const id of profile.samples) {
        const node = byId.get(id);

        if (!node) {
            continue;
        }

        const frame = node.callFrame;
        const file = frame.url.split('/').slice(-1)[0];
        const key = `${frame.functionName || '(anon)'}  ${file}:${frame.lineNumber + 1}`;

        self.set(key, (self.get(key) || 0) + 1);
    }

    const total = profile.samples.length;

    return [...self.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, 25)
        .map(([fn, samples]) => ({ fn, samples, pct: +(samples / total * 100).toFixed(1) }));
}

function compareSnapshots(baseline, current) {
    let radiiDiff = 0;
    let wedgeDiff = 0;
    let wedgeShape = 0;

    for (let i = 0; i < baseline.length; i += 1) {
        const a = baseline[i];
        const b = current[i];

        if (!a.radii || !b.radii) {
            if (Boolean(a.radii) !== Boolean(b.radii)) {
                wedgeShape += 1;
            }

            continue;
        }

        for (let k = 0; k < a.radii.length; k += 1) {
            radiiDiff = Math.max(radiiDiff, Math.abs(a.radii[k] - b.radii[k]));
        }

        for (let k = 0; k < a.wedges.length; k += 1) {
            if (a.wedges[k].length !== b.wedges[k].length) {
                wedgeShape += 1;

                continue;
            }

            for (let m = 0; m < a.wedges[k].length; m += 1) {
                wedgeDiff = Math.max(wedgeDiff, Math.abs(a.wedges[k][m] - b.wedges[k][m]));
            }
        }
    }

    return `max ring radius difference ${radiiDiff.toExponential(2)} m, max wedge edge difference ${wedgeDiff.toExponential(2)} m, bearings whose wedge count changed ${wedgeShape}`;
}

function printScenario(label, scenario) {
    console.log(`\n  ${label}: median ${scenario.median} ms, p95 ${scenario.p95} ms, max ${scenario.max} ms, mean ${scenario.mean} ms, ${scenario.over16ms}/${scenario.frames} frames over 16.7 ms`);

    console.table(
        scenario.attribution
            .filter(row => row.selfMsPerFrame >= 0.05)
            .slice(0, 12)
    );

    const counted = Object.entries(scenario.callsPerFrame)
        .filter(([, calls]) => calls > 0)
        .map(([name, calls]) => `${name} ${calls}`);

    if (counted.length) {
        console.log(`  calls per frame: ${counted.join(', ')}`);
    }
}

async function benchPage(browser, options, pageName) {
    const url = pageURL(options.url, pageName);
    const isMobile = pageName === 'mobile';

    const context = await browser.newContext({
        viewport: VIEWPORTS[pageName],
        isMobile,
        hasTouch: isMobile,
        deviceScaleFactor: isMobile ? 3 : 1
    });

    const page = await context.newPage();

    page.on('pageerror', error => console.log('[pageerror]', error.message));

    await page.goto(url, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => typeof drawNow === 'function' && typeof S === 'object', null, { timeout: 60000 });
    await page.waitForTimeout(1500);
    await page.evaluate(PAGE_HELPERS);

    const ready = await page.evaluate(
        ({ scenario, counts }) => window.__bench.setup(scenario, counts),
        { scenario: SCENARIO, counts: options.counts }
    );

    console.log(`\n=== ${pageName} ${url} viewport ${VIEWPORTS[pageName].width}x${VIEWPORTS[pageName].height}`);
    console.log(`heightfield ${ready.heightfield}, contours ${ready.contours}, hillshade ${ready.hillshade}, projectile model ${ready.model}, ${ready.metresPerUnit.toFixed(1)} m/unit, layers on: ${ready.layers.join(', ')}`);

    const cdp = await context.newCDPSession(page);
    const report = { page: pageName, url, ready, throttles: {} };

    if (!isMobile && (options.snapshot || options.compare)) {
        report.snapshot = await page.evaluate(() => window.__bench.solverSnapshot());

        if (options.snapshot) {
            await writeFile(options.snapshot, JSON.stringify(report.snapshot));

            console.log(`solver snapshot written to ${options.snapshot}`);
        }

        if (options.compare) {
            const baseline = JSON.parse(await readFile(options.compare, 'utf8'));

            console.log(`solver snapshot against ${options.compare}: ${compareSnapshots(baseline, report.snapshot)}`);
        }
    }

    for (const rate of options.throttle) {
        await cdp.send('Emulation.setCPUThrottlingRate', { rate });
        await page.waitForTimeout(200);

        console.log(`\n--- CPU throttle ${rate}x`);

        const scenarios = await runScenarios(page, options.steps);

        for (const [label, scenario] of Object.entries(scenarios)) {
            printScenario(label, scenario);
        }

        const micro = await page.evaluate(repetitions => window.__bench.microbench(repetitions), options.repetitions);

        console.log('\n  fresh solves (order shuffled per repetition, medians):');
        console.table(micro);

        const entry = { scenarios, micro };

        if (!isMobile) {
            entry.inputPan = await runInputPan(page, options.steps);

            console.log(`\n  right-button pan driven by real mouse events: ${entry.inputPan.mousemoves} mousemoves, ${entry.inputPan.drawNowCalls} drawNow calls in ${entry.inputPan.elapsedMs} ms, median ${entry.inputPan.medianFrameMs} ms, p95 ${entry.inputPan.p95FrameMs} ms`);
        }

        if (options.profile) {
            entry.profile = await profileDrag(page, cdp, options.steps);

            console.log('\n  CPU sampler self time during an origin drag:');
            console.table(entry.profile);
        }

        report.throttles[rate] = entry;
    }

    await cdp.send('Emulation.setCPUThrottlingRate', { rate: 1 });
    await context.close();

    return report;
}

async function main() {
    const options = {
        url: getArgument('--url') || DEFAULT_URL,
        throttle: parseList(getArgument('--throttle') || DEFAULT_THROTTLE).map(Number),
        pages: parseList(getArgument('--pages') || DEFAULT_PAGES),
        steps: Number(getArgument('--steps') || DEFAULT_STEPS),
        repetitions: Number(getArgument('--repetitions') || 5),
        profile: hasFlag('--profile'),
        counts: hasFlag('--counts'),
        snapshot: getArgument('--snapshot'),
        compare: getArgument('--compare'),
        json: getArgument('--json')
    };

    const browser = await launchBrowser();
    const reports = [];

    try {
        for (const pageName of options.pages) {
            if (!VIEWPORTS[pageName]) {
                throw new Error(`Unknown page ${pageName}; use desktop or mobile`);
            }

            reports.push(await benchPage(browser, options, pageName));
        }
    } finally {
        await browser.close();
    }

    if (options.json) {
        await writeFile(options.json, JSON.stringify({ options, reports }, null, 2));

        console.log(`\nWrote ${options.json}`);
    }
}

main().catch(error => {
    console.error(error);
    process.exit(1);
});
