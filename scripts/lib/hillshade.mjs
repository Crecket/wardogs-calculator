/*
 * Hillshade from an elevation grid: Horn's 3x3 slope and aspect, then the
 * standard Lambertian shade against a single directional light.
 *
 * Grid rows run north to south, matching scripts/build-contours.mjs and the
 * canvas the result is eventually drawn on, so a step down a row is a step
 * south.
 *
 * Everything here is pure. The build script owns the file I/O and the
 * terrain sampling; this owns the arithmetic, which is what the tests in
 * hillshade.test.mjs pin down.
 */

const DEG = Math.PI / 180;

/*
 * The shade a perfectly flat surface returns, and so the value the drawn
 * layer has to treat as "no shading at all".
 */
export function neutralShade(altitudeDegrees) {
    return Math.cos((90 - altitudeDegrees) * DEG) * 255;
}

/*
 * Vertical exaggeration, per map, from the map's own relief.
 *
 * A single shared constant cannot serve both maps: at a z-factor that suits
 * Bakurani's 1077 m of relief, Ozeti's 382 m comes out nearly flat. So the
 * factor is chosen to bring every map's vertical range to the same
 * effective scale — a map with half the relief gets twice the exaggeration
 * — and clamped so a freakishly flat or freakishly steep map cannot turn
 * the layer into noise or a silhouette.
 */
export const REFERENCE_RELIEF_METERS = 1000;

export function zFactorForRelief(reliefMeters, options = {}) {
    const reference =
        options.referenceRelief ?? REFERENCE_RELIEF_METERS;

    const minimum = options.minZFactor ?? 0.5;
    const maximum = options.maxZFactor ?? 4;

    if (!Number.isFinite(reliefMeters) || reliefMeters <= 0) {
        return 1;
    }

    return Math.min(
        maximum,
        Math.max(minimum, reference / reliefMeters)
    );
}

/*
 * Horn's method over a 3x3 window, with the window clamped to the grid at
 * the edges so no sample is ever read from outside it.
 *
 * Returns one 0..255 shade per grid cell.
 */
export function computeHillshade(grid, width, height, options = {}) {
    const cellSizeX = options.cellSizeX ?? options.cellSize ?? 1;
    const cellSizeY = options.cellSizeY ?? options.cellSize ?? 1;
    const zFactor = options.zFactor ?? 1;
    const azimuth = options.azimuth ?? 315;
    const altitude = options.altitude ?? 45;

    if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width < 1 ||
        height < 1
    ) {
        throw new Error('Hillshade needs a positive grid size');
    }

    if (grid.length < width * height) {
        throw new Error(
            `Grid of ${grid.length} is too small for ${width}x${height}`
        );
    }

    const zenith = (90 - altitude) * DEG;
    const cosZenith = Math.cos(zenith);
    const sinZenith = Math.sin(zenith);

    /*
     * Compass azimuth, clockwise from north, into the maths convention the
     * aspect below is measured in.
     */
    const light = (360 - azimuth + 90) * DEG;

    const shade = new Uint8Array(width * height);

    const maxX = width - 1;
    const maxY = height - 1;

    for (let y = 0; y <= maxY; y += 1) {
        const north = Math.max(0, y - 1) * width;
        const middle = y * width;
        const south = Math.min(maxY, y + 1) * width;

        for (let x = 0; x <= maxX; x += 1) {
            const west = Math.max(0, x - 1);
            const east = Math.min(maxX, x + 1);

            const a = grid[north + west];
            const b = grid[north + x];
            const c = grid[north + east];
            const d = grid[middle + west];
            const f = grid[middle + east];
            const g = grid[south + west];
            const h = grid[south + x];
            const i = grid[south + east];

            /*
             * The clamped window is half as wide at an edge column or row,
             * so the divisor shrinks with it and an edge keeps the same
             * gradient the interior would have read there.
             */
            const spanX = (east - west) * cellSizeX;
            const spanY =
                (Math.min(maxY, y + 1) - Math.max(0, y - 1)) * cellSizeY;

            const dzdx =
                ((c + 2 * f + i) - (a + 2 * d + g)) / (4 * spanX);

            const dzdy =
                ((g + 2 * h + i) - (a + 2 * b + c)) / (4 * spanY);

            const rise = zFactor * Math.hypot(dzdx, dzdy);
            const slope = Math.atan(rise);

            const aspect = Math.atan2(dzdy, -dzdx);

            const value =
                cosZenith * Math.cos(slope) +
                sinZenith * Math.sin(slope) * Math.cos(light - aspect);

            shade[middle + x] = Math.max(
                0,
                Math.min(255, Math.round(value * 255))
            );
        }
    }

    return shade;
}

/*
 * Turns the shade into the greyscale-with-alpha pixels the PNG carries.
 *
 * An opaque grey sheet would wash the map tiles out, so the layer is drawn
 * as translucent black where the ground is in shadow and translucent white
 * where it faces the sun, with flat ground fully transparent. That way the
 * tiles show through untouched wherever there is nothing to say.
 *
 * Flat ground sits at the neutral shade, which is nowhere near the middle
 * of the 0..255 range — at a 45 degree sun it is 180 — so the two sides of
 * neutral have very different room above and below them. Each sign is
 * therefore normalised against its own headroom, so a slope square-on to
 * the light and a slope fully in shadow come out equally strong instead of
 * the highlight reaching a quarter of the shadow's alpha. Gain then scales
 * the normalised value, and so still acts the same on both signs.
 */
export function shadeToGreyAlpha(shade, options = {}) {
    const altitude = options.altitude ?? 45;
    const gain = options.gain ?? 1;

    const neutral = neutralShade(altitude);

    const headroomUp = 255 - neutral;
    const headroomDown = neutral;

    const pixels = new Uint8Array(shade.length * 2);

    for (let i = 0; i < shade.length; i += 1) {
        const offset = shade[i] - neutral;

        const headroom = offset >= 0 ? headroomUp : headroomDown;

        const delta = headroom > 0 ? offset / headroom : 0;

        pixels[i * 2] = offset >= 0 ? 255 : 0;

        pixels[i * 2 + 1] = Math.max(
            0,
            Math.min(255, Math.round(Math.abs(delta) * gain * 255))
        );
    }

    return pixels;
}
