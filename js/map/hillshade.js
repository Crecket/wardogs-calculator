/* =========================
   HILLSHADE
   ========================= */

/*
 * Shaded relief, baked by scripts/build-hillshade.mjs into one greyscale
 * image per map and drawn between the tiles and the contour lines.
 *
 * The raster is translucent black in shadow, translucent white in sunlight
 * and fully transparent on flat ground, so it lays over the photographic
 * tiles without flattening their colour. The sun sits in the north-west at
 * 45 degrees, the convention every printed topo map uses, because relief lit
 * from anywhere south reads inverted to most eyes.
 *
 * Like the contours, this is a separate download nobody who leaves the layer
 * off ever makes. The sidecar hillshade.json carries the grid geometry, so
 * the placement never has to be duplicated from the builder by hand.
 */

const HILLSHADE_FORMAT = 'wardogs-hillshade-v1';

/*
 * Maps known to ship a hillshade.png. Listed rather than probed so the
 * Layers popover can decide whether to offer the toggle without a fetch.
 */
const HILLSHADE_MAP_IDS = [
    'bakurani',
    'ozeti'
];

const HILLSHADE_OPACITY = 0.72;

const HILLSHADE_CACHE = new Map();

function mapHasHillshade(mapId) {
    return HILLSHADE_MAP_IDS.includes(mapId);
}

/*
 * Terrain data is not version-stamped by scripts/version-assets.mjs, so the
 * paths are plain.
 */
function hillshadeUrl(mapId) {
    return `data/terrain/${mapId}/hillshade.png`;
}

function hillshadeHeaderUrl(mapId) {
    return `data/terrain/${mapId}/hillshade.json`;
}

function hillshadeIsSameOrigin(url) {
    try {
        return new URL(url, location.href).origin === location.origin;
    } catch (error) {
        return false;
    }
}

function decodeHillshadeElement(url) {
    return new Promise((resolve, reject) => {
        const image = new Image();

        image.decoding = 'async';

        image.onload = () => {
            if (typeof image.decode !== 'function') {
                resolve(image);

                return;
            }

            image.decode().then(
                () => resolve(image),
                () => resolve(image)
            );
        };

        image.onerror = () => reject(new Error(url));

        image.src = url;
    });
}

async function decodeHillshade(url) {
    if (
        typeof createImageBitmap !== 'function' ||
        typeof fetch !== 'function' ||
        !hillshadeIsSameOrigin(url)
    ) {
        return decodeHillshadeElement(url);
    }

    let response = null;

    try {
        response = await fetch(url);
    } catch (error) {
        return decodeHillshadeElement(url);
    }

    if (!response.ok) {
        throw new Error(`${url}: ${response.status}`);
    }

    try {
        return await createImageBitmap(await response.blob());
    } catch (error) {
        return decodeHillshadeElement(url);
    }
}

function hillshadeGrid(payload) {
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
        throw new Error('Hillshade payload has an unusable grid');
    }

    return geometry;
}

/*
 * Resolves to the decoded raster for a map, or null if the map has none.
 * Concurrent callers share one load, and a failure is cached as null so a
 * missing file does not re-request on every redraw.
 */
function loadHillshade(mapId) {
    if (!mapHasHillshade(mapId)) {
        return Promise.resolve(null);
    }

    if (HILLSHADE_CACHE.has(mapId)) {
        return Promise.resolve(HILLSHADE_CACHE.get(mapId));
    }

    const pending = fetch(hillshadeHeaderUrl(mapId))
        .then(response => {
            if (!response.ok) {
                throw new Error(
                    `${response.status} ${response.statusText}`
                );
            }

            return response.json();
        })
        .then(payload => {
            if (payload?.format !== HILLSHADE_FORMAT) {
                throw new Error(
                    `Unsupported hillshade format ${payload?.format}`
                );
            }

            const grid = hillshadeGrid(payload);

            return decodeHillshade(hillshadeUrl(mapId)).then(image => {
                const entry = { image, grid };

                HILLSHADE_CACHE.set(mapId, entry);

                return entry;
            });
        })
        .catch(error => {
            console.warn(
                `[hillshade] Could not load ${mapId} relief; ` +
                'the layer will stay empty.',
                error
            );

            HILLSHADE_CACHE.set(mapId, null);

            return null;
        });

    HILLSHADE_CACHE.set(mapId, pending);

    return pending;
}

function cachedHillshade(mapId) {
    const cached = HILLSHADE_CACHE.get(mapId);

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
function ensureHillshadeLoaded(mapId) {
    if (!mapId || HILLSHADE_CACHE.has(mapId)) {
        return;
    }

    loadHillshade(mapId).then(entry => {
        if (entry) {
            draw();
        }
    });
}

function drawHillshade(currentMap) {
    const mapId = currentMap?.id;

    if (!mapId || !mapHasHillshade(mapId)) {
        return;
    }

    ensureHillshadeLoaded(mapId);

    const data = cachedHillshade(mapId);

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

    ctx.globalAlpha = previousAlpha * HILLSHADE_OPACITY;

    ctx.drawImage(
        data.image,
        (gameMinX - v.bounds.minX) * v.scale,
        (v.bounds.maxY - gameMaxY) * v.scale,
        gameWidth * v.scale,
        gameHeight * v.scale
    );

    ctx.globalAlpha = previousAlpha;
}
