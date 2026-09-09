import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { request } from 'node:http';
import { createServer } from 'node:net';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..');

function unusedPort() {
    return new Promise((resolvePort, reject) => {
        const server = createServer();
        server.once('error', reject);
        server.listen(0, '127.0.0.1', () => {
            const { port } = server.address();
            server.close(error => error ? reject(error) : resolvePort(port));
        });
    });
}

function get(port, path, options = {}) {
    return new Promise((resolveResponse, reject) => {
        const outgoing = request({
            hostname: '127.0.0.1',
            port,
            path,
            method: options.method || 'GET',
            headers: options.headers || {}
        }, incoming => {
            incoming.resume();
            incoming.once('end', () => resolveResponse(incoming));
        });
        outgoing.once('error', reject);
        outgoing.end();
    });
}

async function waitUntilReady(port, child) {
    for (let attempt = 0; attempt < 40; attempt++) {
        if (child.exitCode !== null) throw new Error('development server exited before startup');
        try {
            return await get(port, '/');
        } catch {
            await new Promise(resolveWait => setTimeout(resolveWait, 50));
        }
    }
    throw new Error('development server startup timeout');
}

test('development server exposes only public files and rejects hostile requests', async t => {
    const port = await unusedPort();
    const child = spawn(process.execPath, [
        'scripts/dev-server.mjs',
        '--host', '127.0.0.1',
        '--port', String(port)
    ], { cwd: root, stdio: ['ignore', 'ignore', 'pipe'] });
    let stderr = '';
    child.stderr.setEncoding('utf8');
    child.stderr.on('data', chunk => { stderr += chunk; });
    t.after(() => { if (child.exitCode === null) child.kill('SIGTERM'); });

    assert.equal((await waitUntilReady(port, child)).statusCode, 200, stderr);
    const script = await get(port, '/js/core/core.js');
    assert.equal(script.statusCode, 200);
    assert.equal(script.headers['x-content-type-options'], 'nosniff');
    assert.equal((await get(port, '/package.json')).statusCode, 404);
    assert.equal((await get(port, '/%2e%2e/package.json')).statusCode, 404);
    assert.equal((await get(port, '/', { headers: { Host: `evil.test:${port}` } })).statusCode, 403);
    assert.equal((await get(port, '/', { headers: { Host: `evil.test@127.0.0.1:${port}` } })).statusCode, 403);
    assert.equal((await get(port, '/', { headers: { Host: `203.0.113.10:${port}` } })).statusCode, 403);
    assert.equal((await get(port, '/', { method: 'POST' })).statusCode, 405);
});
