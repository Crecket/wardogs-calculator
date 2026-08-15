/* =========================
   MAP HELPERS
   ========================= */

function formatCoord(value) {

    return Math.round(value)
        .toString()
        .padStart(4, '0');
}

function isValidBounds(bounds) {

    return Boolean(
        bounds &&
        typeof bounds.minX === 'number' &&
        typeof bounds.maxX === 'number' &&
        typeof bounds.minY === 'number' &&
        typeof bounds.maxY === 'number' &&
        bounds.maxX > bounds.minX &&
        bounds.maxY > bounds.minY
    );
}

function isValidTileConfig(tiles) {

    return Boolean(
        tiles &&
        typeof tiles.path === 'string' &&
        tiles.path.trim()
    );
}

function normalizeMap(map) {

    const normalized = {
        ...map
    };

    /*
     * Width / height describe the
     * complete game coordinate space.
     */
    normalized.w =
        typeof map.w === 'number' &&
        map.w > 0
            ? map.w
            : 10;

    normalized.h =
        typeof map.h === 'number' &&
        map.h > 0
            ? map.h
            : 10;

    /*
     * Optional calibrated image bounds.
     *
     * If no bounds are supplied,
     * the full map coordinate space
     * is used.
     */
    if (
        !isValidBounds(
            normalized.bounds
        )
    ) {

        normalized.bounds = {
            minX: 0,
            maxX: normalized.w,
            minY: 0,
            maxY: normalized.h
        };
    }

    /*
     * Normalize tile configuration.
     */
    if (
        isValidTileConfig(
            normalized.tiles
        )
    ) {

        normalized.tiles = {
            path:
                normalized.tiles.path
                    .replace(
                        /\/+$/,
                        ''
                    ),

            tileSize:
                typeof normalized.tiles.tileSize ===
                'number'
                    ? normalized.tiles.tileSize
                    : DEFAULT_TILE_SIZE,

            minZoom:
                typeof normalized.tiles.minZoom ===
                'number'
                    ? normalized.tiles.minZoom
                    : DEFAULT_TILE_MIN_ZOOM,

            maxZoom:
                typeof normalized.tiles.maxZoom ===
                'number'
                    ? normalized.tiles.maxZoom
                    : DEFAULT_TILE_MAX_ZOOM,

            extension:
                typeof normalized.tiles.extension ===
                'string' &&
                normalized.tiles.extension.trim()
                    ? normalized.tiles.extension
                        .replace(
                            /^\./,
                            ''
                        )
                    : DEFAULT_TILE_EXTENSION
        };

    } else {

        normalized.tiles =
            null;
    }

    normalized.markers =
        Array.isArray(map.markers)
            ? map.markers
            : [];

    normalized.zones =
        Array.isArray(map.zones)
            ? map.zones
            : [];

    normalized.polygons =
        Array.isArray(map.polygons)
            ? map.polygons
            : [];

    return normalized;
}


/* =========================
   LOAD MAPS
   ========================= */

async function loadMaps() {

    const index =
        await fetchJSON(
            'maps/index.json'
        );

    const files =
        Array.isArray(index)
            ? index
            : Array.isArray(index.maps)
                ? index.maps
                : [];

    if (!files.length) {

        throw new Error(
            'No maps found in maps/index.json'
        );
    }

    const loaded =
        await Promise.all(
            files.map(
                async item => {

                    const file =
                        typeof item === 'string'
                            ? item
                            : item.file;

                    if (!file) {
                        return null;
                    }

                    const map =
                        await fetchJSON(
                            `maps/${file}`
                        );

                    if (!map.id) {

                        throw new Error(
                            `Map ${file} has no id`
                        );
                    }

                    if (!map.name) {

                        throw new Error(
                            `Map ${file} has no name`
                        );
                    }

                    return normalizeMap(
                        map
                    );
                }
            )
        );

    MAPS = {};

    loaded
        .filter(Boolean)
        .forEach(
            map => {

                MAPS[map.id] =
                    map;
            }
        );

    populateMapSelect();
}


/* =========================
   MAP SELECT
   ========================= */

function populateMapSelect() {

    const select =
        $('mapSelect');

    select.innerHTML = '';

    /*
     * Preset maps first.
     */
    Object.values(MAPS)
        .forEach(
            map => {

                const option =
                    document.createElement(
                        'option'
                    );

                option.value =
                    map.id;

                option.textContent =
                    map.name;

                select.appendChild(
                    option
                );
            }
        );

    /*
     * Custom map always last.
     */
    const custom =
        document.createElement(
            'option'
        );

    custom.value =
        'custom';

    custom.textContent =
        tr('customMap');

    select.appendChild(
        custom
    );

    /*
     * If configured default map doesn't
     * exist for some reason, fall back
     * to the first available map.
     */
    if (
        S.map !== 'custom' &&
        !MAPS[S.map]
    ) {

        const firstMap =
            Object.values(
                MAPS
            )[0];

        S.map =
            firstMap
                ? firstMap.id
                : 'custom';
    }

    select.value =
        S.map;
}