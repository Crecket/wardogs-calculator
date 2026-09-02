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
const GUN_INACTIVE_RANGE_ALPHA = 0.15;

/*
 * The active gun ignores its own eye toggle. Selecting a hidden gun would
 * otherwise leave the sidebar solving for something invisible, and forcing
 * visible=true on selection would silently discard the user's setting.
 */
function gunShouldDraw(gun) {
    return gun.id === S.activeGunId || gun.visible;
}

/*
 * Nearest grabbable gun to a point, or null. `distanceTo` decides the
 * space — world units for the desktop drag, screen pixels for touch — so
 * the two callers share one rule about which guns can be picked up.
 *
 * The active gun is measured first and beaten only strictly, so a tie
 * keeps the current selection instead of swapping it for a neighbour. A
 * hidden gun is not a candidate: you cannot grab what is not drawn.
 */
function gunNearest(distanceTo, threshold) {
    const active = activeGun();
    const activeDistance = distanceTo(active);

    let best = activeDistance <= threshold ? active : null;
    let bestDistance = best ? activeDistance : threshold;

    for (const gun of S.guns) {
        if (gun.id === active.id || !gunShouldDraw(gun)) {
            continue;
        }

        const distance = distanceTo(gun);

        if (distance < bestDistance) {
            best = gun;
            bestDistance = distance;
        }
    }

    return best;
}

function gunAtPoint(point, threshold) {
    return gunNearest(
        gun => Math.hypot(
            point.x - gun.position.x,
            point.y - gun.position.y
        ),
        threshold
    );
}

function gunAtScreen(x, y, radiusPx) {
    return gunNearest(
        gun => {
            const at = toScreen(gun.position.x, gun.position.y);
            return Math.hypot(x - at.x, y - at.y);
        },
        radiusPx
    );
}

/*
 * Traces a ring whose radius varies by bearing. Bearing 0 is +x and the
 * angle increases the same way it does in range-ring.js; screen y is
 * inverted, which is why sin is subtracted.
 *
 * Appends a subpath rather than starting one, so two of these can be traced
 * into a single path and filled even-odd to tint the band between them.
 */
function traceRangeRing(at, radii, scale, clampMetres) {
    for (let b = 0; b < radii.length; b += 1) {
        const angle = b * 2 * Math.PI / radii.length;

        const metres = clampMetres === null
            ? radii[b]
            : Math.min(radii[b], clampMetres);

        const r = metersToWorldDistance(metres) * scale;

        const x = at.x + Math.cos(angle) * r;
        const y = at.y - Math.sin(angle) * r;

        if (b === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    }

    ctx.closePath();
}

/*
 * The max range ring, terrain-aware where the data allows it.
 *
 * Two outlines: the solid one is clamped to the weapon's declared max range,
 * because past that the shipped table cannot produce a MIL and drawing it
 * filled would promise a shot we cannot lay. The faint one is the true
 * terrain reach, drawn only where it exceeds the clamp — context in the same
 * register as the deltaZ readout, never a number to fire on.
 *
 * With no heightfield this falls back to the circle it replaced.
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

    const ring =
        typeof terrainRangeRing === 'function'
            ? terrainRangeRing(gun, S.map)
            : null;

    ctx.beginPath();

    if (ring) {
        traceRangeRing(at, ring.radii, v.scale, ring.maxRangeMeters);
    } else {
        ctx.arc(at.x, at.y, rangePx, 0, Math.PI * 2);
    }

    ctx.fillStyle = 'rgba(215,164,82,.08)';
    ctx.fill();

    ctx.strokeStyle = '#d7a452';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    /*
     * Only worth drawing when the terrain actually buys range somewhere.
     * On flat ground it coincides with the solid ring exactly.
     *
     * Height buys range but the clamp above hides it: the solid ring stays
     * on the table max, so an elevated gun draws the same circle a flat one
     * does. The gain is only legible if this band is, hence the tint —
     * an outline alone reads as absent.
     */
    if (ring && ring.radii.some(r => r > ring.maxRangeMeters + 1)) {
        ctx.beginPath();
        traceRangeRing(at, ring.radii, v.scale, null);
        traceRangeRing(at, ring.radii, v.scale, ring.maxRangeMeters);

        ctx.fillStyle = 'rgba(255,210,127,.12)';
        ctx.fill('evenodd');

        ctx.beginPath();
        traceRangeRing(at, ring.radii, v.scale, null);

        ctx.strokeStyle = '#ffd27f';
        ctx.lineWidth = 3;
        ctx.setLineDash([12, 7]);
        ctx.stroke();
        ctx.setLineDash([]);
    }

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
        ctx.globalAlpha = GUN_INACTIVE_RANGE_ALPHA;

        drawGunRangeRings(gun, at);
        drawGunToTargetLine(at, target);

        ctx.globalAlpha = GUN_INACTIVE_ALPHA;

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
