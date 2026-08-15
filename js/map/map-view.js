/* =========================
   MAP
   ========================= */

function getCurrentMap() {

    if (
        S.map === 'custom'
    ) {
        return null;
    }

    return (
        MAPS[S.map] ||
        null
    );
}


/* =========================
   WORLD / VIEW BOUNDS
   ========================= */

function getViewBounds() {

    const map =
        getCurrentMap();

    if (
        map &&
        isValidBounds(
            map.bounds
        )
    ) {

        return {
            minX:
            map.bounds.minX,

            maxX:
            map.bounds.maxX,

            minY:
            map.bounds.minY,

            maxY:
            map.bounds.maxY
        };
    }

    return {
        minX: 0,
        maxX: S.w,

        minY: 0,
        maxY: S.h
    };
}


/* =========================
   VIEW
   ========================= */

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

    const availableWidth =
        Math.max(
            1,
            W -
            padding * 2
        );

    const availableHeight =
        Math.max(
            1,
            H -
            padding * 2
        );

    const scale =
        Math.min(
            availableWidth /
            worldWidth,

            availableHeight /
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


/* =========================
   WORLD -> SCREEN
   ========================= */

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


/* =========================
   SCREEN -> WORLD
   ========================= */

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


/* =========================
   CLAMP
   ========================= */

function clamp(p) {

    const bounds =
        getViewBounds();

    p.x =
        Math.max(
            bounds.minX,
            Math.min(
                bounds.maxX,
                Math.round(
                    p.x *
                    1000
                ) /
                1000
            )
        );

    p.y =
        Math.max(
            bounds.minY,
            Math.min(
                bounds.maxY,
                Math.round(
                    p.y *
                    1000
                ) /
                1000
            )
        );
}