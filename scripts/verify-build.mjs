import assert from 'node:assert/strict';
import { readdir, readFile } from 'node:fs/promises';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { runInNewContext } from 'node:vm';
import { analyticsWebsiteId, collabUrl } from './lib/site-config.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist');

function collabOrigin() {
    const configured = collabUrl();

    if (!configured) return null;

    try {
        return new URL(configured).origin;
    } catch {
        return null;
    }
}

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

const appConfig = JSON.parse(await readFile(join(root, 'config', 'app.json'), 'utf8'));
const turnstileEnabled = appConfig.collab?.turnstile?.enabled === true;
const analyticsEnabled = Boolean(analyticsWebsiteId());
const origin = collabOrigin();

const obsRoute = join(dist, 'obs', 'index.html');
const securityMetaPages = htmlFiles.filter(path => path !== obsRoute);

for (const path of securityMetaPages) {
    const page = relative(dist, path);
    const html = await readFile(path, 'utf8');
    assert.match(html, /http-equiv="Content-Security-Policy"/i, `${page}: missing CSP`);
    assert.match(html, /script-src-attr 'none'/, `${page}: inline handlers are not blocked`);
    if (origin) {
        assert.ok(html.includes(origin), `${page}: collab origin is not allowed by CSP`);
    }
    if (turnstileEnabled) {
        assert.match(html, /https:\/\/challenges\.cloudflare\.com/, `${page}: Turnstile is not allowed by CSP`);
    }
    if (analyticsEnabled) {
        assert.match(html, /https:\/\/gateway\.umami\.is/, `${page}: Umami gateway is not allowed by CSP`);
    }
    assert.doesNotMatch(html, /Content-Security-Policy[^>]+localhost/i, `${page}: development origin leaked into CSP`);
}

for (const path of htmlFiles) {
    const page = relative(dist, path);
    const html = await readFile(path, 'utf8');
    const localScripts = html.match(/<script[^>]*\ssrc="js\/[^"]+"[^>]*><\/script>/g) ?? [];
    assert.ok(localScripts.length <= 2, `${page}: ${localScripts.length} separate script tags, the build did not bundle them`);
    for (const tag of localScripts.filter(tag => tag.includes('js/bundles/'))) {
        const bundle = tag.match(/src="([^"?]+)/)[1];
        assert.ok(artifactFiles.includes(join(dist, bundle)), `${page}: ${bundle} is missing from the Pages artifact`);
        assert.match(tag, /\sdefer\s/, `${page}: ${bundle} is not deferred`);
    }
}

const terrainContext = JSON.parse(await readFile(join(root, 'data', 'ballistics', 'terrain-context.json'), 'utf8'));
const terrainMapIds = Object.keys(terrainContext.terrainMaps ?? {});
assert.ok(terrainMapIds.length > 0, 'terrain-context.json has no terrainMaps');

for (const mapId of terrainMapIds) {
    const manifest = join(dist, 'data', 'terrain', mapId, 'manifest.json');
    const heightfield = join(dist, 'data', 'terrain', mapId, 'heightfield.bin');
    assert.ok(artifactFiles.includes(manifest), `${mapId}: terrain manifest is missing from the Pages artifact`);
    assert.ok(artifactFiles.includes(heightfield), `${mapId}: terrain heightfield is missing from the Pages artifact`);
}

assert.equal(artifactFiles.some(path => path.includes(`${join('maps', 'tiles')}`)), false, 'map tiles entered the Pages artifact');

const sitemap = await readFile(join(dist, 'sitemap.xml'), 'utf8');
const robots = await readFile(join(dist, 'robots.txt'), 'utf8');

assert.match(robots, /^Allow:\s*\/$/mi, 'robots.txt does not allow crawling');
assert.match(robots, /Sitemap:\s*https:\/\/wardogs-artillery\.com\/sitemap\.xml/i, 'production sitemap is not advertised');

const mapRuntime = await readFile(join(root, 'js', 'map', 'maps.js'), 'utf8');
const selected = { value: '' };
let replacedUrl = '';
const runtimeContext = {
    URL,
    MAPS: {
        bakurani: { id: 'bakurani', w: 16, h: 16 },
        ozeti: { id: 'ozeti', w: 32, h: 32 }
    },
    S: { map: 'bakurani', w: 16, h: 16 },
    $: id => id === 'mapSelect' ? selected : null,
    window: {
        location: { href: 'https://wardogs-artillery.com/?source=landing&map=ozeti#result' },
        history: {
            state: null,
            replaceState: (_state, _title, url) => { replacedUrl = url; }
        }
    }
};

runInNewContext(mapRuntime, runtimeContext);
assert.equal(runtimeContext.applyMapQuerySelection(), true, 'valid map CTA parameter was rejected');
assert.equal(runtimeContext.S.map, 'ozeti', 'valid map CTA did not select the map');
assert.equal(selected.value, 'ozeti', 'map select UI was not synchronized');
assert.equal(replacedUrl, '/?source=landing#result', 'map query was not consumed safely');

runtimeContext.window.location.href = 'https://wardogs-artillery.com/?map=constructor';
runtimeContext.S.map = 'bakurani';
replacedUrl = '';
assert.equal(runtimeContext.applyMapQuerySelection(), false, 'unknown map CTA parameter was accepted');
assert.equal(runtimeContext.S.map, 'bakurani', 'unknown map CTA changed application state');
assert.equal(replacedUrl, '', 'unknown map CTA rewrote the URL');

console.log('Production artifact security and map SEO checks passed.');
