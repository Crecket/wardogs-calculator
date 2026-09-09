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
export const CELL_FALLBACK_INTERIOR = 3;
export const CELL_FALLBACK_BOUNDARY = 4;

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

/*
 * The tilt a go-to spot may have. The flatness ramp warns at 8 degrees,
 * which is the hull's limit; this layer is not asking whether the gun can
 * sit there but whether it is somewhere you would drive to on purpose, and
 * on Bakurani halving the limit cuts the candidate ground by four fifths
 * before trees are even considered.
 */
export const TILT_LIMIT_DEGREES = 4;

/*
 * The second tier: ground that is not a go-to spot but is not awful either.
 * It is the layer's original rule — the hull's own 8 degree limit, trees
 * ignored, every tower and every ring point — and it exists because on
 * Bakurani the strict set leaves one spawn with almost nothing, and a gun
 * that has to set up anyway is better served by a worse spot than by none.
 */
export const FALLBACK_TILT_LIMIT_DEGREES = 8;

/*
 * How many towers the low arc may fail to reach flat. The bake originally
 * demanded a clean low lane to every tower and every ring point around it,
 * and once trees count that set is empty on Bakurani: the flat ground is the
 * valley floor and the valley floor has hedgerows, so a 600 m corridor in
 * four directions at once never exists. Requiring the tower centres and
 * forgiving one of them is the reading of "I can hit the towers flat from
 * here" that still has spots in it. The any-arc set keeps the full rule.
 */
export const LOW_ARC_MISSABLE_TOWERS = 1;

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
 * Lays the two tiers into one raster. The go-to set is outlined as itself;
 * the fallback set is outlined only where the go-to set is not, so a green
 * region sitting inside orange ground keeps its own edge and the orange
 * edge runs around the outside. Both inputs are already parked and
 * de-specked; this only decides which byte a cell gets.
 */
export function tierMask(primary, fallback, width, height) {
    const mask = outlineMask(primary, width, height);

    const rest = new Uint8Array(width * height);

    for (let i = 0; i < rest.length; i += 1) {
        rest[i] = fallback[i] && !primary[i] ? 1 : 0;
    }

    const outer = outlineMask(rest, width, height);

    for (let i = 0; i < mask.length; i += 1) {
        if (mask[i]) {
            continue;
        }

        if (outer[i] === CELL_INTERIOR) {
            mask[i] = CELL_FALLBACK_INTERIOR;
        } else if (outer[i] === CELL_BOUNDARY) {
            mask[i] = CELL_FALLBACK_BOUNDARY;
        }
    }

    return mask;
}

/*
 * Keeps only the cells that belong to some fully viable three by three
 * block, returning a new mask and leaving the caller's alone.
 *
 * An 8 m cell is one hull, and a string of them one cell wide is a line
 * you could stand a gun on but never park a gun in. Three cells is 24 m,
 * room to pull in, turn, and pull out, and it is the smallest square that
 * still reads as a spot rather than a mark at map-fit zoom. Erode then
 * dilate, so a block keeps its edges and a spur loses them.
 */
export function parkingMask(viable, width, height) {
    const core = new Uint8Array(width * height);

    for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
            let solid = true;

            for (let dy = -1; dy <= 1 && solid; dy += 1) {
                for (let dx = -1; dx <= 1; dx += 1) {
                    if (!viable[(y + dy) * width + (x + dx)]) {
                        solid = false;
                        break;
                    }
                }
            }

            if (solid) {
                core[y * width + x] = 1;
            }
        }
    }

    const kept = new Uint8Array(width * height);

    for (let y = 1; y < height - 1; y += 1) {
        for (let x = 1; x < width - 1; x += 1) {
            if (!core[y * width + x]) {
                continue;
            }

            for (let dy = -1; dy <= 1; dy += 1) {
                for (let dx = -1; dx <= 1; dx += 1) {
                    kept[(y + dy) * width + (x + dx)] = 1;
                }
            }
        }
    }

    return kept;
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
