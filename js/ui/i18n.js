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

    /*
     * Localized entry pages declare their language
     * in <html data-page-language="...">.
     * This takes priority so every language URL
     * always renders the matching language.
     */
    const pageLanguage =
        document.documentElement
            .dataset.pageLanguage;

    if (
        pageLanguage &&
        available.has(pageLanguage)
    ) {
        return pageLanguage;
    }

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

function getLanguagePageURL(languageId) {

    /*
     * document.baseURI points at the shared app root.
     * Localized pages use <base href="../">, so this
     * also works on GitHub Pages and localhost.
     */
    const rootURL =
        new URL(
            './',
            document.baseURI
        );

    if (languageId === DEFAULT_LANG) {
        return rootURL.href;
    }

    return new URL(
        `${languageId}/`,
        rootURL
    ).href;
}

function switchLanguage(languageId) {

    localStorage.setItem(
        'wardogs-language',
        languageId
    );

    window.location.href =
        getLanguagePageURL(
            languageId
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
