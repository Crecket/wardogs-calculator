/* =========================
   DRAW
   ========================= */

function draw() {

    if (!wrap) {
        return;
    }

    const W =
        wrap.clientWidth;

    const H =
        wrap.clientHeight;

    const v =
        view();

    ctx.clearRect(
        0,
        0,
        W,
        H
    );

    const styles =
        getComputedStyle(
            document.documentElement
        );

    ctx.fillStyle =
        styles
            .getPropertyValue(
                '--map-bg'
            )
            .trim() ||
        '#0d1012';

    ctx.fillRect(
        0,
        0,
        W,
        H
    );

    ctx.save();

    ctx.translate(
        v.left,
        v.top
    );

    ctx.fillStyle =
        styles
            .getPropertyValue(
                '--panel-bg'
            )
            .trim() ||
        '#151a1d';

    ctx.fillRect(
        0,
        0,
        v.mw,
        v.mh
    );

    const currentMap =
        MAPS[S.map];

    /*
     * Layer 1:
     * base map tiles.
     */
    if (
        currentMap &&
        currentMap.id ===
        'bakurani'
    ) {

        drawTileMap(
            currentMap
        );
    }

    /*
     * Layer 2:
     * coordinate grid.
     */
    drawGrid();

    drawCoordinateLabels();

    /*
     * Layer 3:
     * circular zones.
     */
    drawPresetZones(
        currentMap
    );

    /*
     * Layer 4:
     * arbitrary polygons.
     */
    drawPresetPolygons(
        currentMap
    );

    const a =
        worldToLocalScreen(
            S.origin.x,
            S.origin.y
        );

    const b =
        worldToLocalScreen(
            S.target.x,
            S.target.y
        );

    const rangePx =
        WEAPONS[S.weapon].range *
        v.scale;

    /*
     * Layer 5:
     * artillery range.
     */
    ctx.beginPath();

    ctx.arc(
        a.x,
        a.y,
        rangePx,
        0,
        Math.PI * 2
    );

    ctx.fillStyle =
        'rgba(215,164,82,.08)';

    ctx.fill();

    ctx.strokeStyle =
        '#d7a452';

    ctx.lineWidth =
        2;

    ctx.setLineDash([
        7,
        5
    ]);

    ctx.stroke();

    ctx.setLineDash([]);

    /*
     * Layer 6:
     * origin -> target line.
     */
    ctx.strokeStyle =
        '#d7a452';

    ctx.lineWidth =
        2;

    ctx.setLineDash([
        8,
        6
    ]);

    ctx.beginPath();

    ctx.moveTo(
        a.x,
        a.y
    );

    ctx.lineTo(
        b.x,
        b.y
    );

    ctx.stroke();

    ctx.setLineDash([]);

    /*
     * Layer 7:
     * artillery / target markers.
     */
    marker(
        S.origin,
        'O'
    );

    marker(
        S.target,
        'T'
    );

    /*
     * Layer 8:
     * preset icons are ALWAYS drawn last.
     *
     * This prevents tiles, grid, zones,
     * polygons and artillery overlays from
     * covering map icons.
     */
    drawPresetMarkers(
        currentMap
    );

    ctx.restore();

    result();
}
