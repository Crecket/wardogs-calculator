/* =========================
   CURSOR
   ========================= */

function updateCursor(e) {

    const rect =
        c.getBoundingClientRect();

    const x =
        e.clientX -
        rect.left;

    const y =
        e.clientY -
        rect.top;

    const world =
        toWorld(
            x,
            y
        );

    const bounds =
        getViewBounds();

    if (
        world.x <
        bounds.minX ||
        world.x >
        bounds.maxX ||
        world.y <
        bounds.minY ||
        world.y >
        bounds.maxY
    ) {

        $('cursorCoords')
            .style.display =
            'none';

        return;
    }

    const cursor =
        $('cursorCoords');

    cursor.style.display =
        'block';

    cursor.style.left =
        `${x + 14}px`;

    cursor.style.top =
        `${y + 14}px`;

    cursor.querySelector(
        '.cursor-x'
    ).textContent =
        `x${formatGameCoordinate(world.x)}`;

    cursor.querySelector(
        '.cursor-y'
    ).textContent =
        `y${formatGameCoordinate(world.y)}`;
}
