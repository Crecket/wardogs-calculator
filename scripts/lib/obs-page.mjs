import { readFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '../..');

/*
 * The OBS overlay route is the desktop shell with its head replaced and its
 * chrome hidden, rather than a page of its own.
 *
 * A browser source loads one URL and gets one canvas, so the overlay has to
 * boot the whole application: the same init(), the same renderer, the same
 * collab client. Deriving it from src/pages/index.html means every element
 * init() reaches for is present, and a shell that gains a control does not
 * quietly break a route nobody opens while developing.
 *
 * The head is not derived: none of the SEO metadata, the analytics tag or
 * the mobile redirect belongs on a page that only ever runs inside OBS.
 */
const OBS_HEAD = [
    '<head>',
    '<meta charset="utf-8"/>',
    '<meta content="width=device-width,initial-scale=1" name="viewport"/>',
    '<base href="../"/>',
    '<meta content="noindex, nofollow" name="robots"/>',
    '<title>WARDOGS Artillery Overlay</title>',
    '<link href="assets/favicon.png" rel="icon"/>',
    '<link href="style.css" rel="stylesheet"/>',
    '<link href="obs.css" rel="stylesheet"/>',
    '<script>window.__WARDOGS_ANALYTICS_DISABLED__ = true;</script>',
    '</head>'
].join('\n');

export function overlayFragmentPath() {
    return join(root, 'src', 'pages', 'obs', 'overlay.html');
}

export function desktopShellPath() {
    return join(root, 'src', 'pages', 'index.html');
}

export function renderObsPage(template, overlay) {
    return template
        .replace(
            /<head>[\s\S]*?<\/head>/i,
            OBS_HEAD
        )
        .replace(
            '<html data-page-language="en" lang="en">',
            '<html data-obs="1" data-page-language="en" lang="en">'
        )
        .replace(
            '<body>',
            '<body class="obs-mode">'
        )
        .replace(
            '<script src="js/main.js"></script>',
            '<script src="js/features/obs.js"></script>\n' +
            '<script src="js/main.js"></script>'
        )
        .replace(
            '<script src="js/core/core.js"></script>',
            `${overlay.trim()}\n<script src="js/core/core.js"></script>`
        );
}

export async function buildObsPage() {
    const [template, overlay] = await Promise.all([
        readFile(desktopShellPath(), 'utf8'),
        readFile(overlayFragmentPath(), 'utf8')
    ]);

    return renderObsPage(template, overlay);
}
