import { DurableObject } from 'cloudflare:workers';

import {
    LIMITS,
    isOpError,
    validateOp
} from './ops.js';

/*
 * One Durable Object per room, addressed by its room code.
 *
 * The room code IS the credential, so this class assumes every peer is
 * hostile: it validates each op, caps how fast and how much a socket can
 * send, and rebroadcasts only the canonical form it produced itself.
 *
 * WebSocket Hibernation (ctx.acceptWebSocket, not ws.accept) is what makes
 * this affordable: peers can idle with a map open for hours without the
 * object holding memory, since duration charges stop while hibernated.
 */
export class Room extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);

        /*
         * Rate-limit buckets live in memory only. Hibernation drops them,
         * which is harmless: hibernating requires ~10s of silence, so a
         * bucket that comes back full has already served its purpose.
         */
        this.buckets = new Map();

        ctx.blockConcurrencyWhile(async () => this.migrate());
    }

    migrate() {
        const sql = this.ctx.storage.sql;

        sql.exec(`
            CREATE TABLE IF NOT EXISTS _sql_schema_migrations (
                id INTEGER PRIMARY KEY,
                applied_at TEXT NOT NULL DEFAULT (datetime('now'))
            )
        `);

        const version = sql
            .exec('SELECT COALESCE(MAX(id), 0) AS version FROM _sql_schema_migrations')
            .one()
            .version;

        if (version < 1) {
            sql.exec(`
                CREATE TABLE IF NOT EXISTS meta (
                    k TEXT PRIMARY KEY,
                    v TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS drawings (
                    id TEXT PRIMARY KEY,
                    json TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS markers (
                    id TEXT PRIMARY KEY,
                    json TEXT NOT NULL
                );
                CREATE TABLE IF NOT EXISTS targets (
                    id TEXT PRIMARY KEY,
                    json TEXT NOT NULL
                );
                INSERT INTO _sql_schema_migrations (id) VALUES (1);
            `);
        }
    }

    /* ---------- meta helpers ---------- */

    readMeta(key, fallback = null) {
        const rows = this.ctx.storage.sql
            .exec('SELECT v FROM meta WHERE k = ?', key)
            .toArray();

        if (!rows.length) {
            return fallback;
        }

        try {
            return JSON.parse(rows[0].v);
        } catch {
            return fallback;
        }
    }

    writeMeta(key, value) {
        this.ctx.storage.sql.exec(
            'INSERT OR REPLACE INTO meta (k, v) VALUES (?, ?)',
            key,
            JSON.stringify(value)
        );
    }

    exists() {
        return this.readMeta('createdAt') !== null;
    }

    /* ---------- lifecycle ---------- */

    /*
     * Called once by the Worker right after it mints a room code. Returns
     * false if this code somehow already names a live room, so the Worker
     * can mint another rather than hand a caller someone else's room.
     */
    async create(mapId) {
        if (this.exists()) {
            return false;
        }

        this.writeMeta('createdAt', Date.now());
        this.writeMeta('mapId', mapId);
        this.writeMeta('origin', null);
        this.writeMeta('target', null);
        this.writeMeta('weapon', null);

        await this.touch();

        return true;
    }

    /*
     * Push the idle deadline out. Every connect and every accepted op
     * calls this, so a room only expires after LIMITS.idleMs of real
     * silence rather than a fixed time from creation.
     */
    async touch() {
        this.writeMeta('lastActivity', Date.now());

        await this.ctx.storage.setAlarm(
            Date.now() + LIMITS.idleMs
        );
    }

    async alarm() {
        const last = this.readMeta('lastActivity', 0);
        const idle = Date.now() - last;

        if (idle < LIMITS.idleMs) {
            await this.ctx.storage.setAlarm(
                last + LIMITS.idleMs
            );
            return;
        }

        for (const socket of this.ctx.getWebSockets()) {
            try {
                socket.close(1001, 'room-expired');
            } catch {
                /* Already gone. */
            }
        }

        /*
         * Clear the content rather than storage.deleteAll(): that would
         * drop the schema too, and this instance may stay resident and
         * hit missing tables before the constructor ever re-runs. Empty
         * meta is what makes exists() false, so the code 404s from here on.
         */
        this.ctx.storage.sql.exec(`
            DELETE FROM drawings;
            DELETE FROM markers;
            DELETE FROM targets;
            DELETE FROM meta;
        `);
    }

    /* ---------- document ---------- */

    rows(table) {
        return this.ctx.storage.sql
            .exec(`SELECT json FROM ${table} ORDER BY rowid`)
            .toArray()
            .map(row => JSON.parse(row.json));
    }

    count(table) {
        return this.ctx.storage.sql
            .exec(`SELECT COUNT(*) AS n FROM ${table}`)
            .one()
            .n;
    }

    snapshot() {
        return {
            mapId: this.readMeta('mapId'),
            drawings: this.rows('drawings'),
            markers: this.rows('markers'),
            savedTargets: this.rows('targets'),
            origin: this.readMeta('origin'),
            target: this.readMeta('target'),
            weapon: this.readMeta('weapon')
        };
    }

    insert(table, limit, item) {
        const existing = this.ctx.storage.sql
            .exec(`SELECT 1 FROM ${table} WHERE id = ?`, item.id)
            .toArray()
            .length;

        /*
         * An id already present is an undo re-adding its own item, which
         * must not count against the cap a second time.
         */
        if (!existing && this.count(table) >= limit) {
            return false;
        }

        this.ctx.storage.sql.exec(
            `INSERT OR REPLACE INTO ${table} (id, json) VALUES (?, ?)`,
            item.id,
            JSON.stringify(item)
        );

        return true;
    }

    /*
     * SELECT before DELETE rather than reading rowsWritten: that counter
     * also counts index updates and only settles as the cursor is drained,
     * so it cannot answer "did this row exist". Two peers erasing the same
     * stroke must produce exactly one broadcast, so the answer has to be exact.
     */
    remove(table, id) {
        const found = this.ctx.storage.sql
            .exec(`SELECT 1 FROM ${table} WHERE id = ?`, id)
            .toArray()
            .length > 0;

        if (!found) {
            return false;
        }

        this.ctx.storage.sql.exec(
            `DELETE FROM ${table} WHERE id = ?`,
            id
        );

        return true;
    }

    /*
     * Applies an already-validated op. Returns true when the document
     * actually changed; a false means the op is dropped rather than
     * rebroadcast, so peers never see a no-op.
     */
    apply(op) {
        const sql = this.ctx.storage.sql;

        switch (op.op) {
            case 'drawing.add':
                return this.insert('drawings', LIMITS.drawings, op.drawing);

            case 'marker.add':
                return this.insert('markers', LIMITS.markers, op.marker);

            case 'target.add':
                return this.insert('targets', LIMITS.targets, op.target);

            case 'drawing.remove':
                return this.remove('drawings', op.id);

            case 'marker.remove':
                return this.remove('markers', op.id);

            case 'target.remove':
                return this.remove('targets', op.id);

            case 'target.rename': {
                const rows = sql
                    .exec('SELECT json FROM targets WHERE id = ?', op.id)
                    .toArray();

                if (!rows.length) {
                    return false;
                }

                const target = JSON.parse(rows[0].json);
                target.name = op.name;

                sql.exec(
                    'UPDATE targets SET json = ? WHERE id = ?',
                    JSON.stringify(target),
                    op.id
                );

                return true;
            }

            case 'point.set':
                this.writeMeta(op.point, { x: op.x, y: op.y });
                return true;

            case 'weapon.set':
                this.writeMeta('weapon', op.weapon);
                return true;

            case 'clear':
                if (op.scope === 'all' || op.scope === 'drawings') {
                    sql.exec('DELETE FROM drawings');
                }

                if (op.scope === 'all' || op.scope === 'markers') {
                    sql.exec('DELETE FROM markers');
                }

                if (op.scope === 'all' || op.scope === 'targets') {
                    sql.exec('DELETE FROM targets');
                }

                return true;

            case 'push': {
                let changed = false;

                for (const drawing of op.drawings) {
                    changed = this.insert('drawings', LIMITS.drawings, drawing) || changed;
                }

                for (const marker of op.markers) {
                    changed = this.insert('markers', LIMITS.markers, marker) || changed;
                }

                for (const target of op.targets) {
                    changed = this.insert('targets', LIMITS.targets, target) || changed;
                }

                return changed;
            }

            default:
                return false;
        }
    }

    /* ---------- sockets ---------- */

    async fetch(request) {
        if (request.headers.get('Upgrade') !== 'websocket') {
            return new Response('Expected websocket', { status: 426 });
        }

        if (!this.exists()) {
            return new Response('No such room', { status: 404 });
        }

        if (this.ctx.getWebSockets().length >= LIMITS.peers) {
            return new Response('Room is full', { status: 409 });
        }

        const pair = new WebSocketPair();
        const client = pair[0];
        const server = pair[1];

        const clientId = crypto.randomUUID();

        this.ctx.acceptWebSocket(server);
        server.serializeAttachment({ clientId });

        await this.touch();

        this.send(server, {
            type: 'snapshot',
            you: clientId,
            peers: this.ctx.getWebSockets().length,
            limits: {
                drawings: LIMITS.drawings,
                markers: LIMITS.markers,
                targets: LIMITS.targets,
                peers: LIMITS.peers
            },
            doc: this.snapshot()
        });

        this.broadcastPeers(server);

        return new Response(null, {
            status: 101,
            webSocket: client
        });
    }

    send(socket, payload) {
        try {
            socket.send(JSON.stringify(payload));
        } catch {
            /* Socket died between selection and send. */
        }
    }

    broadcast(payload, except = null) {
        const message = JSON.stringify(payload);

        for (const socket of this.ctx.getWebSockets()) {
            if (socket === except) {
                continue;
            }

            try {
                socket.send(message);
            } catch {
                /* Socket died between selection and send. */
            }
        }
    }

    broadcastPeers(except = null) {
        this.broadcast(
            {
                type: 'peers',
                count: this.ctx.getWebSockets().length
            },
            except
        );
    }

    clientIdFor(socket) {
        const attachment = socket.deserializeAttachment();
        return attachment?.clientId ?? null;
    }

    /*
     * Token bucket: LIMITS.opsPerSecond sustained, LIMITS.opsBurst in hand.
     * A burst budget matters because "push mine into the room" and a fast
     * series of eraser clicks are both legitimately spiky.
     */
    allow(clientId) {
        const now = Date.now();

        const bucket = this.buckets.get(clientId) ?? {
            tokens: LIMITS.opsBurst,
            last: now
        };

        const refill =
            ((now - bucket.last) / 1000) * LIMITS.opsPerSecond;

        bucket.tokens = Math.min(
            LIMITS.opsBurst,
            bucket.tokens + refill
        );

        bucket.last = now;

        if (bucket.tokens < 1) {
            this.buckets.set(clientId, bucket);
            return false;
        }

        bucket.tokens -= 1;
        this.buckets.set(clientId, bucket);

        return true;
    }

    async webSocketMessage(socket, message) {
        if (typeof message !== 'string') {
            this.send(socket, { type: 'error', code: 'binary-unsupported' });
            return;
        }

        if (message.length > LIMITS.messageBytes) {
            this.send(socket, { type: 'error', code: 'too-large' });
            return;
        }

        const clientId = this.clientIdFor(socket);

        if (!clientId) {
            socket.close(1011, 'no-identity');
            return;
        }

        if (!this.allow(clientId)) {
            this.send(socket, { type: 'error', code: 'rate-limited' });
            return;
        }

        let raw;

        try {
            raw = JSON.parse(message);
        } catch {
            this.send(socket, { type: 'error', code: 'bad-json' });
            return;
        }

        if (raw?.type === 'ping') {
            this.send(socket, { type: 'pong' });
            return;
        }

        let op;

        try {
            op = validateOp(raw, this.readMeta('mapId'));
        } catch (error) {
            this.send(socket, {
                type: 'error',
                code: isOpError(error)
                    ? error.code
                    : 'bad-op'
            });
            return;
        }

        if (!this.apply(op)) {
            this.send(socket, { type: 'error', code: 'rejected' });
            return;
        }

        await this.touch();

        this.broadcast(
            {
                type: 'op',
                from: clientId,
                op
            },
            socket
        );

        this.send(socket, {
            type: 'ack',
            seq: raw.seq ?? null
        });
    }

    async webSocketClose(socket) {
        const clientId = this.clientIdFor(socket);

        if (clientId) {
            this.buckets.delete(clientId);
        }

        this.broadcastPeers(socket);
    }

    async webSocketError(socket) {
        await this.webSocketClose(socket);
    }
}
