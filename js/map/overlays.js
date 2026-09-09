/* =========================
   USER MARKERS
   ========================= */

function marker(
    p,
    text,
    fill
) {

    const pos =
        worldToLocalScreen(
            p.x,
            p.y
        );

    ctx.beginPath();

    ctx.arc(
        pos.x,
        pos.y,
        8,
        0,
        Math.PI * 2
    );

    ctx.fillStyle =
        fill ||
        (
            text === 'O'
                ? '#5fa8d3'
                : '#d86666'
        );

    ctx.fill();

    ctx.strokeStyle =
        '#fff';

    ctx.lineWidth =
        2;

    ctx.stroke();

    ctx.fillStyle =
        '#fff';

    ctx.font =
        'bold 10px system-ui';

    ctx.textAlign =
        'center';

    ctx.textBaseline =
        'alphabetic';

    ctx.fillText(
        text,
        pos.x,
        pos.y + 4
    );
}


/* =========================
   SAVED TARGET MARKERS
   ========================= */

const SAVED_TARGET_MARKER_ALPHA = 0.7;

const SAVED_TARGET_MARKER_FILL = '#efb469';

function drawSavedTargets() {

    if (
        typeof savedTargets === 'undefined' ||
        !savedTargets.length
    ) {
        return;
    }

    const activeIds =
        typeof activeSavedTargetIds === 'function'
            ? activeSavedTargetIds()
            : null;

    ctx.save();

    ctx.globalAlpha =
        SAVED_TARGET_MARKER_ALPHA;

    savedTargets.forEach(
        (target, index) => {

            if (
                activeIds &&
                activeIds.has(
                    String(target.id)
                )
            ) {
                return;
            }

            const x =
                Number(target.x);

            const y =
                Number(target.y);

            if (
                !Number.isFinite(x) ||
                !Number.isFinite(y)
            ) {
                return;
            }

            marker(
                {
                    x,
                    y
                },
                'T',
                SAVED_TARGET_MARKER_FILL
            );

            const at =
                worldToLocalScreen(
                    x,
                    y
                );

            ctx.font =
                'bold 11px system-ui';

            ctx.textAlign =
                'center';

            ctx.textBaseline =
                'alphabetic';

            ctx.lineWidth =
                3;

            ctx.strokeStyle =
                'rgba(0, 0, 0, .75)';

            ctx.strokeText(
                String(index + 1),
                at.x,
                at.y - 12
            );

            ctx.fillStyle =
                SAVED_TARGET_MARKER_FILL;

            ctx.fillText(
                String(index + 1),
                at.x,
                at.y - 12
            );
        }
    );

    ctx.restore();
}


/* =========================
   RADIUS RINGS
   ========================= */

/*
 * One dashed circle of a given in-game radius, drawn in screen space.
 */
function drawRadiusRing(
    worldX,
    worldY,
    radiusMeters,
    color,
    label,
    {
        fill = true,
        dash = [7, 5]
    } = {}
) {

    const v =
        view();

    const pos =
        worldToLocalScreen(
            worldX,
            worldY
        );

    const radius =
        metersToWorldDistance(
            radiusMeters
        ) *
        v.scale;

    if (
        !Number.isFinite(radius) ||
        radius <= 0
    ) {
        return;
    }

    const stroke =
        color ||
        '#d7a452';

    ctx.beginPath();

    ctx.arc(
        pos.x,
        pos.y,
        radius,
        0,
        Math.PI * 2
    );

    if (fill) {

        ctx.fillStyle =
            hexToRgba(
                stroke,
                0.12
            );

        ctx.fill();
    }

    ctx.strokeStyle =
        stroke;

    ctx.lineWidth =
        2;

    ctx.setLineDash(
        dash
    );

    ctx.stroke();

    ctx.setLineDash([]);

    if (!label) {
        return;
    }

    /*
     * The label rides the top edge rather than the centre, where the
     * marker icon sits and where overlapping shapes would stack their
     * text on top of each other.
     */
    ctx.save();

    ctx.font =
        '600 12px system-ui, sans-serif';

    ctx.textAlign =
        'center';

    ctx.textBaseline =
        'bottom';

    ctx.lineWidth =
        3;

    ctx.strokeStyle =
        'rgba(0, 0, 0, 0.75)';

    ctx.strokeText(
        label,
        pos.x,
        pos.y - radius - 4
    );

    ctx.fillStyle =
        stroke;

    ctx.fillText(
        label,
        pos.x,
        pos.y - radius - 4
    );

    ctx.restore();
}

/*
 * A FOB's build area is a square, not a circle, so it gets its own
 * primitive. `halfExtent` is the in-game distance from the centre to an
 * edge — the full side is twice that. `rotationDegrees` turns the square
 * about its centre, because a FOB dropped in-game rarely lands square
 * with the world grid.
 */
function drawRadiusSquare(
    worldX,
    worldY,
    halfExtentMeters,
    color,
    label,
    rotationDegrees = 0
) {

    const v =
        view();

    const pos =
        worldToLocalScreen(
            worldX,
            worldY
        );

    const half =
        metersToWorldDistance(
            halfExtentMeters
        ) *
        v.scale;

    if (
        !Number.isFinite(half) ||
        half <= 0
    ) {
        return;
    }

    const stroke =
        color ||
        '#d7a452';

    const side =
        half * 2;

    const angle =
        (
            Number(rotationDegrees) || 0
        ) *
        Math.PI /
        180;

    ctx.save();

    ctx.translate(
        pos.x,
        pos.y
    );

    ctx.rotate(angle);

    ctx.fillStyle =
        hexToRgba(
            stroke,
            0.12
        );

    ctx.fillRect(
        -half,
        -half,
        side,
        side
    );

    ctx.strokeStyle =
        stroke;

    ctx.lineWidth =
        2;

    ctx.setLineDash([
        7,
        5
    ]);

    ctx.strokeRect(
        -half,
        -half,
        side,
        side
    );

    ctx.setLineDash([]);

    ctx.restore();

    if (!label) {
        return;
    }

    /*
     * The label stays upright and clears the square's topmost corner,
     * which swings out to half the diagonal as the square turns.
     */
    const labelOffset =
        half *
        Math.max(
            Math.abs(
                Math.cos(angle)
            ) +
            Math.abs(
                Math.sin(angle)
            ),
            1
        );

    ctx.save();

    ctx.font =
        '600 12px system-ui, sans-serif';

    ctx.textAlign =
        'center';

    ctx.textBaseline =
        'bottom';

    ctx.lineWidth =
        3;

    ctx.strokeStyle =
        'rgba(0, 0, 0, 0.75)';

    ctx.strokeText(
        label,
        pos.x,
        pos.y - labelOffset - 4
    );

    ctx.fillStyle =
        stroke;

    ctx.fillText(
        label,
        pos.x,
        pos.y - labelOffset - 4
    );

    ctx.restore();
}

/* =========================
   PRESET ZONES
   ========================= */

function drawPresetZones(map) {

    if (
        !map ||
        !Array.isArray(
            map.zones
        )
    ) {
        return;
    }

    map.zones.forEach(
        zone => {

            if (
                typeof zone.x !== 'number' ||
                typeof zone.y !== 'number' ||
                typeof zone.radius !== 'number'
            ) {
                return;
            }

            drawRadiusRing(
                storedMetersToWorldCoordinate(zone.x),
                storedMetersToWorldCoordinate(zone.y),
                zone.radius,
                zone.color,
                null
            );
        }
    );
}

/* =========================
   PRESET POLYGONS
   ========================= */

function getPolygonCenter(points) {

    if (
        !Array.isArray(points) ||
        points.length === 0
    ) {
        return null;
    }

    let signedArea =
        0;

    let centroidX =
        0;

    let centroidY =
        0;

    for (
        let i = 0;
        i < points.length;
        i++
    ) {

        const current =
            points[i];

        const next =
            points[
            (
                i + 1
            ) %
            points.length
                ];

        const cross =
            current.x *
            next.y -
            next.x *
            current.y;

        signedArea +=
            cross;

        centroidX +=
            (
                current.x +
                next.x
            ) *
            cross;

        centroidY +=
            (
                current.y +
                next.y
            ) *
            cross;
    }

    signedArea *=
        0.5;

    if (
        Math.abs(
            signedArea
        ) <
        1e-9
    ) {

        const sum =
            points.reduce(
                (
                    result,
                    point
                ) => {

                    result.x +=
                        point.x;

                    result.y +=
                        point.y;

                    return result;
                },
                {
                    x: 0,
                    y: 0
                }
            );

        return {
            x:
                sum.x /
                points.length,

            y:
                sum.y /
                points.length
        };
    }

    centroidX /=
        6 *
        signedArea;

    centroidY /=
        6 *
        signedArea;

    return {
        x:
        centroidX,

        y:
        centroidY
    };
}

function drawPolygonLabel(
    polygon,
    validPoints
) {

    if (
        !polygon.label
    ) {
        return;
    }

    const center =
        getPolygonCenter(
            validPoints
        );

    if (!center) {
        return;
    }

    const screen =
        worldToLocalScreen(
            storedMetersToWorldCoordinate(center.x),

            storedMetersToWorldCoordinate(center.y)
        );

    ctx.save();

    ctx.font =
        'bold 11px system-ui, sans-serif';

    ctx.textAlign =
        'center';

    ctx.textBaseline =
        'middle';

    const metrics =
        ctx.measureText(
            polygon.label
        );

    const paddingX =
        7;

    const paddingY =
        4;

    const labelWidth =
        metrics.width +
        paddingX *
        2;

    const labelHeight =
        11 +
        paddingY *
        2;

    ctx.fillStyle =
        polygon.labelBackground ||
        'rgba(16, 19, 22, .85)';

    ctx.fillRect(
        screen.x -
        labelWidth /
        2,

        screen.y -
        labelHeight /
        2,

        labelWidth,
        labelHeight
    );

    ctx.strokeStyle =
        polygon.labelBorder ||
        'rgba(255,255,255,.15)';

    ctx.lineWidth =
        1;

    ctx.strokeRect(
        screen.x -
        labelWidth /
        2,

        screen.y -
        labelHeight /
        2,

        labelWidth,
        labelHeight
    );

    ctx.fillStyle =
        polygon.labelColor ||
        '#ffffff';

    ctx.fillText(
        polygon.label,
        screen.x,
        screen.y
    );

    ctx.restore();
}

function drawPresetPolygons(map) {

    if (
        !map ||
        !Array.isArray(
            map.polygons
        )
    ) {
        return;
    }

    map.polygons.forEach(
        polygon => {

            if (
                !polygon ||
                !Array.isArray(
                    polygon.points
                )
            ) {
                return;
            }

            const validPoints =
                polygon.points.filter(
                    point =>
                        point &&
                        typeof point.x === 'number' &&
                        typeof point.y === 'number'
                );

            if (
                validPoints.length <
                3
            ) {
                return;
            }

            const first =
                worldToLocalScreen(
                    storedMetersToWorldCoordinate(validPoints[0].x),

                    storedMetersToWorldCoordinate(validPoints[0].y)
                );

            ctx.save();

            ctx.beginPath();

            ctx.moveTo(
                first.x,
                first.y
            );

            for (
                let i = 1;
                i < validPoints.length;
                i++
            ) {

                const point =
                    validPoints[i];

                const screen =
                    worldToLocalScreen(
                        storedMetersToWorldCoordinate(point.x),

                        storedMetersToWorldCoordinate(point.y)
                    );

                ctx.lineTo(
                    screen.x,
                    screen.y
                );
            }

            ctx.closePath();

            const color =
                polygon.color ||
                '#d7a452';

            const fillOpacity =
                typeof polygon.fillOpacity ===
                'number'
                    ? Math.max(
                        0,
                        Math.min(
                            1,
                            polygon.fillOpacity
                        )
                    )
                    : 0.15;

            if (
                polygon.fillColor
            ) {

                ctx.fillStyle =
                    hexToRgba(
                        polygon.fillColor,
                        fillOpacity
                    );

            } else {

                ctx.fillStyle =
                    hexToRgba(
                        color,
                        fillOpacity
                    );
            }

            ctx.fill();

            ctx.strokeStyle =
                color;

            ctx.lineWidth =
                typeof polygon.strokeWidth ===
                'number'
                    ? Math.max(
                        0.5,
                        polygon.strokeWidth
                    )
                    : 2;

            if (
                polygon.dashed
            ) {

                ctx.setLineDash(
                    Array.isArray(
                        polygon.dash
                    )
                        ? polygon.dash
                        : [
                            8,
                            6
                        ]
                );

            } else {

                ctx.setLineDash([]);
            }

            ctx.lineJoin =
                'round';

            ctx.lineCap =
                'round';

            ctx.stroke();

            ctx.setLineDash([]);

            ctx.restore();

            drawPolygonLabel(
                polygon,
                validPoints
            );
        }
    );
}


/* =========================
   PRESET MARKER ZOOM VISIBILITY
   ========================= */

/*
 * Marker minZoom / maxZoom values use the actual camera
 * zoom multiplier (S.zoom). Both limits are inclusive.
 * Missing limits mean unbounded.
 *
 * Example:
 *   minZoom: 2   -> hidden below 2x camera zoom
 *   maxZoom: 10  -> hidden above 10x camera zoom
 */
function getPresetMarkerZoomLevel() {

    const zoom =
        Number(S.zoom);

    return Number.isFinite(zoom)
        ? zoom
        : 1;
}

function isPresetMarkerVisibleAtZoom(
    item
) {

    if (!item) {
        return false;
    }

    const zoom =
        getPresetMarkerZoomLevel();

    const minZoom =
        Number(item.minZoom);

    const maxZoom =
        Number(item.maxZoom);

    if (
        Number.isFinite(minZoom) &&
        zoom < minZoom
    ) {
        return false;
    }

    if (
        Number.isFinite(maxZoom) &&
        zoom > maxZoom
    ) {
        return false;
    }

    return true;
}


/* =========================
   PRESET MARKERS
   ========================= */

function getMarkerEmojiSize(v) {

    return Math.max(
        14,
        Math.min(
            32,
            v.scale * 0.35
        )
    );
}

function getMarkerImageLayout(
    item,
    asset
) {

    const width =
        typeof item.width === 'number' &&
        item.width > 0
            ? item.width
            : asset.width;

    const height =
        typeof item.height === 'number' &&
        item.height > 0
            ? item.height
            : asset.height;

    const scale =
        typeof item.scale === 'number' &&
        item.scale > 0
            ? item.scale
            : 1;

    const anchorX =
        typeof item.anchorX === 'number'
            ? Math.max(
                0,
                Math.min(
                    1,
                    item.anchorX
                )
            )
            : asset.anchorX;

    const anchorY =
        typeof item.anchorY === 'number'
            ? Math.max(
                0,
                Math.min(
                    1,
                    item.anchorY
                )
            )
            : asset.anchorY;

    return {
        width:
            width * scale,

        height:
            height * scale,

        anchorX,
        anchorY
    };
}

function drawMarkerImage(
    item,
    x,
    y
) {

    const asset =
        getMarkerAsset(
            item.icon
        );

    if (!asset) {
        return null;
    }

    const imageEntry =
        loadMarkerImage(
            asset
        );

    if (
        !imageEntry ||
        imageEntry.failed
    ) {
        return null;
    }

    const layout =
        getMarkerImageLayout(
            item,
            asset
        );

    if (
        !imageEntry.loaded
    ) {
        return {
            drawn: false,
            height: layout.height,
            anchorY: layout.anchorY
        };
    }

    const drawWidth =
        layout.width;

    const drawHeight =
        layout.height;

    const left =
        x -
        drawWidth *
        layout.anchorX;

    const top =
        y -
        drawHeight *
        layout.anchorY;

    ctx.save();

    ctx.filter =
        getMapIconCanvasFilter();

    ctx.drawImage(
        imageEntry.image,
        left,
        top,
        drawWidth,
        drawHeight
    );

    ctx.restore();

    return {
        drawn: true,
        height: drawHeight,
        anchorY: layout.anchorY
    };
}

function drawMarkerEmoji(
    item,
    x,
    y,
    v
) {

    const emojiSize =
        getMarkerEmojiSize(
            v
        );

    ctx.font =
        `${emojiSize}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;

    ctx.fillText(
        item.emoji ||
        '📍',
        x,
        y
    );

    return emojiSize;
}

function drawPresetMarkerLabel(
    item,
    x,
    y,
    visualBottomOffset,
    v
) {

    if (!item.label) {
        return;
    }

    const labelSize =
        Math.max(
            10,
            Math.min(
                14,
                v.scale * 0.15
            )
        );

    ctx.font =
        `${labelSize}px system-ui, sans-serif`;

    const metrics =
        ctx.measureText(
            item.label
        );

    const paddingX =
        6;

    const paddingY =
        3;

    const labelWidth =
        metrics.width +
        paddingX * 2;

    const labelHeight =
        labelSize +
        paddingY * 2;

    const labelX =
        x -
        labelWidth / 2;

    const labelY =
        y +
        visualBottomOffset +
        5;

    ctx.fillStyle =
        'rgba(16, 19, 22, .88)';

    ctx.fillRect(
        labelX,
        labelY,
        labelWidth,
        labelHeight
    );

    ctx.strokeStyle =
        'rgba(255, 255, 255, .12)';

    ctx.lineWidth =
        1;

    ctx.strokeRect(
        labelX,
        labelY,
        labelWidth,
        labelHeight
    );

    ctx.fillStyle =
        '#e7edf2';

    ctx.fillText(
        item.label,
        x,
        labelY +
        labelHeight / 2
    );
}

function drawPresetMarkers(map) {

    if (
        !map ||
        !Array.isArray(
            map.markers
        )
    ) {
        return;
    }

    const v =
        view();

    map.markers.forEach(
        (
            item,
            index
        ) => {

            if (
                !isPresetMarkerVisibleAtZoom(
                    item
                )
            ) {
                return;
            }

            if (
                typeof item.x !== 'number' ||
                typeof item.y !== 'number'
            ) {
                return;
            }

            const pos =
                worldToLocalScreen(
                    storedMetersToWorldCoordinate(item.x),
                    storedMetersToWorldCoordinate(item.y)
                );

            const x =
                pos.x;

            const y =
                pos.y;

            ctx.save();

            ctx.textAlign =
                'center';

            ctx.textBaseline =
                'middle';

            let visualBottomOffset =
                0;

            let imageResult =
                null;

            /*
             * If "icon" is specified, try to
             * render an image asset first.
             */
            if (
                typeof item.icon === 'string' &&
                item.icon
            ) {

                imageResult =
                    drawMarkerImage(
                        item,
                        x,
                        y
                    );
            }

            if (
                imageResult &&
                imageResult.drawn
            ) {

                visualBottomOffset =
                    imageResult.height *
                    (
                        1 -
                        imageResult.anchorY
                    );

            } else {

                /*
                 * Emoji remains fully supported
                 * and is also used as a fallback
                 * if an image asset is missing or
                 * fails to load.
                 */
                const emojiSize =
                    drawMarkerEmoji(
                        item,
                        x,
                        y,
                        v
                    );

                visualBottomOffset =
                    emojiSize / 2;
            }

            drawPresetMarkerLabel(
                item,
                x,
                y,
                visualBottomOffset,
                v
            );

            ctx.restore();
        }
    );
}


/* =========================
   COLORS
   ========================= */

function hexToRgba(
    color,
    alpha
) {

    if (!color) {
        return `rgba(215,164,82,${alpha})`;
    }

    if (
        color.startsWith(
            'rgba('
        )
    ) {
        return color;
    }

    if (
        color.startsWith(
            'rgb('
        )
    ) {

        return color
            .replace(
                'rgb(',
                'rgba('
            )
            .replace(
                ')',
                `,${alpha})`
            );
    }

    const hex =
        color.replace(
            '#',
            ''
        );

    if (
        hex.length !== 3 &&
        hex.length !== 6
    ) {
        return `rgba(215,164,82,${alpha})`;
    }

    const normalized =
        hex.length === 3
            ? hex
                .split('')
                .map(
                    char =>
                        char +
                        char
                )
                .join('')
            : hex;

    const r =
        parseInt(
            normalized.substring(
                0,
                2
            ),
            16
        );

    const g =
        parseInt(
            normalized.substring(
                2,
                4
            ),
            16
        );

    const b =
        parseInt(
            normalized.substring(
                4,
                6
            ),
            16
        );

    return `rgba(${r},${g},${b},${alpha})`;
}
