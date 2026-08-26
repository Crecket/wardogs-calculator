import {
    createReadStream,
    statSync,
    watch
} from 'node:fs';
import {
    readFile,
    stat
} from 'node:fs/promises';
import {
    createServer
} from 'node:http';
import {
    dirname,
    extname,
    join,
    normalize,
    resolve,
    sep
} from 'node:path';
import {
    fileURLToPath
} from 'node:url';
import {
    collabUrl,
    loadEnv,
    patchAppConfig,
    patchMapConfig,
    tileBaseUrl
} from './lib/site-config.mjs';

loadEnv();

const __dirname = dirname(
    fileURLToPath(import.meta.url)
);

const root = resolve(
    __dirname,
    '..'
);

const DEFAULT_HOST =
    '127.0.0.1';

const DEFAULT_PORT =
    8000;

function parseBooleanEnvironment(
    value,
    fallback
) {
    if (
        value === undefined ||
        value === null ||
        String(value).trim() === ''
    ) {
        return fallback;
    }

    const normalized =
        String(value)
            .trim()
            .toLowerCase();

    if (
        ['1', 'true', 'yes', 'on'].includes(
            normalized
        )
    ) {
        return true;
    }

    if (
        ['0', 'false', 'no', 'off'].includes(
            normalized
        )
    ) {
        return false;
    }

    throw new Error(
        `Invalid boolean environment value: ${value}`
    );
}

const DISABLE_DEV_ANALYTICS =
    parseBooleanEnvironment(
        process.env.WARDOGS_DISABLE_ANALYTICS,
        true
    );

const MIME_TYPES = {
    '.css': 'text/css; charset=utf-8',
    '.gif': 'image/gif',
    '.html': 'text/html; charset=utf-8',
    '.ico': 'image/x-icon',
    '.jpeg': 'image/jpeg',
    '.jpg': 'image/jpeg',
    '.js': 'text/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.map': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.txt': 'text/plain; charset=utf-8',
    '.webmanifest': 'application/manifest+json; charset=utf-8',
    '.webp': 'image/webp',
    '.xml': 'application/xml; charset=utf-8'
};

const LIVE_RELOAD_CLIENT = `
<script data-wardogs-dev-reload>
(() => {
    const source = new EventSource('/__dev/reload');

    source.onmessage = event => {
        if (event.data === 'reload') {
            window.location.reload();
        }
    };
})();
</script>`;

function getArgument(name) {
    const args =
        process.argv.slice(2);

    const equalsPrefix =
        `${name}=`;

    for (
        let index = 0;
        index < args.length;
        index++
    ) {
        const argument =
            args[index];

        if (
            argument.startsWith(
                equalsPrefix
            )
        ) {
            return argument.slice(
                equalsPrefix.length
            );
        }

        if (
            argument === name
        ) {
            return args[index + 1];
        }
    }

    return null;
}

function resolveHost() {
    return (
        getArgument('--host') ||
        process.env.HOST ||
        DEFAULT_HOST
    );
}

function resolvePort() {
    const raw =
        getArgument('--port') ||
        process.env.PORT ||
        String(DEFAULT_PORT);

    const port =
        Number(raw);

    if (
        !Number.isInteger(port) ||
        port < 1 ||
        port > 65535
    ) {
        throw new Error(
            `Invalid dev server port: ${raw}`
        );
    }

    return port;
}

async function exists(path) {
    try {
        await stat(path);
        return true;
    } catch {
        return false;
    }
}

function directoryExists(path) {
    try {
        return statSync(path)
            .isDirectory();
    } catch {
        return false;
    }
}

function renderMobileLocale(
    template,
    language
) {
    const isDefault =
        language === 'en';

    const desktopCanonical =
        isDefault
            ? 'https://wardogs-artillery.com/'
            : `https://wardogs-artillery.com/${language}/`;

    const baseHref =
        isDefault
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

async function getLanguages() {
    const index =
        JSON.parse(
            await readFile(
                join(
                    root,
                    'locales',
                    'index.json'
                ),
                'utf8'
            )
        );

    const configured =
        Array.isArray(
            index.languages
        )
            ? index.languages
                .map(
                    item =>
                        item?.id
                )
                .filter(Boolean)
            : [];

    return new Set(
        [
            'en',
            ...configured
        ]
    );
}

function prepareDevHTML(html) {
    let prepared = html;

    if (DISABLE_DEV_ANALYTICS) {
        /*
         * Keep local development out of production analytics and tell
         * the application wrapper not to queue events while disabled.
         */
        prepared = prepared.replace(
            /\s*<script[^>]*src=["']https:\/\/cloud\.umami\.is\/script\.js["'][^>]*><\/script>/gi,
            ''
        );

        prepared = prepared.replace(
            '<head>',
            '<head>\n<script>window.__WARDOGS_ANALYTICS_DISABLED__ = true;</script>'
        );
    }

    if (prepared.includes('</body>')) {
        return prepared.replace(
            '</body>',
            `${LIVE_RELOAD_CLIENT}\n</body>`
        );
    }

    return (
        `${prepared}\n` +
        LIVE_RELOAD_CLIENT
    );
}

function sendText(
    response,
    statusCode,
    body,
    contentType =
        'text/plain; charset=utf-8'
) {
    response.writeHead(
        statusCode,
        {
            'Content-Type':
                contentType,

            'Cache-Control':
                'no-store, max-age=0'
        }
    );

    response.end(body);
}

async function sendHTML(
    response,
    path,
    transform = null
) {
    let html =
        await readFile(
            path,
            'utf8'
        );

    if (transform) {
        html =
            transform(html);
    }

    sendText(
        response,
        200,
        prepareDevHTML(html),
        'text/html; charset=utf-8'
    );
}

function safeStaticPath(pathname) {
    let decoded;

    try {
        decoded =
            decodeURIComponent(
                pathname
            );
    } catch {
        return null;
    }

    const relative =
        normalize(
            decoded.replace(
                /^\/+/, 
                ''
            )
        );

    const absolute =
        resolve(
            root,
            relative
        );

    if (
        absolute !== root &&
        !absolute.startsWith(
            `${root}${sep}`
        )
    ) {
        return null;
    }

    return absolute;
}

/*
 * config/app.json and maps/*.json are rewritten on the way out, exactly as
 * the build rewrites them, so `npm run dev` talks to the same sync service
 * and tile host as a deployed build. Without this, collaboration is dead in
 * development no matter what .env says.
 */
async function sendPatchedJson(
    response,
    pathname,
    path
) {
    const original =
        JSON.parse(
            await readFile(path, 'utf8')
        );

    const patched =
        pathname === '/config/app.json'
            ? patchAppConfig(original)
            : patchMapConfig(original);

    if (!patched) {
        return false;
    }

    const body =
        JSON.stringify(patched, null, 2);

    response.writeHead(
        200,
        {
            'Content-Type':
                'application/json; charset=utf-8',

            'Content-Length':
                Buffer.byteLength(body),

            'Cache-Control':
                'no-store, max-age=0'
        }
    );

    response.end(body);

    return true;
}

function isPatchableJson(pathname) {
    return (
        pathname === '/config/app.json' ||
        /^\/maps\/[^/]+\.json$/.test(pathname)
    );
}

async function sendStatic(
    response,
    pathname
) {
    const path =
        safeStaticPath(
            pathname
        );

    if (
        !path ||
        !(await exists(path))
    ) {
        return false;
    }

    if (
        isPatchableJson(pathname) &&
        await sendPatchedJson(
            response,
            pathname,
            path
        )
    ) {
        return true;
    }

    const info =
        await stat(path);

    if (!info.isFile()) {
        return false;
    }

    const contentType =
        MIME_TYPES[
            extname(path)
                .toLowerCase()
        ] ||
        'application/octet-stream';

    response.writeHead(
        200,
        {
            'Content-Type':
                contentType,

            'Content-Length':
                info.size,

            'Cache-Control':
                'no-store, max-age=0'
        }
    );

    createReadStream(path)
        .pipe(response);

    return true;
}

const reloadClients =
    new Set();

function connectReloadClient(
    request,
    response
) {
    response.writeHead(
        200,
        {
            'Content-Type':
                'text/event-stream',

            'Cache-Control':
                'no-cache, no-transform',

            'Connection':
                'keep-alive'
        }
    );

    response.write(
        'retry: 500\n'
    );

    response.write(
        'data: connected\n\n'
    );

    reloadClients.add(
        response
    );

    request.on(
        'close',
        () => {
            reloadClients.delete(
                response
            );
        }
    );
}

let reloadTimer =
    null;

function queueReload(changedPath) {
    clearTimeout(
        reloadTimer
    );

    reloadTimer =
        setTimeout(
            () => {
                console.log(
                    `[reload] ${changedPath}`
                );

                for (
                    const client
                    of reloadClients
                ) {
                    client.write(
                        'data: reload\n\n'
                    );
                }
            },
            80
        );
}

function watchDirectory(
    relativePath,
    recursive = true
) {
    const target =
        join(
            root,
            relativePath
        );

    if (
        !directoryExists(target)
    ) {
        return null;
    }

    try {
        return watch(
            target,
            { recursive },
            (
                _eventType,
                filename
            ) => {
                const changed =
                    filename
                        ? `${relativePath}/${filename}`
                        : relativePath;

                queueReload(
                    changed.replaceAll(
                        '\\',
                        '/'
                    )
                );
            }
        );
    } catch (error) {
        console.warn(
            `[dev] Unable to watch ${relativePath}: ${error.message}`
        );

        return null;
    }
}

function watchRootFiles() {
    const watched =
        new Set([
            'style.css',
            'mobile.css'
        ]);

    try {
        return watch(
            root,
            {
                recursive: false
            },
            (
                _eventType,
                filename
            ) => {
                if (
                    filename &&
                    watched.has(
                        filename.toString()
                    )
                ) {
                    queueReload(
                        filename.toString()
                    );
                }
            }
        );
    } catch (error) {
        console.warn(
            `[dev] Unable to watch root CSS entry points: ${error.message}`
        );

        return null;
    }
}

async function createRequestHandler() {
    const mobileTemplatePath =
        join(
            root,
            'src',
            'pages',
            'mobile',
            'index.html'
        );

    return async (
        request,
        response
    ) => {
        try {
            const url =
                new URL(
                    request.url,
                    'http://localhost'
                );

            const pathname =
                url.pathname;

            if (
                pathname ===
                '/__dev/reload'
            ) {
                connectReloadClient(
                    request,
                    response
                );

                return;
            }

            if (
                pathname === '/' ||
                pathname === '/index.html'
            ) {
                await sendHTML(
                    response,
                    join(
                        root,
                        'src',
                        'pages',
                        'index.html'
                    )
                );

                return;
            }

            const mobileMatch =
                pathname.match(
                    /^\/mobile(?:\/([a-z-]+))?\/?$/i
                );

            const mobileIndexMatch =
                pathname.match(
                    /^\/mobile(?:\/([a-z-]+))?\/index\.html$/i
                );

            const matchedMobileRoute =
                mobileMatch ||
                mobileIndexMatch;

            if (matchedMobileRoute) {
                const language =
                    matchedMobileRoute[1] ||
                    'en';

                const languages =
                    await getLanguages();

                if (
                    !languages.has(
                        language
                    )
                ) {
                    sendText(
                        response,
                        404,
                        'Unknown mobile language.'
                    );

                    return;
                }

                await sendHTML(
                    response,
                    mobileTemplatePath,
                    template =>
                        renderMobileLocale(
                            template,
                            language
                        )
                );

                return;
            }

            const desktopMatch =
                pathname.match(
                    /^\/([a-z-]+)(?:\/index\.html)?\/?$/i
                );

            if (desktopMatch) {
                const language =
                    desktopMatch[1];

                const languages =
                    await getLanguages();

                if (
                    language !== 'en' &&
                    languages.has(language)
                ) {
                    const localePath =
                        join(
                            root,
                            'src',
                            'pages',
                            'locales',
                            `${language}.html`
                        );

                    if (
                        await exists(
                            localePath
                        )
                    ) {
                        await sendHTML(
                            response,
                            localePath
                        );

                        return;
                    }
                }
            }

            if (
                await sendStatic(
                    response,
                    pathname
                )
            ) {
                return;
            }

            sendText(
                response,
                404,
                'Not found.'
            );
        } catch (error) {
            console.error(error);

            sendText(
                response,
                500,
                'Development server error.'
            );
        }
    };
}

const host =
    resolveHost();

const port =
    resolvePort();

const requestHandler =
    await createRequestHandler();

const server =
    createServer(
        requestHandler
    );

const watchers = [
    watchDirectory('js'),
    watchDirectory('styles'),
    watchDirectory('src/pages'),
    watchDirectory('locales'),
    watchDirectory('config'),
    watchDirectory('data'),
    watchDirectory('assets'),

    /*
     * Watch only the top-level map config directory.
     * The huge tile pyramid is intentionally not watched.
     * Tile files are still served directly from disk and are visible
     * immediately after a manual page refresh.
     */
    watchDirectory(
        'maps',
        false
    ),

    watchRootFiles()
].filter(Boolean);

function shutdown() {
    for (
        const watcher
        of watchers
    ) {
        watcher.close();
    }

    for (
        const client
        of reloadClients
    ) {
        client.end();
    }

    server.close(
        () => process.exit(0)
    );
}

process.on(
    'SIGINT',
    shutdown
);

process.on(
    'SIGTERM',
    shutdown
);

server.listen(
    port,
    host,
    () => {
        const displayHost =
            host === '0.0.0.0'
                ? 'localhost'
                : host;

        console.log('');
        console.log(
            'WARDOGS development server'
        );
        console.log(
            `Desktop: http://${displayHost}:${port}/`
        );
        console.log(
            `Mobile:  http://${displayHost}:${port}/mobile/`
        );
        console.log('');
        console.log(
            DISABLE_DEV_ANALYTICS
                ? 'Live reload enabled. Production Umami analytics disabled.'
                : 'Live reload enabled. Production Umami analytics ENABLED for this dev session.'
        );
        console.log(
            tileBaseUrl()
                ? `Map tiles are served from ${tileBaseUrl()} (TILE_BASE_URL).`
                : 'Map tiles are served directly and are not watched for changes.'
        );
        console.log(
            collabUrl()
                ? `Shared sessions point at ${collabUrl()} (COLLAB_URL).`
                : 'Shared sessions are off. Set COLLAB_URL in .env to enable them.'
        );
        console.log(
            'Press Ctrl+C to stop.'
        );
        console.log('');
    }
);
