/* =========================
   INIT
   ========================= */

const APP_ASSET_VERSION = (() => {
    const source =
        document.currentScript?.src;

    if (!source) {
        return '';
    }

    try {
        return (
            new URL(source)
                .searchParams
                .get('v') ||
            ''
        );
    } catch {
        return '';
    }
})();

function versionRuntimeAsset(url) {
    if (!APP_ASSET_VERSION) {
        return url;
    }

    try {
        const resolved =
            new URL(
                url,
                document.baseURI
            );

        resolved.searchParams.set(
            'v',
            APP_ASSET_VERSION
        );

        return resolved.href;
    } catch {
        return url;
    }
}

async function loadTerrainBallisticsRuntime() {
    try {
        await new Promise((resolve, reject) => {
            const existing = document.querySelector(
                'script[data-terrain-ballistics]'
            );

            if (existing) {
                if (
                    typeof initTerrainBallistics ===
                    'function'
                ) {
                    resolve();
                    return;
                }

                existing.addEventListener(
                    'load',
                    resolve,
                    { once: true }
                );
                existing.addEventListener(
                    'error',
                    () => reject(
                        new Error(
                            'Failed to load terrain ballistics runtime'
                        )
                    ),
                    { once: true }
                );
                return;
            }

            const script =
                document.createElement('script');

            script.src =
                versionRuntimeAsset(
                    'js/features/terrain-ballistics.js'
                );

            script.async = false;
            script.dataset.terrainBallistics = '1';
            script.onload = resolve;
            script.onerror = () => reject(
                new Error(
                    'Failed to load terrain ballistics runtime'
                )
            );

            document.head.appendChild(script);
        });

        if (
            typeof initTerrainBallistics ===
            'function'
        ) {
            await initTerrainBallistics();
        }
    } catch (error) {
        console.warn(
            '[terrain-ballistics] Runtime unavailable; flat-table fallback remains active.',
            error
        );
    }
}

async function init() {

    try {

        applyTheme(
            getTheme()
        );

        bindThemeToggle();

        loadSavedTargets();

        await loadLanguages();

        await loadAppConfig();

        renderFooter();

        await loadWeapons();

        loadProjectileModel();

        await loadMapAssets();

        await loadMaps();

        await loadTerrainBallisticsRuntime();

        initMapTools();

        initLayout();

        /*
         * Before the clamp below, so points restored from a previous
         * visit are pulled inside the map's bounds like any other.
         */
        loadMapPoints();

        /*
         * Sync initial state with the
         * selected preset map after the
         * map JSON files are available.
         */
        if (
            S.map !== 'custom' &&
            MAPS[S.map]
        ) {

            S.w =
                MAPS[S.map].w;

            S.h =
                MAPS[S.map].h;

            clamp(S.origin);
            clamp(S.target);
        }

        bindEvents();

        if (
            typeof initMobileUI ===
            'function'
        ) {
            initMobileUI();
        }

        loadSaveArtilleryPreference();

        updatePresetLock();
        updatePointLocksUI();

        applyLanguage();

        /*
         * Load and display MOTD.
         */
        await initMotd();

        inputs();

        resize();

        renderSavedTargets();

        if (typeof initGunsUI === 'function') {
            initGunsUI();
        }

        /*
         * Last: joining from a #room= link replaces map content, so it
         * must run after the solo state is fully loaded and rendered.
         */
        if (
            typeof initCollab ===
            'function'
        ) {
            initCollab();
        }

    } catch (error) {

        console.error(
            'Failed to initialize application:',
            error
        );

        document.documentElement.dataset.appInitState =
            'failed';

        const status =
            document.getElementById('status');

        if (status) {
            status.textContent =
                'Interactive tools failed to load. Please reload the page.';
        }
    }
}

init();
