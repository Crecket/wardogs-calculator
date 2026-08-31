const SOLUTION_POPOUT_SIZE_KEY =
    'wardogs-solution-popout-size';

const SOLUTION_POPOUT_DEFAULT_SIZE = {
    width: 360,
    height: 330
};

const SOLUTION_POPOUT_MIN_SIZE = {
    width: 220,
    height: 190
};

const SOLUTION_POPOUT_MAX_SIZE = {
    width: 1200,
    height: 1000
};

const SOLUTION_POPOUT_ICON =
    '<svg aria-hidden="true" viewBox="0 0 24 24" width="16" height="16"' +
    ' fill="none" stroke="currentColor" stroke-width="1.8"' +
    ' stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M13 4h7v7"/>' +
    '<path d="M20 4l-8.5 8.5"/>' +
    '<path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5"/>' +
    '</svg>';

let solutionPopoutWindow = null;
let solutionPopoutPanel = null;
let solutionPopoutPlaceholder = null;
let solutionPopoutHome = null;
let solutionPopoutButton = null;
let solutionPopoutThemeObserver = null;
let solutionPopoutStyleObserver = null;
let solutionPopoutRestoring = false;

function isSolutionPopoutSupported() {

    return (
        typeof window !== 'undefined' &&
        'documentPictureInPicture' in window &&
        !document.body.classList.contains(
            'mobile-app'
        )
    );
}

function isSolutionPoppedOut() {

    return Boolean(
        solutionPopoutWindow
    );
}

function findSolutionPanel() {

    if (
        solutionPopoutPanel?.isConnected
    ) {
        return solutionPopoutPanel;
    }

    const anchor =
        $('mil') ||
        $('distm');

    solutionPopoutPanel =
        anchor?.closest(
            '.section'
        ) ||
        null;

    return solutionPopoutPanel;
}

function clampSolutionPopoutSize(
    value,
    minimum,
    maximum,
    fallback
) {

    const size =
        Math.round(
            Number(value)
        );

    if (!Number.isFinite(size)) {
        return fallback;
    }

    return Math.min(
        maximum,
        Math.max(
            minimum,
            size
        )
    );
}

function loadSolutionPopoutSize() {

    try {

        const saved =
            JSON.parse(
                localStorage.getItem(
                    SOLUTION_POPOUT_SIZE_KEY
                ) ||
                'null'
            );

        return {
            width:
                clampSolutionPopoutSize(
                    saved?.width,
                    SOLUTION_POPOUT_MIN_SIZE.width,
                    SOLUTION_POPOUT_MAX_SIZE.width,
                    SOLUTION_POPOUT_DEFAULT_SIZE.width
                ),
            height:
                clampSolutionPopoutSize(
                    saved?.height,
                    SOLUTION_POPOUT_MIN_SIZE.height,
                    SOLUTION_POPOUT_MAX_SIZE.height,
                    SOLUTION_POPOUT_DEFAULT_SIZE.height
                )
        };

    } catch (error) {

        return {
            ...SOLUTION_POPOUT_DEFAULT_SIZE
        };
    }
}

function saveSolutionPopoutSize(popout) {

    if (!popout) {
        return;
    }

    const width =
        clampSolutionPopoutSize(
            popout.innerWidth,
            SOLUTION_POPOUT_MIN_SIZE.width,
            SOLUTION_POPOUT_MAX_SIZE.width,
            SOLUTION_POPOUT_DEFAULT_SIZE.width
        );

    const height =
        clampSolutionPopoutSize(
            popout.innerHeight,
            SOLUTION_POPOUT_MIN_SIZE.height,
            SOLUTION_POPOUT_MAX_SIZE.height,
            SOLUTION_POPOUT_DEFAULT_SIZE.height
        );

    try {

        localStorage.setItem(
            SOLUTION_POPOUT_SIZE_KEY,
            JSON.stringify({
                width,
                height
            })
        );

    } catch (error) {

        console.warn(
            'Failed to save solution pop-out size:',
            error
        );
    }
}

function adoptSolutionPopoutStyle(
    target,
    node
) {

    if (
        node.tagName === 'LINK'
    ) {

        const link =
            target.createElement(
                'link'
            );

        link.rel =
            'stylesheet';

        link.href =
            node.href;

        if (node.media) {
            link.media =
                node.media;
        }

        target.head.appendChild(
            link
        );

        return;
    }

    const style =
        target.createElement(
            'style'
        );

    style.textContent =
        node.textContent;

    target.head.appendChild(
        style
    );
}

function isSolutionPopoutStyleNode(node) {

    if (node.nodeType !== 1) {
        return false;
    }

    return (
        node.tagName === 'STYLE' ||
        (
            node.tagName === 'LINK' &&
            node.rel === 'stylesheet'
        )
    );
}

function copySolutionPopoutStyles(target) {

    document
        .querySelectorAll(
            'link[rel="stylesheet"], style'
        )
        .forEach(node => {

            adoptSolutionPopoutStyle(
                target,
                node
            );
        });
}

function observeSolutionPopoutStyles() {

    solutionPopoutStyleObserver =
        new MutationObserver(records => {

            if (!solutionPopoutWindow) {
                return;
            }

            records.forEach(record => {

                record.addedNodes.forEach(node => {

                    if (
                        !isSolutionPopoutStyleNode(
                            node
                        )
                    ) {
                        return;
                    }

                    adoptSolutionPopoutStyle(
                        solutionPopoutWindow.document,
                        node
                    );
                });
            });
        });

    solutionPopoutStyleObserver.observe(
        document.head,
        {
            childList: true
        }
    );
}

function mirrorSolutionPopoutTheme() {

    if (!solutionPopoutWindow) {
        return;
    }

    const source =
        document.documentElement;

    const target =
        solutionPopoutWindow
            .document
            .documentElement;

    if (source.dataset.theme) {
        target.dataset.theme =
            source.dataset.theme;
    } else {
        delete target.dataset.theme;
    }

    target.lang =
        source.lang ||
        LANG;
}

function observeSolutionPopoutTheme() {

    solutionPopoutThemeObserver =
        new MutationObserver(
            mirrorSolutionPopoutTheme
        );

    solutionPopoutThemeObserver.observe(
        document.documentElement,
        {
            attributes: true,
            attributeFilter: [
                'data-theme',
                'lang'
            ]
        }
    );
}

function disconnectSolutionPopoutObservers() {

    solutionPopoutThemeObserver?.disconnect();
    solutionPopoutStyleObserver?.disconnect();

    solutionPopoutThemeObserver = null;
    solutionPopoutStyleObserver = null;
}

function createSolutionPopoutButton() {

    const button =
        document.createElement(
            'button'
        );

    button.type =
        'button';

    button.id =
        'solutionPopoutToggle';

    button.className =
        'panel-popout-button';

    button.innerHTML =
        SOLUTION_POPOUT_ICON;

    button.addEventListener(
        'click',
        event => {

            event.preventDefault();

            if (isSolutionPoppedOut()) {
                closeSolutionPopout();
                return;
            }

            openSolutionPopout();
        }
    );

    return button;
}

function createSolutionPopoutPlaceholder() {

    const placeholder =
        document.createElement(
            'div'
        );

    placeholder.id =
        'solutionPopoutPlaceholder';

    placeholder.className =
        'section panel-popout-placeholder';

    const heading =
        document.createElement(
            'h2'
        );

    heading.className =
        'panel-popout-placeholder-heading';

    const note =
        document.createElement(
            'p'
        );

    note.className =
        'hint panel-popout-placeholder-note';

    const button =
        document.createElement(
            'button'
        );

    button.type =
        'button';

    button.className =
        'panel-popout-return';

    button.addEventListener(
        'click',
        event => {

            event.preventDefault();

            closeSolutionPopout();
        }
    );

    placeholder.append(
        heading,
        note,
        button
    );

    return placeholder;
}

function updateSolutionPopoutControls() {

    const poppedOut =
        isSolutionPoppedOut();

    if (solutionPopoutButton) {

        const label =
            poppedOut
                ? tr('returnSolutionPanel')
                : tr('popOutSolution');

        solutionPopoutButton.innerHTML =
            SOLUTION_POPOUT_ICON;

        solutionPopoutButton.title =
            poppedOut
                ? label
                : tr('popOutSolutionHint');

        solutionPopoutButton.setAttribute(
            'aria-label',
            label
        );
    }

    if (solutionPopoutPlaceholder) {

        setText(
            solutionPopoutPlaceholder
                .querySelector(
                    '.panel-popout-placeholder-heading'
                ),
            tr('result')
        );

        setText(
            solutionPopoutPlaceholder
                .querySelector(
                    '.panel-popout-placeholder-note'
                ),
            tr('solutionPopoutMoved')
        );

        setText(
            solutionPopoutPlaceholder
                .querySelector(
                    '.panel-popout-return'
                ),
            tr('returnSolutionPanel')
        );
    }

    if (poppedOut) {

        solutionPopoutWindow.document.title =
            tr('solutionPopoutTitle');
    }
}

function localizeSolutionPopout() {

    if (
        isSolutionPoppedOut() &&
        solutionPopoutPanel
    ) {

        solutionPopoutPanel
            .querySelectorAll(
                '[data-i18n]'
            )
            .forEach(element => {

                element.textContent =
                    tr(
                        element.dataset.i18n
                    );
            });
    }

    updateSolutionPopoutControls();
}

async function openSolutionPopout() {

    if (
        isSolutionPoppedOut() ||
        !isSolutionPopoutSupported()
    ) {
        return;
    }

    const panel =
        findSolutionPanel();

    if (!panel) {
        return;
    }

    const size =
        loadSolutionPopoutSize();

    let popout = null;

    try {

        popout =
            await documentPictureInPicture
                .requestWindow({
                    width: size.width,
                    height: size.height
                });

    } catch (error) {

        console.warn(
            'Failed to open the solution pop-out:',
            error
        );

        return;
    }

    solutionPopoutWindow =
        popout;

    POPOUT_DOCUMENT =
        popout.document;

    popout.document.body.className =
        'solution-popout-body';

    copySolutionPopoutStyles(
        popout.document
    );

    observeSolutionPopoutStyles();
    observeSolutionPopoutTheme();
    mirrorSolutionPopoutTheme();

    solutionPopoutHome = {
        parent: panel.parentNode,
        next: panel.nextSibling
    };

    solutionPopoutPlaceholder =
        createSolutionPopoutPlaceholder();

    panel.replaceWith(
        solutionPopoutPlaceholder
    );

    popout.document.body.append(
        panel
    );

    popout.addEventListener(
        'pagehide',
        handleSolutionPopoutClosed
    );

    updateSolutionPopoutControls();

    result();
}

function closeSolutionPopout() {

    if (!isSolutionPoppedOut()) {
        return;
    }

    const popout =
        solutionPopoutWindow;

    saveSolutionPopoutSize(
        popout
    );

    restoreSolutionPanel();

    popout.close();
}

function handleSolutionPopoutClosed() {

    if (!isSolutionPoppedOut()) {
        return;
    }

    saveSolutionPopoutSize(
        solutionPopoutWindow
    );

    restoreSolutionPanel();
}

function restoreSolutionPanel() {

    if (solutionPopoutRestoring) {
        return;
    }

    solutionPopoutRestoring = true;

    const panel =
        solutionPopoutPanel;

    if (panel) {

        if (
            solutionPopoutPlaceholder?.parentNode
        ) {
            solutionPopoutPlaceholder.replaceWith(
                panel
            );

        } else if (
            solutionPopoutHome?.parent?.isConnected
        ) {
            solutionPopoutHome.parent.insertBefore(
                panel,
                solutionPopoutHome.next?.isConnected
                    ? solutionPopoutHome.next
                    : null
            );

        } else {
            document
                .querySelector(
                    'main > aside'
                )
                ?.appendChild(
                    panel
                );
        }
    }

    solutionPopoutPlaceholder = null;
    solutionPopoutHome = null;
    solutionPopoutWindow = null;
    POPOUT_DOCUMENT = null;

    disconnectSolutionPopoutObservers();

    updateSolutionPopoutControls();

    solutionPopoutRestoring = false;

    result();
}

function initSolutionPopout() {

    if (!isSolutionPopoutSupported()) {
        return;
    }

    const themeToggle =
        $('themeToggle');

    if (!themeToggle?.parentElement) {
        return;
    }

    solutionPopoutButton =
        createSolutionPopoutButton();

    themeToggle.parentElement
        .insertBefore(
            solutionPopoutButton,
            themeToggle
        );

    updateSolutionPopoutControls();

    window.addEventListener(
        'pagehide',
        () => {

            if (!isSolutionPoppedOut()) {
                return;
            }

            const popout =
                solutionPopoutWindow;

            saveSolutionPopoutSize(
                popout
            );

            restoreSolutionPanel();

            popout.close();
        }
    );
}

if (
    typeof applyLanguage ===
    'function'
) {
    const applyLanguageBase =
        applyLanguage;

    applyLanguage =
        function (...args) {

            const value =
                applyLanguageBase.apply(
                    this,
                    args
                );

            localizeSolutionPopout();

            return value;
        };
}

initSolutionPopout();
