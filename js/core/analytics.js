/* =========================
   ANALYTICS
   ========================= */

/*
 * Thin wrapper around the Umami tracker already loaded by
 * the page shell.
 *
 * Goals:
 * - keep tracking calls out of feature code;
 * - avoid losing very early events while the deferred Umami
 *   script is still loading;
 * - keep event data intentionally small and non-sensitive;
 * - debounce calculator changes so marker dragging does not
 *   generate an event for every animation frame.
 */

const ANALYTICS_QUEUE = [];
const ANALYTICS_MAX_QUEUE = 32;
const ANALYTICS_FLUSH_INTERVAL = 500;
const ANALYTICS_FLUSH_ATTEMPTS = 30;
const ANALYTICS_CALCULATION_DELAY = 900;
const ANALYTICS_SESSION_DEDUPE_KEY =
    'wardogs-analytics-session-v1';

const ANALYTICS_CONTEXT_DEDUPED_EVENTS =
    new Set([
        'calculation',
        'origin-placed',
        'target-placed',
        'preset-marker-selected'
    ]);

let analyticsFlushTimer = null;
let analyticsFlushAttempts = 0;
let analyticsCalculationTimer = null;
let analyticsCalculationInitialized = false;
let analyticsLastCalculationFingerprint = null;
let analyticsSessionKeys =
    loadAnalyticsSessionKeys();


function loadAnalyticsSessionKeys() {
    try {
        const raw = window.sessionStorage.getItem(
            ANALYTICS_SESSION_DEDUPE_KEY
        );

        if (!raw) {
            return new Set();
        }

        const parsed = JSON.parse(raw);

        if (!Array.isArray(parsed)) {
            return new Set();
        }

        return new Set(
            parsed.filter(
                value =>
                    typeof value === 'string'
            )
        );

    } catch (_) {
        return new Set();
    }
}

function persistAnalyticsSessionKeys() {
    try {
        window.sessionStorage.setItem(
            ANALYTICS_SESSION_DEDUPE_KEY,
            JSON.stringify(
                Array.from(
                    analyticsSessionKeys
                )
            )
        );
    } catch (_) {
        // sessionStorage is optional.
    }
}

function getAnalyticsContextKey(
    name,
    data
) {
    if (
        !ANALYTICS_CONTEXT_DEDUPED_EVENTS.has(
            name
        )
    ) {
        return null;
    }

    const map =
        typeof data?.map === 'string'
            ? data.map
            : '';

    if (name === 'calculation') {
        const weapon =
            typeof data?.weapon === 'string'
                ? data.weapon
                : '';

        return [
            name,
            map,
            weapon
        ].join('|');
    }

    return [
        name,
        map
    ].join('|');
}

function shouldSuppressAnalyticsEvent(
    name,
    data
) {
    const key =
        getAnalyticsContextKey(
            name,
            data
        );

    if (!key) {
        return false;
    }

    if (
        analyticsSessionKeys.has(
            key
        )
    ) {
        return true;
    }

    analyticsSessionKeys.add(
        key
    );

    persistAnalyticsSessionKeys();

    return false;
}

function isAnalyticsDisabled() {
    return (
        window.__WARDOGS_ANALYTICS_DISABLED__ ===
        true
    );
}

function isAnalyticsAvailable() {
    return Boolean(
        !isAnalyticsDisabled() &&
        window.umami &&
        typeof window.umami.track === 'function'
    );
}

function normalizeAnalyticsData(data) {
    if (!data || typeof data !== 'object') {
        return undefined;
    }

    const normalized = {};

    Object.entries(data)
        .forEach(([key, value]) => {
            if (
                value === null ||
                value === undefined
            ) {
                return;
            }

            if (
                typeof value === 'string' ||
                typeof value === 'number' ||
                typeof value === 'boolean'
            ) {
                normalized[key] =
                    typeof value === 'string'
                        ? value.slice(0, 64)
                        : value;
            }
        });

    return Object.keys(normalized).length
        ? normalized
        : undefined;
}

function sendAnalyticsEvent(name, data) {
    if (!isAnalyticsAvailable()) {
        return false;
    }

    try {
        window.umami.track(
            name,
            normalizeAnalyticsData(data)
        );

        return true;

    } catch (error) {
        console.warn(
            'Failed to send analytics event:',
            error
        );

        return false;
    }
}

function flushAnalyticsQueue() {
    if (isAnalyticsDisabled()) {
        ANALYTICS_QUEUE.length = 0;

        if (analyticsFlushTimer) {
            window.clearInterval(
                analyticsFlushTimer
            );
            analyticsFlushTimer = null;
        }

        return;
    }

    if (isAnalyticsAvailable()) {
        while (ANALYTICS_QUEUE.length) {
            const event = ANALYTICS_QUEUE.shift();

            sendAnalyticsEvent(
                event.name,
                event.data
            );
        }

        if (analyticsFlushTimer) {
            window.clearInterval(
                analyticsFlushTimer
            );

            analyticsFlushTimer = null;
        }

        return;
    }

    analyticsFlushAttempts++;

    if (
        analyticsFlushAttempts >=
        ANALYTICS_FLUSH_ATTEMPTS
    ) {
        ANALYTICS_QUEUE.length = 0;

        if (analyticsFlushTimer) {
            window.clearInterval(
                analyticsFlushTimer
            );

            analyticsFlushTimer = null;
        }
    }
}

function scheduleAnalyticsFlush() {
    if (
        analyticsFlushTimer ||
        isAnalyticsAvailable()
    ) {
        return;
    }

    analyticsFlushAttempts = 0;

    analyticsFlushTimer =
        window.setInterval(
            flushAnalyticsQueue,
            ANALYTICS_FLUSH_INTERVAL
        );
}

function trackAnalytics(name, data = undefined) {
    if (isAnalyticsDisabled()) {
        return;
    }

    if (
        typeof name !== 'string' ||
        !name.trim()
    ) {
        return;
    }

    const normalizedName =
        name.trim().slice(0, 64);

    const normalizedData =
        normalizeAnalyticsData(data);

    if (
        shouldSuppressAnalyticsEvent(
            normalizedName,
            normalizedData
        )
    ) {
        return;
    }

    if (
        sendAnalyticsEvent(
            normalizedName,
            normalizedData
        )
    ) {
        return;
    }

    if (
        ANALYTICS_QUEUE.length >=
        ANALYTICS_MAX_QUEUE
    ) {
        ANALYTICS_QUEUE.shift();
    }

    ANALYTICS_QUEUE.push({
        name: normalizedName,
        data: normalizedData
    });

    scheduleAnalyticsFlush();
}

function getCalculationFingerprint() {
    if (
        typeof S === 'undefined' ||
        !S.weapon
    ) {
        return null;
    }

    return [
        S.map,
        S.weapon,
        Number(S.origin.x).toFixed(4),
        Number(S.origin.y).toFixed(4),
        Number(S.target.x).toFixed(4),
        Number(S.target.y).toFixed(4)
    ].join('|');
}

function trackCalculationState(inRange) {
    const fingerprint =
        getCalculationFingerprint();

    if (!fingerprint) {
        return;
    }

    /*
     * The first rendered solution is the initial application
     * state, not a user calculation. Store it as the baseline
     * without emitting an event.
     */
    if (!analyticsCalculationInitialized) {
        analyticsCalculationInitialized = true;
        analyticsLastCalculationFingerprint =
            fingerprint;
        return;
    }

    if (
        fingerprint ===
        analyticsLastCalculationFingerprint
    ) {
        return;
    }

    if (analyticsCalculationTimer) {
        window.clearTimeout(
            analyticsCalculationTimer
        );
    }

    analyticsCalculationTimer =
        window.setTimeout(
            () => {
                const currentFingerprint =
                    getCalculationFingerprint();

                if (
                    !currentFingerprint ||
                    currentFingerprint ===
                    analyticsLastCalculationFingerprint
                ) {
                    return;
                }

                analyticsLastCalculationFingerprint =
                    currentFingerprint;

                trackAnalytics(
                    'calculation',
                    {
                        map: S.map,
                        weapon: S.weapon,
                        inRange: Boolean(inRange)
                    }
                );
            },
            ANALYTICS_CALCULATION_DELAY
        );
}

window.addEventListener(
    'load',
    flushAnalyticsQueue,
    { once: true }
);
