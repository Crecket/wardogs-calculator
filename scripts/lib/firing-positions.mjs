/*
 * Where an SPG has to be able to land a shell, and how a mask of the ground
 * that can becomes something with a drawable edge.
 *
 * The aim points are not the towers. Towers move between matches, so a
 * position that can only just reach one of them today cannot be trusted
 * tomorrow; the 300 m ring is what absorbs that, and changing it moves
 * every figure in the spec. A position is viable only if every point in the
 * set is reachable, which is a deliberately strict reading of "can range
 * every tower".
 *
 * The outline exists because the layer is drawn over the flatness ramp and
 * a second translucent wash would tint the bands underneath into
 * illegibility. Marking the boundary at bake time keeps the runtime cost at
 * one drawImage, which is the invariant the whole design rests on.
 *
 * Everything here is pure. The build script owns the terrain and the
 * ballistics.
 */

export const AIM_RING_METRES = 300;

export const AIM_RING_POINTS = 8;

export const CELL_OUTSIDE = 0;
export const CELL_INTERIOR = 1;
export const CELL_BOUNDARY = 2;

const METRES_PER_GAME_UNIT = 100;

export function aimPoints(towers, options = {}) {
    const ringMeters = options.ringMeters ?? AIM_RING_METRES;
    const ringPoints = options.ringPoints ?? AIM_RING_POINTS;
    const scale = options.metresPerGameUnit ?? METRES_PER_GAME_UNIT;

    const radius = ringMeters / scale;
    const points = [];

    for (const tower of towers) {
        points.push({ x: tower.x, y: tower.y });

        for (let i = 0; i < ringPoints; i += 1) {
            const bearing = (i / ringPoints) * 2 * Math.PI;

            points.push({
                x: tower.x + radius * Math.sin(bearing),
                y: tower.y + radius * Math.cos(bearing)
            });
        }
    }

    return points;
}

/*
 * A viable cell is on the boundary when any of its four orthogonal
 * neighbours is not viable. Cells on the raster edge count as boundary
 * too: a region that runs off the map has an edge there as far as anyone
 * looking at the map is concerned, and drawing it open would read as the
 * region continuing.
 */
export function outlineMask(viable, width, height) {
    const mask = new Uint8Array(width * height);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const index = y * width + x;

            if (!viable[index]) {
                continue;
            }

            const enclosed =
                x > 0 && x < width - 1 &&
                y > 0 && y < height - 1 &&
                Boolean(viable[index - 1]) &&
                Boolean(viable[index + 1]) &&
                Boolean(viable[index - width]) &&
                Boolean(viable[index + width]);

            mask[index] = enclosed ? CELL_INTERIOR : CELL_BOUNDARY;
        }
    }

    return mask;
}
