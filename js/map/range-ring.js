/* =========================
   RANGE RING
   ========================= */

/*
 * The terrain-aware max range ring.
 *
 * How far a shell reaches on a bearing depends on the height of the ground
 * where it lands, which depends on how far it reached. So each bearing is a
 * fixed point, solved by marching outward until the model's max range stops
 * exceeding the distance already travelled.
 *
 * The result is always a DIFFERENCE added to the weapon's declared max
 * range, never the model's own absolute number. At deltaZ 0 that difference
 * is exactly zero and the ring is pixel-identical to the circle this
 * replaced. See docs/superpowers/specs/2026-08-27-terrain-range-ring-design.md
 * section 1.
 */

const RANGE_RING_BEARINGS = 360;
const RANGE_RING_MARCH_METRES = 25;
const RANGE_RING_BISECTIONS = 14;

/*
 * Metres the gun may move before its ring is resolved again.
 *
 * 8 m, not the grid's own 32 m, because z_gun enters every bearing: on steep
 * ground two points in one 32 m cell differ by ~20 m of height, which is
 * ~20 m of range — an order of magnitude above the 2.6 m p90 the grid
 * spacing itself contributes. The memo must not become the dominant error.
 */
const RANGE_RING_MEMO_METRES = 8;

const RANGE_RING_CACHE = new Map();

function weaponReachRange(weapon, deltaZMeters) {
    let best = null;

    for (const arc of REACH_ARCS) {
        const fit = projectileModelArc(weapon?.id, arc);

        if (!fit) {
            continue;
        }

        const range = arcMaxRangeModel(weapon, fit, deltaZMeters);

        if (range !== null && (best === null || range > best)) {
            best = range;
        }
    }

    return best;
}

/*
 * The march can leave the map before a bearing converges: a gun 1.6 km from
 * the north edge outreaches it on a third of its bearings. Beyond the
 * playable bounds there is no data, so the ray is sampled at the nearest
 * point on the boundary — terrain is treated as continuing outward at the
 * edge height.
 *
 * Stopping the march there instead would chop the outline off square along
 * the map edge, which draws as a range limit the gun does not have.
 * heightfieldSample itself keeps returning null out there, because it
 * mirrors sampleGrid in scripts/lib/heightfield.mjs and that contract is
 * what the generator is tested against.
 */
function rangeRingSample(field, gameX, gameY) {
    const maxX =
        field.originX + (field.width - 1) * field.stepGameUnits;

    const maxY =
        field.originY + (field.height - 1) * field.stepGameUnits;

    return heightfieldSample(
        field,
        Math.min(maxX, Math.max(field.originX, gameX)),
        Math.min(maxY, Math.max(field.originY, gameY))
    );
}

function rangeRingMemoKey(gun, mapId) {
    const metresPerUnit = getCoordinateMetersPerUnit();
    const cell = RANGE_RING_MEMO_METRES / metresPerUnit;

    return [
        mapId,
        gun.weapon,
        Math.round(gun.position.x / cell),
        Math.round(gun.position.y / cell)
    ].join('|');
}

/*
 * Dragging a gun mints one entry per 8 m of travel, 2.9 KB each, so the
 * cache is bounded rather than cleared. Insertion order is iteration order
 * for a Map, which makes the oldest key the first one out.
 */
const RANGE_RING_CACHE_LIMIT = 256;

function rememberRangeRing(key, ring) {
    if (RANGE_RING_CACHE.size >= RANGE_RING_CACHE_LIMIT) {
        RANGE_RING_CACHE.delete(
            RANGE_RING_CACHE.keys().next().value
        );
    }

    RANGE_RING_CACHE.set(key, ring);
}

function terrainRangeRing(gun, mapId) {
    const weapon = WEAPONS[gun.weapon];

    if (!weapon) {
        return null;
    }

    ensureHeightfieldLoaded(mapId);

    const field = cachedHeightfield(mapId);
    const levelMax = weaponReachRange(weapon, 0);

    if (!field || !levelMax) {
        return null;
    }

    const key = rangeRingMemoKey(gun, mapId);
    const memo = RANGE_RING_CACHE.get(key);

    if (memo) {
        return memo;
    }

    const zGun = heightfieldSample(
        field,
        gun.position.x,
        gun.position.y
    );

    if (zGun === null) {
        return null;
    }

    const declaredMax = (weapon.maxRange ?? weapon.range) * 1000;
    const metresPerUnit = getCoordinateMetersPerUnit();

    /*
     * The furthest this gun could reach if the whole map were at its lowest
     * sample. An exact bound, so a bearing that never crosses still ends.
     */
    const marchLimit = Math.min(
        (weaponReachRange(weapon, field.minZMeters - zGun) ?? declaredMax) +
            Math.max(0, declaredMax - levelMax),
        declaredMax * 2
    );

    const highestReach = Number.isFinite(field.maxZMeters)
        ? weaponReachRange(weapon, field.maxZMeters - zGun)
        : null;

    const marchStart = highestReach === null
        ? RANGE_RING_MARCH_METRES
        : Math.max(
            RANGE_RING_MARCH_METRES,
            Math.floor(
                (declaredMax + (highestReach - levelMax)) / RANGE_RING_MARCH_METRES
            ) * RANGE_RING_MARCH_METRES
        );

    const radii = new Float64Array(RANGE_RING_BEARINGS);

    for (let b = 0; b < RANGE_RING_BEARINGS; b += 1) {
        const angle = b * 2 * Math.PI / RANGE_RING_BEARINGS;

        const stepX =
            Math.cos(angle) / metresPerUnit;

        const stepY =
            Math.sin(angle) / metresPerUnit;

        /*
         * True while the shell still outreaches the distance travelled.
         * Null only if the sample is unusable at all, which clamping makes
         * unreachable for a finite gun position.
         */
        const reaches = metres => {
            const z = rangeRingSample(
                field,
                gun.position.x + stepX * metres,
                gun.position.y + stepY * metres
            );

            if (z === null) {
                return null;
            }

            const modelled = weaponReachRange(weapon, z - zGun);

            if (modelled === null) {
                return false;
            }

            return metres <= declaredMax + (modelled - levelMax);
        };

        let edge = null;
        let previous = marchStart;

        const bisect = (from, to) => {
            let inside = from;
            let outside = to;

            for (let i = 0; i < RANGE_RING_BISECTIONS; i += 1) {
                const middle = (inside + outside) / 2;

                if (reaches(middle) === true) {
                    inside = middle;
                } else {
                    outside = middle;
                }
            }

            return (inside + outside) / 2;
        };

        for (
            let r = marchStart;
            r <= marchLimit;
            r += RANGE_RING_MARCH_METRES
        ) {
            const ok = reaches(r);

            if (ok === null) {
                edge = declaredMax;
                break;
            }

            if (!ok) {
                edge = bisect(previous, r);
                break;
            }

            previous = r;
        }

        if (edge === null) {
            edge = reaches(marchLimit) === true
                ? marchLimit
                : bisect(Math.min(previous, marchLimit), marchLimit);
        }

        radii[b] = edge;
    }

    const declaredMin = (weapon.minRange ?? 0) * 1000;

    const ring = {
        radii,
        maxRangeMeters: declaredMax,
        minRangeMeters: declaredMin
    };

    rememberRangeRing(key, ring);

    return ring;
}
