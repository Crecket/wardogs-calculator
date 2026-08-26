/*
 * Uploads map tiles to an R2 bucket, incrementally.
 *
 *     R2_ACCOUNT_ID=... R2_ACCESS_KEY_ID=... R2_SECRET_ACCESS_KEY=... \
 *     R2_BUCKET=wardogs-tiles node scripts/sync-tiles.mjs
 *
 * Written to be re-run. It lists what the bucket already holds and uploads
 * only what is missing or a different size, so pulling new or regenerated
 * tiles from upstream and running it again costs one listing pass plus the
 * genuinely new files — not another 43,000 uploads.
 *
 * Pair it with the build flag that points the site at the bucket:
 *
 *     TILE_BASE_URL=https://tiles.example.com npm run build
 *
 * Options:
 *   --source <dir>     local tile root            (default maps/tiles)
 *   --prefix <path>    key prefix inside bucket   (default none)
 *   --concurrency <n>  parallel uploads           (default 32)
 *   --dry-run          report what would change, upload nothing
 *   --force            re-upload every file
 *   --prune            delete bucket objects that no longer exist locally
 */

import { readdir, readFile, stat } from 'node:fs/promises';
import { dirname, extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { sha256Hex, signRequest } from './lib/sigv4.mjs';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');

const CONTENT_TYPES = {
    '.webp': 'image/webp',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.json': 'application/json',
    '.bin': 'application/octet-stream'
};

/*
 * Tiles are content-addressed by their coordinates and regenerated wholesale
 * rather than edited, so a long immutable cache is safe and keeps repeat
 * views off the origin entirely.
 */
const CACHE_CONTROL = 'public, max-age=31536000, immutable';

function parseArgs(argv) {
    const options = {
        source: 'maps/tiles',
        prefix: '',
        concurrency: 32,
        dryRun: false,
        force: false,
        prune: false
    };

    for (let i = 0; i < argv.length; i++) {
        const arg = argv[i];

        if (arg === '--dry-run') options.dryRun = true;
        else if (arg === '--force') options.force = true;
        else if (arg === '--prune') options.prune = true;
        else if (arg === '--source') options.source = argv[++i];
        else if (arg === '--prefix') options.prefix = argv[++i];
        else if (arg === '--concurrency') options.concurrency = Number(argv[++i]);
        else {
            console.error(`Unknown option: ${arg}`);
            process.exit(1);
        }
    }

    if (!Number.isInteger(options.concurrency) || options.concurrency < 1) {
        console.error('--concurrency must be a positive integer');
        process.exit(1);
    }

    options.prefix = options.prefix.replace(/^\/+|\/+$/g, '');

    return options;
}

function readEnvironment() {
    const missing = [
        'R2_ACCOUNT_ID',
        'R2_ACCESS_KEY_ID',
        'R2_SECRET_ACCESS_KEY',
        'R2_BUCKET'
    ].filter(name => !process.env[name]);

    if (missing.length) {
        console.error(
            `Missing environment variable(s): ${missing.join(', ')}\n\n` +
            'Create an R2 API token (Cloudflare dashboard -> R2 -> Manage API\n' +
            'tokens) with Object Read & Write on the target bucket.'
        );
        process.exit(1);
    }

    return {
        accountId: process.env.R2_ACCOUNT_ID,
        accessKeyId: process.env.R2_ACCESS_KEY_ID,
        secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
        bucket: process.env.R2_BUCKET
    };
}

async function walk(dir, base = dir) {
    const out = [];

    for (const entry of await readdir(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);

        if (entry.isDirectory()) {
            out.push(...await walk(path, base));
            continue;
        }

        if (!entry.isFile()) {
            continue;
        }

        const { size } = await stat(path);

        out.push({
            key: path.slice(base.length + 1).split('\\').join('/'),
            path,
            size
        });
    }

    return out;
}

function endpoint(env) {
    return `https://${env.accountId}.r2.cloudflarestorage.com`;
}

async function r2Request(env, { method, key = '', query = {}, body }) {
    const path = key
        ? `/${env.bucket}/${key}`
        : `/${env.bucket}`;

    const url = `${endpoint(env)}${path}`;

    const payloadHash = body
        ? sha256Hex(body)
        : sha256Hex('');

    const headers = signRequest({
        method,
        url,
        query,
        payloadHash,
        accessKeyId: env.accessKeyId,
        secretAccessKey: env.secretAccessKey,
        headers: body
            ? {
                'content-type': CONTENT_TYPES[extname(key).toLowerCase()]
                    || 'application/octet-stream',
                'cache-control': CACHE_CONTROL
            }
            : {}
    });

    const search = new URLSearchParams(query).toString();

    return fetch(
        search ? `${url}?${search}` : url,
        { method, headers, body }
    );
}

/*
 * R2 returns at most 1000 keys per call, so a full pyramid needs ~44 round
 * trips. That is still far cheaper than re-uploading, and it is what makes
 * the whole thing re-runnable.
 */
async function listRemote(env, prefix) {
    const sizes = new Map();

    let token = null;
    let pages = 0;

    do {
        const query = {
            'list-type': '2',
            'max-keys': '1000',
            ...(prefix ? { prefix: `${prefix}/` } : {}),
            ...(token ? { 'continuation-token': token } : {})
        };

        const response = await r2Request(env, { method: 'GET', query });

        if (!response.ok) {
            throw new Error(
                `Listing failed: ${response.status} ${await response.text()}`
            );
        }

        const xml = await response.text();

        for (const match of xml.matchAll(
            /<Contents>[\s\S]*?<Key>([\s\S]*?)<\/Key>[\s\S]*?<Size>(\d+)<\/Size>[\s\S]*?<\/Contents>/g
        )) {
            sizes.set(decodeXml(match[1]), Number(match[2]));
        }

        token = /<IsTruncated>true<\/IsTruncated>/.test(xml)
            ? decodeXml(
                xml.match(/<NextContinuationToken>([\s\S]*?)<\/NextContinuationToken>/)?.[1] || ''
            )
            : null;

        pages++;
        process.stdout.write(`\r  listing bucket… ${sizes.size} objects`);
    } while (token);

    process.stdout.write(
        `\r  listing bucket… ${sizes.size} objects (${pages} page${pages === 1 ? '' : 's'})\n`
    );

    return sizes;
}

function decodeXml(value) {
    return value
        .replaceAll('&amp;', '&')
        .replaceAll('&lt;', '<')
        .replaceAll('&gt;', '>')
        .replaceAll('&quot;', '"')
        .replaceAll('&apos;', "'");
}

async function upload(env, file, key, attempt = 1) {
    const body = await readFile(file.path);

    const response = await r2Request(env, {
        method: 'PUT',
        key,
        body
    });

    if (response.ok) {
        return;
    }

    const text = await response.text();

    /*
     * Retry the transient classes only. A 403 means the credentials or the
     * signature are wrong and will never come good, so failing fast there
     * beats grinding through 43,000 doomed requests.
     */
    const retryable =
        response.status === 429 ||
        response.status >= 500;

    if (retryable && attempt < 4) {
        await new Promise(r => setTimeout(r, 250 * 2 ** attempt));
        return upload(env, file, key, attempt + 1);
    }

    throw new Error(`PUT ${key} failed: ${response.status} ${text}`);
}

async function runPool(items, concurrency, worker) {
    let index = 0;
    let done = 0;

    const failures = [];

    async function next() {
        for (;;) {
            const current = index++;

            if (current >= items.length) {
                return;
            }

            try {
                await worker(items[current]);
            } catch (error) {
                failures.push(error);
            }

            done++;

            if (done % 25 === 0 || done === items.length) {
                process.stdout.write(
                    `\r  uploading… ${done}/${items.length}`
                );
            }
        }
    }

    await Promise.all(
        Array.from(
            { length: Math.min(concurrency, items.length) },
            next
        )
    );

    if (items.length) {
        process.stdout.write('\n');
    }

    return failures;
}

const options = parseArgs(process.argv.slice(2));
const env = readEnvironment();

const sourceDir = resolve(root, options.source);

if (!(await stat(sourceDir).catch(() => null))) {
    console.error(`No such directory: ${sourceDir}`);
    process.exit(1);
}

console.log(`Source : ${sourceDir}`);
console.log(`Bucket : ${env.bucket}${options.prefix ? `/${options.prefix}` : ''}`);
console.log('');

const local = await walk(sourceDir);
console.log(`  ${local.length} local file(s)`);

const remote = options.force
    ? new Map()
    : await listRemote(env, options.prefix);

const keyFor = file => options.prefix
    ? `${options.prefix}/${file.key}`
    : file.key;

const pending = local.filter(file => {
    const known = remote.get(keyFor(file));
    return known === undefined || known !== file.size;
});

const localKeys = new Set(local.map(keyFor));
const orphans = options.prune
    ? [...remote.keys()].filter(key => !localKeys.has(key))
    : [];

console.log(
    `  ${pending.length} to upload, ${local.length - pending.length} already current` +
    (options.prune ? `, ${orphans.length} to prune` : '')
);
console.log('');

if (options.dryRun) {
    for (const file of pending.slice(0, 20)) {
        console.log(`  would upload ${keyFor(file)}`);
    }

    if (pending.length > 20) {
        console.log(`  … and ${pending.length - 20} more`);
    }

    for (const key of orphans.slice(0, 20)) {
        console.log(`  would prune  ${key}`);
    }

    console.log('\nDry run: nothing was changed.');
    process.exit(0);
}

const failures = await runPool(
    pending,
    options.concurrency,
    file => upload(env, file, keyFor(file))
);

for (const key of orphans) {
    const response = await r2Request(env, { method: 'DELETE', key });

    if (!response.ok && response.status !== 404) {
        failures.push(
            new Error(`DELETE ${key} failed: ${response.status}`)
        );
    }
}

if (failures.length) {
    console.error(`\n${failures.length} operation(s) failed:`);

    for (const error of failures.slice(0, 10)) {
        console.error(`  ${error.message}`);
    }

    process.exit(1);
}

console.log(
    `\nDone. ${pending.length} uploaded` +
    (options.prune ? `, ${orphans.length} pruned` : '') +
    `, ${local.length - pending.length} unchanged.`
);
