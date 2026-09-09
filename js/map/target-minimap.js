const TARGET_MINIMAP_SPAN_METRES = 180;

const TARGET_MINIMAP_STATE = {
    collapsed: false,
    bound: false,
    key: '',
    pending: false
};

/*
 * The panel is part of the desktop page and not a layer: it is there
 * whenever its markup is, and the mobile shell simply does not carry it.
 * Collapsing is the header's own affair.
 */
function targetMinimapVisible() {
    return Boolean($('targetMinimap'));
}

function targetMinimapSurface(canvas) {
    const width = canvas.clientWidth;
    const height = canvas.clientHeight;

    if (!width || !height) {
        return null;
    }

    const d = renderScale();

    const pixelWidth = Math.round(width * d);
    const pixelHeight = Math.round(height * d);

    if (
        canvas.width !== pixelWidth ||
        canvas.height !== pixelHeight
    ) {
        canvas.width = pixelWidth;
        canvas.height = pixelHeight;
    }

    const g = canvas.getContext('2d');

    g.setTransform(d, 0, 0, d, 0, 0);
    g.clearRect(0, 0, width, height);

    return {
        g,
        width,
        height
    };
}

function targetMinimapZoom(map, worldPerPixel) {
    const tiles = getTileConfig(map);
    const bounds = getTileBounds(map);

    if (!tiles || !bounds || !(worldPerPixel > 0)) {
        return null;
    }

    const tileWorldWidth = bounds.maxX - bounds.minX;

    if (!(tileWorldWidth > 0)) {
        return null;
    }

    const raw = Math.log2(
        (1 / worldPerPixel) /
        (tiles.tileSize / tileWorldWidth)
    );

    return Math.max(
        tiles.minZoom,
        Math.min(
            tiles.maxZoom,
            Math.ceil(raw)
        )
    );
}

function drawTargetMinimapTiles(g, map, frame) {
    const tiles = getTileConfig(map);
    const bounds = getTileBounds(map);

    g.fillStyle = cssVar('--panel-bg', '#151a1d');
    g.fillRect(0, 0, frame.width, frame.height);

    if (!tiles || !bounds) {
        return false;
    }

    const count = Math.pow(2, frame.zoom);

    const tileWorldWidth = (bounds.maxX - bounds.minX) / count;
    const tileWorldHeight = (bounds.maxY - bounds.minY) / count;

    const tileWidth = tileWorldWidth / frame.worldPerPixel;
    const tileHeight = tileWorldHeight / frame.worldPerPixel;

    const minTileX = Math.max(
        0,
        Math.floor((frame.left - bounds.minX) / tileWorldWidth)
    );

    const maxTileX = Math.min(
        count - 1,
        Math.floor((frame.right - bounds.minX) / tileWorldWidth)
    );

    const minTileY = Math.max(
        0,
        Math.floor((bounds.maxY - frame.top) / tileWorldHeight)
    );

    const maxTileY = Math.min(
        count - 1,
        Math.floor((bounds.maxY - frame.bottom) / tileWorldHeight)
    );

    let pending = false;

    for (let tileY = minTileY; tileY <= maxTileY; tileY += 1) {
        const worldTop = bounds.maxY - tileY * tileWorldHeight;
        const y = (frame.top - worldTop) / frame.worldPerPixel;

        for (let tileX = minTileX; tileX <= maxTileX; tileX += 1) {
            const worldLeft = bounds.minX + tileX * tileWorldWidth;
            const x = (worldLeft - frame.left) / frame.worldPerPixel;

            const tile = loadTile(map, frame.zoom, tileX, tileY);

            if (tile.loaded && !tile.failed) {
                g.drawImage(
                    tile.image,
                    x,
                    y,
                    tileWidth + 0.5,
                    tileHeight + 0.5
                );

                continue;
            }

            if (!tile.failed) {
                pending = true;
            }

            const ancestor = tile.failed
                ? null
                : findCachedTileAncestor(
                    map,
                    tiles,
                    frame.zoom,
                    tileX,
                    tileY
                );

            if (ancestor) {
                g.drawImage(
                    ancestor.image,
                    ancestor.sourceX,
                    ancestor.sourceY,
                    ancestor.sourceSize,
                    ancestor.sourceSize,
                    x,
                    y,
                    tileWidth + 0.5,
                    tileHeight + 0.5
                );
            }
        }
    }

    return pending;
}

function targetMinimapPoint(frame, point) {
    return {
        x: (point.x - frame.left) / frame.worldPerPixel,
        y: (frame.top - point.y) / frame.worldPerPixel
    };
}

function drawTargetMinimapMarker(g, at, text, fill) {
    g.beginPath();
    g.arc(at.x, at.y, 7, 0, Math.PI * 2);

    g.fillStyle = fill;
    g.fill();

    g.lineWidth = 2;
    g.strokeStyle = '#fff';
    g.stroke();

    g.fillStyle = '#fff';
    g.font = 'bold 9px system-ui';
    g.textAlign = 'center';
    g.textBaseline = 'alphabetic';

    g.fillText(text, at.x, at.y + 3.5);
}

function drawTargetMinimapGunLine(g, frame, target) {
    if (!S.origin) {
        return;
    }

    const at = targetMinimapPoint(frame, S.origin);

    g.save();

    g.beginPath();
    g.rect(0, 0, frame.width, frame.height);
    g.clip();

    g.strokeStyle = '#d7a452';
    g.lineWidth = 2;
    g.setLineDash([7, 5]);

    g.beginPath();
    g.moveTo(at.x, at.y);
    g.lineTo(target.x, target.y);
    g.stroke();

    g.setLineDash([]);

    if (
        at.x >= 0 &&
        at.x <= frame.width &&
        at.y >= 0 &&
        at.y <= frame.height
    ) {
        drawTargetMinimapMarker(g, at, 'O', '#5fa8d3');
    }

    g.restore();
}

function drawTargetMinimapScale(g, frame) {
    const metresPerPixel =
        frame.worldPerPixel * getCoordinateMetersPerUnit();

    const metres = 100;
    const length = metres / metresPerPixel;

    if (!(length > 12) || length > frame.width - 24) {
        return;
    }

    const y = frame.height - 12;
    const left = 10;

    g.strokeStyle = 'rgba(0,0,0,.55)';
    g.lineWidth = 4;

    g.beginPath();
    g.moveTo(left, y);
    g.lineTo(left + length, y);
    g.stroke();

    g.strokeStyle = '#e6ecef';
    g.lineWidth = 2;

    g.beginPath();
    g.moveTo(left, y);
    g.lineTo(left + length, y);
    g.stroke();

    g.font = '10px system-ui';
    g.textAlign = 'left';
    g.textBaseline = 'bottom';

    g.lineWidth = 3;
    g.strokeStyle = 'rgba(0,0,0,.55)';
    g.strokeText(`${metres} m`, left, y - 3);

    g.fillStyle = '#e6ecef';
    g.fillText(`${metres} m`, left, y - 3);
}

function drawTargetMinimapCrosshair(g, at) {
    g.strokeStyle = 'rgba(216,102,102,.55)';
    g.lineWidth = 1;

    g.beginPath();
    g.moveTo(at.x - 18, at.y);
    g.lineTo(at.x - 10, at.y);
    g.moveTo(at.x + 10, at.y);
    g.lineTo(at.x + 18, at.y);
    g.moveTo(at.x, at.y - 18);
    g.lineTo(at.x, at.y - 10);
    g.moveTo(at.x, at.y + 10);
    g.lineTo(at.x, at.y + 18);
    g.stroke();
}

function targetMinimapWindow(map, surface) {
    const spanWorld = metersToWorldDistance(TARGET_MINIMAP_SPAN_METRES);

    const worldPerPixel = spanWorld / surface.width;

    const zoom = targetMinimapZoom(map, worldPerPixel);

    if (zoom === null) {
        return null;
    }

    const halfHeight = surface.height * worldPerPixel / 2;

    return {
        width: surface.width,
        height: surface.height,
        worldPerPixel,
        zoom,
        left: S.target.x - spanWorld / 2,
        right: S.target.x + spanWorld / 2,
        top: S.target.y + halfHeight,
        bottom: S.target.y - halfHeight
    };
}

function targetMinimapCaption() {
    return tr('targetMinimapSpan')
        .replace('{metres}', TARGET_MINIMAP_SPAN_METRES)
        .replace('{x}', formatGameCoordinate(S.target.x))
        .replace('{y}', formatGameCoordinate(S.target.y));
}

function targetMinimapKey() {
    const canvas = $('targetMinimapCanvas');

    return [
        S.map,
        Math.round(S.target.x * 100),
        Math.round(S.target.y * 100),
        Math.round(S.origin.x * 100),
        Math.round(S.origin.y * 100),
        LANG,
        canvas ? canvas.clientWidth : 0,
        canvas ? canvas.clientHeight : 0
    ].join('|');
}

function toggleTargetMinimap() {
    const panel = $('targetMinimap');

    if (!panel) {
        return;
    }

    TARGET_MINIMAP_STATE.collapsed = !TARGET_MINIMAP_STATE.collapsed;
    TARGET_MINIMAP_STATE.key = '';

    syncTargetMinimapToggle(panel);

    draw();
}

function bindTargetMinimap() {
    if (TARGET_MINIMAP_STATE.bound) {
        return;
    }

    const header = $('targetMinimap')
        ?.querySelector('.target-minimap-header');

    if (!header) {
        return;
    }

    header.addEventListener('click', toggleTargetMinimap);

    TARGET_MINIMAP_STATE.bound = true;
}

function syncTargetMinimapToggle(panel) {
    const button = $('targetMinimapToggle');

    if (!button) {
        return;
    }

    const collapsed = TARGET_MINIMAP_STATE.collapsed;

    const label = collapsed
        ? tr('targetMinimapExpand')
        : tr('targetMinimapCollapse');

    panel.dataset.collapsed = collapsed ? 'true' : 'false';

    button.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
    button.setAttribute('aria-label', label);
    button.title = label;

    setText(button, collapsed ? '▾' : '▴');
}

function renderTargetMinimap() {
    const panel = $('targetMinimap');

    if (!panel) {
        return;
    }

    const map = getCurrentMap();

    const visible =
        targetMinimapVisible() &&
        Boolean(map && map.tiles);

    if (panel.hidden !== !visible) {
        panel.hidden = !visible;
    }

    if (!visible) {
        return;
    }

    bindTargetMinimap();
    syncTargetMinimapToggle(panel);

    if (TARGET_MINIMAP_STATE.collapsed) {
        return;
    }

    const key = targetMinimapKey();

    if (
        key === TARGET_MINIMAP_STATE.key &&
        !TARGET_MINIMAP_STATE.pending
    ) {
        return;
    }

    const canvas = $('targetMinimapCanvas');
    const surface = canvas ? targetMinimapSurface(canvas) : null;

    if (!surface) {
        TARGET_MINIMAP_STATE.key = '';

        return;
    }

    const frame = targetMinimapWindow(map, surface);

    if (!frame) {
        TARGET_MINIMAP_STATE.key = '';

        return;
    }

    TARGET_MINIMAP_STATE.key = key;

    TARGET_MINIMAP_STATE.pending =
        drawTargetMinimapTiles(surface.g, map, frame);

    const target = targetMinimapPoint(frame, S.target);

    drawTargetMinimapGunLine(surface.g, frame, target);
    drawTargetMinimapCrosshair(surface.g, target);
    drawTargetMinimapMarker(surface.g, target, 'T', '#d86666');
    drawTargetMinimapScale(surface.g, frame);

    setText($('targetMinimapCaption'), targetMinimapCaption());
}
