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

    result();
    draw();
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

    p.x =
        coordinateScale === 100
            ? (Number(xInput.value) || 0)
            : (Number(xInput.value) || 0) / 1000;

    p.y =
        coordinateScale === 100
            ? (Number(yInput.value) || 0)
            : (Number(yInput.value) || 0) / 1000;

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
