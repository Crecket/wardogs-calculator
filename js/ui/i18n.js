/* =========================
   LANGUAGES
   ========================= */

async function loadLanguages() {

    const index =
        await fetchJSON(
            'locales/index.json'
        );

    DEFAULT_LANG =
        index.default || 'en';

    LANGUAGES =
        Array.isArray(index.languages)
            ? index.languages
            : [];

    if (!LANGUAGES.length) {
        throw new Error(
            'No languages found in locales/index.json'
        );
    }

    await Promise.all(
        LANGUAGES.map(
            async language => {

                if (
                    !language.id ||
                    !language.file
                ) {
                    return;
                }

                I18N[language.id] =
                    await fetchJSON(
                        `locales/${language.file}`
                    );
            }
        )
    );

    populateLanguageSelect();

    LANG =
        detectLanguage();

    $('language').value =
        LANG;
}

function populateLanguageSelect() {

    const select =
        $('language');

    select.innerHTML = '';

    LANGUAGES.forEach(
        language => {

            const option =
                document.createElement(
                    'option'
                );

            option.value =
                language.id;

            option.textContent =
                `${language.flag || ''} ${
                    language.nativeName ||
                    language.name ||
                    language.id
                }`;

            select.appendChild(
                option
            );
        }
    );
}

function detectLanguage() {

    const available =
        new Set(
            LANGUAGES.map(
                language =>
                    language.id
            )
        );

    const saved =
        localStorage.getItem(
            'wardogs-language'
        );

    if (
        saved &&
        available.has(saved)
    ) {
        return saved;
    }

    const browserLanguages =
        navigator.languages &&
        navigator.languages.length
            ? navigator.languages
            : [navigator.language];

    for (
        const language
        of browserLanguages
        ) {

        if (!language) {
            continue;
        }

        const exact =
            language.toLowerCase();

        if (available.has(exact)) {
            return exact;
        }

        const base =
            exact.split('-')[0];

        if (available.has(base)) {
            return base;
        }
    }

    return available.has(DEFAULT_LANG)
        ? DEFAULT_LANG
        : LANGUAGES[0].id;
}

function tr(key) {

    const language =
        I18N[LANG];

    const fallback =
        I18N[DEFAULT_LANG];

    return (
        language?.[key] ??
        fallback?.[key] ??
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

    $('language').value =
        LANG;

    updatePresetLock();
    updateThemeButton();
    renderSavedTargets();

    if (
        typeof updateMapToolsLocalization === 'function'
    ) {
        updateMapToolsLocalization();
    }

    result();
    draw();
}
