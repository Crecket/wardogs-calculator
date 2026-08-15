/* =========================
   TILE MAP
   ========================= */

function getTileZoom() {

    const bounds =
        BAKURANI_BOUNDS;

    const worldWidth =
        bounds.maxX -
        bounds.minX;

    const basePixelsPerKm =
        TILE_SIZE /
        worldWidth;

    const desiredPixelsPerKm =
        view().scale;

    const raw =
        Math.log2(
            desiredPixelsPerKm /
            basePixelsPerKm
        );

    return Math.max(
        TILE_MIN_ZOOM,
        Math.min(
            TILE_MAX_ZOOM,
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

function loadTile(
    mapId,
    zoom,
    x,
    y
) {

    const key =
        tileKey(
            mapId,
            zoom,
            x,
            y
        );

    if (
        TILE_CACHE.has(key)
    ) {
        return TILE_CACHE.get(
            key
        );
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
                `Failed to load tile: ${mapId}/zoom_${zoom}/${x}_${y}.webp`
            );

            draw();
        };

    image.src =
        resourceURL(
            `maps/tiles/${mapId}/zoom_${zoom}/${x}_${y}.webp`
        );

    TILE_CACHE.set(
        key,
        tile
    );

    return tile;
}

function drawTileMap(map) {

    if (
        !map ||
        map.id !== 'bakurani'
    ) {
        return;
    }

    const v =
        view();

    const bounds =
        BAKURANI_BOUNDS;

    const zoom =
        getTileZoom();

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

    for (
        let tileY =
            minTileY;

        tileY <=
        maxTileY;

        tileY++
    ) {

        const tileWorldTop =
            bounds.maxY -
            tileY *
            tileWorldHeight;

        for (
            let tileX =
                minTileX;

            tileX <=
            maxTileX;

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
                    map.id,
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


/* =========================
   CANVAS
   ========================= */

function resize() {

    const d =
        window.devicePixelRatio ||
        1;

    c.width =
        wrap.clientWidth *
        d;

    c.height =
        wrap.clientHeight *
        d;

    ctx.setTransform(
        d,
        0,
        0,
        d,
        0,
        0
    );

    draw();
}

function view() {

    const W =
        wrap.clientWidth;

    const H =
        wrap.clientHeight;

    const padding =
        34;

    const bounds =
        getViewBounds();

    const worldWidth =
        bounds.maxX -
        bounds.minX;

    const worldHeight =
        bounds.maxY -
        bounds.minY;

    const scale =
        Math.min(
            (
                W -
                padding *
                2
            ) /
            worldWidth,

            (
                H -
                padding *
                2
            ) /
            worldHeight
        ) *
        S.zoom;

    const mw =
        worldWidth *
        scale;

    const mh =
        worldHeight *
        scale;

    return {
        scale,

        bounds,

        worldWidth,
        worldHeight,

        left:
            (
                W -
                mw
            ) /
            2 +
            S.panX,

        top:
            (
                H -
                mh
            ) /
            2 +
            S.panY,

        mw,
        mh
    };
}

function worldToLocalScreen(
    x,
    y
) {

    const v =
        view();

    return {
        x:
            (
                x -
                v.bounds.minX
            ) *
            v.scale,

        y:
            (
                v.bounds.maxY -
                y
            ) *
            v.scale
    };
}

function toScreen(
    x,
    y
) {

    const v =
        view();

    const local =
        worldToLocalScreen(
            x,
            y
        );

    return {
        x:
            v.left +
            local.x,

        y:
            v.top +
            local.y
    };
}

function toWorld(
    x,
    y
) {

    const v =
        view();

    return {
        x:
            v.bounds.minX +
            (
                x -
                v.left
            ) /
            v.scale,

        y:
            v.bounds.maxY -
            (
                y -
                v.top
            ) /
            v.scale
    };
}

function clamp(p) {

    if (
        S.map === 'bakurani'
    ) {

        p.x =
            Math.max(
                BAKURANI_BOUNDS.minX,
                Math.min(
                    BAKURANI_BOUNDS.maxX,
                    Math.round(
                        p.x *
                        1000
                    ) /
                    1000
                )
            );

        p.y =
            Math.max(
                BAKURANI_BOUNDS.minY,
                Math.min(
                    BAKURANI_BOUNDS.maxY,
                    Math.round(
                        p.y *
                        1000
                    ) /
                    1000
                )
            );

        return;
    }

    p.x =
        Math.max(
            0,
            Math.min(
                S.w,
                Math.round(
                    p.x *
                    1000
                ) /
                1000
            )
        );

    p.y =
        Math.max(
            0,
            Math.min(
                S.h,
                Math.round(
                    p.y *
                    1000
                ) /
                1000
            )
        );
}
