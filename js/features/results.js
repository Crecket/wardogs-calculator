/* =========================
   RESULT
   ========================= */

function result() {

    const weapon = WEAPONS[S.weapon];

    if (!weapon) {
        return;
    }

    const dx =
        S.target.x -
        S.origin.x;

    const dy =
        S.target.y -
        S.origin.y;

    const d =
        Math.hypot(
            dx,
            dy
        );

    let a =
        Math.atan2(
            dx,
            dy
        ) *
        180 /
        Math.PI;

    if (
        a <
        0
    ) {
        a +=
            360;
    }

    $('angle').textContent =
        a.toFixed(
            1
        ) +
        '°';

    $('dist').textContent =
        d.toFixed(
            2
        ) +
        ' km';

    $('distm').textContent =
        Math.round(
            d *
            1000
        ) +
        ' m';

    $('dx').textContent =
        (
            dx >=
            0
                ? '+'
                : '-'
        ) +
        Math.round(
            Math.abs(
                dx *
                1000
            )
        ) +
        ' m';

    $('dy').textContent =
        (
            dy >=
            0
                ? '+'
                : '-'
        ) +
        Math.round(
            Math.abs(
                dy *
                1000
            )
        ) +
        ' m';

    const inRange =
        d <=
        weapon.range +
        1e-9;

    $('range').textContent =
        Math.round(
            weapon.range *
            1000
        ) +
        ' m';

    $('rangeStatus').textContent =
        inRange
            ? tr('inRange')
            : tr('outRange');

    $('rangeStatus').style.color =
        inRange
            ? '#82c596'
            : '#d86666';

    const mapName =
        S.map ===
        'custom'
            ? tr('customMap')
            : MAPS[S.map]?.name ||
            S.map;

    $('status').textContent =
        `${getWeaponName(weapon)} · ` +
        `${mapName} · ` +
        `${tr('artillery')}: ` +
        `${formatCoord(
            S.origin.x *
            1000
        )}, ` +
        `${formatCoord(
            S.origin.y *
            1000
        )} · ` +
        `${tr('target')}: ` +
        `${formatCoord(
            S.target.x *
            1000
        )}, ` +
        `${formatCoord(
            S.target.y *
            1000
        )}`;
}
