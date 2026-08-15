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

        await loadMaps();

        bindEvents();

        loadSaveArtilleryPreference();

        updatePresetLock();

        applyLanguage();

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
