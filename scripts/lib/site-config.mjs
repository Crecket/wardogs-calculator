import { existsSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

/*
 * Deployment-specific settings, shared by the build and the dev server so
 * both behave the same way.
 *
 * These live in the environment rather than in config/app.json or
 * maps/*.json because this repository is a fork: keeping those files
 * byte-identical to upstream means merges never conflict over one
 * deployment's URLs, and a fork that does not set them still builds a
 * working, self-contained site.
 */

const root = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '../..'
);

let loaded = false;

/*
 * Reads .env into process.env if present. Real environment variables
 * already set take precedence, so CI and one-off overrides still win.
 */
export function loadEnv() {
    if (loaded) {
        return;
    }

    loaded = true;

    const path = resolve(root, '.env');

    if (!existsSync(path)) {
        return;
    }

    const before = new Set(Object.keys(process.env));
    const overridden = { ...process.env };

    process.loadEnvFile(path);

    for (const key of before) {
        process.env[key] = overridden[key];
    }
}

export function collabUrl() {
    loadEnv();

    return String(process.env.COLLAB_URL || '').trim();
}

/*
 * Umami's website id. Empty by default, which is what keeps analytics off:
 * the tracker tag lives in the tracked page shells, so a fork that does
 * not set this would otherwise report into upstream's dashboard.
 */
export function analyticsWebsiteId() {
    loadEnv();

    return String(process.env.ANALYTICS_WEBSITE_ID || '').trim();
}

export function tileBaseUrl() {
    loadEnv();

    return String(process.env.TILE_BASE_URL || '')
        .trim()
        .replace(/\/+$/, '');
}

export const LOCAL_TILE_PREFIX = 'maps/tiles/';

/*
 * Returns the patched config, or null when nothing needed changing — the
 * callers use that to skip rewriting a file entirely.
 */
export function patchAppConfig(config) {
    const url = collabUrl();

    if (!url) {
        return null;
    }

    return {
        ...config,
        collab: {
            ...config.collab,
            url
        }
    };
}

export function patchMapConfig(map) {
    const base = tileBaseUrl();
    const current = map?.tiles?.path;

    /*
     * Only paths pointing at the bundled pyramid are rewritten; a map
     * already pointing somewhere absolute is left alone.
     */
    if (
        !base ||
        typeof current !== 'string' ||
        !current.startsWith(LOCAL_TILE_PREFIX)
    ) {
        return null;
    }

    return {
        ...map,
        tiles: {
            ...map.tiles,
            path: `${base}/${current.slice(LOCAL_TILE_PREFIX.length)}`
        }
    };
}
