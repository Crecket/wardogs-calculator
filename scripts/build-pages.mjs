import { cp, mkdir, readFile, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { SEO_ALTERNATE_NAMES, SEO_PAGE_CONTENT } from './seo-content.mjs';

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

async function copyIfExists(source, target) {
    if (!(await exists(source))) return;
    await cp(source, target, { recursive: true });
}

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
    for (const dir of sourceDirs) {
        await copyIfExists(
            join(root, dir),
            join(dist, dir)
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

    output =
        injectSeoAbout(
            output,
            copy
        );

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

async function readAppConfig() {
    const path = join(root, 'config', 'app.json');
    return JSON.parse(await readFile(path, 'utf8'));
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

    const indexableTemplate = template.replace(
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
await bundleStyles();
await buildDesktopPages();
await buildSitemap();
await buildMobilePages();

console.log(`Built desktop + mobile site into ${dist}`);
console.log(`Mobile entry: ${join(dist, 'mobile', 'index.html')}`);
