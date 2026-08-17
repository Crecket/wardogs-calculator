/* =========================
   LAYOUT
   ========================= */

const SIDEBAR_COLLAPSED_KEY =
    'wardogs-sidebar-collapsed';

let mapResizeObserver =
    null;

function isSidebarCollapsed() {

    return document
        .querySelector('main')
        ?.classList
        .contains('sidebar-collapsed') ||
        false;
}

function saveSidebarState(
    collapsed
) {

    try {

        localStorage.setItem(
            SIDEBAR_COLLAPSED_KEY,
            collapsed
                ? 'true'
                : 'false'
        );

    } catch (error) {

        console.warn(
            'Failed to save sidebar state:',
            error
        );
    }
}

function loadSidebarState() {

    try {

        return (
            localStorage.getItem(
                SIDEBAR_COLLAPSED_KEY
            ) === 'true'
        );

    } catch (error) {

        return false;
    }
}

function updateSidebarToggle() {

    const button =
        $('sidebarToggle');

    if (!button) {
        return;
    }

    const collapsed =
        isSidebarCollapsed();

    const label =
        collapsed
            ? tr('sidebarShow')
            : tr('sidebarHide');

    button.title =
        label;

    button.setAttribute(
        'aria-label',
        label
    );

    button.setAttribute(
        'aria-expanded',
        collapsed
            ? 'false'
            : 'true'
    );

    const icon =
        button.querySelector(
            '.sidebar-toggle-icon'
        );

    if (icon) {

        icon.textContent =
            collapsed
                ? '›'
                : '‹';
    }
}

function setSidebarCollapsed(
    collapsed,
    persist = true
) {

    const main =
        document.querySelector(
            'main'
        );

    if (!main) {
        return;
    }

    main.classList.toggle(
        'sidebar-collapsed',
        Boolean(
            collapsed
        )
    );

    if (persist) {

        saveSidebarState(
            Boolean(
                collapsed
            )
        );
    }

    updateSidebarToggle();

    /*
     * ResizeObserver handles the canvas
     * throughout the slide animation.
     * The fallback is useful in browsers
     * without ResizeObserver.
     */
    if (
        typeof ResizeObserver ===
        'undefined'
    ) {

        window.setTimeout(
            () => {
                if (
                    typeof resize ===
                    'function'
                ) {
                    resize();
                }
            },
            280
        );
    }
}

function toggleSidebar() {

    setSidebarCollapsed(
        !isSidebarCollapsed()
    );
}

function updateLayoutLocalization() {

    updateSidebarToggle();
}

function initLayout() {

    const button =
        $('sidebarToggle');

    button?.addEventListener(
        'click',
        event => {

            event.preventDefault();
            event.stopPropagation();

            toggleSidebar();
        }
    );

    setSidebarCollapsed(
        loadSidebarState(),
        false
    );

    const map =
        document.querySelector(
            '.map'
        );

    if (
        map &&
        typeof ResizeObserver !==
        'undefined'
    ) {

        mapResizeObserver =
            new ResizeObserver(
                () => {

                    if (
                        typeof resize ===
                        'function'
                    ) {
                        resize();
                    }
                }
            );

        mapResizeObserver.observe(
            map
        );
    }

    updateLayoutLocalization();
}
