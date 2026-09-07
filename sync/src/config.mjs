import appConfig from '../../config/app.json' with { type: 'json' };

function integer(value, fallback, min, max) {
    return Number.isSafeInteger(value) && value >= min && value <= max ? value : fallback;
}
export function settings(env = {}) {
    const c = appConfig.collab || {};
    return {
        enabled: env.LOBBIES_DISABLED !== 'true' && (c.enabled === true || env.LOBBIES_DEV === 'true'),
        maxParticipants: integer(c.maxParticipants, 8, 1, 32),
        roomLifetimeHours: integer(c.roomLifetimeHours, 6, 1, 24),
        maxRoomsPerDay: integer(c.maxRoomsPerDay, 250, 1, 10000),
        maxChangeBatchesPerDay: integer(c.maxChangeBatchesPerDay, 20000, 32, 1000000),
        maxChangeBatchesPerRoom: integer(c.maxChangeBatchesPerRoom, 1000, 1, 10000),
        allowedOrigins: Array.isArray(c.allowedOrigins) ? c.allowedOrigins : []
    };
}
