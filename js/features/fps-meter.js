/* =========================
   FPS METER
   ========================= */

const FPS_METER_KEY = 'wardogs-fps-meter';

const FPS_METER_SAMPLE_LIMIT = 120;

const FPS_METER_WINDOW_MS = 500;

const FPS_METER_STATE = {
    element: null,
    frames: 0,
    since: 0,
    fps: 0,
    draws: [],
    wrapped: false
};

function fpsMeterEnabled() {

    try {

        return localStorage.getItem(
            FPS_METER_KEY
        ) === '1';

    } catch (error) {

        return false;
    }
}

function setFpsMeter(enabled) {

    try {

        if (enabled) {

            localStorage.setItem(
                FPS_METER_KEY,
                '1'
            );

        } else {

            localStorage.removeItem(
                FPS_METER_KEY
            );
        }

    } catch (error) {

        return false;
    }

    if (enabled) {

        startFpsMeter();

    } else {

        stopFpsMeter();
    }

    return enabled;
}

function toggleFpsMeter() {

    return setFpsMeter(
        !fpsMeterEnabled()
    );
}

function fpsMeterPercentile(sorted, fraction) {

    if (!sorted.length) {
        return 0;
    }

    const index =
        Math.min(
            sorted.length - 1,
            Math.max(
                0,
                Math.round(
                    (sorted.length - 1) * fraction
                )
            )
        );

    return sorted[index];
}

function recordFpsMeterDraw(milliseconds) {

    const draws =
        FPS_METER_STATE.draws;

    draws.push(
        milliseconds
    );

    if (draws.length > FPS_METER_SAMPLE_LIMIT) {
        draws.shift();
    }
}

function wrapDrawNowForFpsMeter() {

    if (
        FPS_METER_STATE.wrapped ||
        typeof drawNow !== 'function'
    ) {
        return;
    }

    const inner =
        drawNow;

    drawNow = function measuredDrawNow() {

        const started =
            performance.now();

        const result =
            inner.apply(
                this,
                arguments
            );

        recordFpsMeterDraw(
            performance.now() - started
        );

        return result;
    };

    FPS_METER_STATE.wrapped =
        true;
}

function fpsMeterElement() {

    if (FPS_METER_STATE.element) {
        return FPS_METER_STATE.element;
    }

    const element =
        document.createElement(
            'div'
        );

    element.id =
        'fpsMeter';

    element.setAttribute(
        'aria-hidden',
        'true'
    );

    element.style.cssText = [
        'position:fixed',
        'right:8px',
        'bottom:8px',
        'z-index:2147483647',
        'border:1px solid rgba(232,230,223,.35)',
        'padding:5px 8px',
        'border-radius:6px',
        'background:rgba(8,10,12,.82)',
        'color:#e8e6df',
        'font:11px/1.45 ui-monospace,SFMono-Regular,Menlo,Consolas,monospace',
        'letter-spacing:.02em',
        'pointer-events:none',
        'white-space:pre',
        'text-shadow:0 1px 0 rgba(0,0,0,.6)'
    ].join(';');

    document.body.appendChild(
        element
    );

    FPS_METER_STATE.element =
        element;

    return element;
}

function renderFpsMeter() {

    const element =
        fpsMeterElement();

    const sorted =
        FPS_METER_STATE.draws
            .slice()
            .sort(
                (a, b) => a - b
            );

    const median =
        fpsMeterPercentile(
            sorted,
            0.5
        );

    const worst =
        fpsMeterPercentile(
            sorted,
            0.95
        );

    const over =
        sorted.filter(
            value => value > 16.7
        ).length;

    element.textContent =
        `${Math.round(FPS_METER_STATE.fps)} fps\n` +
        `draw ${median.toFixed(1)} ms  p95 ${worst.toFixed(1)} ms\n` +
        `${over}/${sorted.length} over 16.7 ms`;

    element.style.color =
        FPS_METER_STATE.fps >= 55
            ? '#8fd694'
            : FPS_METER_STATE.fps >= 30
                ? '#edc76a'
                : '#e88b7d';
}

function stepFpsMeter(now) {

    if (!FPS_METER_STATE.running) {
        return;
    }

    FPS_METER_STATE.frames += 1;

    if (!FPS_METER_STATE.since) {

        FPS_METER_STATE.since =
            now;
    }

    const elapsed =
        now - FPS_METER_STATE.since;

    if (elapsed >= FPS_METER_WINDOW_MS) {

        FPS_METER_STATE.fps =
            FPS_METER_STATE.frames * 1000 / elapsed;

        FPS_METER_STATE.frames =
            0;

        FPS_METER_STATE.since =
            now;

        renderFpsMeter();
    }

    requestAnimationFrame(
        stepFpsMeter
    );
}

function startFpsMeter() {

    if (FPS_METER_STATE.running) {
        return;
    }

    FPS_METER_STATE.running =
        true;

    FPS_METER_STATE.frames =
        0;

    FPS_METER_STATE.since =
        0;

    wrapDrawNowForFpsMeter();

    renderFpsMeter();

    console.info(
        '[fps] meter on; toggleFpsMeter() to switch it off',
        FPS_METER_STATE.element
    );

    requestAnimationFrame(
        stepFpsMeter
    );
}

function stopFpsMeter() {

    FPS_METER_STATE.running =
        false;

    FPS_METER_STATE.draws.length =
        0;

    if (FPS_METER_STATE.element) {

        FPS_METER_STATE.element.remove();

        FPS_METER_STATE.element =
            null;
    }
}

function initFpsMeter() {

    if (fpsMeterEnabled()) {
        startFpsMeter();
    }
}
