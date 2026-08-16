/* =========================
   INIT
   ========================= */

async function init() {

    try {

        applyTheme(
            getTheme()
        );

        bindThemeToggle();

        loadSavedTargets();

        await loadLanguages();

        await loadAppConfig();

        await loadWeapons();

        await loadMapAssets();

        await loadMaps();

        initMapTools();

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

        loadSaveArtilleryPreference();

        updatePresetLock();

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