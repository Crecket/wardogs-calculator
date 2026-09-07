import { settings } from './config.mjs';
import { normalizeDocument } from '../../js/collab/protocol.mjs';
import { randomKey, hash, mintInvite, verifyInvite } from './tokens.mjs';
export { LobbyRoom, LobbyBudget } from './rooms.mjs';
function headers(origin) {
    return {
        'Content-Type': 'application/json', 'Cache-Control': 'no-store',
        'Access-Control-Allow-Origin': origin, Vary: 'Origin',
        'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400',
        'Referrer-Policy': 'no-referrer'
    };
}
const json = (body, status, origin) => new Response(JSON.stringify(body), { status, headers: headers(origin) });

async function limitedBody(request, maximum) {
    const reader = request.body?.getReader();
    if (!reader) throw new Error('bad-json');
    const chunks = [];
    let size = 0;
    while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > maximum) { await reader.cancel(); throw new Error('room-too-large'); }
        chunks.push(value);
    }
    const combined = new Uint8Array(size);
    let offset = 0;
    for (const chunk of chunks) { combined.set(chunk, offset); offset += chunk.length; }
    try { return JSON.parse(new TextDecoder().decode(combined)); }
    catch { throw new Error('bad-json'); }
}
export default {
    async fetch(request, env) {
        const config = settings(env);
        const origin = request.headers.get('Origin') || '';
        // Browser-origin restriction is defence in depth, not authentication.
        if (!config.allowedOrigins.includes(origin)) return json({ error: 'forbidden-origin' }, 403, 'null');
        if (!config.enabled) return json({ error: 'disabled' }, 503, origin);
        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: headers(origin) });
        if (typeof env.ROOM_SECRET !== 'string' || env.ROOM_SECRET.length < 32) return json({ error: 'not-configured' }, 503, origin);
        const ip = request.headers.get('CF-Connecting-IP') || 'local';
        if (env.ENTRY_RATE && !(await env.ENTRY_RATE.limit({ key: ip })).success) return json({ error: 'rate-limited' }, 429, origin);
        const url = new URL(request.url);
        try {
            if (url.pathname === '/rooms' && request.method === 'POST') {
                if (env.CREATE_RATE && !(await env.CREATE_RATE.limit({ key: ip })).success) return json({ error: 'rate-limited' }, 429, origin);
                const raw = await limitedBody(request, 128 * 1024);
                const doc = normalizeDocument(raw.doc);
                const budget = await env.BUDGET.getByName('daily-budget').grant('create');
                if (!budget.amount) return json({ error: 'daily-room-limit' }, 429, origin);
                const expiresAt = Date.now() + config.roomLifetimeHours * 3600000;
                const code = await mintInvite(env.ROOM_SECRET, expiresAt);
                const ownerKey = randomKey();
                const created = await env.ROOMS.getByName(code).create(doc, expiresAt, await hash(ownerKey));
                if (!created) return json({ error: 'create-failed' }, 503, origin);
                return json({ code, ownerKey, expiresAt, maxParticipants: config.maxParticipants }, 201, origin);
            }
            const match = url.pathname.match(/^\/rooms\/([^/]+)$/);
            if (match && request.method === 'GET') {
                if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return json({ error: 'websocket-required' }, 426, origin);
                // Random scanners never instantiate DOs: invites are signed before lookup.
                if (!await verifyInvite(env.ROOM_SECRET, match[1])) return json({ error: 'invalid-invite' }, 404, origin);
                return env.ROOMS.getByName(match[1]).fetch(request);
            }
            return json({ error: 'not-found' }, 404, origin);
        } catch (error) {
            const clientErrors = /^(bad-|too-|wrong-|duplicate-|room-too-large)/;
            return json({ error: clientErrors.test(error.message) ? error.message : 'unavailable' }, clientErrors.test(error.message) ? 400 : 503, origin);
        }
    }
};
