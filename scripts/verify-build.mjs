import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

async function files(directory) {
    const output = [];
    for (const entry of await readdir(directory, { withFileTypes: true })) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) output.push(...await files(path));
        else output.push(path);
    }
    return output;
}

const artifactFiles = await files(dist);
const htmlFiles = artifactFiles.filter(path => path.endsWith('.html'));
assert.ok(htmlFiles.length > 1, 'expected desktop and mobile HTML routes');

for (const path of htmlFiles) {
    const page = relative(dist, path);
    const html = await readFile(path, 'utf8');
    assert.match(html, /http-equiv="Content-Security-Policy"/i, `${page}: missing CSP`);
    assert.match(html, /script-src-attr 'none'/, `${page}: inline handlers are not blocked`);
    assert.match(html, /https:\/\/lobby\.wardogs-artillery\.com/, `${page}: lobby is not allowed by CSP`);
    assert.match(html, /https:\/\/challenges\.cloudflare\.com/, `${page}: Turnstile is not allowed by CSP`);
    assert.doesNotMatch(html, /Content-Security-Policy[^>]+localhost/i, `${page}: development origin leaked into CSP`);
}

assert.equal(artifactFiles.some(path => path.endsWith('.bin')), false, 'terrain binaries entered the Pages artifact');
assert.equal(artifactFiles.some(path => path.includes(`${join('maps', 'tiles')}`)), false, 'map tiles entered the Pages artifact');

console.log('Production artifact security checks passed.');
