/* =========================
   GRID
   ========================= */

function drawGrid() {

    const v =
        view();

    const major =
        '#6f7a82';

    const minor =
        '#3b444b';

    const minorStep =
        0.1;

    const startX =
        Math.ceil(
            v.bounds.minX /
            minorStep
        ) *
        minorStep;

    const endX =
        Math.floor(
            v.bounds.maxX /
            minorStep
        ) *
        minorStep;

    const startY =
        Math.ceil(
            v.bounds.minY /
            minorStep
        ) *
        minorStep;

    const endY =
        Math.floor(
            v.bounds.maxY /
            minorStep
        ) *
        minorStep;

    for (
        let x =
            startX;

        x <=
        endX +
        1e-9;

        x +=
            minorStep
    ) {

        const rounded =
            Math.round(
                x *
                10
            ) /
            10;

        const local =
            worldToLocalScreen(
                rounded,
                v.bounds.maxY
            );

        const isMajor =
            Math.abs(
                rounded -
                Math.round(
                    rounded
                )
            ) <
            1e-8;

        ctx.strokeStyle =
            isMajor
                ? major
                : minor;

        ctx.lineWidth =
            isMajor
                ? 1.3
                : 1;

        ctx.beginPath();

        ctx.moveTo(
            local.x,
            0
        );

        ctx.lineTo(
            local.x,
            v.mh
        );

        ctx.stroke();
    }

    for (
        let y =
            startY;

        y <=
        endY +
        1e-9;

        y +=
            minorStep
    ) {

        const rounded =
            Math.round(
                y *
                10
            ) /
            10;

        const local =
            worldToLocalScreen(
                v.bounds.minX,
                rounded
            );

        const isMajor =
            Math.abs(
                rounded -
                Math.round(
                    rounded
                )
            ) <
            1e-8;

        ctx.strokeStyle =
            isMajor
                ? major
                : minor;

        ctx.lineWidth =
            isMajor
                ? 1.3
                : 1;

        ctx.beginPath();

        ctx.moveTo(
            0,
            local.y
        );

        ctx.lineTo(
            v.mw,
            local.y
        );

        ctx.stroke();
    }
}

function drawCoordinateLabels() {

    const v =
        view();

    const styles =
        getComputedStyle(
            document.documentElement
        );

    ctx.fillStyle =
        styles
            .getPropertyValue(
                '--muted'
            )
            .trim() ||
        '#89959e';

    ctx.font =
        '10px system-ui';

    const firstX =
        Math.ceil(
            v.bounds.minX
        );

    const lastX =
        Math.floor(
            v.bounds.maxX
        );

    const firstY =
        Math.ceil(
            v.bounds.minY
        );

    const lastY =
        Math.floor(
            v.bounds.maxY
        );

    ctx.textBaseline =
        'top';

    ctx.textAlign =
        'center';

    for (
        let x =
            firstX;

        x <=
        lastX;

        x++
    ) {

        const local =
            worldToLocalScreen(
                x,
                v.bounds.minY
            );

        ctx.fillText(
            formatCoord(
                x *
                1000
            ),
            local.x,
            v.mh +
            9
        );
    }

    ctx.textBaseline =
        'middle';

    ctx.textAlign =
        'right';

    for (
        let y =
            firstY;

        y <=
        lastY;

        y++
    ) {

        const local =
            worldToLocalScreen(
                v.bounds.minX,
                y
            );

        ctx.fillText(
            formatCoord(
                y *
                1000
            ),
            -8,
            local.y
        );
    }

    ctx.textBaseline =
        'alphabetic';
}
