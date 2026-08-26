import { LIMITS } from './ops.js';

export { Room } from './room.js';

/*
 * Room codes are the only credential in this system, so they are minted
 * here and never derived from anything a caller supplies.
 *
 * 12 chars from this 31-symbol alphabet is ~59 bits. The alphabet drops the
 * pairs people mistype when reading a code aloud (0/O, 1/I/L) because
 * codes get shared over voice chat.
 */
const CODE_ALPHABET = 'abcdefghjkmnpqrstuvwxyz23456789';
const CODE_LENGTH = 12;
const CODE_PATTERN = /^[abcdefghjkmnpqrstuvwxyz23456789]{12}$/;

const MAP_ID_PATTERN = /^[a-z0-9][a-z0-9_-]{0,63}$/i;

function mintCode() {
    const bytes = crypto.getRandomValues(
        new Uint8Array(CODE_LENGTH)
    );

    let code = '';

    for (const byte of bytes) {
        /*
         * 248 is the largest multiple of 31 below 256, so bytes at or above
         * it would bias modulo toward the first symbols. That bias is
         * nowhere near exploitable at this length, but rejecting the ragged
         * tail costs nothing and keeps the distribution flat.
         */
        if (byte >= 248) {
            return mintCode();
        }

        code += CODE_ALPHABET[byte % CODE_ALPHABET.length];
    }

    return code;
}

function allowedOrigin(request, env) {
    const origin = request.headers.get('Origin');

    const configured = String(env.ALLOWED_ORIGINS || '')
        .split(',')
        .map(value => value.trim())
        .filter(Boolean);

    if (!configured.length || configured.includes('*')) {
        return origin || '*';
    }

    /*
     * No Origin header means no browser, so there is no origin to police —
     * curl, native clients and the test suite all arrive this way. An
     * allowlist is a browser-tab defence, not an authentication check;
     * pretending otherwise here would only break non-browser callers while
     * stopping nobody, since anything without a browser can send any
     * Origin it likes.
     */
    if (!origin) {
        return '*';
    }

    return configured.includes(origin)
        ? origin
        : null;
}

function corsHeaders(origin) {
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin'
    };
}

function json(body, status, origin) {
    return new Response(
        JSON.stringify(body),
        {
            status,
            headers: {
                'Content-Type': 'application/json',
                'Cache-Control': 'no-store',
                ...corsHeaders(origin)
            }
        }
    );
}

async function createRoom(request, env, origin) {
    let body;

    try {
        body = await request.json();
    } catch {
        return json({ error: 'bad-json' }, 400, origin);
    }

    const mapId = typeof body?.mapId === 'string'
        ? body.mapId.trim()
        : '';

    if (!mapId || !MAP_ID_PATTERN.test(mapId)) {
        return json({ error: 'bad-map' }, 400, origin);
    }

    /*
     * A collision at 60 bits is not going to happen, but create() returning
     * false is the difference between a fresh room and silently handing a
     * caller edit access to someone else's, so it is worth the retry loop.
     */
    for (let attempt = 0; attempt < 5; attempt++) {
        const code = mintCode();
        const room = env.ROOM.getByName(code);

        if (await room.create(mapId)) {
            return json(
                {
                    code,
                    mapId,
                    expiresInMs: LIMITS.idleMs
                },
                201,
                origin
            );
        }
    }

    return json({ error: 'no-code' }, 503, origin);
}

export default {
    async fetch(request, env) {
        const origin = allowedOrigin(request, env);
        const url = new URL(request.url);

        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: corsHeaders(origin || '*')
            });
        }

        /*
         * The allowlist gates room CREATION only. Joining is deliberately
         * left open to any origin: the room code is the credential, and
         * people share links into contexts this Worker cannot enumerate.
         * Gating the upgrade here would also break every non-browser
         * client while stopping no attacker, since Origin is trivially
         * forged outside a browser.
         */
        if (
            url.pathname === '/room' &&
            request.method === 'POST'
        ) {
            if (!origin) {
                return new Response('Forbidden origin', { status: 403 });
            }

            return createRoom(request, env, origin);
        }

        const match = url.pathname.match(/^\/room\/([^/]+)$/);

        if (match && request.method === 'GET') {
            const code = match[1];

            /*
             * Reject malformed codes here so a scan of the room space never
             * reaches a Durable Object and never gets timing that separates
             * "wrong shape" from "no such room".
             */
            if (!CODE_PATTERN.test(code)) {
                return new Response('No such room', { status: 404 });
            }

            return env.ROOM
                .getByName(code)
                .fetch(request);
        }

        if (url.pathname === '/health') {
            return json({ ok: true }, 200, origin || '*');
        }

        return new Response('Not found', { status: 404 });
    }
};
