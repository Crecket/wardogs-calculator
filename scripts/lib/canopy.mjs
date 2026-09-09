/*
 * What counts as a tree on the map tiles, and how trees get in the way of
 * a shell.
 *
 * The terrain chunks are landscape collision and know nothing about what
 * stands on the ground, so a flat forest floor reads as parking. The tiles
 * are the only asset that shows the canopy. They are monochrome, so this is
 * a luminance question rather than a colour one: on every map probed so far
 * woodland renders dark and rough, fields render mid grey and smooth, roads
 * and water render dark and smooth, and the high ground above the treeline
 * renders bright and smooth. Dark alone is not enough — the spread is what
 * keeps a road from being called a wood.
 *
 * The thresholds were set by eye on Bakurani crops at 8 m cells, where a 16
 * by 16 pixel patch of a zoom 7 tile is one cell. A lone tree in a field is
 * a few pixels of the patch and does not trip them, which is right: you can
 * park beside a tree.
 *
 * Everything here is pure. The build scripts own the tiles and the files.
 */

export const CANOPY_MEAN_MAX = 45;

export const CANOPY_STD_MIN = 3;

/*
 * The height a thick wood adds to the heightfield the clearance march
 * reads. Mature spruce and fir, which is what these valleys model, runs 25
 * to 35 m. The number barely moves the answer — 20 and 50 give the same
 * viable set on Bakurani, because a low shot fails at any of them and a high
 * shot clears all of them — so it is chosen to be honest, not to tune.
 */
export const CANOPY_METRES = 30;

/*
 * A 32 m heightfield cell counts as wood when this share of the 8 m canopy
 * cells inside it are trees. Below it a hedgerow or a copse leaves the cell
 * on the ground; a lane through scattered trees is a lane.
 */
export const CANOPY_FRACTION = 0.4;

export function isCanopy(mean, std) {
    return mean < CANOPY_MEAN_MAX && std >= CANOPY_STD_MIN;
}

export function patchStats(luminances) {
    const count = luminances.length;

    if (!count) {
        return { mean: 0, std: 0 };
    }

    let sum = 0;
    let squares = 0;

    for (let i = 0; i < count; i += 1) {
        sum += luminances[i];
        squares += luminances[i] * luminances[i];
    }

    const mean = sum / count;
    const variance = Math.max(0, squares / count - mean * mean);

    return { mean, std: Math.sqrt(variance) };
}

/*
 * Lifts every heightfield cell that is mostly wood by the canopy height, in
 * place, and returns how many rose. The canopy grid is row 0 at the north
 * edge, like every raster the map draws; the heightfield is row 0 at the
 * south edge, like the terrain it was cut from.
 */
export function raiseCanopy(field, canopy, options = {}) {
    const metres = options.metres ?? CANOPY_METRES;
    const fraction = options.fraction ?? CANOPY_FRACTION;
    const { cells, grid } = canopy;

    const perSide = Math.max(1, Math.round(field.stepGameUnits / grid.stepX));
    const half = perSide / 2;

    let raised = 0;

    for (let row = 0; row < field.height; row += 1) {
        const gameY = field.originY + row * field.stepGameUnits;
        const centreY = (grid.originY - gameY) / grid.stepY;

        for (let col = 0; col < field.width; col += 1) {
            const gameX = field.originX + col * field.stepGameUnits;
            const centreX = (gameX - grid.originX) / grid.stepX;

            let trees = 0;
            let seen = 0;

            for (let dy = -half; dy < half; dy += 1) {
                const cy = Math.round(centreY + dy);

                if (cy < 0 || cy >= grid.height) {
                    continue;
                }

                for (let dx = -half; dx < half; dx += 1) {
                    const cx = Math.round(centreX + dx);

                    if (cx < 0 || cx >= grid.width) {
                        continue;
                    }

                    seen += 1;
                    trees += cells[cy * grid.width + cx] ? 1 : 0;
                }
            }

            if (seen && trees / seen >= fraction) {
                field.heights[row * field.width + col] += metres;
                raised += 1;
            }
        }
    }

    return raised;
}
