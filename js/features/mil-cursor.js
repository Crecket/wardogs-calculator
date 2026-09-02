/* =========================
   MIL UNDER CURSOR
   ========================= */

const MIL_CURSOR = {
    pending: null,
    queued: false
};

function milCursorHost() {
    return $('milCursor');
}

function hideMilCursor() {

    MIL_CURSOR.pending =
        null;

    setStyle(
        milCursorHost(),
        'display',
        'none'
    );
}

function milCursorVisible() {
    return (
        typeof isMapLayerVisible ===
        'function' &&
        isMapLayerVisible('milCursor')
    );
}

function milCursorRow(host, index) {

    const existing =
        host.children[index];

    if (existing) {
        return existing;
    }

    const row =
        document.createElement('div');

    row.className =
        'mil-cursor-row';

    const label =
        document.createElement('span');

    label.className =
        'mil-cursor-arc';

    row.appendChild(label);

    const value =
        document.createElement('strong');

    value.className =
        'mil-cursor-value';

    row.appendChild(value);

    host.appendChild(row);

    return row;
}

function milCursorRows(solutions, solved) {

    if (!solved) {
        return [
            {
                label: '',

                value:
                tr('noFiringSolution')
            }
        ];
    }

    if (solutions.single) {
        return [
            {
                label: '',

                value:
                formatMilValue(
                    solutions.single
                )
            }
        ];
    }

    const rows = [];

    if (solutions.low) {
        rows.push({
            label:
            tr('lowArc'),

            value:
            formatMilValue(
                solutions.low
            )
        });
    }

    if (solutions.high) {
        rows.push({
            label:
            tr('highArc'),

            value:
            formatMilValue(
                solutions.high
            )
        });
    }

    return rows;
}

function renderMilCursorRows(host, rows) {

    while (
        host.children.length >
        rows.length
    ) {
        host.lastElementChild.remove();
    }

    rows.forEach(
        (row, index) => {

            const node =
                milCursorRow(
                    host,
                    index
                );

            const label =
                node.firstElementChild;

            const value =
                node.lastElementChild;

            setText(
                label,
                row.label
            );

            if (
                label.hidden !==
                !row.label
            ) {
                label.hidden =
                    !row.label;
            }

            setText(
                value,
                row.value
            );
        }
    );
}

function milCursorTopOffset() {
    return (
        typeof isMapLayerVisible ===
        'function' &&
        isMapLayerVisible('cursorCoords')
    )
        ? 62
        : 14;
}

function renderMilCursor() {

    const pending =
        MIL_CURSOR.pending;

    MIL_CURSOR.pending =
        null;

    if (!pending) {
        return;
    }

    const host =
        milCursorHost();

    if (!host) {
        return;
    }

    const weapon =
        WEAPONS[S.weapon];

    if (!weapon) {
        hideMilCursor();
        return;
    }

    const geometry =
        firingGeometry(
            S.origin,
            pending.world
        );

    const elevation =
        solveFiringElevation(
            weapon,
            geometry.dMeters,
            S.origin,
            pending.world,
            false
        );

    setText(
        host.querySelector(
            '.mil-cursor-range'
        ),
        `${Math.round(geometry.dMeters)} m · ` +
        `${geometry.bearing.toFixed(1)}°`
    );

    const arcs =
        host.querySelector(
            '.mil-cursor-arcs'
        );

    if (arcs) {
        renderMilCursorRows(
            arcs,
            milCursorRows(
                elevation.solutions,
                elevation.solved
            )
        );
    }

    setStyle(
        host,
        'left',
        `${pending.x + 14}px`
    );

    setStyle(
        host,
        'top',
        `${pending.y + milCursorTopOffset()}px`
    );

    setStyle(
        host,
        'display',
        'block'
    );
}

function queueMilCursorRender() {

    if (MIL_CURSOR.queued) {
        return;
    }

    MIL_CURSOR.queued =
        true;

    requestAnimationFrame(
        () => {

            MIL_CURSOR.queued =
                false;

            renderMilCursor();
        }
    );
}

function updateMilCursor(event, world, canvasRect) {

    if (!milCursorVisible()) {
        hideMilCursor();
        return;
    }

    if (!WEAPONS[S.weapon]) {
        hideMilCursor();
        return;
    }

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
        hideMilCursor();
        return;
    }

    const rect =
        canvasRect ||
        c.getBoundingClientRect();

    MIL_CURSOR.pending = {
        x:
        event.clientX -
        rect.left,

        y:
        event.clientY -
        rect.top,

        world: {
            x: world.x,
            y: world.y
        }
    };

    queueMilCursorRender();
}
