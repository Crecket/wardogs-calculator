/* =========================
   MESSAGE OF THE DAY
   ========================= */

let MOTD = null;
let motdElement = null;

const MOTD_DISMISSED_PREFIX =
    'wardogs-motd-dismissed:';

function motdText(value) {

    if (
        value &&
        typeof value === 'object' &&
        !Array.isArray(value)
    ) {
        return (
            value[LANG] ??
            value[DEFAULT_LANG] ??
            Object.values(value)[0] ??
            ''
        );
    }

    return typeof value === 'string'
        ? value
        : '';
}

function getMotdDismissKey() {

    if (!MOTD?.id) {
        return null;
    }

    return (
        MOTD_DISMISSED_PREFIX +
        MOTD.id
    );
}

function isMotdDismissed() {

    const key =
        getMotdDismissKey();

    return Boolean(
        key &&
        localStorage.getItem(key) === 'true'
    );
}

function isMotdWithinSchedule() {

    const now =
        Date.now();

    if (MOTD?.startsAt) {

        const startsAt =
            Date.parse(MOTD.startsAt);

        if (
            Number.isFinite(startsAt) &&
            now < startsAt
        ) {
            return false;
        }
    }

    if (MOTD?.endsAt) {

        const endsAt =
            Date.parse(MOTD.endsAt);

        if (
            Number.isFinite(endsAt) &&
            now > endsAt
        ) {
            return false;
        }
    }

    return true;
}

function shouldShowMotd() {

    return Boolean(
        MOTD &&
        MOTD.enabled !== false &&
        MOTD.id &&
        motdText(MOTD.message).trim() &&
        isMotdWithinSchedule() &&
        !isMotdDismissed()
    );
}

function closeMotd() {

    if (!motdElement) {
        return;
    }

    motdElement.classList.add(
        'motd-hidden'
    );

    const element =
        motdElement;

    motdElement = null;

    window.setTimeout(
        () => element.remove(),
        180
    );
}

function createMotdElement() {

    const card =
        document.createElement('aside');

    card.className =
        'motd';

    card.setAttribute(
        'role',
        'status'
    );

    card.setAttribute(
        'aria-live',
        'polite'
    );

    const header =
        document.createElement('div');

    header.className =
        'motd-header';

    const title =
        document.createElement('div');

    title.className =
        'motd-title';

    const close =
        document.createElement('button');

    close.type = 'button';
    close.className =
        'motd-close';
    close.textContent = '×';

    close.addEventListener(
        'click',
        closeMotd
    );

    header.appendChild(title);
    header.appendChild(close);

    const message =
        document.createElement('div');

    message.className =
        'motd-message';

    const footer =
        document.createElement('label');

    footer.className =
        'motd-dismiss';

    const checkbox =
        document.createElement('input');

    checkbox.type =
        'checkbox';

    checkbox.addEventListener(
        'change',
        () => {

            const key =
                getMotdDismissKey();

            if (!key) {
                return;
            }

            if (checkbox.checked) {
                localStorage.setItem(
                    key,
                    'true'
                );
            } else {
                localStorage.removeItem(
                    key
                );
            }
        }
    );

    const dismissText =
        document.createElement('span');

    footer.appendChild(checkbox);
    footer.appendChild(dismissText);

    card.appendChild(header);
    card.appendChild(message);
    card.appendChild(footer);

    card._motd = {
        title,
        message,
        close,
        dismissText
    };

    return card;
}

function updateMotdLocalization() {

    if (!motdElement) {
        return;
    }

    const refs =
        motdElement._motd;

    if (!refs) {
        return;
    }

    refs.title.textContent =
        motdText(MOTD.title) ||
        tr('motdTitle');

    refs.message.textContent =
        motdText(MOTD.message);

    refs.dismissText.textContent =
        tr('motdDontShowAgain');

    refs.close.title =
        tr('motdClose');

    refs.close.setAttribute(
        'aria-label',
        tr('motdClose')
    );
}

function renderMotd() {

    if (!shouldShowMotd()) {
        return;
    }

    if (motdElement) {
        motdElement.remove();
    }

    motdElement =
        createMotdElement();

    updateMotdLocalization();

    document.body.appendChild(
        motdElement
    );

    requestAnimationFrame(
        () => {
            motdElement?.classList.add(
                'motd-visible'
            );
        }
    );
}

async function loadMotd() {

    try {

        MOTD =
            await fetchJSON(
                'data/motd.json'
            );

        renderMotd();

    } catch (error) {

        /*
         * MOTD is optional. A missing or
         * malformed file must never prevent
         * the calculator from starting.
         */
        console.warn(
            'Failed to load MOTD:',
            error
        );
    }
}
