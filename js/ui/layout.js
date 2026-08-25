/* =========================
   LAYOUT
   ========================= */

const SIDEBAR_COLLAPSED_KEY =
    'wardogs-sidebar-collapsed';

const SAVED_TARGETS_PANEL_COLLAPSED_KEY =
    'wardogs-saved-targets-panel-collapsed';

let mapResizeObserver =
    null;

let mobileSideMenuOpen =
    false;

let mobileSphWarningObserver =
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

/* =========================
   MOBILE RIGHT-SIDE MENU
   ========================= */

function setMobileSideMenuOpen(
    open
) {

    const menu =
        $('mobileSideMenu');

    const toggle =
        $('mobileSideMenuToggle');

    const backdrop =
        $('mobileSideMenuBackdrop');

    if (
        !menu ||
        !toggle ||
        !backdrop
    ) {
        return;
    }

    mobileSideMenuOpen =
        Boolean(open);

    document.body.classList.toggle(
        'mobile-side-menu-open',
        mobileSideMenuOpen
    );

    toggle.classList.toggle(
        'active',
        mobileSideMenuOpen
    );

    toggle.setAttribute(
        'aria-expanded',
        mobileSideMenuOpen
            ? 'true'
            : 'false'
    );

    menu.setAttribute(
        'aria-hidden',
        mobileSideMenuOpen
            ? 'false'
            : 'true'
    );

    backdrop.setAttribute(
        'aria-hidden',
        mobileSideMenuOpen
            ? 'false'
            : 'true'
    );

    if (mobileSideMenuOpen) {

        /*
         * Keep the calculator bottom sheet closed
         * while the global mobile menu is open.
         */
        if (
            typeof setMobileSheetOpen ===
            'function'
        ) {
            setMobileSheetOpen(
                false
            );
        }

        if (
            typeof closeLanguagePicker ===
            'function'
        ) {
            closeLanguagePicker();
        }
    }
}

function createMobileSideMenuToggle() {

    const button =
        document.createElement(
            'button'
        );

    button.id =
        'mobileSideMenuToggle';

    button.type =
        'button';

    button.className =
        'mobile-side-menu-toggle';

    button.title =
        'Menu';

    button.setAttribute(
        'aria-label',
        'Menu'
    );

    button.setAttribute(
        'aria-controls',
        'mobileSideMenu'
    );

    button.setAttribute(
        'aria-expanded',
        'false'
    );

    button.innerHTML = `
        <svg
            aria-hidden="true"
            viewBox="0 0 24 24"
            width="20"
            height="20"
            fill="none"
            stroke="currentColor"
            stroke-width="1.8"
            stroke-linecap="round"
        >
            <path d="M5 7h14"></path>
            <path d="M5 12h14"></path>
            <path d="M5 17h14"></path>
        </svg>
    `;

    return button;
}

function initMobileSideMenu() {

    const mobileApp =
        document.body.classList.contains(
            'mobile-app'
        );

    if (!mobileApp) {
        return;
    }

    if (
        $('mobileSideMenu')
    ) {
        return;
    }

    const headerControls =
        document.querySelector(
            '.mobile-header-controls'
        );

    if (!headerControls) {
        return;
    }

    const themeToggle =
        $('themeToggle');

    const languagePicker =
        $('languagePicker');

    const languageSelect =
        $('language');

    const desktopLink =
        $('mobileDesktopVersion');

    const partnerLink =
        document.querySelector(
            '.mobile-partner-link'
        );

    const toggle =
        createMobileSideMenuToggle();

    const backdrop =
        document.createElement(
            'button'
        );

    backdrop.id =
        'mobileSideMenuBackdrop';

    backdrop.type =
        'button';

    backdrop.className =
        'mobile-side-menu-backdrop';

    backdrop.setAttribute(
        'aria-label',
        'Close menu'
    );

    backdrop.setAttribute(
        'aria-hidden',
        'true'
    );

    const menu =
        document.createElement(
            'aside'
        );

    menu.id =
        'mobileSideMenu';

    menu.className =
        'mobile-side-menu';

    menu.setAttribute(
        'aria-label',
        'Menu'
    );

    menu.setAttribute(
        'aria-hidden',
        'true'
    );

    const menuHeader =
        document.createElement(
            'div'
        );

    menuHeader.className =
        'mobile-side-menu-header';

    const closeButton =
        document.createElement(
            'button'
        );

    closeButton.type =
        'button';

    closeButton.className =
        'mobile-side-menu-close';

    closeButton.textContent =
        '×';

    closeButton.title =
        'Close menu';

    closeButton.setAttribute(
        'aria-label',
        'Close menu'
    );

    menuHeader.appendChild(
        closeButton
    );

    const settings =
        document.createElement(
            'div'
        );

    settings.className =
        'mobile-side-menu-settings';

    if (themeToggle) {

        settings.appendChild(
            themeToggle
        );
    }

    if (languagePicker) {

        settings.appendChild(
            languagePicker
        );
    }

    /*
     * buildLanguagePicker() keeps the native select
     * as a hidden accessible fallback. Move it together
     * with the custom picker so all language controls live
     * inside the new menu.
     */
    if (languageSelect) {

        settings.appendChild(
            languageSelect
        );
    }

    const links =
        document.createElement(
            'div'
        );

    links.className =
        'mobile-side-menu-links';

    if (desktopLink) {

        links.appendChild(
            desktopLink
        );
    }

    if (partnerLink) {

        partnerLink.dataset
            .umamiEventPlacement =
            'mobile-menu';

        links.appendChild(
            partnerLink
        );
    }

    menu.append(
        menuHeader,
        settings,
        links
    );

    /*
     * Moving the existing controls keeps all listeners,
     * IDs, localization logic and analytics intact.
     */
    headerControls.appendChild(
        toggle
    );

    document.body.append(
        backdrop,
        menu
    );

    toggle.addEventListener(
        'click',
        event => {

            event.preventDefault();
            event.stopPropagation();

            setMobileSideMenuOpen(
                !mobileSideMenuOpen
            );
        }
    );

    closeButton.addEventListener(
        'click',
        () => {

            setMobileSideMenuOpen(
                false
            );
        }
    );

    backdrop.addEventListener(
        'click',
        () => {

            setMobileSideMenuOpen(
                false
            );
        }
    );

    desktopLink
        ?.addEventListener(
            'click',
            () => {

                setMobileSideMenuOpen(
                    false
                );
            }
        );

    partnerLink
        ?.addEventListener(
            'click',
            () => {

                setMobileSideMenuOpen(
                    false
                );
            }
        );

    document.addEventListener(
        'keydown',
        event => {

            if (
                event.key ===
                    'Escape' &&
                mobileSideMenuOpen
            ) {

                setMobileSideMenuOpen(
                    false
                );
            }
        }
    );

    setMobileSideMenuOpen(
        false
    );
}

/* =========================
   MOBILE SPH-2 LEVEL WARNING
   ========================= */

function setMobileSphWarningExpanded(
    warning,
    expanded
) {

    if (!warning) {
        return;
    }

    const toggle =
        warning.querySelector(
            '.sph-level-warning-toggle'
        );

    const body =
        warning.querySelector(
            '.sph-level-warning-body'
        );

    if (
        !toggle ||
        !body
    ) {
        return;
    }

    const next =
        Boolean(expanded);

    toggle.setAttribute(
        'aria-expanded',
        next
            ? 'true'
            : 'false'
    );

    body.hidden =
        !next;

    warning.classList.toggle(
        'expanded',
        next
    );
}

function prepareMobileSphLevelWarning() {

    const mobileApp =
        document.body.classList.contains(
            'mobile-app'
        );

    if (!mobileApp) {
        return false;
    }

    const warning =
        $('sphLevelWarning');

    const solutionHud =
        document.querySelector(
            '.mobile-solution-hud'
        );

    const rangeStatus =
        $('rangeStatus');

    if (
        !warning ||
        !solutionHud
    ) {
        return false;
    }

    /*
     * Put the SPH-2 leveling warning into the compact
     * firing-solution HUD shown above the map, directly
     * under the range-status row.
     */
    if (
        warning.parentElement !==
        solutionHud
    ) {

        if (
            rangeStatus &&
            rangeStatus.parentElement ===
                solutionHud
        ) {
            rangeStatus.insertAdjacentElement(
                'afterend',
                warning
            );
        } else {
            solutionHud.appendChild(
                warning
            );
        }
    }

    if (
        warning.dataset
            .mobileCollapsible ===
        'true'
    ) {
        return true;
    }

    const title =
        warning.querySelector(
            '.sph-level-warning-title'
        );

    const body =
        warning.querySelector(
            '.sph-level-warning-body'
        );

    if (
        !title ||
        !body
    ) {
        return false;
    }

    const toggle =
        document.createElement(
            'button'
        );

    toggle.type =
        'button';

    toggle.className =
        'sph-level-warning-toggle';

    /*
     * Reuse the existing icon/title nodes so the
     * Terrain3D runtime keeps updating localized text.
     */
    while (title.firstChild) {

        toggle.appendChild(
            title.firstChild
        );
    }

    const chevron =
        document.createElement(
            'span'
        );

    chevron.className =
        'sph-level-warning-chevron';

    chevron.textContent =
        '▾';

    chevron.setAttribute(
        'aria-hidden',
        'true'
    );

    toggle.appendChild(
        chevron
    );

    title.replaceWith(
        toggle
    );

    body.id =
        'sphLevelWarningBody';

    toggle.setAttribute(
        'aria-controls',
        body.id
    );

    toggle.addEventListener(
        'click',
        event => {

            event.preventDefault();
            event.stopPropagation();

            const expanded =
                toggle.getAttribute(
                    'aria-expanded'
                ) === 'true';

            setMobileSphWarningExpanded(
                warning,
                !expanded
            );
        }
    );

    warning.dataset
        .mobileCollapsible =
        'true';

    warning.classList.add(
        'sph-level-warning-mobile-hud'
    );

    /*
     * Keep the HUD compact until the user explicitly
     * asks for the full leveling explanation.
     */
    setMobileSphWarningExpanded(
        warning,
        false
    );

    return true;
}

function initMobileSphLevelWarning() {

    const mobileApp =
        document.body.classList.contains(
            'mobile-app'
        );

    if (!mobileApp) {
        return;
    }

    if (
        prepareMobileSphLevelWarning()
    ) {
        return;
    }

    /*
     * Terrain3D normally creates the warning before
     * initLayout(), but this keeps the UI robust if
     * runtime loading order changes.
     */
    if (
        mobileSphWarningObserver ||
        typeof MutationObserver ===
            'undefined'
    ) {
        return;
    }

    mobileSphWarningObserver =
        new MutationObserver(
            () => {

                if (
                    prepareMobileSphLevelWarning()
                ) {

                    mobileSphWarningObserver
                        .disconnect();

                    mobileSphWarningObserver =
                        null;
                }
            }
        );

    mobileSphWarningObserver.observe(
        document.body,
        {
            childList: true,
            subtree: true
        }
    );
}

/* =========================
   DESKTOP SAVED TARGETS COLLAPSE
   ========================= */

function installDesktopSavedTargetsCollapseStyle() {

    if (
        $('savedTargetsCollapseStyle')
    ) {
        return;
    }

    const style =
        document.createElement(
            'style'
        );

    style.id =
        'savedTargetsCollapseStyle';

    style.textContent = `
        body:not(.mobile-app)
        .saved-targets {
            transition:
                width .18s ease,
                padding .18s ease;
        }

        body:not(.mobile-app)
        .saved-targets-header {
            display: grid;

            grid-template-columns:
                minmax(0, 1fr)
                auto
                24px;

            align-items: center;

            gap: 7px;
        }

        body:not(.mobile-app)
        .saved-targets-collapse-toggle {
            width: 24px;
            min-width: 24px;

            height: 24px;
            min-height: 24px;

            margin: 0;
            padding: 0;

            display: grid;
            place-items: center;

            border: 1px solid
                var(--border-light);

            border-radius: 5px;

            background:
                var(--input-bg);

            color:
                var(--muted);

            font-size: 12px;
            line-height: 1;

            cursor: pointer;
        }

        body:not(.mobile-app)
        .saved-targets-collapse-toggle:hover,
        body:not(.mobile-app)
        .saved-targets-collapse-toggle:focus-visible {
            border-color:
                var(--accent-border);

            background:
                var(--input-hover-bg);

            color:
                var(--accent);
        }

        body:not(.mobile-app)
        .saved-targets.is-collapsed {
            width: 205px;

            padding:
                9px
                10px;
        }

        body:not(.mobile-app)
        .saved-targets.is-collapsed
        .saved-targets-header {
            margin-bottom: 0;
        }

        body:not(.mobile-app)
        .saved-targets.is-collapsed
        > .saved-targets-list,

        body:not(.mobile-app)
        .saved-targets.is-collapsed
        > .saved-target-options,

        body:not(.mobile-app)
        .saved-targets.is-collapsed
        > .saved-target-actions {
            display: none;
        }
    `;

    document.head.appendChild(
        style
    );
}

function loadDesktopSavedTargetsCollapsed() {

    try {

        return (
            localStorage.getItem(
                SAVED_TARGETS_PANEL_COLLAPSED_KEY
            ) === 'true'
        );

    } catch (error) {

        return false;
    }
}

function saveDesktopSavedTargetsCollapsed(
    collapsed
) {

    try {

        localStorage.setItem(
            SAVED_TARGETS_PANEL_COLLAPSED_KEY,
            collapsed
                ? 'true'
                : 'false'
        );

    } catch (error) {

        console.warn(
            'Failed to save saved-targets panel state:',
            error
        );
    }
}

function setDesktopSavedTargetsCollapsed(
    collapsed,
    persist = true
) {

    const panel =
        document.querySelector(
            '.workspace .saved-targets'
        );

    const toggle =
        $('savedTargetsCollapseToggle');

    if (
        !panel ||
        !toggle
    ) {
        return;
    }

    const next =
        Boolean(
            collapsed
        );

    panel.classList.toggle(
        'is-collapsed',
        next
    );

    toggle.setAttribute(
        'aria-expanded',
        next
            ? 'false'
            : 'true'
    );

    toggle.textContent =
        next
            ? '▾'
            : '▴';

    const label =
        typeof tr ===
            'function'
            ? tr('savedTargets')
            : 'Saved targets';

    toggle.title =
        label;

    toggle.setAttribute(
        'aria-label',
        label
    );

    if (persist) {

        saveDesktopSavedTargetsCollapsed(
            next
        );
    }
}

function initDesktopSavedTargetsCollapse() {

    const mobileApp =
        document.body.classList.contains(
            'mobile-app'
        );

    if (mobileApp) {
        return;
    }

    const panel =
        document.querySelector(
            '.workspace .saved-targets'
        );

    const header =
        panel?.querySelector(
            '.saved-targets-header'
        );

    if (
        !panel ||
        !header
    ) {
        return;
    }

    installDesktopSavedTargetsCollapseStyle();

    let toggle =
        $('savedTargetsCollapseToggle');

    if (!toggle) {

        toggle =
            document.createElement(
                'button'
            );

        toggle.id =
            'savedTargetsCollapseToggle';

        toggle.type =
            'button';

        toggle.className =
            'saved-targets-collapse-toggle';

        header.appendChild(
            toggle
        );

        toggle.addEventListener(
            'click',
            event => {

                event.preventDefault();
                event.stopPropagation();

                setDesktopSavedTargetsCollapsed(
                    !panel.classList.contains(
                        'is-collapsed'
                    )
                );
            }
        );
    }

    setDesktopSavedTargetsCollapsed(
        loadDesktopSavedTargetsCollapsed(),
        false
    );
}

function updateLayoutLocalization() {

    updateSidebarToggle();
}

function initLayout() {

    const mobileApp =
        document.body.classList.contains(
            'mobile-app'
        );

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

    if (!mobileApp) {
        setSidebarCollapsed(
            loadSidebarState(),
            false
        );

        initDesktopSavedTargetsCollapse();

    } else {
        initMobileSideMenu();
        initMobileSphLevelWarning();
    }

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
