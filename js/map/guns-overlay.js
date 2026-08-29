/* =========================
   GUN OVERLAY
   ========================= */

/*
 * The artillery overlay, once per gun.
 *
 * Lifted out of renderer.js so the per-gun loop lives in a file upstream
 * does not have — renderer.js keeps a single guarded call, which is a far
 * smaller merge surface than an inlined loop would be.
 */

const GUN_INACTIVE_ALPHA = 0.45;

/*
 * The active gun ignores its own eye toggle. Selecting a hidden gun would
 * otherwise leave the sidebar solving for something invisible, and forcing
 * visible=true on selection would silently discard the user's setting.
 */
function gunShouldDraw(gun) {
    return gun.id === S.activeGunId || gun.visible;
}

/*
 * The max range ring itself is range-ring.js's job — it is terrain-aware and
 * memoised there, and takes the gun so each one solves against its own
 * ground. Only the minimum-range circle is drawn here.
 */
function drawGunRangeRings(gun, at) {
    const weapon = WEAPONS[gun.weapon];

    if (!weapon) {
        return;
    }

    const v = view();

    const maxRange = weapon.maxRange ?? weapon.range;
    const minRange = weapon.minRange ?? 0;

    const rangePx =
        kilometersToWorldDistance(maxRange) * v.scale;

    const minRangePx =
        kilometersToWorldDistance(minRange) * v.scale;

    drawMaxRangeRing(
        at,
        rangePx,
        v.scale,
        gun
    );

    if (minRangePx > 0) {
        ctx.beginPath();
        ctx.arc(at.x, at.y, minRangePx, 0, Math.PI * 2);
        ctx.strokeStyle = '#d86666';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function drawGunToTargetLine(from, to) {
    ctx.strokeStyle = '#d7a452';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    ctx.setLineDash([]);
}

function drawGuns() {
    const target =
        worldToLocalScreen(S.target.x, S.target.y);

    /*
     * Non-active guns first and dimmed, so the selected gun's solution is
     * never buried under a neighbour's rings.
     */
    for (const gun of S.guns) {
        if (gun.id === S.activeGunId || !gunShouldDraw(gun)) {
            continue;
        }

        const at =
            worldToLocalScreen(gun.position.x, gun.position.y);

        ctx.save();
        ctx.globalAlpha = GUN_INACTIVE_ALPHA;

        drawGunRangeRings(gun, at);
        drawGunToTargetLine(at, target);
        marker(gun.position, 'O');

        ctx.restore();
    }

    const active = activeGun();

    const activeAt =
        worldToLocalScreen(active.position.x, active.position.y);

    drawGunRangeRings(active, activeAt);
    drawGunToTargetLine(activeAt, target);

    marker(active.position, 'O');
    marker(S.target, 'T');
}
