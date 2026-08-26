import { cp, mkdir, readFile, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEO_ALTERNATE_NAMES, SEO_PAGE_CONTENT } from './seo-content.mjs';
import {
    collabUrl,
    patchAppConfig,
    patchMapConfig,
    tileBaseUrl
} from './lib/site-config.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = join(root, 'dist');

const NON_INDEXABLE_PAGE_LANGUAGES =
    new Set(['cat']);

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
    'styles/desktop/seo.css'
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
            .replace(/mortar and SPH-2 solutions/gi, 'Mortar and SPH-2 firing solutions')
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
                        .replace(/mortar and SPH-2 solutions/gi, 'Mortar and SPH-2 firing solutions');
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

                data.alternateName =
                    [...SEO_ALTERNATE_NAMES];

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

function injectFaqStructuredData(
    html,
    faq
) {
    if (
        !Array.isArray(faq) ||
        !faq.length ||
        html.includes('\"@type\": \"FAQPage\"')
    ) {
        return html;
    }

    const data = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: faq.map(item => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer
            }
        }))
    };

    const script =
        `<script type="application/ld+json">${JSON.stringify(data, null, 2)}</script>`;

    return html.replace(
        /<\/head>/i,
        `${script}\n</head>`
    );
}

function renderSeoTopicLinks(cluster, faq) {
    const links = [
        {
            id: 'wardogs-artillery-calculator',
            label: cluster.heading
        },
        ...cluster.sections.map(section => ({
            id: section.id,
            label: section.heading
        }))
    ];

    if (Array.isArray(faq) && faq.length) {
        links.push({
            id: 'wardogs-calculator-faq',
            label: 'FAQ'
        });
    }

    return links
        .map(link => (
            `<a href="#${escapeSeoHtml(link.id)}">${escapeSeoHtml(link.label)}</a>`
        ))
        .join('');
}

function renderSeoFaq(faq) {
    if (!Array.isArray(faq) || !faq.length) {
        return '';
    }

    const items = faq
        .map(item => [
            '<details class="seo-faq-item">',
            `<summary>${escapeSeoHtml(item.question)}</summary>`,
            `<p>${escapeSeoHtml(item.answer)}</p>`,
            '</details>'
        ].join('\n'))
        .join('\n');

    return [
        '<section class="seo-faq" id="wardogs-calculator-faq">',
        '<h3>WARDOGS Artillery Calculator FAQ</h3>',
        items,
        '</section>'
    ].join('\n');
}

function injectSeoContentCluster(
    html,
    copy
) {
    const cluster = copy.cluster;

    if (
        !cluster ||
        !Array.isArray(cluster.sections) ||
        !cluster.sections.length ||
        html.includes('class="seo-content-cluster"')
    ) {
        return html;
    }

    const sections = cluster.sections
        .map(section => [
            `<section class="seo-topic" id="${escapeSeoHtml(section.id)}">`,
            `<h3>${escapeSeoHtml(section.heading)}</h3>`,
            `<p>${escapeSeoHtml(section.body)}</p>`,
            '</section>'
        ].join('\n'))
        .join('\n');

    const block = [
        '<div class="section seo-content-cluster">',
        `<h2 id="wardogs-artillery-calculator">${escapeSeoHtml(cluster.heading)}</h2>`,
        `<p class="seo-content-lead">${escapeSeoHtml(cluster.intro)}</p>`,
        `<nav aria-label="${escapeSeoHtml(cluster.navLabel)}" class="seo-topic-nav">`,
        renderSeoTopicLinks(cluster, copy.faq),
        '</nav>',
        '<div class="seo-topic-list">',
        sections,
        '</div>',
        renderSeoFaq(copy.faq),
        '</div>'
    ].join('\n');

    return html.replace(
        /<\/aside>/i,
        `${block}\n</aside>`
    );
}

function injectSeoAbout(
    html,
    copy
) {
    if (
        html.includes(
            'class="seo-about"'
        )
    ) {
        return html;
    }

    const block = [
        '<div class="section seo-about-section">',
        '<details class="seo-about">',
        `<summary>${escapeSeoHtml(copy.heading)}</summary>`,
        '<div class="seo-about-copy">',
        `<p>${escapeSeoHtml(copy.intro)}</p>`,
        `<p>${escapeSeoHtml(copy.usage)}</p>`,
        '</div>',
        '</details>',
        '</div>'
    ].join('\n');

    return html.replace(
        /<\/aside>/i,
        `${block}\n</aside>`
    );
}

function applySeoV2(
    html,
    appConfig,
    language
) {
    const copy =
        SEO_PAGE_CONTENT[language] ||
        SEO_PAGE_CONTENT.en;

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

    output =
        refreshSeoV2StructuredData(
            output,
            appConfig,
            copy
        );

    if (copy.cluster) {
        output =
            injectSeoContentCluster(
                output,
                copy
            );

        output =
            injectFaqStructuredData(
                output,
                copy.faq
            );
    } else {
        output =
            injectSeoAbout(
                output,
                copy
            );
    }

    return output;
}

function mobileUrlForLanguage(language) {
    return language === 'en'
        ? 'https://wardogs-artillery.com/mobile/'
        : `https://wardogs-artillery.com/mobile/${language}/`;
}

function addMobileAlternate(html, language) {
    const mobileUrl = mobileUrlForLanguage(language);
    const mobileAlternate = `<link href="${mobileUrl}" media="only screen and (max-width: 900px)" rel="alternate"/>`;

    if (html.includes(mobileAlternate)) {
        return html;
    }

    return html.replace(
        /(<link\b[^>]*\brel="canonical"[^>]*\/?>)/i,
        `$1\n${mobileAlternate}`
    );
}

async function writeDesktopPage(source, target, appConfig, language) {
    const html = await readFile(source, 'utf8');
    const prepared = addMobileAlternate(
        applySeoV2(
            refreshSeoMetadata(
                normalizeDesktopRuntimePlaceholders(html),
                appConfig
            ),
            appConfig,
            language
        ),
        language
    );

    await writeFile(target, prepared, 'utf8');
}

async function buildDesktopPages() {
    const appConfig = await readAppConfig();

    await writeDesktopPage(
        join(root, 'src', 'pages', 'index.html'),
        join(dist, 'index.html'),
        appConfig,
        'en'
    );

    const localizedDir = join(
        root,
        'src',
        'pages',
        'locales'
    );

    if (!(await exists(localizedDir))) {
        return;
    }

    const files = await readdir(localizedDir);

    for (const file of files) {
        if (!file.endsWith('.html')) continue;

        const lang = file.slice(0, -5);
        const targetDir = join(dist, lang);

        await mkdir(targetDir, { recursive: true });
        await writeDesktopPage(
            join(localizedDir, file),
            join(targetDir, 'index.html'),
            appConfig,
            lang
        );
    }
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

async function getDesktopLanguages() {
    const localizedDir = join(
        root,
        'src',
        'pages',
        'locales'
    );

    if (!(await exists(localizedDir))) {
        return ['en'];
    }

    const files = await readdir(localizedDir);
    const localized = files
        .filter(file => file.endsWith('.html'))
        .map(file => file.slice(0, -5))
        .filter(Boolean)
        .filter(
            language =>
                !NON_INDEXABLE_PAGE_LANGUAGES.has(
                    language
                )
        )
        .sort();

    return ['en', ...localized];
}

function escapeXml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

function desktopUrlForLanguage(language) {
    return language === 'en'
        ? 'https://wardogs-artillery.com/'
        : `https://wardogs-artillery.com/${language}/`;
}

async function buildSitemap() {
    const appConfig = await readAppConfig();
    const languages = await getDesktopLanguages();
    const lastModified = appConfig?.site?.lastModified
        || new Date().toISOString().slice(0, 10);

    const alternateLinks = languages
        .map(language => (
            `    <xhtml:link rel="alternate" hreflang="${escapeXml(language)}" href="${escapeXml(desktopUrlForLanguage(language))}" />`
        ))
        .concat(
            '    <xhtml:link rel="alternate" hreflang="x-default" href="https://wardogs-artillery.com/" />'
        )
        .join('\n');

    const urls = languages
        .map(language => [
            '  <url>',
            `    <loc>${escapeXml(desktopUrlForLanguage(language))}</loc>`,
            alternateLinks,
            '    <changefreq>weekly</changefreq>',
            `    <lastmod>${escapeXml(lastModified)}</lastmod>`,
            '  </url>'
        ].join('\n'))
        .join('\n');

    const sitemap = [
        '<?xml version="1.0" encoding="utf-8"?>',
        '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">',
        urls,
        '</urlset>',
        ''
    ].join('\n');

    await writeFile(
        join(dist, 'sitemap.xml'),
        sitemap,
        'utf8'
    );
}

function renderMobileLocale(template, language) {
    const isDefault = language === 'en';

    const desktopCanonical = isDefault
        ? 'https://wardogs-artillery.com/'
        : `https://wardogs-artillery.com/${language}/`;

    const baseHref = isDefault
        ? '../'
        : '../../';

    const indexableTemplate =
        NON_INDEXABLE_PAGE_LANGUAGES.has(
            language
        )
            ? template
            : template.replace(
                '<meta content="noindex, follow" name="robots"/>',
                '<meta content="index, follow, max-image-preview:large" name="robots"/>'
            );

    return indexableTemplate
        .replace(
            '<html data-page-language="en" lang="en">',
            `<html data-page-language="${language}" lang="${language}">`
        )
        .replace(
            '<base href="../"/>',
            `<base href="${baseHref}"/>`
        )
        .replace(
            '<link href="https://wardogs-artillery.com/" rel="canonical"/>',
            `<link href="${desktopCanonical}" rel="canonical"/>`
        )
        .replace(
            'href="../?desktop=1"',
            `href="${desktopCanonical}?desktop=1"`
        );
}

async function getMobileLanguages() {
    const indexPath = join(
        root,
        'locales',
        'index.json'
    );

    const index = JSON.parse(
        await readFile(indexPath, 'utf8')
    );

    const configured = Array.isArray(index.languages)
        ? index.languages
            .map(item => item?.id)
            .filter(Boolean)
        : [];

    return Array.from(
        new Set(['en', ...configured])
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

    const languages =
        await getMobileLanguages();

    for (const language of languages) {
        const html = renderMobileLocale(
            template,
            language
        );

        if (language === 'en') {
            await writeFile(
                join(
                    mobileRoot,
                    'index.html'
                ),
                html,
                'utf8'
            );
            continue;
        }

        const targetDir = join(
            mobileRoot,
            language
        );

        await mkdir(
            targetDir,
            { recursive: true }
        );

        await writeFile(
            join(
                targetDir,
                'index.html'
            ),
            html,
            'utf8'
        );
    }
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

console.log(`Built desktop + mobile site into ${dist}`);
console.log(`Mobile entry: ${join(dist, 'mobile', 'index.html')}`);
