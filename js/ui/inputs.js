/* =========================
   INPUTS
   ========================= */

function inputs() {

    $('mapSelect').value =
        S.map;

    $('weapon').value =
        S.weapon;

    $('ox').value = formatGameCoordinate(S.origin.x);

    $('oy').value = formatGameCoordinate(S.origin.y);

    $('tx').value = formatGameCoordinate(S.target.x);

    $('ty').value = formatGameCoordinate(S.target.y);

    $('w').value =
        S.w;

    $('h').value =
        S.h;

    /*
     * Origin and target are written from six different places (map drags,
     * the coordinate inputs, saved-target restore, undo, coordinate
     * search). They all land here, so one throttled diff covers them all
     * instead of a hook at each site.
     */
    if (
        typeof collabSyncShared ===
        'function'
    ) {
        collabSyncShared();
    }

    /*
     * And the same for remembering the two points across a reload — one
     * throttled write here rather than a hook at each of those six sites.
     */
    if (
        typeof persistMapPoints ===
        'function'
    ) {
        persistMapPoints();
    }

    /*
     * Same reasoning for the saved-target highlight: it is derived from
     * where the target sits, so every writer of S.target refreshes it by
     * arriving here.
     */
    if (
        typeof refreshSavedTargetHighlight ===
        'function'
    ) {
        refreshSavedTargetHighlight();
    }

    /*
     * The row shows each gun's own coordinates, so it has to follow the
     * same writes the ox/oy fields do.
     */
    if (typeof renderGuns === 'function') {
        renderGuns();
    }

    result();
    draw();
}

function setPointMode(type) {

    if (
        type !== 'origin' &&
        type !== 'target'
    ) {
        return;
    }

    S.mode =
        type;

    $('originMode')
        ?.classList.toggle(
            'active',
            type === 'origin'
        );

    $('targetMode')
        ?.classList.toggle(
            'active',
            type === 'target'
        );

    if (
        typeof updateForcePlacementUI ===
        'function'
    ) {
        updateForcePlacementUI();
    }
}

function inputPoint(type) {

    const p =
        S[type];

    const xInput =
        type === 'origin'
            ? $('ox')
            : $('tx');

    const yInput =
        type === 'origin'
            ? $('oy')
            : $('ty');

    const coordinateScale =
        getCoordinateMetersPerUnit();

    const nextX =
        coordinateScale === 100
            ? (Number(xInput.value) || 0)
            : (Number(xInput.value) || 0) / 1000;

    const nextY =
        coordinateScale === 100
            ? (Number(yInput.value) || 0)
            : (Number(yInput.value) || 0) / 1000;

    if (
        nextX !== p.x ||
        nextY !== p.y
    ) {
        pushMapToolHistory();
    }

    p.x = nextX;
    p.y = nextY;

    clamp(
        p
    );

    inputs();
}

function updatePresetLock() {

    const locked =
        $('mapSelect').value !==
        'custom';

    $('customMapSizing').style.display =
        locked
            ? 'none'
            : '';
}
