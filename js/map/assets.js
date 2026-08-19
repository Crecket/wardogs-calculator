/* =========================
   MAP ASSETS
   ========================= */

function normalizeMarkerAsset(
    id,
    asset
) {

    if (
        typeof asset === 'string'
    ) {

        return {
            id,
            path: asset,
            width: 32,
            height: 32,
            anchorX: 0.5,
            anchorY: 0.5,
            placeable: true
        };
    }

    if (
        !asset ||
        typeof asset !== 'object' ||
        typeof asset.path !== 'string' ||
        !asset.path.trim()
    ) {
        return null;
    }

    return {
        id,

        path:
            asset.path.trim(),

        width:
            typeof asset.width === 'number' &&
            asset.width > 0
                ? asset.width
                : 32,

        height:
            typeof asset.height === 'number' &&
            asset.height > 0
                ? asset.height
                : 32,

        anchorX:
            typeof asset.anchorX === 'number'
                ? Math.max(
                    0,
                    Math.min(
                        1,
                        asset.anchorX
                    )
                )
                : 0.5,

        anchorY:
            typeof asset.anchorY === 'number'
                ? Math.max(
                    0,
                    Math.min(
                        1,
                        asset.anchorY
                    )
                )
                : 0.5,

        placeable:
            asset.placeable !== false
    };
}

async function loadMapAssets() {

    const data =
        await fetchJSON(
            'maps/assets.json'
        );

    const source =
        data &&
        typeof data === 'object' &&
        data.markerIcons &&
        typeof data.markerIcons === 'object'
            ? data.markerIcons
            : {};

    MAP_ASSETS = {};

    Object.entries(source)
        .forEach(
            ([id, asset]) => {

                const normalized =
                    normalizeMarkerAsset(
                        id,
                        asset
                    );

                if (normalized) {
                    MAP_ASSETS[id] =
                        normalized;
                }
            }
        );
}

function getMarkerAsset(id) {

    if (
        typeof id !== 'string' ||
        !id
    ) {
        return null;
    }

    return (
        MAP_ASSETS[id] ||
        null
    );
}

function loadMarkerImage(asset) {

    if (!asset) {
        return null;
    }

    const key =
        asset.path;

    if (
        MARKER_IMAGE_CACHE.has(
            key
        )
    ) {
        return MARKER_IMAGE_CACHE.get(
            key
        );
    }

    const image =
        new Image();

    image.decoding =
        'async';

    const entry = {
        image,
        loaded: false,
        failed: false
    };

    image.onload =
        () => {

            entry.loaded =
                true;

            draw();
        };

    image.onerror =
        () => {

            entry.failed =
                true;

            console.warn(
                `Failed to load marker image: ${asset.path}`
            );

            draw();
        };

    image.src =
        resourceURL(
            asset.path
        );

    MARKER_IMAGE_CACHE.set(
        key,
        entry
    );

    return entry;
}


/* =========================
   MAP ICON APPEARANCE
   ========================= */

function getMapIconCanvasFilter() {

    return (
        document.documentElement
            .dataset.theme === 'light'
            ? 'brightness(0.88) saturate(0.92) contrast(1.06)'
            : 'none'
    );
}
