

const COLLAB_CURSOR_FONT =
    'bold 11px system-ui, sans-serif';

const COLLAB_CURSOR_ARROW = [
    [0, 0],
    [0, 14],
    [3.6, 10.6],
    [6.2, 15.6],
    [8.6, 14.4],
    [6.1, 9.6],
    [10.6, 9.4]
];

function drawCollabCursors() {

    if (
        typeof COLLAB === 'undefined' ||
        !COLLAB.cursors ||
        !COLLAB.cursors.size
    ) {
        return;
    }

    ctx.save();
    ctx.font = COLLAB_CURSOR_FONT;
    ctx.textAlign = 'left';
    ctx.textBaseline = 'middle';

    for (const cursor of COLLAB.cursors.values()) {

        const point =
            worldToLocalScreen(
                cursor.x,
                cursor.y
            );

        drawCollabCursorArrow(
            point,
            cursor.color
        );

        drawCollabCursorLabel(
            point,
            cursor
        );
    }

    ctx.restore();
}

function drawCollabCursorArrow(point, color) {

    ctx.beginPath();

    COLLAB_CURSOR_ARROW.forEach((corner, index) => {

        const x =
            point.x +
            corner[0];

        const y =
            point.y +
            corner[1];

        if (index === 0) {
            ctx.moveTo(x, y);
        } else {
            ctx.lineTo(x, y);
        }
    });

    ctx.closePath();

    ctx.fillStyle = color;
    ctx.fill();

    ctx.lineWidth = 1;
    ctx.strokeStyle = 'rgba(8, 10, 12, .75)';
    ctx.stroke();
}

function drawCollabCursorLabel(point, cursor) {

    if (cursor.labelName !== cursor.name) {
        cursor.labelName = cursor.name;
        cursor.labelWidth =
            ctx.measureText(cursor.name).width;
    }

    const width =
        cursor.labelWidth + 12;

    const height = 17;

    const left =
        point.x + 12;

    const top =
        point.y + 12;

    ctx.fillStyle = 'rgba(16, 19, 22, .92)';
    ctx.fillRect(
        left,
        top,
        width,
        height
    );

    ctx.lineWidth = 1;
    ctx.strokeStyle = cursor.color;
    ctx.strokeRect(
        left,
        top,
        width,
        height
    );

    ctx.fillStyle = cursor.color;
    ctx.fillText(
        cursor.name,
        left + 6,
        top + height / 2 + 1
    );
}
