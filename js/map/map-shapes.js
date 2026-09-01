/* =========================
   MAP SHAPES
   ========================= */

const MAP_SHAPE_TYPES = [
    'line',
    'arrow',
    'rect',
    'circle'
];

const MAP_SHAPE_LABEL_KEYS = {
    line: 'mapToolShapeLine',
    arrow: 'mapToolShapeArrow',
    rect: 'mapToolShapeRect',
    circle: 'mapToolShapeCircle'
};

const MAP_SHAPE_ICONS = {
    line:
        '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5 19 19 5"/></svg>',
    arrow:
        '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 19 19 5"/><path d="M11 5h8v8"/></svg>',
    rect:
        '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linejoin="round"><rect x="4.5" y="6.5" width="15" height="11" rx="1"/></svg>',
    circle:
        '<svg aria-hidden="true" viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="1.8"><circle cx="12" cy="12" r="7.5"/></svg>'
};

const MAP_SHAPE_MIN_DRAG_PX = 4;

const MAP_SHAPE_ARROW_HEAD_PX = 14;

const MAP_SHAPE_ARROW_HEAD_ANGLE = 0.45;

function normalizeMapShapeType(value) {
    return MAP_SHAPE_TYPES.includes(value)
        ? value
        : null;
}

function isMapShapeDrawing(path) {
    return Boolean(
        path &&
        normalizeMapShapeType(path.type)
    );
}

function getActiveMapShapeType() {
    return (
        normalizeMapShapeType(
            MAP_TOOL_STATE.shapeType
        ) || 'line'
    );
}

function setActiveMapShapeType(type) {
    MAP_TOOL_STATE.shapeType =
        normalizeMapShapeType(type) || 'line';
}

function buildMapShapePalette() {
    const container =
        $('shapePalette');

    if (!container) {
        return;
    }

    container.innerHTML = '';

    const shapeRow =
        document.createElement('div');

    shapeRow.className =
        'map-tool-shape-row';

    MAP_SHAPE_TYPES.forEach(type => {
        const button =
            document.createElement('button');

        button.type = 'button';
        button.className =
            'map-tool-button map-tool-shape-option';
        button.dataset.shape = type;
        button.innerHTML =
            MAP_SHAPE_ICONS[type];

        const title =
            tr(MAP_SHAPE_LABEL_KEYS[type]);

        button.title = title;
        button.setAttribute(
            'aria-label',
            title
        );

        button.addEventListener(
            'click',
            event => {
                event.stopPropagation();

                setActiveMapShapeType(type);

                MAP_TOOL_STATE.tool =
                    'shapes';

                updateMapToolsUI();
            }
        );

        shapeRow.appendChild(button);
    });

    container.appendChild(shapeRow);

    const colorRow =
        document.createElement('div');

    colorRow.className =
        'map-tool-shape-colors';

    MAP_TOOL_COLORS.forEach(item => {
        const button =
            document.createElement('button');

        button.type = 'button';
        button.className =
            'map-tool-color';
        button.dataset.color =
            item.color;

        const title =
            tr(item.titleKey);

        button.title = title;
        button.setAttribute(
            'aria-label',
            title
        );
        button.style.setProperty(
            '--tool-color',
            item.color
        );

        button.addEventListener(
            'click',
            event => {
                event.stopPropagation();

                MAP_TOOL_STATE.pencilColor =
                    item.color;

                MAP_TOOL_STATE.tool =
                    'shapes';

                updateMapToolsUI();
            }
        );

        colorRow.appendChild(button);
    });

    container.appendChild(colorRow);
}

function updateMapShapePaletteUI() {
    document
        .querySelectorAll('.map-tool-shape-option')
        .forEach(button => {
            button.classList.toggle(
                'active',
                button.dataset.shape ===
                getActiveMapShapeType()
            );
        });
}

function beginMapShapeDrag(world) {
    const path = {
        id: mapToolId(),
        mapId: currentMapToolMapId(),
        type: getActiveMapShapeType(),
        color: MAP_TOOL_STATE.pencilColor,
        points: [
            {
                x: world.x,
                y: world.y
            },
            {
                x: world.x,
                y: world.y
            }
        ]
    };

    MAP_TOOL_STATE.activePath = path;
    MAP_TOOL_STATE.shapeDragging = true;

    draw();
}

function updateMapShapeDrag(world) {
    const path =
        MAP_TOOL_STATE.activePath;

    if (!path) {
        return;
    }

    path.points[1] = {
        x: world.x,
        y: world.y
    };

    draw();
}

function mapShapeDragIsLongEnough(path) {
    const a =
        toScreen(
            path.points[0].x,
            path.points[0].y
        );

    const b =
        toScreen(
            path.points[1].x,
            path.points[1].y
        );

    return (
        Math.hypot(
            b.x - a.x,
            b.y - a.y
        ) >= MAP_SHAPE_MIN_DRAG_PX
    );
}

function finishMapShapeDrag() {
    MAP_TOOL_STATE.shapeDragging = false;

    const path =
        MAP_TOOL_STATE.activePath;

    MAP_TOOL_STATE.activePath = null;

    if (
        path &&
        mapShapeDragIsLongEnough(path)
    ) {
        pushMapToolHistory();
        MAP_TOOL_STATE.drawings.push(path);
        saveMapToolState();

        if (
            typeof collabOnDrawingAdded ===
            'function'
        ) {
            collabOnDrawingAdded(path);
        }

        if (
            typeof trackAnalytics ===
            'function'
        ) {
            trackAnalytics(
                'drawing-created',
                {
                    map: S.map
                }
            );
        }
    }

    draw();
}

function drawMapShapePath(path) {
    const a =
        worldToLocalScreen(
            path.points[0].x,
            path.points[0].y
        );

    const b =
        worldToLocalScreen(
            path.points[1].x,
            path.points[1].y
        );

    ctx.save();
    ctx.strokeStyle =
        path.color || '#d7a452';
    ctx.lineWidth = 3;
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    if (path.type === 'rect') {
        ctx.beginPath();
        ctx.rect(
            Math.min(a.x, b.x),
            Math.min(a.y, b.y),
            Math.abs(b.x - a.x),
            Math.abs(b.y - a.y)
        );
        ctx.stroke();
        ctx.restore();
        return;
    }

    if (path.type === 'circle') {
        const radius =
            Math.hypot(
                b.x - a.x,
                b.y - a.y
            );

        ctx.beginPath();
        ctx.arc(
            a.x,
            a.y,
            radius,
            0,
            Math.PI * 2
        );
        ctx.stroke();
        ctx.restore();
        return;
    }

    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();

    if (path.type === 'arrow') {
        const length =
            Math.hypot(
                b.x - a.x,
                b.y - a.y
            );

        if (length > 0) {
            const angle =
                Math.atan2(
                    b.y - a.y,
                    b.x - a.x
                );

            const head =
                Math.min(
                    MAP_SHAPE_ARROW_HEAD_PX,
                    length * 0.5
                );

            ctx.beginPath();
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(
                b.x -
                head *
                Math.cos(
                    angle - MAP_SHAPE_ARROW_HEAD_ANGLE
                ),
                b.y -
                head *
                Math.sin(
                    angle - MAP_SHAPE_ARROW_HEAD_ANGLE
                )
            );
            ctx.moveTo(b.x, b.y);
            ctx.lineTo(
                b.x -
                head *
                Math.cos(
                    angle + MAP_SHAPE_ARROW_HEAD_ANGLE
                ),
                b.y -
                head *
                Math.sin(
                    angle + MAP_SHAPE_ARROW_HEAD_ANGLE
                )
            );
            ctx.stroke();
        }
    }

    ctx.restore();
}

function mapShapeSegmentHit(
    canvasX,
    canvasY,
    segments
) {
    let best = null;

    segments.forEach(segment => {
        const hit =
            pointToSegmentDistance(
                canvasX,
                canvasY,
                segment[0].x,
                segment[0].y,
                segment[1].x,
                segment[1].y
            );

        if (
            !best ||
            hit.distance < best.distance
        ) {
            best = {
                distance: hit.distance,
                x:
                    segment[0].x +
                    (
                        segment[1].x -
                        segment[0].x
                    ) * hit.t,
                y:
                    segment[0].y +
                    (
                        segment[1].y -
                        segment[0].y
                    ) * hit.t
            };
        }
    });

    return best;
}

function findMapShapeHitAtCanvasPoint(
    path,
    canvasX,
    canvasY
) {
    const a =
        toScreen(
            path.points[0].x,
            path.points[0].y
        );

    const b =
        toScreen(
            path.points[1].x,
            path.points[1].y
        );

    let hit = null;

    if (path.type === 'rect') {
        const left = Math.min(a.x, b.x);
        const right = Math.max(a.x, b.x);
        const top = Math.min(a.y, b.y);
        const bottom = Math.max(a.y, b.y);

        const corners = [
            { x: left, y: top },
            { x: right, y: top },
            { x: right, y: bottom },
            { x: left, y: bottom }
        ];

        hit =
            mapShapeSegmentHit(
                canvasX,
                canvasY,
                [
                    [corners[0], corners[1]],
                    [corners[1], corners[2]],
                    [corners[2], corners[3]],
                    [corners[3], corners[0]]
                ]
            );
    } else if (path.type === 'circle') {
        const radius =
            Math.hypot(
                b.x - a.x,
                b.y - a.y
            );

        const offsetX = canvasX - a.x;
        const offsetY = canvasY - a.y;

        const distance =
            Math.hypot(offsetX, offsetY);

        const scale =
            distance > 0
                ? radius / distance
                : 0;

        hit = {
            distance:
                Math.abs(distance - radius),
            x:
                distance > 0
                    ? a.x + offsetX * scale
                    : a.x + radius,
            y:
                distance > 0
                    ? a.y + offsetY * scale
                    : a.y
        };
    } else {
        hit =
            mapShapeSegmentHit(
                canvasX,
                canvasY,
                [[a, b]]
            );
    }

    if (
        !hit ||
        hit.distance > MAP_TOOL_ERASER_THRESHOLD_PX
    ) {
        return null;
    }

    return {
        id: path.id,
        distance: hit.distance,
        point:
            toWorld(hit.x, hit.y)
    };
}
