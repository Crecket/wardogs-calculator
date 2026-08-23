/* =========================
   INIT
   ========================= */

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
                'js/features/terrain-ballistics.js';

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

        await loadMapAssets();

        await loadMaps();

        await loadTerrainBallisticsRuntime();

        initMapTools();

        initLayout();

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

    } catch (error) {

        console.error(
            'Failed to initialize application:',
            error
        );

        document.body.innerHTML = `
            <div style="
                padding:40px;
                font-family:system-ui;
                color:#d86666;
                background:#101316;
            ">
                <h1>Failed to initialize application</h1>
                <pre>${error.message}</pre>
            </div>
        `;
    }
}

init();
