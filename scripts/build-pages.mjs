import { cp, mkdir, readFile, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = resolve(__dirname, '..');

const sourceDirs = [
    'assets',
    'config',
    'data',
    'js',
    'locales',
    'maps'
];

const commonSourceFiles = [
    'style.css',
    'robots.txt',
    'LICENSE'
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

async function copySharedStatic(target) {
    for (const dir of sourceDirs) {
        await copyIfExists(
            join(root, dir),
            join(target, dir)
        );
    }

    for (const file of commonSourceFiles) {
        await copyIfExists(
            join(root, file),
            join(target, file)
        );
    }
}

async function buildDesktop() {
    const dist = join(root, 'dist');

    await rm(dist, { recursive: true, force: true });
    await mkdir(dist, { recursive: true });
    await copySharedStatic(dist);

    for (const file of ['sitemap.xml', 'CNAME']) {
        await copyIfExists(
            join(root, file),
            join(dist, file)
        );
    }

    await copyIfExists(
        join(root, 'src', 'pages', 'index.html'),
        join(dist, 'index.html')
    );

    const localizedDir = join(
        root,
        'src',
        'pages',
        'locales'
    );

    if (await exists(localizedDir)) {
        const files = await readdir(localizedDir);

        for (const file of files) {
            if (!file.endsWith('.html')) continue;

            const lang = file.slice(0, -5);
            const targetDir = join(dist, lang);

            await mkdir(targetDir, { recursive: true });
            await cp(
                join(localizedDir, file),
                join(targetDir, 'index.html')
            );
        }
    }

    console.log(`Built desktop site into ${dist}`);
}

function renderMobileLocale(template, language) {
    const isDefault = language === 'en';
    const desktopCanonical = isDefault
        ? 'https://wardogs-artillery.com/'
        : `https://wardogs-artillery.com/${language}/`;

    let html = template
        .replace(
            '<html data-page-language="en" lang="en">',
            `<html data-page-language="${language}" lang="${language}">`
        )
        .replace(
            '<link href="https://wardogs-artillery.com/" rel="canonical"/>',
            `<link href="${desktopCanonical}" rel="canonical"/>`
        );

    if (!isDefault) {
        html = html.replace(
            '<meta content="width=device-width,initial-scale=1,viewport-fit=cover" name="viewport"/>',
            '<meta content="width=device-width,initial-scale=1,viewport-fit=cover" name="viewport"/>\n<base href="../"/>'
        );
    }

    return html;
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

async function buildMobile() {
    const dist = join(root, 'dist-mobile');

    await rm(dist, { recursive: true, force: true });
    await mkdir(dist, { recursive: true });
    await copySharedStatic(dist);

    await copyIfExists(
        join(root, 'mobile.css'),
        join(dist, 'mobile.css')
    );

    const template = await readFile(
        join(root, 'src', 'pages', 'mobile', 'index.html'),
        'utf8'
    );

    const languages = await getMobileLanguages();

    for (const language of languages) {
        const html = renderMobileLocale(
            template,
            language
        );

        if (language === 'en') {
            await writeFile(
                join(dist, 'index.html'),
                html,
                'utf8'
            );
            continue;
        }

        const targetDir = join(dist, language);
        await mkdir(targetDir, { recursive: true });
        await writeFile(
            join(targetDir, 'index.html'),
            html,
            'utf8'
        );
    }

    await writeFile(
        join(dist, 'CNAME'),
        'm.wardogs-artillery.com\n',
        'utf8'
    );

    console.log(`Built mobile site into ${dist}`);
}

const mode = String(
    process.argv[2] || 'desktop'
).toLowerCase();

if (!['desktop', 'mobile', 'all'].includes(mode)) {
    throw new Error(
        `Unknown build mode: ${mode}. Use desktop, mobile, or all.`
    );
}

if (mode === 'desktop' || mode === 'all') {
    await buildDesktop();
}

if (mode === 'mobile' || mode === 'all') {
    await buildMobile();
}
