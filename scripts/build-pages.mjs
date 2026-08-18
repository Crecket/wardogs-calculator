import { cp, mkdir, readFile, rm, writeFile, readdir, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

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
    'style.css',
    'mobile.css',
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

    for (const file of ['sitemap.xml', 'CNAME']) {
        await copyIfExists(
            join(root, file),
            join(dist, file)
        );
    }
}

async function buildDesktopPages() {
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

    if (!(await exists(localizedDir))) {
        return;
    }

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

function renderMobileLocale(template, language) {
    const isDefault = language === 'en';

    const desktopCanonical = isDefault
        ? 'https://wardogs-artillery.com/'
        : `https://wardogs-artillery.com/${language}/`;

    const baseHref = isDefault
        ? '../'
        : '../../';

    return template
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
await buildDesktopPages();
await buildMobilePages();

console.log(`Built desktop + mobile site into ${dist}`);
console.log(`Mobile entry: ${join(dist, 'mobile', 'index.html')}`);
