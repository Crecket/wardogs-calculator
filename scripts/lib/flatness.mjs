/*
 * How steep the ground under a hull is, and which band of the flatness ramp
 * that lands in.
 *
 * The gun's footprint spans metres, and 2 m terrain data exaggerates the
 * gradient at the smallest scale, so a central difference across one cell
 * answers a question no vehicle asks. A plane fitted through the whole
 * footprint is the tilt the hull would actually take, and it is least
 * squares rather than a corner-to-corner slope so a single spiky sample
 * cannot dominate.
 *
 * The bands are anchored absolutely on the 8 degree threshold the app
 * already warns at, so the same colour means the same tilt on every map.
 * A per-map relative ramp was rejected in the spec: green would mean 4
 * degrees on Bakurani and 1.6 on Ozeti, and a legend that changes meaning
 * between maps is worse than no legend.
 *
 * Everything here is pure. The build script owns the file I/O and the
 * terrain sampling.
 */

export const TILT_BAND_EDGES = [2, 4, 6, 8];

/*
 * The first band a gun should not be parked in. The flatness ramp's red and
 * the firing-positions filter are the same predicate expressed once, so the
 * two layers cannot disagree about a cell on the boundary.
 */
export const TILT_LIMIT_BAND = TILT_BAND_EDGES.length;

export function tiltBand(degrees) {
    if (!Number.isFinite(degrees)) {
        return TILT_LIMIT_BAND;
    }

    for (let i = 0; i < TILT_BAND_EDGES.length; i += 1) {
        if (degrees < TILT_BAND_EDGES[i]) {
            return i;
        }
    }

    return TILT_LIMIT_BAND;
}

/*
 * Least squares over a regular square stencil collapses to two independent
 * sums: the sample offsets are symmetric about the centre and the two axes
 * are orthogonal, so the normal equations never have to be formed.
 */
export function planeTiltDegrees(samples, spacingMeters) {
    const size = Math.round(Math.sqrt(samples.length));

    if (size < 2 || size * size !== samples.length) {
        return NaN;
    }

    if (!Number.isFinite(spacingMeters) || spacingMeters <= 0) {
        return NaN;
    }

    const centre = (size - 1) / 2;

    let sumEast = 0;
    let sumNorth = 0;
    let sumSquares = 0;

    for (let row = 0; row < size; row += 1) {
        const north = (centre - row) * spacingMeters;

        for (let col = 0; col < size; col += 1) {
            const east = (col - centre) * spacingMeters;
            const z = samples[row * size + col];

            if (!Number.isFinite(z)) {
                return NaN;
            }

            sumEast += east * z;
            sumNorth += north * z;
        }

        sumSquares += size * north * north;
    }

    if (sumSquares <= 0) {
        return NaN;
    }

    const gradientEast = sumEast / sumSquares;
    const gradientNorth = sumNorth / sumSquares;

    return Math.atan(Math.hypot(gradientEast, gradientNorth)) * 180 / Math.PI;
}
