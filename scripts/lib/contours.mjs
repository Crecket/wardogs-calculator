/*
 * Marching squares, polyline stitching, and line simplification.
 *
 * Kept free of file and terrain concerns so it can be tested against small
 * synthetic grids — scripts/build-contours.mjs supplies the real heightfield
 * and writes the payload.
 *
 * Grids are row-major Float32Array-alikes addressed as grid[y * width + x],
 * and every coordinate produced here is in *cell* units: x runs 0..width-1,
 * y runs 0..height-1. Converting those to game units is the caller's job.
 */

/*
 * Marching squares over one level, emitting unordered segments.
 *
 * The four corners are classified against the level and the resulting
 * 4-bit case index picks which cell edges the contour crosses. Corners
 * exactly equal to the level count as below, which keeps a plateau at
 * exactly a contour height from producing a band of degenerate segments.
 */
export function contourSegments(grid, width, height, level) {
    const segments = [];

    for (let y = 0; y < height - 1; y += 1) {
        for (let x = 0; x < width - 1; x += 1) {
            const tl = grid[y * width + x];
            const tr = grid[y * width + x + 1];
            const br = grid[(y + 1) * width + x + 1];
            const bl = grid[(y + 1) * width + x];

            let index = 0;

            if (tl > level) {
                index |= 8;
            }

            if (tr > level) {
                index |= 4;
            }

            if (br > level) {
                index |= 2;
            }

            if (bl > level) {
                index |= 1;
            }

            if (index === 0 || index === 15) {
                continue;
            }

            const top = () => [
                x + (level - tl) / (tr - tl),
                y
            ];

            const right = () => [
                x + 1,
                y + (level - tr) / (br - tr)
            ];

            const bottom = () => [
                x + (level - bl) / (br - bl),
                y + 1
            ];

            const left = () => [
                x,
                y + (level - tl) / (bl - tl)
            ];

            switch (index) {
                case 1:
                case 14:
                    segments.push([left(), bottom()]);
                    break;

                case 2:
                case 13:
                    segments.push([bottom(), right()]);
                    break;

                case 3:
                case 12:
                    segments.push([left(), right()]);
                    break;

                case 4:
                case 11:
                    segments.push([top(), right()]);
                    break;

                case 6:
                case 9:
                    segments.push([top(), bottom()]);
                    break;

                case 7:
                case 8:
                    segments.push([left(), top()]);
                    break;

                /*
                 * Saddles. Which pairing is correct depends on the centre
                 * value, but at a 20 m interval on 4 m samples the two
                 * readings differ by less than a line width, so the cheap
                 * fixed pairing is used.
                 */
                case 5:
                    segments.push([left(), top()]);
                    segments.push([bottom(), right()]);
                    break;

                case 10:
                    segments.push([top(), right()]);
                    segments.push([left(), bottom()]);
                    break;
            }
        }
    }

    return segments;
}

function endpointKey(point) {
    return `${point[0].toFixed(6)},${point[1].toFixed(6)}`;
}

/*
 * Joins segments into the longest polylines their shared endpoints allow.
 *
 * Segments come out of marching squares in raster order, so a chain almost
 * always starts in the middle of a real contour. Walking forward and then
 * backward from the seed is what keeps one ridge from being emitted as a
 * few hundred seven-point fragments — the difference is roughly 5x in the
 * gzipped payload.
 */
export function stitchSegments(segments) {
    const byEndpoint = new Map();

    for (const segment of segments) {
        for (const point of segment) {
            const key = endpointKey(point);

            if (!byEndpoint.has(key)) {
                byEndpoint.set(key, []);
            }

            byEndpoint.get(key).push(segment);
        }
    }

    const used = new Set();

    function extend(line, forward) {
        for (;;) {
            const tipIndex = forward
                ? line.length - 1
                : 0;

            const tip = endpointKey(line[tipIndex]);

            const next = (byEndpoint.get(tip) || []).find(
                segment => !used.has(segment)
            );

            if (!next) {
                return;
            }

            used.add(next);

            const other = endpointKey(next[0]) === tip
                ? next[1]
                : next[0];

            if (forward) {
                line.push(other);
            } else {
                line.unshift(other);
            }

            /*
             * A closed ring has walked back onto its own far end; stop
             * before it laps itself.
             */
            const farIndex = forward
                ? 0
                : line.length - 1;

            if (endpointKey(other) === endpointKey(line[farIndex])) {
                return;
            }
        }
    }

    const lines = [];

    for (const segment of segments) {
        if (used.has(segment)) {
            continue;
        }

        used.add(segment);

        const line = [segment[0], segment[1]];

        extend(line, true);
        extend(line, false);

        lines.push(line);
    }

    return lines;
}

/*
 * Douglas-Peucker, iterative so a long contour cannot blow the stack.
 * Tolerance is in cell units.
 */
export function simplifyLine(points, tolerance) {
    if (tolerance <= 0 || points.length < 3) {
        return points;
    }

    const keep = new Uint8Array(points.length);

    keep[0] = 1;
    keep[points.length - 1] = 1;

    const stack = [[0, points.length - 1]];

    while (stack.length) {
        const [first, last] = stack.pop();

        if (last - first < 2) {
            continue;
        }

        const [ax, ay] = points[first];
        const [bx, by] = points[last];

        const dx = bx - ax;
        const dy = by - ay;

        const span = Math.hypot(dx, dy);

        let farthest = -1;
        let farthestDistance = tolerance;

        for (let i = first + 1; i < last; i += 1) {
            const [px, py] = points[i];

            /*
             * A closed ring has a zero-length chord, so fall back to the
             * distance from the shared endpoint.
             */
            const distance = span > 0
                ? Math.abs((px - ax) * dy - (py - ay) * dx) / span
                : Math.hypot(px - ax, py - ay);

            if (distance > farthestDistance) {
                farthest = i;
                farthestDistance = distance;
            }
        }

        if (farthest > 0) {
            keep[farthest] = 1;
            stack.push([first, farthest], [farthest, last]);
        }
    }

    return points.filter((_, index) => keep[index] === 1);
}

/*
 * Delta-encodes one polyline into a flat integer array.
 *
 * Coordinates are quantised to 1 / `quantisation` of a cell and stored as
 * differences from the previous point: [x0, y0, dx, dy, dx, dy, ...]. Most
 * deltas are single digits, which is what makes the JSON compress.
 */
export function encodeLine(points, quantisation) {
    const flat = [];

    let previousX = 0;
    let previousY = 0;

    for (const [x, y] of points) {
        const quantisedX = Math.round(x * quantisation);
        const quantisedY = Math.round(y * quantisation);

        flat.push(
            quantisedX - previousX,
            quantisedY - previousY
        );

        previousX = quantisedX;
        previousY = quantisedY;
    }

    return flat;
}

/*
 * Full pipeline for one level: segments -> polylines -> simplified ->
 * delta-encoded. Lines that simplify away to a single point are dropped.
 */
export function buildLevelLines(
    grid,
    width,
    height,
    level,
    { tolerance = 0, quantisation = 10 } = {}
) {
    const lines = [];

    for (const line of stitchSegments(
        contourSegments(grid, width, height, level)
    )) {
        const simplified = simplifyLine(line, tolerance);

        if (simplified.length < 2) {
            continue;
        }

        lines.push(encodeLine(simplified, quantisation));
    }

    return lines;
}
