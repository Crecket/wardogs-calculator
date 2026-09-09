import { cp, mkdir, readFile, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEO_ALTERNATE_NAMES, SEO_PAGE_CONTENT } from './seo-content.mjs';
import { buildObsPage } from './lib/obs-page.mjs';
import {
    analyticsWebsiteId,
    collabUrl,
    patchAppConfig,
    patchMapConfig,
    tileBaseUrl,
    tileFallbackBaseUrl
} from './lib/site-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = join(root, 'dist');

const sourceDirs = [
    'assets',
    'config',
    'data',
    'js',
    'locales',
    'maps'
];

const commonSourceFiles = [
    'robots.txt',
    'LICENSE'
];

const desktopStyleFiles = [
    'styles/desktop/base.css',
    'styles/desktop/layout.css',
    'styles/desktop/controls.css',
    'styles/desktop/map.css',
    'styles/desktop/saved-targets.css',
    'styles/desktop/chrome.css',
    'styles/desktop/map-tools.css',
    'styles/desktop/motd.css',
    'styles/desktop/popout.css',
];

const obsStyleFiles = [
    'styles/obs/overlay.css'
];

const mobileStyleFiles = [
    'styles/mobile/shell.css',
    'styles/mobile/map.css',
    'styles/mobile/tools.css',
    'styles/mobile/sheet.css',
    'styles/mobile/responsive.css'
];

async function exists(path) {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

function tileOrigins() {
    const origins = [];

    for (const base of [tileBaseUrl(), tileFallbackBaseUrl()]) {
        if (!base) continue;

        try {
            origins.push(new URL(base).origin);
        } catch {
            /* a relative base needs no origin of its own */
        }
    }

    return [...new Set(origins)];
}

function collabOrigins() {
    const configured = collabUrl();

    if (!configured) return [];

    try {
        const server = new URL(configured);
        const origins = [server.origin];

        if (server.protocol === 'wss:') origins.push(`https://${server.host}`);
        if (server.protocol === 'ws:') origins.push(`http://${server.host}`);

        return origins;
    } catch {
        return [];
    }
}

function addProductionSecurityMeta(html, appConfig) {
    const collab = appConfig.collab || {};
    const turnstileEnabled = collab.turnstile?.enabled === true;
    const analyticsEnabled = Boolean(analyticsWebsiteId());
    const origins = tileOrigins();

    const connectSources = new Set(["'self'"]);
    for (const origin of origins) connectSources.add(origin);
    if (analyticsEnabled) {
        connectSources.add('https://cloud.umami.is');
        connectSources.add('https://gateway.umami.is');
    }

    for (const collabOrigin of collabOrigins()) connectSources.add(collabOrigin);
    if (turnstileEnabled) connectSources.add('https://challenges.cloudflare.com');

    const scriptSources = ["'self'"];
    if (analyticsEnabled) scriptSources.push('https://cloud.umami.is');
    if (turnstileEnabled) scriptSources.push('https://challenges.cloudflare.com');

    const imageSources = [
        "'self'",
        'data:',
        'blob:'
    ];
    imageSources.push(...origins);
    if (turnstileEnabled) imageSources.push('https://challenges.cloudflare.com');

    const policy = [
        "default-src 'self'",
        `script-src ${scriptSources.join(' ')}`,
        "script-src-attr 'none'",
        "style-src 'self' 'unsafe-inline'",
        `img-src ${imageSources.join(' ')}`,
        `connect-src ${[...connectSources].join(' ')}`,
        `frame-src ${turnstileEnabled ? 'https://challenges.cloudflare.com' : "'none'"}`,
        "font-src 'self' data:",
        "object-src 'none'",
        "base-uri 'self'",
        "form-action 'self'",
        "worker-src 'self' blob:",
        'upgrade-insecure-requests'
    ].join('; ');

    const metadata = [
        `<meta content="${policy}" http-equiv="Content-Security-Policy"/>`,
        '<meta content="no-referrer" name="referrer"/>'
    ].join('\n');

    return html.replace(
        /(<meta\b[^>]*\bcharset\s*=\s*["'][^"']+["'][^>]*>)/i,
        `$1\n${metadata}`
    );
}

async function copyIfExists(source, target, filter) {
    if (!(await exists(source))) return;
    await cp(source, target, { recursive: true, filter });
}

/*
 * Deployment settings come from the environment or .env — see
 * scripts/lib/site-config.mjs for why they are not committed.
 *
 *     COLLAB_URL=wss://sync.example.com \
 *     TILE_BASE_URL=https://tiles.example.com npm run build
 *
 * The tile pyramids are ~43,700 files and 1.4 GB, more than most static
 * hosts will take (Cloudflare Pages caps a deployment at 20,000 files).
 * Pointing them at object storage drops the built site to a few hundred.
 */

async function bundleStyleFiles(files, outputName) {
    let css = '';

    for (const file of files) {
        css += await readFile(
            join(root, file),
            'utf8'
        );
    }

    await writeFile(
        join(dist, outputName),
        css,
        'utf8'
    );
}

async function bundleStyles() {
    await bundleStyleFiles(
        desktopStyleFiles,
        'style.css'
    );

    await bundleStyleFiles(
        mobileStyleFiles,
        'mobile.css'
    );

    await bundleStyleFiles(
        obsStyleFiles,
        'obs.css'
    );

    await mkdir(
        join(dist, 'styles'),
        { recursive: true }
    );
}

async function copySharedStatic() {
    const tilesDir = join(root, 'maps', 'tiles');

    /*
     * With tiles served remotely there is no reason to copy 1.4 GB of them
     * into the artifact.
     */
    const skipTiles = tileBaseUrl()
        ? source => source !== tilesDir &&
            !source.startsWith(tilesDir + sep)
        : undefined;

    for (const dir of sourceDirs) {
        await copyIfExists(
            join(root, dir),
            join(dist, dir),
            dir === 'maps'
                ? skipTiles
                : undefined
        );
    }

    for (const file of commonSourceFiles) {
        await copyIfExists(
            join(root, file),
            join(dist, file)
        );
    }

    for (const file of ['CNAME']) {
        await copyIfExists(
            join(root, file),
            join(dist, file)
        );
    }
}

function replaceElementTextById(html, id, value) {
    const escapedId = id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const pattern = new RegExp(
        `(<([a-z0-9]+)\\b[^>]*\\bid="${escapedId}"[^>]*>)[\\s\\S]*?(</\\2>)`,
        'i'
    );

    return html.replace(pattern, `$1${value}$3`);
}

function normalizeDesktopRuntimePlaceholders(html) {
    const runtimeValueIds = [
        'range',
        'rangeStatus',
        'distm',
        'dist',
        'angle',
        'dx',
        'dy'
    ];

    let output = html;

    for (const id of runtimeValueIds) {
        output = replaceElementTextById(
            output,
            id,
            '—'
        );
    }

    return output;
}

function refreshSeoMetadata(html, appConfig) {
    const version = appConfig?.site?.footer?.version;

    let output = html.replace(
        /<head>[\s\S]*?<\/head>/i,
        head => head
            .replace(/\bSPG\b/g, 'SPH-2')
            .replace(/mortar and SPH-2 solutions/gi, 'L81 Mortar and SPH-2 firing solutions')
    );

    output = output.replace(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i,
        (match, jsonText) => {
            try {
                const data = JSON.parse(jsonText.trim());

                data.alternateName = 'WARDOGS Artillery Calculator & Tactical Map';

                if (version) {
                    data.softwareVersion = version;
                }

                if (typeof data.description === 'string') {
                    data.description = data.description
                        .replace(/\bSPG\b/g, 'SPH-2')
                        .replace(/mortar and SPH-2 solutions/gi, 'L81 Mortar and SPH-2 firing solutions');
                }

                return `<script type="application/ld+json">${JSON.stringify(data, null, 2)}</script>`;
            } catch {
                return match;
            }
        }
    );

    return output;
}

function escapeSeoHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function escapeSeoRegExp(value) {
    return String(value)
        .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function replaceSeoTitle(
    html,
    title
) {
    if (!title) {
        return html;
    }

    return html.replace(
        /<title>[\s\S]*?<\/title>/i,
        `<title>${escapeSeoHtml(title)}</title>`
    );
}

function replaceSeoMetaContent(
    html,
    attribute,
    key,
    value
) {
    const pattern = new RegExp(
        `<meta\\b[^>]*\\b${escapeSeoRegExp(attribute)}="${escapeSeoRegExp(key)}"[^>]*>`,
        'i'
    );

    return html.replace(
        pattern,
        tag => {
            const content =
                escapeSeoHtml(value);

            if (/\bcontent="[^"]*"/i.test(tag)) {
                return tag.replace(
                    /\bcontent="[^"]*"/i,
                    `content="${content}"`
                );
            }

            return tag.replace(
                />$/,
                ` content="${content}">`
            );
        }
    );
}

function refreshSeoV2StructuredData(
    html,
    appConfig,
    copy
) {
    const version =
        appConfig?.site?.footer?.version;

    return html.replace(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/i,
        (match, jsonText) => {
            try {
                const data =
                    JSON.parse(
                        jsonText.trim()
                    );

                data.description =
                    copy.description;

                data.url =
                    'https://wardogs-artillery.com/';

                data.inLanguage = 'en';

                data.alternateName =
                    [...(copy.alternateNames || SEO_ALTERNATE_NAMES)];

                data.featureList =
                    [...copy.features];

                if (version) {
                    data.softwareVersion =
                        version;
                }

                return `<script type="application/ld+json">${JSON.stringify(data, null, 2)}</script>`;
            } catch {
                return match;
            }
        }
    );
}

function applySeoV2(
    html,
    appConfig
) {
    const copy = SEO_PAGE_CONTENT.en;

    let output =
        replaceSeoMetaContent(
            html,
            'name',
            'description',
            copy.description
        );

    if (copy.title) {
        output =
            replaceSeoTitle(
                output,
                copy.title
            );

        output =
            replaceSeoMetaContent(
                output,
                'property',
                'og:title',
                copy.title
            );

        output =
            replaceSeoMetaContent(
                output,
                'name',
                'twitter:title',
                copy.title
            );
    }

    output =
        replaceSeoMetaContent(
            output,
            'property',
            'og:description',
            copy.description
        );

    output =
        replaceSeoMetaContent(
            output,
            'name',
            'twitter:description',
            copy.description
        );

    if (copy.imageAlt) {
        output =
            replaceSeoMetaContent(
                output,
                'property',
                'og:image:alt',
                copy.imageAlt
            );
    }

    output =
        refreshSeoV2StructuredData(
            output,
            appConfig,
            copy
        );

    return output;
}

function addMobileAlternate(html) {
    const mobileUrl = 'https://wardogs-artillery.com/mobile/';
    const mobileAlternate = `<link href="${mobileUrl}" media="only screen and (max-width: 900px)" rel="alternate"/>`;

    if (html.includes(mobileAlternate)) {
        return html;
    }

    return html.replace(
        /(<link\b[^>]*\brel="canonical"[^>]*\/?>)/i,
        `$1\n${mobileAlternate}`
    );
}

const ANALYTICS_TAG_PATTERN =
    /\s*<script[^>]*src=["']https:\/\/cloud\.umami\.is\/script\.js["'][^>]*><\/script>/gi;

/*
 * Analytics are off unless ANALYTICS_WEBSITE_ID says otherwise.
 *
 * The tracker tag is committed in the page shells, so a build that did
 * nothing here would report a fork's traffic into upstream's dashboard.
 * Stripping it in the built copy rather than editing the shells keeps
 * those files byte-identical to upstream, the same way COLLAB_URL and
 * TILE_BASE_URL are kept out of the tracked config — see
 * scripts/lib/site-config.mjs.
 *
 * The flag matches the dev server's, so a build with analytics off
 * behaves exactly like local development: js/core/analytics.js drops
 * events instead of queueing them for a tracker that never arrives.
 */
function prepareAnalytics(html) {
    const websiteId = analyticsWebsiteId();

    if (websiteId) {
        return html.replace(
            ANALYTICS_TAG_PATTERN,
            tag => tag.replace(
                /data-website-id=["'][^"']*["']/i,
                `data-website-id="${websiteId}"`
            )
        );
    }

    return html
        .replace(ANALYTICS_TAG_PATTERN, '')
        .replace(
            '<head>',
            '<head>\n' +
            '<script>window.__WARDOGS_ANALYTICS_DISABLED__ = true;</script>'
        );
}

async function writeDesktopPage(source, target, appConfig) {
    const html = prepareAnalytics(await readFile(source, 'utf8'));
    const prepared = addProductionSecurityMeta(
        addMobileAlternate(
            applySeoV2(
                refreshSeoMetadata(
                    normalizeDesktopRuntimePlaceholders(html),
                    appConfig
                ),
                appConfig
            )
        ),
        appConfig
    );

    await writeFile(target, prepared, 'utf8');
}

async function buildDesktopPages() {
    const appConfig = await readAppConfig();

    await writeDesktopPage(
        join(root, 'src', 'pages', 'index.html'),
        join(dist, 'index.html'),
        appConfig
    );
}

/*
 * Repoints every map's tiles.path at TILE_BASE_URL, in the built copy only.
 *
 * No client change is needed for this: tile URLs go through resourceURL(),
 * which is `new URL(path, BASE_PATH)`, and an absolute URL ignores the base.
 */
async function applyTileBaseUrl() {
    const base = tileBaseUrl();

    if (!base) {
        return;
    }

    const mapsDir = join(dist, 'maps');
    const entries = await readdir(mapsDir).catch(() => []);

    let repointed = 0;

    for (const entry of entries) {
        if (!entry.endsWith('.json')) {
            continue;
        }

        const path = join(mapsDir, entry);

        const patched = patchMapConfig(
            JSON.parse(await readFile(path, 'utf8'))
        );

        if (!patched) {
            continue;
        }

        await writeFile(
            path,
            JSON.stringify(patched, null, 2) + '\n',
            'utf8'
        );

        repointed++;
    }

    console.log(
        `Tiles served from ${base} (${repointed} map${repointed === 1 ? '' : 's'} repointed)`
    );
}

async function readAppConfig() {
    const path = join(root, 'config', 'app.json');
    return JSON.parse(await readFile(path, 'utf8'));
}

/*
 * The shared-session service URL is deployment-specific, so config/app.json
 * keeps it null and a build supplies it:
 *
 *     COLLAB_URL=wss://your-worker.example.com npm run build
 *
 * Committing a real URL instead would point every build of this repo at one
 * person's Cloudflare account — including anyone who forked it.
 */
async function applyCollabUrl() {
    if (!collabUrl()) {
        return;
    }

    const path = join(dist, 'config', 'app.json');

    const patched = patchAppConfig(
        JSON.parse(await readFile(path, 'utf8'))
    );

    if (!patched) {
        return;
    }

    await writeFile(
        path,
        JSON.stringify(patched, null, 2) + '\n',
        'utf8'
    );

    console.log(`Shared sessions enabled against ${collabUrl()}`);
}

function escapeXml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

async function buildSitemap() {
    const appConfig = await readAppConfig();
    const lastModified = appConfig?.site?.lastModified
        || new Date().toISOString().slice(0, 10);

    const sitemap = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
        '  <url>',
        '    <loc>https://wardogs-artillery.com/</loc>',
        '    <changefreq>weekly</changefreq>',
        `    <lastmod>${escapeXml(lastModified)}</lastmod>`,
        '  </url>',
        '</urlset>',
        ''
    ].join('\n');

    await writeFile(
        join(dist, 'sitemap.xml'),
        sitemap,
        'utf8'
    );
}

async function buildMobilePages() {
    const mobileRoot = join(
        dist,
        'mobile'
    );

    await mkdir(
        mobileRoot,
        { recursive: true }
    );

    const template = await readFile(
        join(
            root,
            'src',
            'pages',
            'mobile',
            'index.html'
        ),
        'utf8'
    );

    const appConfig =
        await readAppConfig();

    const html = addProductionSecurityMeta(
        prepareAnalytics(
            template.replace(
                '<meta content="noindex, follow" name="robots"/>',
                '<meta content="index, follow, max-image-preview:large" name="robots"/>'
            )
        ),
        appConfig
    );

    await writeFile(
        join(
            mobileRoot,
            'index.html'
        ),
        html,
        'utf8'
    );
}

/*
 * The OBS overlay route. Derived from the desktop shell rather than written
 * as a page of its own — see scripts/lib/obs-page.mjs.
 */
async function buildObsRoute() {
    const target = join(dist, 'obs');

    await mkdir(target, { recursive: true });

    await writeFile(
        join(target, 'index.html'),
        await buildObsPage(),
        'utf8'
    );
}

/*
 * One repository, one Pages artifact, one custom domain.
 * Desktop and mobile page shells share the same JS, locales,
 * maps, tiles, configuration and localStorage origin.
 */
await rm(
    dist,
    { recursive: true, force: true }
);

/* Remove the legacy standalone mobile build if it exists. */
await rm(
    join(root, 'dist-mobile'),
    { recursive: true, force: true }
);

await mkdir(
    dist,
    { recursive: true }
);

await copySharedStatic();
await applyCollabUrl();
await applyTileBaseUrl();
await bundleStyles();
await buildDesktopPages();
await buildSitemap();
await buildMobilePages();
await buildObsRoute();

console.log(`Built desktop + mobile site into ${dist}`);
console.log(`Mobile entry: ${join(dist, 'mobile', 'index.html')}`);
