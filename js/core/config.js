/* =========================
   APPLICATION CONFIG
   ========================= */

const DEFAULT_APP_CONFIG = {
    mapTools: {
        shortcuts: {
            ruler: 'r',
            pencil: 'p',
            marker: 'm',
            coordinateSearch: 'f',
            legend: 'l',
            clearTool: 'escape'
        }
    }
};

function mergeAppConfig(base, override) {
    return {
        ...base,
        ...(override || {}),
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
        const loaded = await fetchJSON('config/app.json');
        APP_CONFIG = mergeAppConfig(DEFAULT_APP_CONFIG, loaded);
    } catch (error) {
        console.warn('Failed to load config/app.json, using defaults:', error);
        APP_CONFIG = mergeAppConfig(DEFAULT_APP_CONFIG, {});
    }
}

function getMapToolShortcut(action) {
    return String(
        APP_CONFIG?.mapTools?.shortcuts?.[action] || ''
    ).trim().toLowerCase();
}
