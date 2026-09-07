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

/*
 * The smallest patch of viable ground worth drawing, in 8 m cells.
 *
 * 16 cells is 1024 m2, which is exactly one cell of the 32 m heightfield the
 * clearance filter marches against. A viable island smaller than that is
 * smaller than the grid square that decided it was viable, so it asserts a
 * resolution the evidence behind it does not have — and it is not a place a
 * player could reliably park anyway, being a speck surrounded by ground the
 * layer has already refused.
 *
 * On both maps and both arcs this removes about 87% of the regions for
 * about 3% of the area, which is what a threshold set at the noise floor
 * should look like.
 */
export const MIN_REGION_CELLS = 16;

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

/*
 * Clears every four-connected region smaller than `minCells`, returning a new
 * mask and leaving the caller's alone.
 *
 * Four-connected, not eight: a diagonal touch is not ground you can drive
 * along, so a string of corner-to-corner cells is a row of specks rather
 * than one region.
 */
export function dropSmallRegions(viable, width, height, minCells = MIN_REGION_CELLS) {
    const kept = Uint8Array.from(viable, value => (value ? 1 : 0));

    if (minCells <= 1) {
        return kept;
    }

    const seen = new Uint8Array(kept.length);
    const stack = new Int32Array(kept.length);
    const region = new Int32Array(kept.length);

    for (let start = 0; start < kept.length; start += 1) {
        if (!kept[start] || seen[start]) {
            continue;
        }

        let top = 0;
        let size = 0;

        stack[top] = start;
        top += 1;
        seen[start] = 1;

        while (top > 0) {
            top -= 1;

            const index = stack[top];

            region[size] = index;
            size += 1;

            const x = index % width;
            const y = (index - x) / width;

            const visit = neighbour => {
                if (kept[neighbour] && !seen[neighbour]) {
                    seen[neighbour] = 1;
                    stack[top] = neighbour;
                    top += 1;
                }
            };

            if (x > 0) {
                visit(index - 1);
            }

            if (x < width - 1) {
                visit(index + 1);
            }

            if (y > 0) {
                visit(index - width);
            }

            if (y < height - 1) {
                visit(index + width);
            }
        }

        if (size < minCells) {
            for (let i = 0; i < size; i += 1) {
                kept[region[i]] = 0;
            }
        }
    }

    return kept;
}
