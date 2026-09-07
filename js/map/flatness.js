/* =========================
   FLATNESS
   ========================= */

/*
 * Hull tilt everywhere on the map, baked by scripts/build-flatness.mjs into
 * one band raster per map and drawn between the hillshade and the contours.
 *
 * The app has warned about ground steeper than 8 degrees since the firing
 * range measurements of 2026-09-03, because hull tilt moves the impact
 * further than any error in the ballistics. It could never say where the
 * flat ground was, so the warning arrived after the position was chosen,
 * which is the wrong order.
 *
 * The PNG holds band indices, not colours, so the ramp lives here and can
 * be retuned without rebaking every map. The bands are anchored absolutely
 * on that same 8 degree threshold, so a colour means the same tilt on every
 * map: Bakurani reading four fifths red is the correct answer, not a
 * calibration failure.
 *
 * Like the hillshade, this is a separate download nobody who leaves the
 * layer off ever makes.
 *
 * Two things the layer cannot know. There is no water data in the
 * repository, so lake and river surfaces are perfectly flat and read green;
 * both shipped maps have both. And buildings and props are not in the
 * height field, so ground this calls flat can still be occupied.
 */

const FLATNESS_FORMAT = 'wardogs-flatness-v1';

/*
 * Maps known to ship a flatness.png. Listed rather than probed so the
 * Layers popover can decide whether to offer the toggle without a fetch.
 * scripts/lib/config.test.mjs holds this to the files on disk.
 */
const FLATNESS_MAP_IDS = [
    'bakurani',
    'ozeti'
];

const FLATNESS_OPACITY = 0.45;

const FLATNESS_CACHE = new Map();

/*
 * One entry per band, flattest first. Green through amber to red, with the
 * steepest band the only one that reads as a refusal.
 */
function flatnessPalette() {
    return [
        [29, 156, 86],
        [110, 168, 40],
        [192, 147, 19],
        [207, 114, 25],
        [196, 69, 58]
    ];
}

function mapHasFlatness(mapId) {
    return FLATNESS_MAP_IDS.includes(mapId);
}

/*
 * Terrain data is not version-stamped by scripts/version-assets.mjs, so the
 * paths are plain.
 */
function flatnessUrl(mapId) {
    return `data/terrain/${mapId}/flatness.png`;
}

function flatnessHeaderUrl(mapId) {
    return `data/terrain/${mapId}/flatness.json`;
}

function flatnessGrid(payload) {
    const grid = payload?.grid || {};

    const geometry = {
        originX: Number(grid.originX),
        originY: Number(grid.originY),
        stepX: Number(grid.stepX),
        stepY: Number(grid.stepY),
        width: Number(grid.width),
        height: Number(grid.height)
    };

    const usable = Object.values(geometry).every(
        value => Number.isFinite(value) && value !== 0
    );

    if (!usable) {
        throw new Error('Flatness payload has an unusable grid');
    }

    return geometry;
}

/*
 * Paints band indices through the palette once, at load. The alternative is
 * a per-frame pass over 1.9 million cells, which is the thing this layer
 * exists to avoid.
 */
function colouriseFlatness(image, grid) {
    const canvas = document.createElement('canvas');

    canvas.width = grid.width;
    canvas.height = grid.height;

    const context = canvas.getContext('2d', { willReadFrequently: true });

    context.drawImage(image, 0, 0);

    const pixels = context.getImageData(0, 0, grid.width, grid.height);
    const data = pixels.data;
    const palette = flatnessPalette();
    const last = palette.length - 1;

    for (let i = 0; i < data.length; i += 4) {
        const band = palette[Math.min(last, data[i])];

        data[i] = band[0];
        data[i + 1] = band[1];
        data[i + 2] = band[2];
        data[i + 3] = 255;
    }

    context.putImageData(pixels, 0, 0);

    return canvas;
}

/*
 * Resolves to the coloured raster for a map, or null if the map has none.
 * Concurrent callers share one load, and a failure is cached as null so a
 * missing file does not re-request on every redraw.
 */
function loadFlatness(mapId) {
    if (!mapHasFlatness(mapId)) {
        return Promise.resolve(null);
    }

    if (FLATNESS_CACHE.has(mapId)) {
        return Promise.resolve(FLATNESS_CACHE.get(mapId));
    }

    const pending = fetch(flatnessHeaderUrl(mapId))
        .then(response => {
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText}`);
            }

            return response.json();
        })
        .then(payload => {
            if (payload?.format !== FLATNESS_FORMAT) {
                throw new Error(`Unsupported flatness format ${payload?.format}`);
            }

            const grid = flatnessGrid(payload);

            return decodeMapImage(flatnessUrl(mapId)).then(image => {
                const entry = { image: colouriseFlatness(image, grid), grid };

                FLATNESS_CACHE.set(mapId, entry);

                return entry;
            });
        })
        .catch(error => {
            console.warn(
                `[flatness] Could not load ${mapId} tilt; ` +
                'the layer will stay empty.',
                error
            );

            FLATNESS_CACHE.set(mapId, null);

            return null;
        });

    FLATNESS_CACHE.set(mapId, pending);

    return pending;
}

function cachedFlatness(mapId) {
    const cached = FLATNESS_CACHE.get(mapId);

    if (!cached || typeof cached.then === 'function') {
        return null;
    }

    return cached;
}

/*
 * Called when the layer is switched on, and on map change while it is on.
 * The load is fire-and-forget: draw() renders nothing until it lands, then
 * redraws.
 */
function ensureFlatnessLoaded(mapId) {
    if (!mapId || FLATNESS_CACHE.has(mapId)) {
        return;
    }

    loadFlatness(mapId).then(entry => {
        if (entry) {
            draw();
        }
    });
}

function drawFlatness(currentMap) {
    const mapId = currentMap?.id;

    if (!mapId || !mapHasFlatness(mapId)) {
        return;
    }

    ensureFlatnessLoaded(mapId);

    const data = cachedFlatness(mapId);

    if (!data) {
        return;
    }

    const v = view();
    const grid = data.grid;

    /*
     * A pixel is a sample point, so the image covers half a cell beyond the
     * outermost samples on every side.
     */
    const gameMinX = grid.originX - grid.stepX / 2;
    const gameMaxY = grid.originY + grid.stepY / 2;
    const gameWidth = grid.width * grid.stepX;
    const gameHeight = grid.height * grid.stepY;

    const previousAlpha = ctx.globalAlpha;

    ctx.globalAlpha = previousAlpha * FLATNESS_OPACITY;

    ctx.drawImage(
        data.image,
        (gameMinX - v.bounds.minX) * v.scale,
        (v.bounds.maxY - gameMaxY) * v.scale,
        gameWidth * v.scale,
        gameHeight * v.scale
    );

    ctx.globalAlpha = previousAlpha;
}
