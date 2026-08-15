/* =========================
   MAPS
   ========================= */

function formatCoord(value) {

    return Math.round(value)
        .toString()
        .padStart(4, '0');
}

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

                    return map;
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

    if (MAPS.bakurani) {

        MAPS.bakurani.w =
            16;

        MAPS.bakurani.h =
            16;

        MAPS.bakurani.tilePath =
            'maps/tiles/bakurani';
    }

    populateMapSelect();
}

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
     * Custom map is always last.
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

    select.value =
        S.map;
}

/* =========================
   WORLD / VIEW BOUNDS
   ========================= */

function getViewBounds() {

    if (
        S.map === 'bakurani'
    ) {

        return {
            minX:
            BAKURANI_BOUNDS.minX,

            maxX:
            BAKURANI_BOUNDS.maxX,

            minY:
            BAKURANI_BOUNDS.minY,

            maxY:
            BAKURANI_BOUNDS.maxY
        };
    }

    return {
        minX: 0,
        maxX: S.w,

        minY: 0,
        maxY: S.h
    };
}
