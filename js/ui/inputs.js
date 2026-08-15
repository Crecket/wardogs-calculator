/* =========================
   INPUTS
   ========================= */

function inputs() {

    $('mapSelect').value =
        S.map;

    $('weapon').value =
        S.weapon;

    $('ox').value =
        Math.round(
            S.origin.x *
            1000
        );

    $('oy').value =
        Math.round(
            S.origin.y *
            1000
        );

    $('tx').value =
        Math.round(
            S.target.x *
            1000
        );

    $('ty').value =
        Math.round(
            S.target.y *
            1000
        );

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

    p.x =
        (
            Number(
                xInput.value
            ) ||
            0
        ) /
        1000;

    p.y =
        (
            Number(
                yInput.value
            ) ||
            0
        ) /
        1000;

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
