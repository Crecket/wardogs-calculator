/*
 * Verifies that the dev server honours .env the same way the build does, so
 * `npm run dev` talks to the same sync service and tile host as a deployed
 * build instead of silently running with the feature off.
 *
 * Run with: npm run test:scripts
 */

import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';

import { spawn } from 'node:child_process';
import { readFile, writeFile, rm, rename } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../..');
const envPath = join(root, '.env');
const backupPath = join(root, '.env.testbackup');

const PORT = Number(process.env.DEV_TEST_PORT || 8806);

/*
 * loadEnv() resolves .env from the repo root, so this test has to write the
 * real file. Anything already there is moved aside first and put back in
 * after() — losing a developer's credentials to a test run would be a
 * genuinely bad trade for the coverage.
 */
let hadExistingEnv = false;

before(async () => {
    if (existsSync(envPath)) {
        hadExistingEnv = true;
        await rename(envPath, backupPath);
    }
});

after(async () => {
    await rm(envPath, { force: true });

    if (hadExistingEnv) {
        await rename(backupPath, envPath);
    }
});

function startDevServer(port) {
    const child = spawn(
        'node',
        ['scripts/dev-server.mjs', `--port=${port}`],
        { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }
    );

    let output = '';
    child.stdout.on('data', d => { output += d.toString(); });
    child.stderr.on('data', d => { output += d.toString(); });

    return {
        child,
        output: () => output,
        async ready() {
            for (let i = 0; i < 80; i++) {
                try {
                    const response = await fetch(
                        `http://localhost:${port}/config/app.json`
                    );
                    if (response.ok) return;
                } catch {
                    /* not listening yet */
                }
                await new Promise(r => setTimeout(r, 250));
            }
            throw new Error(`dev server did not start:\n${output}`);
        }
    };
}

test('dev server injects COLLAB_URL and TILE_BASE_URL', async () => {
    await writeFile(
        envPath,
        'COLLAB_URL=ws://localhost:8799\n' +
        'TILE_BASE_URL=https://tiles.example.test\n'
    );

    const server = startDevServer(PORT);

    try {
        await server.ready();

        const config = await (
            await fetch(`http://localhost:${PORT}/config/app.json`)
        ).json();

        assert.equal(config.collab?.url, 'ws://localhost:8799');

        const map = await (
            await fetch(`http://localhost:${PORT}/maps/bakurani.json`)
        ).json();

        assert.equal(map.tiles?.path, 'https://tiles.example.test/bakurani');

        /* Patching must not disturb anything else in the map definition. */
        assert.equal(map.id, 'bakurani');
        assert.equal(map.tiles.tileSize, 256);
        assert.equal(map.bounds?.minX, 23.35);

        /* The files on disk stay as upstream wrote them. */
        const onDisk = JSON.parse(
            await readFile(join(root, 'maps/bakurani.json'), 'utf8')
        );
        assert.equal(onDisk.tiles.path, 'maps/tiles/bakurani');

        const appOnDisk = JSON.parse(
            await readFile(join(root, 'config/app.json'), 'utf8')
        );
        assert.equal(appOnDisk.collab.url, null);
    } finally {
        server.child.kill();
    }
});

test('without .env the dev server serves the originals', async () => {
    await rm(envPath, { force: true });

    const port = PORT + 1;
    const server = startDevServer(port);

    try {
        await server.ready();

        const config = await (
            await fetch(`http://localhost:${port}/config/app.json`)
        ).json();

        assert.equal(config.collab?.url, null);

        const map = await (
            await fetch(`http://localhost:${port}/maps/bakurani.json`)
        ).json();

        assert.equal(map.tiles?.path, 'maps/tiles/bakurani');

        /* Tiles are still served locally when they are not remote. */
        const tile = await fetch(
            `http://localhost:${port}/maps/tiles/bakurani/zoom_0/0_0.webp`
        );
        assert.ok(tile.ok, `expected a local tile, got ${tile.status}`);

        assert.match(server.output(), /Shared sessions are off/);
    } finally {
        server.child.kill();
    }
});
