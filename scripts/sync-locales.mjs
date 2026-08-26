import {
    mkdir,
    readFile,
    readdir,
    stat,
    writeFile
} from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ZH_CN_SEO } from './zh-cn-seo.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');
const dist = join(root, 'dist');
const SITE_ORIGIN = 'https://wardogs-artillery.com';
const DEFAULT_LANGUAGE = 'en';
const ZH_CN_ID = 'zh-cn';

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function escapeXml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');
}

async function exists(path) {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

async function listFilesRecursive(directory) {
    const entries = await readdir(directory, { withFileTypes: true });
    const files = [];

    for (const entry of entries) {
        const path = join(directory, entry.name);
        if (entry.isDirectory()) {
            files.push(...await listFilesRecursive(path));
        } else if (entry.isFile()) {
            files.push(path);
        }
    }

    return files;
}

async function readLocaleRegistry() {
    const index = JSON.parse(
        await readFile(join(root, 'locales', 'index.json'), 'utf8')
    );

    const languages = Array.isArray(index.languages)
        ? index.languages
        : [];

    return languages
        .filter(item => item?.id && item?.file)
        .map(item => ({
            ...item,
            id: String(item.id).toLowerCase(),
            hreflang: item.hreflang || item.id,
            ogLocale: item.ogLocale || null,
            indexable: item.indexable !== false
        }));
}

function desktopUrl(definition) {
    return definition.id === DEFAULT_LANGUAGE
        ? `${SITE_ORIGIN}/`
        : `${SITE_ORIGIN}/${definition.id}/`;
}

function mobileUrl(definition) {
    return definition.id === DEFAULT_LANGUAGE
        ? `${SITE_ORIGIN}/mobile/`
        : `${SITE_ORIGIN}/mobile/${definition.id}/`;
}

function replaceTitle(html, title) {
    return html.replace(
        /<title>[\s\S]*?<\/title>/i,
        `<title>${escapeHtml(title)}</title>`
    );
}

function replaceOrInsertMeta(html, attribute, key, content) {
    const metaPattern = new RegExp(
        `<meta\\b[^>]*\\b${attribute}="${key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}"[^>]*>`,
        'i'
    );
    const replacement = `<meta ${attribute}="${escapeHtml(key)}" content="${escapeHtml(content)}"/>`;

    if (metaPattern.test(html)) {
        return html.replace(metaPattern, replacement);
    }

    return html.replace(/<\/head>/i, `${replacement}\n</head>`);
}

function replaceCanonical(html, url) {
    const link = `<link href="${escapeHtml(url)}" rel="canonical"/>`;
    if (/<link\b[^>]*\brel="canonical"[^>]*>/i.test(html)) {
        return html.replace(/<link\b[^>]*\brel="canonical"[^>]*>/i, link);
    }
    return html.replace(/<\/head>/i, `${link}\n</head>`);
}

function removeHreflangLinks(head) {
    return head.replace(
        /<link\b[^>]*>\s*/gi,
        tag => (
            /\brel="alternate"/i.test(tag) &&
            /\bhreflang="/i.test(tag)
                ? ''
                : tag
        )
    );
}

function syncHreflang(html, indexableLanguages) {
    return html.replace(
        /<head>[\s\S]*?<\/head>/i,
        head => {
            const cleaned = removeHreflangLinks(head);
            const links = indexableLanguages
                .map(definition => (
                    `<link href="${escapeHtml(desktopUrl(definition))}" hreflang="${escapeHtml(definition.hreflang)}" rel="alternate"/>`
                ))
                .concat(
                    `<link href="${SITE_ORIGIN}/" hreflang="x-default" rel="alternate"/>`
                )
                .join('\n');

            return cleaned.replace(
                /(<link\b[^>]*\brel="canonical"[^>]*>)/i,
                `$1\n${links}`
            );
        }
    );
}

function syncOgLocales(html, current, indexableLanguages) {
    if (!current?.ogLocale) {
        return html;
    }

    return html.replace(
        /<head>[\s\S]*?<\/head>/i,
        head => {
            const cleaned = head.replace(
                /<meta\b[^>]*\bproperty="og:locale(?::alternate)?"[^>]*>\s*/gi,
                ''
            );

            const locales = [
                `<meta content="${escapeHtml(current.ogLocale)}" property="og:locale"/>`,
                ...indexableLanguages
                    .filter(item => item.id !== current.id && item.ogLocale)
                    .map(item => (
                        `<meta content="${escapeHtml(item.ogLocale)}" property="og:locale:alternate"/>`
                    ))
            ].join('\n');

            if (/<meta\b[^>]*\bproperty="og:site_name"[^>]*>/i.test(cleaned)) {
                return cleaned.replace(
                    /(<meta\b[^>]*\bproperty="og:site_name"[^>]*>)/i,
                    `$1\n${locales}`
                );
            }

            return cleaned.replace(/<\/head>/i, `${locales}\n</head>`);
        }
    );
}

function syncOgUrl(html, url) {
    return replaceOrInsertMeta(html, 'property', 'og:url', url);
}

function addBaseHref(html, href) {
    if (/<base\b[^>]*>/i.test(html)) {
        return html.replace(/<base\b[^>]*>/i, `<base href="${href}"/>`);
    }

    return html.replace(
        /(<meta\b[^>]*\bname="viewport"[^>]*>)/i,
        `$1\n<base href="${href}"/>`
    );
}

function translateDataI18n(html, translations) {
    return html.replace(
        /(<([a-z0-9]+)\b[^>]*\bdata-i18n="([^"]+)"[^>]*>)([\s\S]*?)(<\/\2>)/gi,
        (match, open, _tag, key, _body, close) => {
            const value = translations?.[key];
            return typeof value === 'string'
                ? `${open}${escapeHtml(value)}${close}`
                : match;
        }
    );
}

function refreshWebApplicationJsonLd(html, definition) {
    let replaced = false;

    return html.replace(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
        (match, jsonText) => {
            if (replaced) return match;

            try {
                const data = JSON.parse(jsonText.trim());
                if (data['@type'] !== 'WebApplication') return match;

                data.url = desktopUrl(definition);
                data.description = ZH_CN_SEO.description;
                data.inLanguage = definition.hreflang;
                data.featureList = [...ZH_CN_SEO.featureList];
                data.alternateName = [
                    'WARDOGS Artillery Calculator & Tactical Map',
                    'WARDOGS Arty Calc',
                    'WARDOGS 炮兵计算器',
                    'WARDOGS 迫击炮计算器'
                ];
                replaced = true;
                return `<script type="application/ld+json">${JSON.stringify(data, null, 2)}</script>`;
            } catch {
                return match;
            }
        }
    );
}

function renderChineseSeoCluster() {
    const sections = ZH_CN_SEO.cluster.sections
        .map(section => [
            `<section class="seo-topic" id="${escapeHtml(section.id)}">`,
            `<h3>${escapeHtml(section.heading)}</h3>`,
            `<p>${escapeHtml(section.body)}</p>`,
            '</section>'
        ].join('\n'))
        .join('\n');

    const navLinks = [
        { id: 'wardogs-artillery-calculator', label: ZH_CN_SEO.cluster.heading },
        ...ZH_CN_SEO.cluster.sections.map(section => ({
            id: section.id,
            label: section.heading
        })),
        { id: 'wardogs-calculator-faq', label: ZH_CN_SEO.faqLabel }
    ]
        .map(link => `<a href="#${escapeHtml(link.id)}">${escapeHtml(link.label)}</a>`)
        .join('');

    const faq = ZH_CN_SEO.faq
        .map(item => [
            '<details class="seo-faq-item">',
            `<summary>${escapeHtml(item.question)}</summary>`,
            `<p>${escapeHtml(item.answer)}</p>`,
            '</details>'
        ].join('\n'))
        .join('\n');

    return [
        '<div class="section seo-content-cluster">',
        `<h2 id="wardogs-artillery-calculator">${escapeHtml(ZH_CN_SEO.cluster.heading)}</h2>`,
        `<p class="seo-content-lead">${escapeHtml(ZH_CN_SEO.cluster.intro)}</p>`,
        `<nav aria-label="${escapeHtml(ZH_CN_SEO.cluster.navLabel)}" class="seo-topic-nav">`,
        navLinks,
        '</nav>',
        '<div class="seo-topic-list">',
        sections,
        '</div>',
        '<section class="seo-faq" id="wardogs-calculator-faq">',
        `<h3>${escapeHtml(ZH_CN_SEO.faqHeading)}</h3>`,
        faq,
        '</section>',
        '</div>'
    ].join('\n');
}

function injectChineseSeoCluster(html) {
    const block = renderChineseSeoCluster();

    if (/class="seo-content-cluster"/i.test(html)) {
        return html.replace(
            /<div class="section seo-content-cluster">[\s\S]*?<\/div>\s*<\/aside>/i,
            `${block}\n</aside>`
        );
    }

    if (/class="seo-about-section"/i.test(html)) {
        return html.replace(
            /<div class="section seo-about-section">[\s\S]*?<\/div>\s*<\/aside>/i,
            `${block}\n</aside>`
        );
    }

    return html.replace(/<\/aside>/i, `${block}\n</aside>`);
}


function removeExistingFaqJsonLd(html) {
    return html.replace(
        /<script type="application\/ld\+json">([\s\S]*?)<\/script>/gi,
        (match, jsonText) => {
            try {
                const data = JSON.parse(jsonText.trim());
                return data['@type'] === 'FAQPage'
                    ? ''
                    : match;
            } catch {
                return match;
            }
        }
    );
}

function injectChineseFaqJsonLd(html) {
    const faqData = {
        '@context': 'https://schema.org',
        '@type': 'FAQPage',
        mainEntity: ZH_CN_SEO.faq.map(item => ({
            '@type': 'Question',
            name: item.question,
            acceptedAnswer: {
                '@type': 'Answer',
                text: item.answer
            }
        }))
    };

    const script = `<script type="application/ld+json">${JSON.stringify(faqData, null, 2)}</script>`;
    return html.replace(/<\/head>/i, `${script}\n</head>`);
}

function prepareChineseDesktop(html, definition, translations) {
    let output = html
        .replace(
            /<html\b[^>]*>/i,
            `<html data-page-language="${definition.id}" lang="${definition.hreflang}">`
        );

    output = addBaseHref(output, '../');
    output = translateDataI18n(output, translations);
    output = replaceTitle(output, ZH_CN_SEO.title);
    output = replaceOrInsertMeta(output, 'name', 'description', ZH_CN_SEO.description);
    output = replaceOrInsertMeta(output, 'property', 'og:title', ZH_CN_SEO.title);
    output = replaceOrInsertMeta(output, 'property', 'og:description', ZH_CN_SEO.description);
    output = replaceOrInsertMeta(output, 'name', 'twitter:title', ZH_CN_SEO.title);
    output = replaceOrInsertMeta(output, 'name', 'twitter:description', ZH_CN_SEO.description);
    output = replaceOrInsertMeta(
        output,
        'property',
        'og:image:alt',
        'WARDOGS 炮兵计算器战术地图与射击解算界面'
    );
    output = replaceCanonical(output, desktopUrl(definition));
    output = syncOgUrl(output, desktopUrl(definition));
    output = refreshWebApplicationJsonLd(output, definition);
    output = removeExistingFaqJsonLd(output);
    output = injectChineseSeoCluster(output);
    output = injectChineseFaqJsonLd(output);

    return output;
}

function prepareChineseMobile(html, definition) {
    let output = html.replace(
        /<html\b[^>]*>/i,
        `<html data-page-language="${definition.id}" lang="${definition.hreflang}">`
    );

    output = replaceTitle(output, ZH_CN_SEO.mobileTitle);
    output = replaceOrInsertMeta(output, 'name', 'description', ZH_CN_SEO.description);
    output = replaceCanonical(output, desktopUrl(definition));

    return output;
}

function injectRuntimeLocaleOverrides(html) {
    if (html.includes('js/ui/locale-overrides.js')) {
        return html;
    }

    const script = '<script src="js/ui/locale-overrides.js"></script>';

    if (/<script src="js\/main\.js"><\/script>/i.test(html)) {
        return html.replace(
            /(<script src="js\/main\.js"><\/script>)/i,
            `${script}\n$1`
        );
    }

    return html.replace(/<\/body>/i, `${script}\n</body>`);
}

async function buildSitemap(indexableLanguages, lastModified) {
    const alternateLinks = indexableLanguages
        .map(definition => (
            `    <xhtml:link rel="alternate" hreflang="${escapeXml(definition.hreflang)}" href="${escapeXml(desktopUrl(definition))}" />`
        ))
        .concat(
            `    <xhtml:link rel="alternate" hreflang="x-default" href="${SITE_ORIGIN}/" />`
        )
        .join('\n');

    const urls = indexableLanguages
        .map(definition => [
            '  <url>',
            `    <loc>${escapeXml(desktopUrl(definition))}</loc>`,
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

    await writeFile(join(dist, 'sitemap.xml'), sitemap, 'utf8');
}

const registry = await readLocaleRegistry();
const indexableLanguages = registry.filter(item => item.indexable);
const chinese = registry.find(item => item.id === ZH_CN_ID);

if (!chinese) {
    throw new Error(`Locale ${ZH_CN_ID} is missing from locales/index.json`);
}

const translations = JSON.parse(
    await readFile(join(root, 'locales', chinese.file), 'utf8')
);

const appConfig = JSON.parse(
    await readFile(join(root, 'config', 'app.json'), 'utf8')
);

const rootDesktopPath = join(dist, 'index.html');
if (!(await exists(rootDesktopPath))) {
    throw new Error('dist/index.html is missing; run build-pages first');
}

const rootDesktop = await readFile(rootDesktopPath, 'utf8');
const chineseDesktopDir = join(dist, chinese.id);
await mkdir(chineseDesktopDir, { recursive: true });
await writeFile(
    join(chineseDesktopDir, 'index.html'),
    prepareChineseDesktop(rootDesktop, chinese, translations),
    'utf8'
);

const chineseMobilePath = join(dist, 'mobile', chinese.id, 'index.html');
if (await exists(chineseMobilePath)) {
    const mobileHtml = await readFile(chineseMobilePath, 'utf8');
    await writeFile(
        chineseMobilePath,
        prepareChineseMobile(mobileHtml, chinese),
        'utf8'
    );
}

for (const definition of indexableLanguages) {
    const path = definition.id === DEFAULT_LANGUAGE
        ? rootDesktopPath
        : join(dist, definition.id, 'index.html');

    if (!(await exists(path))) continue;

    let html = await readFile(path, 'utf8');
    html = replaceCanonical(html, desktopUrl(definition));
    html = syncOgUrl(html, desktopUrl(definition));
    html = syncHreflang(html, indexableLanguages);
    html = syncOgLocales(html, definition, indexableLanguages);
    await writeFile(path, html, 'utf8');
}

const allHtmlFiles = (await listFilesRecursive(dist))
    .filter(file => file.toLowerCase().endsWith('.html'));

for (const file of allHtmlFiles) {
    const html = await readFile(file, 'utf8');
    await writeFile(file, injectRuntimeLocaleOverrides(html), 'utf8');
}

await buildSitemap(
    indexableLanguages,
    appConfig?.site?.lastModified || new Date().toISOString().slice(0, 10)
);

console.log(
    `Synchronized ${registry.length} locales; ${chinese.hreflang} published at ${desktopUrl(chinese)} and ${mobileUrl(chinese)}`
);
