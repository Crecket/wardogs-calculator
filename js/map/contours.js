/* =========================
   CONTOURS
   ========================= */

/*
 * Terrain contour lines, precomputed by scripts/build-contours.mjs.
 *
 * The heightfield itself is 129 MB per map and js/features/terrain-ballistics.js
 * only ever streams the two chunks a firing solution touches. A contour layer
 * needs the whole map, so the lines are baked at build time into one file per
 * map — a few hundred KB — and fetched here the first time somebody turns the
 * layer on. Nobody who leaves it off ever downloads anything.
 *
 * Lines carry no altitude labels. The heightfield sits on an offset datum
 * (see docs/terrain.md), so an absolute label would be wrong by roughly
 * 900 m; the shape of the ground is what the layer is for.
 */

const CONTOURS_FORMAT = 'wardogs-contours-v1';

/*
 * Maps known to ship a contours.json. Listed rather than probed so the
 * Layers popover can decide whether to offer the toggle without a fetch.
 */
const CONTOUR_MAP_IDS = [
    'bakurani',
    'ozeti'
];

/*
 * Every line is stroked twice: a dark casing, then the line itself. Map
 * tiles are photographic, so a single thin stroke disappears into snow on
 * one ridge and into shadow on the next. The casing is what makes the
 * colour legible over all of it.
 */
const CONTOUR_STYLE = {
    casing: 'rgba(0, 0, 0, 0.55)',
    minorWidth: 1,
    majorWidth: 2.2,
    casingExtra: 1.6,
    minorAlpha: 0.75,
    majorAlpha: 1
};

/*
 * Hypsometric ramp, low ground to high. Without it every line is the same
 * colour and a contour map is just a wall of squiggles — you cannot tell a
 * basin from a summit without tracing a line by eye. Colour carries the
 * height so the shape of the ground reads at a glance.
 */
const CONTOUR_RAMP = [
    [0.00, [79, 127, 168]],
    [0.20, [95, 168, 127]],
    [0.42, [176, 189, 92]],
    [0.60, [215, 194, 95]],
    [0.76, [217, 139, 74]],
    [0.90, [201, 96, 63]],
    [1.00, [242, 228, 216]]
];

function contourRampColor(fraction) {
    const t = Math.min(1, Math.max(0, fraction));

    let lower = CONTOUR_RAMP[0];
    let upper = CONTOUR_RAMP[CONTOUR_RAMP.length - 1];

    for (let i = 0; i < CONTOUR_RAMP.length - 1; i += 1) {
        if (t >= CONTOUR_RAMP[i][0] && t <= CONTOUR_RAMP[i + 1][0]) {
            lower = CONTOUR_RAMP[i];
            upper = CONTOUR_RAMP[i + 1];
            break;
        }
    }

    const span = upper[0] - lower[0];

    const local = span > 0
        ? (t - lower[0]) / span
        : 0;

    const channel = index => Math.round(
        lower[1][index] +
        (upper[1][index] - lower[1][index]) * local
    );

    return `rgb(${channel(0)}, ${channel(1)}, ${channel(2)})`;
}

const CONTOUR_CACHE = new Map();

function mapHasContours(mapId) {
    return CONTOUR_MAP_IDS.includes(mapId);
}

function contoursUrl(mapId) {
    return `data/terrain/${mapId}/contours.json`;
}

/*
 * Turns the delta-encoded payload into absolute game coordinates once, so
 * every later frame is a straight coordinate transform.
 *
 * Grid rows run north to south, which is why y is subtracted.
 */
function decodeContours(payload) {
    const quantisation =
        Number(payload.quantisation) || 10;

    const grid = payload.grid || {};

    const originX = Number(grid.originX);
    const originY = Number(grid.originY);
    const stepX = Number(grid.stepX);
    const stepY = Number(grid.stepY);

    if (
        ![originX, originY, stepX, stepY].every(Number.isFinite)
    ) {
        throw new Error('Contour payload has an unusable grid');
    }

    const levels = [];

    /*
     * Heights are relative to the lowest sample in the map's own bounds, so
     * the ramp is stretched across whatever relief this map actually has —
     * Bakurani's 1082 m and Ozeti's 388 m both use the full range.
     */
    const relief =
        Number(payload.reliefMeters) ||
        Math.max(
            1,
            ...(payload.levels || []).map(
                level => Number(level.relativeMeters) || 0
            )
        );

    for (const level of payload.levels || []) {
        const lines = [];

        for (const flat of level.lines || []) {
            const points = new Float32Array(flat.length);

            let x = 0;
            let y = 0;

            for (let i = 0; i < flat.length; i += 2) {
                x += flat[i];
                y += flat[i + 1];

                points[i] = originX + (x / quantisation) * stepX;
                points[i + 1] = originY - (y / quantisation) * stepY;
            }

            lines.push(points);
        }

        levels.push({
            major: Boolean(level.major),
            relativeMeters: Number(level.relativeMeters),
            color: contourRampColor(
                Number(level.relativeMeters) / relief
            ),
            lines
        });
    }

    return {
        mapId: payload.mapId,
        intervalMeters: Number(payload.intervalMeters),
        reliefMeters: relief,
        levels,
        /*
         * Offscreen raster of the drawn layer, created on first draw and
         * reused until the zoom changes or a pan runs off its margin.
         */
        raster: null
    };
}

/*
 * Resolves to the decoded contours for a map, or null if the map has none.
 * Concurrent callers share one fetch, and a failure is cached as null so a
 * missing file does not re-request on every redraw.
 */
function loadContours(mapId) {
    if (!mapHasContours(mapId)) {
        return Promise.resolve(null);
    }

    if (CONTOUR_CACHE.has(mapId)) {
        return Promise.resolve(CONTOUR_CACHE.get(mapId));
    }

    const pending = fetch(contoursUrl(mapId))
        .then(response => {
            if (!response.ok) {
                throw new Error(
                    `${response.status} ${response.statusText}`
                );
            }

            return response.json();
        })
        .then(payload => {
            if (payload?.format !== CONTOURS_FORMAT) {
                throw new Error(
                    `Unsupported contour format ${payload?.format}`
                );
            }

            const decoded = decodeContours(payload);

            CONTOUR_CACHE.set(mapId, decoded);

            return decoded;
        })
        .catch(error => {
            console.warn(
                `[contours] Could not load ${mapId} contours; ` +
                'the layer will stay empty.',
                error
            );

            CONTOUR_CACHE.set(mapId, null);

            return null;
        });

    CONTOUR_CACHE.set(mapId, pending);

    return pending;
}

function cachedContours(mapId) {
    const cached = CONTOUR_CACHE.get(mapId);

    if (!cached || typeof cached.then === 'function') {
        return null;
    }

    return cached;
}

/*
 * Called when the layer is switched on, and on map change while it is on.
 * The fetch is fire-and-forget: draw() renders nothing until it lands, then
 * redraws.
 */
function ensureContoursLoaded(mapId) {
    if (!mapId || CONTOUR_CACHE.has(mapId)) {
        return;
    }

    loadContours(mapId).then(decoded => {
        if (decoded) {
            draw();
        }
    });
}

/*
 * Bakurani is 54 levels of a few hundred polylines each. Stroking that on
 * every frame — twice, once for the casing — makes a drag visibly stutter,
 * and a drag redraws on every pointer move.
 *
 * So the layer is rasterised once into an offscreen canvas covering the
 * viewport plus a margin, and every frame after that is one drawImage. The
 * raster is rebuilt only when the zoom changes or a pan reaches the edge of
 * the margin, which is what makes the cost independent of how many lines
 * the map has.
 */
const CONTOUR_RASTER_MARGIN = 320;

/*
 * Path2D per level in the raster's own coordinates. Each level has its own
 * ramp colour, so they cannot be merged into one path.
 */
function buildContourPaths(data, v, originX, originY) {
    return data.levels.map(level => {
        const path = new Path2D();

        for (const points of level.lines) {
            for (let i = 0; i < points.length; i += 2) {
                const x =
                    (points[i] - v.bounds.minX) * v.scale - originX;

                const y =
                    (v.bounds.maxY - points[i + 1]) * v.scale - originY;

                if (i === 0) {
                    path.moveTo(x, y);
                } else {
                    path.lineTo(x, y);
                }
            }
        }

        return {
            path,
            color: level.color,
            width: level.major
                ? CONTOUR_STYLE.majorWidth
                : CONTOUR_STYLE.minorWidth,
            alpha: level.major
                ? CONTOUR_STYLE.majorAlpha
                : CONTOUR_STYLE.minorAlpha
        };
    });
}

/*
 * Renders the layer into `raster`, which covers the local-screen rectangle
 * starting at (originX, originY).
 */
function renderContourRaster(data, v, raster) {
    const target = raster.canvas.getContext('2d');
    const ratio = raster.ratio;

    target.setTransform(ratio, 0, 0, ratio, 0, 0);
    target.clearRect(0, 0, raster.width, raster.height);

    const paths = buildContourPaths(
        data,
        v,
        raster.originX,
        raster.originY
    );

    target.lineJoin = 'round';
    target.lineCap = 'round';

    /*
     * Every casing first, so one level's casing never cuts a dark notch
     * through a neighbouring line that runs alongside it.
     */
    target.strokeStyle = CONTOUR_STYLE.casing;

    for (const level of paths) {
        target.lineWidth = level.width + CONTOUR_STYLE.casingExtra;
        target.stroke(level.path);
    }

    for (const level of paths) {
        target.globalAlpha = level.alpha;
        target.strokeStyle = level.color;
        target.lineWidth = level.width;
        target.stroke(level.path);
    }

    target.globalAlpha = 1;
}

function drawContours(currentMap) {
    const mapId = currentMap?.id;

    if (!mapId || !mapHasContours(mapId)) {
        return;
    }

    ensureContoursLoaded(mapId);

    const data = cachedContours(mapId);

    if (!data) {
        return;
    }

    const v = view();

    /*
     * draw() has already translated by (v.left, v.top), so the visible
     * region in that space starts at (-v.left, -v.top).
     */
    const visibleX = -v.left;
    const visibleY = -v.top;
    const visibleWidth = wrap.clientWidth;
    const visibleHeight = wrap.clientHeight;

    const ratio = window.devicePixelRatio || 1;

    const width = visibleWidth + CONTOUR_RASTER_MARGIN * 2;
    const height = visibleHeight + CONTOUR_RASTER_MARGIN * 2;

    let raster = data.raster;

    const stale =
        !raster ||
        raster.scale !== v.scale ||
        raster.ratio !== ratio ||
        raster.width !== width ||
        raster.height !== height ||
        visibleX < raster.originX ||
        visibleY < raster.originY ||
        visibleX + visibleWidth > raster.originX + raster.width ||
        visibleY + visibleHeight > raster.originY + raster.height;

    if (stale) {
        if (!raster) {
            raster = { canvas: document.createElement('canvas') };
            data.raster = raster;
        }

        raster.scale = v.scale;
        raster.ratio = ratio;
        raster.width = width;
        raster.height = height;
        raster.originX = visibleX - CONTOUR_RASTER_MARGIN;
        raster.originY = visibleY - CONTOUR_RASTER_MARGIN;

        raster.canvas.width = Math.round(width * ratio);
        raster.canvas.height = Math.round(height * ratio);

        renderContourRaster(data, v, raster);
    }

    ctx.drawImage(
        raster.canvas,
        raster.originX,
        raster.originY,
        raster.width,
        raster.height
    );
}
