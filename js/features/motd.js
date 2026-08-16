const MOTD_DISMISSED_PREFIX = 'wardogs-motd-dismissed:';

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

function removeExistingMotd() {
    document
        .querySelectorAll('.motd')
        .forEach(
            element => {
                element.remove();
            }
        );
}

function closeMotd(
    container,
    motd,
    dontShowAgain
) {
    if (
        dontShowAgain?.checked &&
        motd.id
    ) {
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
        tr('close')
    );

    closeButton.title =
        tr('close');

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
        }
    );

    return container;
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

    if (!motd) {
        return;
    }

    createMotd(
        motd
    );
}