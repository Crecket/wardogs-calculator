/* =========================
   EVENTS
   ========================= */

function bindEvents() {

    $('mapSelect').addEventListener(
        'change',
        () => {
            const key =
                $('mapSelect').value;

            S.map = key;
            S.w = MAPS[key].w;
            S.h = MAPS[key].h;

            if (
                typeof loadMapPoints ===
                'function'
            ) {
                loadMapPoints();
            }

            persistAppSelections();

            clamp(
                S.origin
            );

            clamp(
                S.target
            );

            S.zoom =
                1;

            S.panX =
                0;

            S.panY =
                0;

            resetMapToolHistory();

            if (
                typeof trackAnalytics ===
                'function'
            ) {
                trackAnalytics(
                    'map-changed',
                    {
                        map: S.map
                    }
                );
            }

            inputs();
        }
    );

    $('weapon').addEventListener(
        'change',
        () => {

            S.weapon =
                $('weapon').value;

            /*
             * The row for the selected gun names its weapon, so the list
             * has to redraw with it.
             */
            if (
                typeof renderGuns ===
                'function'
            ) {
                renderGuns();
            }

            if (
                typeof collabSyncShared ===
                'function'
            ) {
                collabSyncShared();
            }

            persistAppSelections();

            if (
                typeof trackAnalytics ===
                'function'
            ) {
                trackAnalytics(
                    'weapon-changed',
                    {
                        weapon: S.weapon
                    }
                );
            }

            draw();
        }
    );

    $('originMode').addEventListener(
        'click',
        () => setPointMode('origin')
    );

    $('targetMode').addEventListener(
        'click',
        () => setPointMode('target')
    );

    ['ox', 'oy'].forEach(
        id => {

            $(id).addEventListener(
                'change',
                () =>
                    inputPoint(
                        'origin'
                    )
            );
        }
    );

    ['tx', 'ty'].forEach(
        id => {

            $(id).addEventListener(
                'change',
                () =>
                    inputPoint(
                        'target'
                    )
            );
        }
    );

    $('coordinateOriginCopy')
        ?.addEventListener(
            'click',
            () => copyPointCoordinates('origin')
        );

    $('coordinateOriginPaste')
        ?.addEventListener(
            'click',
            () => pastePointCoordinates('origin')
        );

    $('coordinateTargetCopy')
        ?.addEventListener(
            'click',
            () => copyPointCoordinates('target')
        );

    $('coordinateTargetPaste')
        ?.addEventListener(
            'click',
            () => pastePointCoordinates('target')
        );

    $('zoomIn').addEventListener(
        'click',
        () => {

            S.zoom =
                Math.min(
                    getMaxCameraZoom(),
                    S.zoom *
                    ZOOM_BUTTON_FACTOR
                );

            draw();
        }
    );

    $('zoomOut').addEventListener(
        'click',
        () => {

            S.zoom =
                Math.max(
                    MIN_ZOOM,
                    S.zoom /
                    ZOOM_BUTTON_FACTOR
                );

            draw();
        }
    );

    $('fit').addEventListener(
        'click',
        () => {

            S.zoom =
                1;

            S.panX =
                0;

            S.panY =
                0;

            draw();
        }
    );

    $('clear').addEventListener(
        'click',
        () => {

            pushMapToolHistory();

            const bounds =
                getViewBounds();

            S.origin = {
                x:
                bounds.minX,

                y:
                bounds.minY
            };

            S.target = {
                x:
                bounds.minX,

                y:
                bounds.minY
            };

            inputs();

            renderSavedTargets();
        }
    );


    /* =========================
       SAVED TARGETS
       ========================= */

    $('saveTarget').addEventListener(
        'click',
        saveCurrentTarget
    );

    $('saveArtilleryPosition')
        .addEventListener(
            'change',
            saveArtilleryPreference
        );


    /* =========================
       CANVAS
       ========================= */

    c.addEventListener(
        'mousedown',
        e => {

            e.preventDefault();

            const rect =
                c.getBoundingClientRect();

            const p =
                toWorld(
                    e.clientX -
                    rect.left,

                    e.clientY -
                    rect.top
                );

            if (
                e.button ===
                2
            ) {

                pan = {
                    startX:
                    e.clientX,

                    startY:
                    e.clientY,

                    originX:
                    S.panX,

                    originY:
                    S.panY
                };

                $('cursorCoords')
                    .style.display =
                    'none';

                return;
            }

            if (
                handleMapToolMouseDown(
                    e,
                    p
                )
            ) {
                drag = null;
                return;
            }

            const pointHitThreshold =
                metersToWorldDistance(300);

            /*
             * Any drawn gun is grabbable, not just the selected one:
             * clicking a neighbour picks that gun up rather than
             * teleporting the current one onto it.
             */
            const gunPicking =
                typeof gunAtPoint === 'function';

            const hitGun =
                gunPicking
                    ? gunAtPoint(
                        p,
                        pointHitThreshold
                    )
                    : null;

            const originPoint =
                gunPicking
                    ? hitGun?.position || null
                    : S.origin;

            const d1 =
                originPoint
                    ? Math.hypot(
                        p.x -
                        originPoint.x,

                        p.y -
                        originPoint.y
                    )
                    : Infinity;

            const d2 =
                Math.hypot(
                    p.x -
                    S.target.x,

                    p.y -
                    S.target.y
                );

            /*
             * Locked points are not hit-test targets. A click beside a
             * locked gun/target must remain available for placing the active
             * unlocked point instead of being swallowed by the nearer lock.
             */
            const nearestUnlockedPoint =
                getNearestUnlockedMapPoint(
                    d1,
                    d2,
                    pointHitThreshold
                );

            if (
                nearestUnlockedPoint
            ) {
                /*
                 * Select before the write below: S.origin resolves through
                 * the active gun, so the selection has to move first or
                 * the drag would edit the gun you just clicked away from.
                 */
                if (
                    nearestUnlockedPoint === 'origin' &&
                    hitGun &&
                    hitGun.id !== S.activeGunId
                ) {
                    selectGun(hitGun.id);
                }

                drag =
                    nearestUnlockedPoint;

            } else {

                const hitSavedTarget =
                    typeof savedTargetAtPoint === 'function'
                        ? savedTargetAtPoint(
                            p,
                            pointHitThreshold
                        )
                        : null;

                if (hitSavedTarget) {

                    drag = null;

                    restoreTarget(
                        hitSavedTarget
                    );

                    updateCursor(e);

                    return;
                }

                drag = S.mode;
            }

            pushMapToolHistory();

            S[drag] = {
                x:
                p.x,

                y:
                p.y
            };

            clamp(
                S[drag]
            );

            inputs();

            updateCursor(
                e
            );
        }
    );

    window.addEventListener(
        'mousemove',
        e => {

            if (pan) {

                if (
                    typeof hideMilCursor ===
                    'function'
                ) {
                    hideMilCursor();
                }

                S.panX =
                    pan.originX +
                    (
                        e.clientX -
                        pan.startX
                    );

                S.panY =
                    pan.originY +
                    (
                        e.clientY -
                        pan.startY
                    );

                draw();

                return;
            }

            /*
             * One rect for the whole event. Reading it back after the
             * cursor readout has been written forces a layout, and this
             * handler used to read it twice.
             */
            const rect =
                c.getBoundingClientRect();

            updateCursor(
                e,
                rect
            );

            const toolWorld =
                toWorld(
                    e.clientX -
                    rect.left,
                    e.clientY -
                    rect.top
                );

            if (
                e.target === c &&
                typeof collabOnPointerWorld ===
                'function'
            ) {
                collabOnPointerWorld(
                    toolWorld
                );
            }

            if (
                handleMapToolMouseMove(
                    e,
                    toolWorld
                )
            ) {
                if (
                    typeof hideMilCursor ===
                    'function'
                ) {
                    hideMilCursor();
                }

                drag = null;
                return;
            }

            if (
                typeof updateMilCursor ===
                'function'
            ) {
                if (drag) {
                    hideMilCursor();
                } else {
                    updateMilCursor(
                        e,
                        toolWorld,
                        rect
                    );
                }
            }

            if (!drag) {
                return;
            }

            const world =
                toWorld(
                    e.clientX -
                    rect.left,

                    e.clientY -
                    rect.top
                );

            S[drag] =
                world;

            clamp(
                S[drag]
            );

            inputs();

            updateCursor(
                e,
                rect
            );
        }
    );

    c.addEventListener(
        'contextmenu',
        e => {

            e.preventDefault();
        }
    );

    c.addEventListener(
        'mouseleave',
        () => {

            if (
                typeof collabOnPointerLeft ===
                'function'
            ) {
                collabOnPointerLeft();
            }

            if (!pan) {

                $('cursorCoords')
                    .style.display =
                    'none';
            }

            if (
                typeof hideMilCursor ===
                'function'
            ) {
                hideMilCursor();
            }
        }
    );

    window.addEventListener(
        'mouseup',
        () => {

            const placedPoint =
                drag;

            handleMapToolMouseUp();

            if (
                placedPoint &&
                typeof trackAnalytics ===
                'function'
            ) {
                trackAnalytics(
                    `${placedPoint}-placed`,
                    {
                        map: S.map
                    }
                );
            }

            drag =
                null;

            pan =
                null;
        }
    );

    c.addEventListener(
        'wheel',
        e => {

            e.preventDefault();

            /*
             * With the marker tool active, the wheel turns the FOB build
             * area under the cursor instead of zooming. Everywhere else —
             * every other tool, every other spot on the map — it zooms.
             */
            if (handleMapToolWheel(e)) {
                return;
            }

            const rect =
                c.getBoundingClientRect();

            const mouseX =
                e.clientX -
                rect.left;

            const mouseY =
                e.clientY -
                rect.top;

            const before =
                toWorld(
                    mouseX,
                    mouseY
                );

            S.zoom =
                Math.max(
                    MIN_ZOOM,
                    Math.min(
                        getMaxCameraZoom(),
                        S.zoom *
                        (
                            e.deltaY <
                            0
                                ? ZOOM_WHEEL_IN
                                : ZOOM_WHEEL_OUT
                        )
                    )
                );

            const after =
                toWorld(
                    mouseX,
                    mouseY
                );

            S.panX +=
                (
                    after.x -
                    before.x
                ) *
                view().scale;

            S.panY -=
                (
                    after.y -
                    before.y
                ) *
                view().scale;

            draw();
        },
        {
            passive:
                false
        }
    );

    const cameraKeysLoaded =
        typeof handleCameraKeyDown ===
        'function';

    window.addEventListener(
        'keydown',
        e => {
            if (handleMapToolShortcut(e)) {
                e.preventDefault();
                return;
            }

            if (
                cameraKeysLoaded &&
                handleCameraKeyDown(e)
            ) {
                e.preventDefault();
            }
        }
    );

    if (cameraKeysLoaded) {

        window.addEventListener(
            'keyup',
            handleCameraKeyUp
        );

        /*
         * Held keys would otherwise stick when the window
         * loses focus mid-pan.
         */
        window.addEventListener(
            'blur',
            stopCameraPan
        );
    }

    window.addEventListener(
        'resize',
        resize
    );
}
