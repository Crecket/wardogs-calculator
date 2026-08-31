/*
 * Op validation shared by the Worker and the Durable Object.
 *
 * Every rule here mirrors a rule the client already enforces on
 * import (see normalizeImportedMapToolDrawing / normalizeImportedSavedTarget
 * in the main site). The server repeats them because a room code is the
 * only credential, so anyone holding one is untrusted input.
 *
 * Deliberately absent: knowledge of which marker icons or map IDs exist.
 * The server checks that they are safe, short slugs; the client rejects
 * unknown ones when it applies the op via getMarkerAsset(). That keeps
 * maps/assets.json a client-only concern.
 */

export const LIMITS = {
    drawings: 2000,
    markers: 5000,
    targets: 500,
    guns: 8,
    pointsPerDrawing: 10000,

    peers: 16,
    viewers: 8,

    messageBytes: 64 * 1024,

    opsPerSecond: 20,
    opsBurst: 40,

    cursorsPerSecond: 20,
    cursorBurst: 30,

    cursorNameLength: 24,

    idleMs: 14 * 24 * 60 * 60 * 1000
};

const ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;
const COLOR_PATTERN = /^#[0-9a-f]{6}$/i;
const SLUG_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

const COORDINATE_BOUND = 1e6;
const NAME_LENGTH = 120;

const CONTROL_CHARACTERS = /[\u0000-\u001f\u007f]/g;

class OpError extends Error {
    constructor(code) {
        super(code);
        this.code = code;
    }
}

function fail(code) {
    throw new OpError(code);
}

export function isOpError(error) {
    return error instanceof OpError;
}

function coordinate(value) {
    const parsed = Number(value);

    if (
        !Number.isFinite(parsed) ||
        Math.abs(parsed) > COORDINATE_BOUND
    ) {
        fail('bad-coordinate');
    }

    return parsed;
}

/*
 * Marker rotation in degrees, wrapped into [0, 360). A missing or unusable
 * value is 0 rather than a rejection: markers from a client that predates
 * rotation simply sit square, the way they always did.
 */
function rotation(value) {
    const degrees = Number(value);

    if (!Number.isFinite(degrees)) {
        return 0;
    }

    return ((degrees % 360) + 360) % 360;
}

function id(value) {
    if (
        typeof value !== 'string' ||
        !ID_PATTERN.test(value)
    ) {
        fail('bad-id');
    }

    return value;
}

function slug(value, fallback) {
    if (typeof value !== 'string' || !value.trim()) {
        return fallback;
    }

    const trimmed = value.trim();

    if (!SLUG_PATTERN.test(trimmed)) {
        fail('bad-slug');
    }

    return trimmed;
}

function name(value) {
    if (typeof value !== 'string') {
        fail('bad-name');
    }

    const trimmed = value.trim().slice(0, NAME_LENGTH);

    if (!trimmed) {
        fail('bad-name');
    }

    return trimmed;
}

function cursorName(value) {
    if (typeof value !== 'string') {
        return null;
    }

    const cleaned = value
        .replace(CONTROL_CHARACTERS, '')
        .trim()
        .slice(0, LIMITS.cursorNameLength);

    return cleaned || null;
}

export function validateName(value) {
    return cursorName(value);
}

export function validateCursor(raw) {
    if (!raw || typeof raw !== 'object') {
        fail('bad-cursor');
    }

    if (raw.gone === true) {
        return { gone: true };
    }

    return {
        x: coordinate(raw.x),
        y: coordinate(raw.y),
        name: cursorName(raw.name)
    };
}

export function validateDrawing(value, mapId) {
    if (!value || typeof value !== 'object') {
        fail('bad-drawing');
    }

    if (!Array.isArray(value.points)) {
        fail('bad-drawing');
    }

    if (value.points.length > LIMITS.pointsPerDrawing) {
        fail('too-many-points');
    }

    const points = value.points.map(point => {
        if (!point || typeof point !== 'object') {
            fail('bad-point');
        }

        return {
            x: coordinate(point.x),
            y: coordinate(point.y)
        };
    });

    if (points.length < 2) {
        fail('bad-drawing');
    }

    if (
        typeof value.color !== 'string' ||
        !COLOR_PATTERN.test(value.color)
    ) {
        fail('bad-color');
    }

    return {
        id: id(value.id),
        mapId: slug(value.mapId, mapId),
        color: value.color,
        points
    };
}

export function validateMarker(value, mapId) {
    if (!value || typeof value !== 'object') {
        fail('bad-marker');
    }

    return {
        id: id(value.id),
        mapId: slug(value.mapId, mapId),
        icon: slug(value.icon, null) ?? fail('bad-icon'),
        x: coordinate(value.x),
        y: coordinate(value.y),
        rotation: rotation(value.rotation)
    };
}

export function validateTarget(value) {
    if (!value || typeof value !== 'object') {
        fail('bad-target');
    }

    const origin =
        value.origin && typeof value.origin === 'object'
            ? {
                x: coordinate(value.origin.x),
                y: coordinate(value.origin.y)
            }
            : null;

    return {
        id: id(value.id),
        name: name(value.name),
        x: coordinate(value.x),
        y: coordinate(value.y),
        saveArtillery: Boolean(value.saveArtillery && origin),
        origin
    };
}

/*
 * A gun on the wire is flat, like markers and targets — the client's
 * nested `position` is its own concern.
 *
 * `visible` is deliberately absent: it is per-viewer view state, so it is
 * dropped here rather than relayed. Returning a fresh object is what
 * enforces that; a peer cannot smuggle extra fields to everyone else.
 */
export function validateGun(value) {
    if (!value || typeof value !== 'object') {
        fail('bad-gun');
    }

    return {
        id: id(value.id),
        name: name(value.name),
        x: coordinate(value.x),
        y: coordinate(value.y),
        weapon: value.weapon === null || value.weapon === undefined
            ? null
            : slug(value.weapon, null) ?? fail('bad-weapon')
    };
}

/*
 * Returns the op in canonical form, or throws an OpError whose .code
 * the caller reports back over the socket. Never returns the caller's
 * object: rebroadcasting an unvalidated shape would let one peer smuggle
 * extra fields to every other peer.
 */
export function validateOp(raw, mapId) {
    if (!raw || typeof raw !== 'object') {
        fail('bad-op');
    }

    switch (raw.op) {
        case 'drawing.add':
            return {
                op: 'drawing.add',
                drawing: validateDrawing(raw.drawing, mapId)
            };

        case 'drawing.remove':
            return {
                op: 'drawing.remove',
                id: id(raw.id)
            };

        case 'marker.add':
            return {
                op: 'marker.add',
                marker: validateMarker(raw.marker, mapId)
            };

        case 'marker.remove':
            return {
                op: 'marker.remove',
                id: id(raw.id)
            };

        case 'target.add':
            return {
                op: 'target.add',
                target: validateTarget(raw.target)
            };

        case 'target.remove':
            return {
                op: 'target.remove',
                id: id(raw.id)
            };

        case 'target.rename':
            return {
                op: 'target.rename',
                id: id(raw.id),
                name: name(raw.name)
            };

        case 'gun.add':
            return {
                op: 'gun.add',
                gun: validateGun(raw.gun)
            };

        case 'gun.move':
            return {
                op: 'gun.move',
                id: id(raw.id),
                x: coordinate(raw.x),
                y: coordinate(raw.y)
            };

        /*
         * A weapon swap carries the gun's id. Without it the receiver has
         * to guess which gun changed, and guesses at its own selection —
         * which is not the one the sender swapped.
         */
        case 'gun.weapon':
            return {
                op: 'gun.weapon',
                id: id(raw.id),
                weapon: raw.weapon === null || raw.weapon === undefined
                    ? null
                    : slug(raw.weapon, null) ?? fail('bad-weapon')
            };

        case 'gun.remove':
            return {
                op: 'gun.remove',
                id: id(raw.id)
            };

        case 'point.set':
            if (
                raw.point !== 'origin' &&
                raw.point !== 'target'
            ) {
                fail('bad-point-kind');
            }

            return {
                op: 'point.set',
                point: raw.point,
                x: coordinate(raw.x),
                y: coordinate(raw.y)
            };

        case 'weapon.set':
            return {
                op: 'weapon.set',
                weapon: raw.weapon === null
                    ? null
                    : slug(raw.weapon, null) ?? fail('bad-weapon')
            };

        case 'clear':
            if (
                raw.scope !== 'all' &&
                raw.scope !== 'drawings' &&
                raw.scope !== 'markers' &&
                raw.scope !== 'targets'
            ) {
                fail('bad-scope');
            }

            return {
                op: 'clear',
                scope: raw.scope
            };

        /*
         * "Push mine into the room" on join. One op rather than a burst
         * of adds so it cannot be split across the rate limiter, and so
         * a joiner's whole contribution lands atomically for every peer.
         */
        case 'push': {
            const drawings = Array.isArray(raw.drawings)
                ? raw.drawings
                : [];

            const markers = Array.isArray(raw.markers)
                ? raw.markers
                : [];

            const targets = Array.isArray(raw.targets)
                ? raw.targets
                : [];

            const guns = Array.isArray(raw.guns)
                ? raw.guns
                : [];

            if (
                drawings.length > LIMITS.drawings ||
                markers.length > LIMITS.markers ||
                targets.length > LIMITS.targets ||
                guns.length > LIMITS.guns
            ) {
                fail('too-large');
            }

            return {
                op: 'push',
                drawings: drawings.map(
                    drawing => validateDrawing(drawing, mapId)
                ),
                markers: markers.map(
                    marker => validateMarker(marker, mapId)
                ),
                targets: targets.map(validateTarget),
                guns: guns.map(validateGun)
            };
        }

        default:
            fail('unknown-op');
    }
}
