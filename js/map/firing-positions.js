/* =========================
   FIRING POSITIONS
   ========================= */

/*
 * The go-to spots: ground an SPG would drive to on purpose, baked by
 * scripts/build-firing-positions.mjs into one raster per map per arc rule
 * and drawn above the flatness ramp.
 *
 * This is the opinionated layer. Flatness is terrain truth with no view
 * about what the gun is for; this one has been through four filters — in
 * range of every aim point, hull tilt under 4 degrees, not inside woodland,
 * and the shell clearing the ground with thick woods standing 30 m tall —
 * then trimmed to blocks at least 24 m square. What survives is well under
 * one percent of the map.
 *
 * It is drawn as an outline with a faint wash rather than a second ramp.
 * Every cell here has already passed the tilt filter, so colouring it by
 * tilt would spend a whole scale on a distinction the layer guarantees is
 * irrelevant; and a second opaque wash over the flatness ramp would tint
 * the bands underneath into illegibility. The boundary is marked at bake
 * time, so this still costs one drawImage.
 *
 * The arc rule is the player's choice and it is not cosmetic. The low arc
 * is the flatter, more accurate shot and it is the one trees defeat: a
 * shallow shell meets the first thick wood within 70 m, so the low set
 * asks for a clean flat lane to the centre of all but one tower rather
 * than to every ring point, which no wooded valley floor can give. The any
 * arc keeps the full rule, every tower and every ring point with whichever
 * arc works, because the high arc reaches 1390 mil and clears almost
 * anything.
 *
 * The canopy comes from the map tiles, not the terrain, so it is a reading
 * of the picture rather than of the game. The shot assessment the app runs
 * when the player clicks a spot does not see it: this layer refuses ground
 * the click verdict would pass, by design, and never the other way round.
 * The towers move between matches, which is what the 300 m ring around each
 * of them is absorbing in the any-arc set.
 */

const FIRING_POSITION_FORMAT = 'wardogs-firing-positions-v1';

/*
 * Maps known to ship the rasters. Listed rather than probed so the Layers
 * popover can decide whether to offer the toggle without a fetch.
 * scripts/lib/config.test.mjs holds this to the files on disk.
 */
const FIRING_POSITION_MAP_IDS = [
    'bakurani',
    'ozeti',
    'zestafona'
];

const FIRING_POSITION_ARCS = ['low', 'any'];

const FIRING_POSITION_CACHE = new Map();

/*
 * One entry per cell value: outside both sets, inside the go-to set, on
 * its edge, inside the fallback set, on its edge. RGBA, because the alpha
 * does the work here rather than the colour.
 *
 * The interior carries a slight wash. An outline alone marks where the set
 * ends without saying which side of the line is the good ground, and on a
 * layer whose regions enclose hundreds of holes that is a real ambiguity.
 *
 * The alpha is 32 because it was measured rather than chosen. Against the
 * flatness ramp underneath, that wash is a perceptual distance of 13 to 16
 * from unfilled ground — comfortably visible — while leaving the closest
 * pair of ramp bands 11.5 apart where they are 13.3 unfilled. The ramp
 * loses about an eighth of its contrast and stays readable through the
 * fill, which is the whole reason the two layers were split in the first
 * place. Anything past about 64 starts flattening the bands together.
 *
 * Two tiers. Neon green is the go-to set, at full strength: green is what
 * "go here" reads as, and the set is small enough now that it has to be
 * found rather than avoided. The viable ground sits on the flatness ramp's
 * greenest band by construction, but the ramp's green is a dim wash and
 * this is a saturated edge at full alpha, several times brighter than
 * anything under it, so the two do not merge. Orange is the fallback set,
 * the layer's original rule with the hull's own tilt limit and trees
 * ignored, drawn only where green is not; it is there for the spawn that
 * the strict rule leaves with almost nothing. The two hues sit far apart
 * and neither is claimed by anything else on the map except the range
 * ring, which is a thin circle and never a filled region.
 *
 * Full alpha because the raster downscales at map-fit zoom and an 8 m edge
 * falls below a pixel; what survives is an average, so starting dimmer only
 * makes it vanish sooner.
 */
function firingPositionsPalette() {
    return [
        [0, 0, 0, 0],
        [57, 255, 20, 32],
        [57, 255, 20, 255],
        [255, 150, 0, 32],
        [255, 150, 0, 255]
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
