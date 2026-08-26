/* =========================
   APPLICATION CONFIG
   ========================= */

const DEFAULT_APP_CONFIG = {
    map: {
        camera: {
            maxZoom: 100
        }
    },

    site: {
        footer: {
            disclaimer:
                'Unofficial community project. Not affiliated with or endorsed by BULKHEAD or the WARDOGS development team.',
            productName:
                'WARDOGS Artillery Calculator',
            authorLabel:
                'by',
            authorName:
                'Apollyon',
            authorUrl:
                'https://discord.com/users/202109460238434304',
            version:
                '1.0'
        }
    },

    /*
     * Realtime collaboration is off unless a sync service URL is
     * configured. The service deploys separately from the static site
     * (see sync/README.md), so a fork without one simply never shows
     * the feature rather than failing at runtime.
     */
    collab: {
        url: null
    },

    mapTools: {
        shortcuts: {
            ruler: 'r',
            pencil: 'p',
            eraser: 'e',
            marker: 'm',
            coordinateSearch: 'f',
            layers: 'l',
            clearTool: 'escape',
            undo: 'ctrl+z',
            redo: 'ctrl+y',
            redoAlt: 'ctrl+shift+z'
        }
    }
};

function mergeAppConfig(base, override) {
    return {
        ...base,
        ...(override || {}),

        map: {
            ...base.map,
            ...(override?.map || {}),
            camera: {
                ...base.map.camera,
                ...(override?.map?.camera || {})
            }
        },

        site: {
            ...base.site,
            ...(override?.site || {}),
            footer: {
                ...base.site.footer,
                ...(override?.site?.footer || {})
            }
        },

        collab: {
            ...base.collab,
            ...(override?.collab || {})
        },

        mapTools: {
            ...base.mapTools,
            ...(override?.mapTools || {}),
            shortcuts: {
                ...base.mapTools.shortcuts,
                ...(override?.mapTools?.shortcuts || {})
            }
        }
    };
}

async function loadAppConfig() {
    try {
        const loaded =
            await fetchJSON(
                'config/app.json'
            );

        APP_CONFIG =
            mergeAppConfig(
                DEFAULT_APP_CONFIG,
                loaded
            );
    } catch (error) {
        console.warn(
            'Failed to load config/app.json, using defaults:',
            error
        );

        APP_CONFIG =
            mergeAppConfig(
                DEFAULT_APP_CONFIG,
                {}
            );
    }
}

function getMapToolShortcut(action) {
    return String(
        APP_CONFIG
            ?.mapTools
            ?.shortcuts
            ?.[action] || ''
    )
        .trim()
        .toLowerCase();
}

/*
 * Returns the sync service base URL, or '' when collaboration is not
 * configured. Only wss:// (or ws:// against a local dev server) is
 * accepted: the room code travels in this URL, so a plain-http endpoint
 * would leak the credential that grants edit access to the room.
 */
function getCollabServiceUrl() {
    const configured = String(
        APP_CONFIG
            ?.collab
            ?.url || ''
    ).trim();

    if (!configured) {
        return '';
    }

    try {
        const parsed = new URL(configured);

        const isLocal =
            parsed.hostname === 'localhost' ||
            parsed.hostname === '127.0.0.1';

        if (
            parsed.protocol !== 'wss:' &&
            !(parsed.protocol === 'ws:' && isLocal)
        ) {
            console.warn(
                'Ignoring collab.url: expected wss://',
                configured
            );
            return '';
        }

        return configured.replace(/\/+$/, '');
    } catch {
        console.warn(
            'Ignoring collab.url: not a valid URL',
            configured
        );
        return '';
    }
}

function isCollabConfigured() {
    return Boolean(
        getCollabServiceUrl()
    );
}

function getMaxCameraZoom() {
    const configured =
        Number(
            APP_CONFIG
                ?.map
                ?.camera
                ?.maxZoom
        );

    return (
        Number.isFinite(configured) &&
        configured > 0
            ? configured
            : DEFAULT_APP_CONFIG.map.camera.maxZoom
    );
}
