/* =========================
   TEXT
   ========================= */

async function loadLanguages() {
    I18N.en =
        await fetchJSON(
            'locales/en.json'
        );
}

function tr(key) {
    return (
        I18N.en?.[key] ??
        key
    );
}

function applyLanguage() {
    document.documentElement.lang =
        LANG;

    document
        .querySelectorAll('[data-i18n]')
        .forEach(element => {

            element.textContent =
                tr(
                    element.dataset.i18n
                );
        });

    if (
        typeof populateWeaponSelect ===
            'function' &&
        Object.keys(WEAPONS).length
    ) {
        populateWeaponSelect();
    }

    renderSavedTargets();

    if (
        typeof updateMapToolsLocalization ===
        'function'
    ) {
        updateMapToolsLocalization();
    }

    if (
        typeof updateLayoutLocalization ===
        'function'
    ) {
        updateLayoutLocalization();
    }

    if (
        typeof updateMotdLocalization ===
        'function'
    ) {
        updateMotdLocalization();
    }

    if (
        typeof updateMobileDesktopLink ===
        'function'
    ) {
        updateMobileDesktopLink();
    }

    result();
    draw();
}
