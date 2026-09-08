import bakurani from '../../maps/bakurani.json' with { type: 'json' };
import ozeti from '../../maps/ozeti.json' with { type: 'json' };
import zestafona from '../../maps/zestafona.json' with { type: 'json' };
import assets from '../../maps/assets.json' with { type: 'json' };

function mapBounds(map) {
    const bounds = map.bounds;
    if (bounds &&
        [bounds.minX, bounds.maxX, bounds.minY, bounds.maxY].every(Number.isFinite) &&
        bounds.maxX > bounds.minX && bounds.maxY > bounds.minY) {
        return {
            minX: bounds.minX, maxX: bounds.maxX,
            minY: bounds.minY, maxY: bounds.maxY
        };
    }
    return { minX: 0, maxX: map.w, minY: 0, maxY: map.h };
}
const maps = new Map(
    [bakurani, ozeti, zestafona].map(map => [map.id, {
        w: map.w, h: map.h, bounds: mapBounds(map)
    }])
);
const markerIcons = new Set(
    Object.entries(assets.markerIcons || {})
        .filter(([, definition]) => definition?.placeable === true)
        .map(([id]) => id)
);

export function documentBounds(doc) {
    if (doc.mapId === 'custom') {
        return { minX: 0, maxX: doc.w, minY: 0, maxY: doc.h };
    }
    const map = maps.get(doc.mapId);
    if (!map) throw new Error('unsupported-map');
    if (doc.w !== map.w || doc.h !== map.h) throw new Error('wrong-map-size');
    return map.bounds;
}

function validatePoint(point, bounds) {
    if (point.x < bounds.minX || point.x > bounds.maxX ||
        point.y < bounds.minY || point.y > bounds.maxY) {
        throw new Error('outside-map');
    }
}

export function validateCatalogDocument(doc) {
    if (doc.mapId !== 'custom') {
        const map = maps.get(doc.mapId);
        if (!map) throw new Error('unsupported-map');
        if (doc.w !== map.w || doc.h !== map.h) throw new Error('wrong-map-size');
    }
    const bounds = documentBounds(doc);
    for (const marker of doc.markers) {
        if (!markerIcons.has(marker.icon)) throw new Error('unsupported-marker');
        validatePoint(marker, bounds);
    }
    for (const drawing of [...doc.drawings, ...doc.polygons]) {
        for (const point of drawing.points) validatePoint(point, bounds);
    }
    for (const zone of doc.zones) {
        validatePoint(zone, bounds);
        if (zone.radius > Math.hypot(
            bounds.maxX - bounds.minX,
            bounds.maxY - bounds.minY
        )) throw new Error('outside-map');
    }
    for (const target of doc.savedTargets) {
        validatePoint(target, bounds);
        if (target.origin) validatePoint(target.origin, bounds);
    }
    return doc;
}
