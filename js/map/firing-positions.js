/* =========================
   FIRING POSITIONS
   ========================= */

/*
 * The ground an SPG can be parked on that can also put a shell into every
 * tower, baked by scripts/build-firing-positions.mjs into one raster per
 * map per arc rule and drawn above the flatness ramp.
 *
 * This is the opinionated layer. Flatness is terrain truth with no view
 * about what the gun is for; this one has been through three filters — in
 * range of every aim point, hull tilt under 8 degrees, and the shell
 * actually clearing the ground on the way — and what survives is a few
 * percent of the map.
 *
 * It is drawn as an outline with a faint wash rather than a second ramp.
 * Every cell here has already passed the tilt filter, so colouring it by
 * tilt would spend a whole scale on a distinction the layer guarantees is
 * irrelevant; and a second opaque wash over the flatness ramp would tint
 * the bands underneath into illegibility. The boundary is marked at bake
 * time, so this still costs one drawImage.
 *
 * The arc rule is the player's choice and it is not cosmetic. Forcing the
 * low arc matches the dead-ground layer and is the flatter, more accurate
 * shot; allowing any mil is more truthful about the gun and far more
 * permissive, because the high arc reaches 1390 mil and clears almost
 * anything. On Bakurani the choice moves MANTICORE from 2% of the viable
 * set to 21%, and on Ozeti it moves the ranking the other way, so neither
 * rule can be shipped as the only one.
 *
 * The same blind spots as the flatness layer apply, and one more: the towers
 * move between matches, which is what the 300 m ring around each of them is
 * absorbing.
 */

const FIRING_POSITION_FORMAT = 'wardogs-firing-positions-v1';

/*
 * Maps known to ship the rasters. Listed rather than probed so the Layers
 * popover can decide whether to offer the toggle without a fetch.
 * scripts/lib/config.test.mjs holds this to the files on disk.
 */
const FIRING_POSITION_MAP_IDS = [
    'bakurani',
    'ozeti'
];

const FIRING_POSITION_ARCS = ['low', 'any'];

const FIRING_POSITION_CACHE = new Map();

/*
 * One entry per cell value: outside the set, inside it, on its edge. RGBA,
 * because the alpha does the work here rather than the colour.
 *
 * The interior draws nothing. A wash was tried and read as glare: the set
 * is lacy — Bakurani's any-mil regions enclose 491 holes — so a filled
 * interior puts colour over most of the tower approaches at once and buries
 * both the tiles and the flatness ramp underneath it. An outline states the
 * same thing and leaves the ground legible.
 *
 * The edge is deliberately under full strength. At map-fit zoom the raster
 * is downscaled and an 8 m edge falls below a pixel, so drawing it at 255
 * buys nothing but aliasing.
 */
function firingPositionsPalette() {
    return [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [56, 189, 220, 205]
    ];
}

function mapHasFiringPositions(mapId) {
    return FIRING_POSITION_MAP_IDS.includes(mapId);
}

function firingPositionsKey(mapId, arc) {
    return `${mapId}|${arc}`;
}

/*
 * Terrain data is not version-stamped by scripts/version-assets.mjs, so the
 * paths are plain.
 */
function firingPositionsUrl(mapId, arc) {
    return `data/terrain/${mapId}/firing-positions-${arc}.png`;
}

function firingPositionsHeaderUrl(mapId, arc) {
    return `data/terrain/${mapId}/firing-positions-${arc}.json`;
}

function firingPositionsGrid(payload) {
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
        throw new Error('Firing positions payload has an unusable grid');
    }

    return geometry;
}

function colouriseFiringPositions(image, grid) {
    const canvas = document.createElement('canvas');

    canvas.width = grid.width;
    canvas.height = grid.height;

    const context = canvas.getContext('2d', { willReadFrequently: true });

    context.drawImage(image, 0, 0);

    const pixels = context.getImageData(0, 0, grid.width, grid.height);
    const data = pixels.data;
    const palette = firingPositionsPalette();
    const last = palette.length - 1;

    for (let i = 0; i < data.length; i += 4) {
        const cell = palette[Math.min(last, data[i])];

        data[i] = cell[0];
        data[i + 1] = cell[1];
        data[i + 2] = cell[2];
        data[i + 3] = cell[3];
    }

    context.putImageData(pixels, 0, 0);

    return canvas;
}

/*
 * Resolves to the coloured raster for a map and arc, or null. Concurrent
 * callers share one load, and a failure is cached as null so a missing file
 * does not re-request on every redraw. Switching the arc is a second fetch,
 * kept apart in the cache, so switching back is instant.
 */
function loadFiringPositions(mapId, arc) {
    if (!mapHasFiringPositions(mapId) || !FIRING_POSITION_ARCS.includes(arc)) {
        return Promise.resolve(null);
    }

    const key = firingPositionsKey(mapId, arc);

    if (FIRING_POSITION_CACHE.has(key)) {
        return Promise.resolve(FIRING_POSITION_CACHE.get(key));
    }

    const pending = fetch(firingPositionsHeaderUrl(mapId, arc))
        .then(response => {
            if (!response.ok) {
                throw new Error(`${response.status} ${response.statusText}`);
            }

            return response.json();
        })
        .then(payload => {
            if (payload?.format !== FIRING_POSITION_FORMAT) {
                throw new Error(
                    `Unsupported firing positions format ${payload?.format}`
                );
            }

            /*
             * The two arcs differ by a factor of six in area, so a raster
             * baked for the wrong one would draw as a plausible answer to
             * the wrong question rather than as an obvious fault.
             */
            if (payload?.arc !== arc) {
                throw new Error(
                    `${mapId} ${arc} raster is baked for ${payload?.arc}`
                );
            }

            const grid = firingPositionsGrid(payload);

            return decodeMapImage(firingPositionsUrl(mapId, arc)).then(image => {
                const entry = {
                    image: colouriseFiringPositions(image, grid),
                    grid
                };

                FIRING_POSITION_CACHE.set(key, entry);

                return entry;
            });
        })
        .catch(error => {
            console.warn(
                `[firing-positions] Could not load ${mapId} ${arc}; ` +
                'the layer will stay empty.',
                error
            );

            FIRING_POSITION_CACHE.set(key, null);

            return null;
        });

    FIRING_POSITION_CACHE.set(key, pending);

    return pending;
}

function cachedFiringPositions(mapId, arc) {
    const cached = FIRING_POSITION_CACHE.get(firingPositionsKey(mapId, arc));

    if (!cached || typeof cached.then === 'function') {
        return null;
    }

    return cached;
}

/*
 * Called when the layer is switched on, on map change while it is on, and
 * on every arc change. The load is fire-and-forget: draw() renders nothing
 * until it lands, then redraws.
 */
function ensureFiringPositionsLoaded(mapId, arc) {
    if (!mapId || FIRING_POSITION_CACHE.has(firingPositionsKey(mapId, arc))) {
        return;
    }

    loadFiringPositions(mapId, arc).then(entry => {
        if (entry) {
            draw();
        }
    });
}

function drawFiringPositions(currentMap) {
    const mapId = currentMap?.id;

    if (!mapId || !mapHasFiringPositions(mapId)) {
        return;
    }

    const arc = typeof firingPositionsArc === 'function'
        ? firingPositionsArc()
        : FIRING_POSITION_ARCS[0];

    ensureFiringPositionsLoaded(mapId, arc);

    const data = cachedFiringPositions(mapId, arc);

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

    ctx.drawImage(
        data.image,
        (gameMinX - v.bounds.minX) * v.scale,
        (v.bounds.maxY - gameMaxY) * v.scale,
        gameWidth * v.scale,
        gameHeight * v.scale
    );
}
