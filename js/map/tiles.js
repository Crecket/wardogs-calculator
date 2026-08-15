/* =========================
   TILE MAP
   ========================= */

function getTileConfig(map) {

    if (
        !map ||
        !map.tiles ||
        !isValidTileConfig(map.tiles) ||
        !isValidBounds(map.bounds)
    ) {
        return null;
    }

    return map.tiles;
}

function getTileZoom(map) {

    const tiles =
        getTileConfig(map);

    if (!tiles) {
        return null;
    }

    const bounds =
        map.bounds;

    const worldWidth =
        bounds.maxX -
        bounds.minX;

    const basePixelsPerKm =
        tiles.tileSize /
        worldWidth;

    const desiredPixelsPerKm =
        view().scale;

    const raw =
        Math.log2(
            desiredPixelsPerKm /
            basePixelsPerKm
        );

    return Math.max(
        tiles.minZoom,
        Math.min(
            tiles.maxZoom,
            Math.round(raw)
        )
    );
}

function tileKey(
    mapId,
    zoom,
    x,
    y
) {

    return `${mapId}:${zoom}:${x}:${y}`;
}

function getTileURL(
    map,
    zoom,
    x,
    y
) {

    const tiles =
        getTileConfig(map);

    if (!tiles) {
        return null;
    }

    return resourceURL(
        `${tiles.path}/zoom_${zoom}/${x}_${y}.${tiles.extension}`
    );
}

function loadTile(
    map,
    zoom,
    x,
    y
) {

    const key =
        tileKey(
            map.id,
            zoom,
            x,
            y
        );

    if (
        TILE_CACHE.has(key)
    ) {
        return TILE_CACHE.get(key);
    }

    const image =
        new Image();

    image.decoding =
        'async';

    const tile = {
        image,
        loaded: false,
        failed: false
    };

    image.onload =
        () => {

            tile.loaded =
                true;

            draw();
        };

    image.onerror =
        () => {

            tile.failed =
                true;

            console.warn(
                `Failed to load tile: ${getTileURL(
                    map,
                    zoom,
                    x,
                    y
                )}`
            );

            draw();
        };

    image.src =
        getTileURL(
            map,
            zoom,
            x,
            y
        );

    TILE_CACHE.set(
        key,
        tile
    );

    return tile;
}

function drawTileMap(map) {

    const tiles =
        getTileConfig(map);

    if (!tiles) {
        return;
    }

    const v =
        view();

    const bounds =
        map.bounds;

    const zoom =
        getTileZoom(map);

    if (
        zoom === null
    ) {
        return;
    }

    const tileCount =
        Math.pow(
            2,
            zoom
        );

    const worldWidth =
        bounds.maxX -
        bounds.minX;

    const worldHeight =
        bounds.maxY -
        bounds.minY;

    const tileWorldWidth =
        worldWidth /
        tileCount;

    const tileWorldHeight =
        worldHeight /
        tileCount;

    const tileScreenWidth =
        tileWorldWidth *
        v.scale;

    const tileScreenHeight =
        tileWorldHeight *
        v.scale;

    const topLeft =
        toWorld(
            0,
            0
        );

    const bottomRight =
        toWorld(
            wrap.clientWidth,
            wrap.clientHeight
        );

    const visibleLeft =
        Math.min(
            topLeft.x,
            bottomRight.x
        );

    const visibleRight =
        Math.max(
            topLeft.x,
            bottomRight.x
        );

    const visibleBottom =
        Math.min(
            topLeft.y,
            bottomRight.y
        );

    const visibleTop =
        Math.max(
            topLeft.y,
            bottomRight.y
        );

    const worldLeft =
        Math.max(
            bounds.minX,
            visibleLeft
        );

    const worldRight =
        Math.min(
            bounds.maxX,
            visibleRight
        );

    const worldBottom =
        Math.max(
            bounds.minY,
            visibleBottom
        );

    const worldTop =
        Math.min(
            bounds.maxY,
            visibleTop
        );

    if (
        worldLeft >= worldRight ||
        worldBottom >= worldTop
    ) {
        return;
    }

    const minTileX =
        Math.max(
            0,
            Math.floor(
                (
                    worldLeft -
                    bounds.minX
                ) /
                tileWorldWidth
            ) - 1
        );

    const maxTileX =
        Math.min(
            tileCount - 1,
            Math.floor(
                (
                    worldRight -
                    bounds.minX
                ) /
                tileWorldWidth
            ) + 1
        );

    const minTileY =
        Math.max(
            0,
            Math.floor(
                (
                    bounds.maxY -
                    worldTop
                ) /
                tileWorldHeight
            ) - 1
        );

    const maxTileY =
        Math.min(
            tileCount - 1,
            Math.floor(
                (
                    bounds.maxY -
                    worldBottom
                ) /
                tileWorldHeight
            ) + 1
        );

    ctx.save();

    ctx.beginPath();

    ctx.rect(
        0,
        0,
        v.mw,
        v.mh
    );

    ctx.clip();

    for (
        let tileY = minTileY;
        tileY <= maxTileY;
        tileY++
    ) {

        const tileWorldTop =
            bounds.maxY -
            tileY *
            tileWorldHeight;

        for (
            let tileX = minTileX;
            tileX <= maxTileX;
            tileX++
        ) {

            const tileWorldLeft =
                bounds.minX +
                tileX *
                tileWorldWidth;

            const screen =
                worldToLocalScreen(
                    tileWorldLeft,
                    tileWorldTop
                );

            const tile =
                loadTile(
                    map,
                    zoom,
                    tileX,
                    tileY
                );

            if (
                tile.loaded &&
                !tile.failed
            ) {

                ctx.drawImage(
                    tile.image,
                    screen.x,
                    screen.y,
                    tileScreenWidth + 0.5,
                    tileScreenHeight + 0.5
                );

            } else {

                ctx.fillStyle =
                    '#151a1d';

                ctx.fillRect(
                    screen.x,
                    screen.y,
                    tileScreenWidth + 0.5,
                    tileScreenHeight + 0.5
                );
            }
        }
    }

    ctx.restore();
}
