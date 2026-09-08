import bakurani from '../../maps/bakurani.json' with { type: 'json' };
import ozeti from '../../maps/ozeti.json' with { type: 'json' };
import zestafona from '../../maps/zestafona.json' with { type: 'json' };
import assets from '../../maps/assets.json' with { type: 'json' };

const maps = new Map(
    [bakurani, ozeti, zestafona].map(map => [map.id, { w: map.w, h: map.h }])
);
const markerIcons = new Set(
    Object.entries(assets.markerIcons || {})
        .filter(([, definition]) => definition?.placeable === true)
        .map(([id]) => id)
);

function validatePoint(point, doc) {
    if (point.x < 0 || point.x > doc.w || point.y < 0 || point.y > doc.h) {
        throw new Error('outside-map');
    }
}

export function validateCatalogDocument(doc) {
    if (doc.mapId !== 'custom') {
        const map = maps.get(doc.mapId);
        if (!map) throw new Error('unsupported-map');
        if (doc.w !== map.w || doc.h !== map.h) throw new Error('wrong-map-size');
    }
    for (const marker of doc.markers) {
        if (!markerIcons.has(marker.icon)) throw new Error('unsupported-marker');
        validatePoint(marker, doc);
    }
    for (const drawing of [...doc.drawings, ...doc.polygons]) {
        for (const point of drawing.points) validatePoint(point, doc);
    }
    for (const zone of doc.zones) {
        validatePoint(zone, doc);
        if (zone.radius > Math.hypot(doc.w, doc.h)) throw new Error('outside-map');
    }
    for (const target of doc.savedTargets) {
        validatePoint(target, doc);
        if (target.origin) validatePoint(target.origin, doc);
    }
    return doc;
}
