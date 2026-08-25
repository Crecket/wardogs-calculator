const MOTD_DISMISSED_PREFIX =
    'wardogs-motd-dismissed:';

const MOTD_READ_PREFIX =
    'wardogs-motd-read:';

let currentMobileMotd =
    null;

function getLocalizedMotdValue(value) {
    if (typeof value === 'string') {
        return value;
    }

    if (!value || typeof value !== 'object') {
        return '';
    }

    return (
        value[LANG] ??
        value[DEFAULT_LANG] ??
        value.en ??
        Object.values(value).find(
            item => typeof item === 'string'
        ) ??
        ''
    );
}

function formatMotdMessage(message) {
    return String(message ?? '')
        .replace(/\\n/g, '\n');
}

function isMotdActive(motd) {
    if (!motd || motd.enabled !== true) {
        return false;
    }

    const now = Date.now();

    if (motd.startsAt) {
        const startsAt = Date.parse(motd.startsAt);

        if (
            !Number.isNaN(startsAt) &&
            now < startsAt
        ) {
            return false;
        }
    }

    if (motd.endsAt) {
        const endsAt = Date.parse(motd.endsAt);

        if (
            !Number.isNaN(endsAt) &&
            now >= endsAt
        ) {
            return false;
        }
    }

    return true;
}

function getMotdStorageKey(id) {
    return `${MOTD_DISMISSED_PREFIX}${id}`;
}

function getMotdReadStorageKey(id) {
    return `${MOTD_READ_PREFIX}${id}`;
}

function isMotdDismissed(id) {
    if (!id) {
        return false;
    }

    try {
        return (
            localStorage.getItem(
                getMotdStorageKey(id)
            ) === 'true'
        );
    } catch (error) {
        console.warn(
            'Failed to read MOTD state:',
            error
        );

        return false;
    }
}

function dismissMotd(id) {
    if (!id) {
        return;
    }

    try {
        localStorage.setItem(
            getMotdStorageKey(id),
            'true'
        );
    } catch (error) {
        console.warn(
            'Failed to save MOTD state:',
            error
        );
    }
}

function isMotdRead(id) {
    if (!id) {
        return true;
    }

    try {
        return (
            localStorage.getItem(
                getMotdReadStorageKey(id)
            ) === 'true'
        );
    } catch (error) {
        console.warn(
            'Failed to read MOTD read state:',
            error
        );

        return false;
    }
}

function markMotdRead(id) {
    if (!id) {
        return;
    }

    try {
        localStorage.setItem(
            getMotdReadStorageKey(id),
            'true'
        );
    } catch (error) {
        console.warn(
            'Failed to save MOTD read state:',
            error
        );
    }
}

function isMobileMotdUI() {
    return document.body.classList.contains(
        'mobile-app'
    );
}

function removeExistingMotd() {
    document
        .querySelectorAll('.motd')
        .forEach(
            element => {
                element.remove();
            }
        );

    syncMobileMotdButton();
}

function closeMotd(
    container,
    motd,
    dontShowAgain
) {
    const dismiss =
        Boolean(
            dontShowAgain?.checked &&
            motd.id
        );

    if (dismiss) {
        dismissMotd(
            motd.id
        );
    }

    container.classList.add(
        'motd--closing'
    );

    window.setTimeout(
        () => {
            container.remove();

            if (
                dismiss &&
                isMobileMotdUI() &&
                currentMobileMotd?.id ===
                    motd.id
            ) {
                currentMobileMotd =
                    null;
            }

            syncMobileMotdButton();
        },
        150
    );
}

function createMotd(motd) {
    removeExistingMotd();

    const container =
        document.createElement(
            'aside'
        );

    container.className =
        'motd';

    container.setAttribute(
        'role',
        'status'
    );

    container.setAttribute(
        'aria-live',
        'polite'
    );

    const header =
        document.createElement(
            'div'
        );

    header.className =
        'motd-header';

    const title =
        document.createElement(
            'div'
        );

    title.className =
        'motd-title';

    title.textContent =
        getLocalizedMotdValue(
            motd.title
        ) ||
        'Message';

    const closeButton =
        document.createElement(
            'button'
        );

    closeButton.className =
        'motd-close';

    closeButton.type =
        'button';

    closeButton.textContent =
        '×';

    closeButton.setAttribute(
        'aria-label',
        tr('motdClose')
    );

    closeButton.title =
        tr('motdClose');

    header.append(
        title,
        closeButton
    );

    const message =
        document.createElement(
            'div'
        );

    message.className =
        'motd-message';

    message.textContent =
        formatMotdMessage(
            getLocalizedMotdValue(
                motd.message
            )
        );

    const footer =
        document.createElement(
            'div'
        );

    footer.className =
        'motd-footer';

    const dontShowLabel =
        document.createElement(
            'label'
        );

    dontShowLabel.className =
        'motd-dismiss-label';

    const dontShowAgain =
        document.createElement(
            'input'
        );

    dontShowAgain.type =
        'checkbox';

    dontShowAgain.className =
        'motd-dismiss-checkbox';

    const dontShowText =
        document.createElement(
            'span'
        );

    dontShowText.textContent =
        tr('motdDontShowAgain');

    dontShowLabel.append(
        dontShowAgain,
        dontShowText
    );

    footer.appendChild(
        dontShowLabel
    );

    container.append(
        header,
        message,
        footer
    );

    closeButton.addEventListener(
        'click',
        () => {

            closeMotd(
                container,
                motd,
                dontShowAgain
            );
        }
    );

    document.body.appendChild(
        container
    );

    requestAnimationFrame(
        () => {

            container.classList.add(
                'motd--visible'
            );

            syncMobileMotdButton();
        }
    );

    return container;
}

function createMobileMotdButton() {
    let button =
        document.getElementById(
            'mobileMotdButton'
        );

    if (button) {
        return button;
    }

    const controls =
        document.querySelector(
            '.mobile-header-controls'
        );

    if (!controls) {
        return null;
    }

    button =
        document.createElement(
            'button'
        );

    button.id =
        'mobileMotdButton';

    button.type =
        'button';

    button.className =
        'mobile-motd-button';

    button.hidden =
        true;

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
            stroke-linejoin="round"
        >
            <path
                d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9"
            ></path>
            <path d="M10 21h4"></path>
        </svg>
    `;

    button.addEventListener(
        'click',
        event => {

            event.preventDefault();
            event.stopPropagation();

            if (!currentMobileMotd) {
                return;
            }

            const existing =
                document.querySelector(
                    '.motd'
                );

            if (existing) {
                existing.remove();
                syncMobileMotdButton();
                return;
            }

            /*
             * Reading is separate from "Don't show again":
             * opening the bell clears only the unread highlight,
             * while the same message can still be reopened later.
             */
            markMotdRead(
                currentMobileMotd.id
            );

            syncMobileMotdButton();

            createMotd(
                currentMobileMotd
            );
        }
    );

    const menuToggle =
        document.getElementById(
            'mobileSideMenuToggle'
        );

    if (
        menuToggle &&
        menuToggle.parentElement ===
            controls
    ) {
        controls.insertBefore(
            button,
            menuToggle
        );
    } else {
        controls.appendChild(
            button
        );
    }

    updateMotdLocalization();

    return button;
}

function syncMobileMotdButton() {
    if (!isMobileMotdUI()) {
        return;
    }

    const button =
        createMobileMotdButton();

    if (!button) {
        return;
    }

    const hasMotd =
        Boolean(
            currentMobileMotd?.id
        );

    button.hidden =
        !hasMotd;

    if (!hasMotd) {
        button.classList.remove(
            'has-unread'
        );

        button.setAttribute(
            'aria-expanded',
            'false'
        );

        return;
    }

    const unread =
        !isMotdRead(
            currentMobileMotd.id
        );

    button.classList.toggle(
        'has-unread',
        unread
    );

    button.setAttribute(
        'aria-expanded',
        document.querySelector(
            '.motd'
        )
            ? 'true'
            : 'false'
    );
}

function updateMotdLocalization() {
    const button =
        document.getElementById(
            'mobileMotdButton'
        );

    if (!button) {
        return;
    }

    const label =
        tr('motdTitle');

    button.setAttribute(
        'aria-label',
        label
    );

    button.title =
        label;
}

async function loadMotd() {
    try {
        const response =
            await fetch(
                resourceURL(
                    'data/motd.json'
                ),
                {
                    cache: 'no-store'
                }
            );

        if (!response.ok) {
            if (
                response.status !== 404
            ) {
                console.warn(
                    `Failed to load MOTD: ${response.status}`
                );
            }

            return null;
        }

        const motd =
            await response.json();

        if (
            !isMotdActive(
                motd
            )
        ) {
            return null;
        }

        if (!motd.id) {
            console.warn(
                'MOTD is enabled but has no id.'
            );

            return null;
        }

        if (
            isMotdDismissed(
                motd.id
            )
        ) {
            return null;
        }

        return motd;

    } catch (error) {

        console.warn(
            'Failed to load MOTD:',
            error
        );

        return null;
    }
}

async function initMotd() {
    const motd =
        await loadMotd();

    /*
     * Desktop keeps the existing automatic popup.
     * Mobile only exposes the current MOTD through
     * the notification bell in the header.
     */
    if (isMobileMotdUI()) {

        currentMobileMotd =
            motd;

        createMobileMotdButton();
        syncMobileMotdButton();

        return;
    }

    if (!motd) {
        return;
    }

    createMotd(
        motd
    );
}
