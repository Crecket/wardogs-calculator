/* =========================
   COLLAB OVERWRITE FLASH
   ========================= */

const COLLAB_FLASH_DURATION = 1000;

const COLLAB_FLASH_RADIUS = 16;

const COLLAB_FLASH_FONT =
    'bold 11px system-ui, sans-serif';

const COLLAB_FLASH = {
    points: new Map(),
    frame: null,
    lastFrame: 0
};

function collabFlashPoint(key, worldPoint, peerId) {

    if (
        !key ||
        !peerId ||
        !worldPoint ||
        !Number.isFinite(worldPoint.x) ||
        !Number.isFinite(worldPoint.y)
    ) {
        return;
    }

    const name =
        typeof collabPeerName === 'function'
            ? collabPeerName(peerId)
            : '';

    const color =
        typeof collabPeerColor === 'function'
            ? collabPeerColor(peerId)
            : '#ffffff';

    COLLAB_FLASH.points.set(key, {
        x: worldPoint.x,
        y: worldPoint.y,
        color,
        label: tr('collabMovedBy').replace('{name}', name),
        labelWidth: null,
        left: COLLAB_FLASH_DURATION
    });

    collabStartFlashFrame();
    draw();
}

function collabClearFlashes() {

    if (!COLLAB_FLASH.points.size) {
        return;
    }

    COLLAB_FLASH.points.clear();
    collabStopFlashFrame();
    draw();
}

function collabStartFlashFrame() {

    if (COLLAB_FLASH.frame) {
        return;
    }

    COLLAB_FLASH.lastFrame = performance.now();

    COLLAB_FLASH.frame = requestAnimationFrame(
        collabStepFlash
    );
}

function collabStopFlashFrame() {

    if (COLLAB_FLASH.frame) {
        cancelAnimationFrame(COLLAB_FLASH.frame);
        COLLAB_FLASH.frame = null;
    }
}

function collabStepFlash(timestamp) {

    COLLAB_FLASH.frame = null;

    if (!COLLAB_FLASH.points.size) {
        return;
    }

    const delta = Math.min(
        100,
        timestamp - COLLAB_FLASH.lastFrame
    );

    COLLAB_FLASH.lastFrame = timestamp;

    let expired = false;

    for (const [key, flash] of COLLAB_FLASH.points) {

        flash.left -= delta;

        if (flash.left <= 0) {
            COLLAB_FLASH.points.delete(key);
            expired = true;
        }
    }

    if (expired || !collabFlashStatic()) {
        draw();
    }

    if (COLLAB_FLASH.points.size) {
        COLLAB_FLASH.frame = requestAnimationFrame(
            collabStepFlash
        );
    }
}

function collabFlashStatic() {
    return (
        typeof collabReducedMotion === 'function' &&
        collabReducedMotion()
    );
}

function collabFlashOpacity(flash) {

    if (collabFlashStatic()) {
        return 1;
    }

    return Math.max(
        0,
        Math.min(
            1,
            flash.left / COLLAB_FLASH_DURATION
        )
    );
}

function drawCollabFlashes() {

    if (!COLLAB_FLASH.points.size) {
        return;
    }

    ctx.save();
    ctx.font = COLLAB_FLASH_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (const flash of COLLAB_FLASH.points.values()) {

        const point =
            worldToLocalScreen(
                flash.x,
                flash.y
            );

        const alpha =
            collabFlashOpacity(flash);

        drawCollabFlashRing(
            point,
            flash.color,
            alpha
        );

        ctx.globalAlpha = alpha;

        drawCollabFlashLabel(
            point,
            flash
        );
    }

    ctx.restore();
}

function drawCollabFlashRing(point, color, alpha) {

    ctx.beginPath();
    ctx.arc(
        point.x,
        point.y,
        COLLAB_FLASH_RADIUS,
        0,
        Math.PI * 2
    );

    ctx.globalAlpha = alpha * 0.25;
    ctx.fillStyle = color;
    ctx.fill();

    ctx.globalAlpha = alpha;
    ctx.lineWidth = 3;
    ctx.strokeStyle = color;
    ctx.stroke();
}

function drawCollabFlashLabel(point, flash) {

    if (flash.labelWidth === null) {
        flash.labelWidth =
            ctx.measureText(flash.label).width;
    }

    const width =
        flash.labelWidth + 12;

    const height = 17;

    const left =
        point.x + COLLAB_FLASH_RADIUS + 6;

    const top =
        point.y - height / 2;

    ctx.fillStyle = 'rgba(16, 19, 22, .92)';
    ctx.fillRect(
        left,
        top,
        width,
        height
    );

    ctx.lineWidth = 1;
    ctx.strokeStyle = flash.color;
    ctx.strokeRect(
        left,
        top,
        width,
        height
    );

    ctx.fillStyle = flash.color;
    ctx.fillText(
        flash.label,
        left + 6,
        top + height / 2 + 1
    );
}
