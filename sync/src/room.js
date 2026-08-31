import { DurableObject } from 'cloudflare:workers';

import {
    LIMITS,
    isOpError,
    validateCursor,
    validateName,
    validateOp
} from './ops.js';

/*
 * How far the stored idle deadline is allowed to lag behind the room's
 * real last activity. Five minutes against a fourteen-day window, in
 * exchange for not writing storage on every op.
 */
const TOUCH_GRANULARITY_MS = 5 * 60 * 1000;

/* Reused rather than reallocated: every inbound message is measured. */
const ENCODER = new TextEncoder();

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

        this.cursorBuckets = new Map();

        /*
         * Mirrors the stored idle deadline so the common op does not read
         * it back. null means "not read yet", which is also what alarm()
         * leaves behind after a wipe. See touch().
         */
        this.lastActivity = null;

        /*
         * Heartbeats are answered by the runtime itself: a matching frame
         * gets the canned reply without waking a hibernating room, so a
         * peer can hold a map open for hours and cost nothing. The handler
         * in webSocketMessage still exists for pings that carry extra
         * fields, since the match here is exact string equality.
         */
        ctx.setWebSocketAutoResponse(
            new WebSocketRequestResponsePair(
                JSON.stringify({ type: 'ping' }),
                JSON.stringify({ type: 'pong' })
            )
        );

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

        /*
         * Guns are a collection, unlike origin/target which are single
         * meta rows. A room created before this migration simply gains an
         * empty table; its existing origin keeps working untouched.
         */
        if (version < 2) {
            sql.exec(`
                CREATE TABLE IF NOT EXISTS guns (
                    id TEXT PRIMARY KEY,
                    json TEXT NOT NULL
                );
                INSERT INTO _sql_schema_migrations (id) VALUES (2);
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

        await this.touch(true);

        return true;
    }

    /*
     * Push the idle deadline out. Every connect and every accepted op
     * calls this, so a room only expires after LIMITS.idleMs of real
     * silence rather than a fixed time from creation.
     *
     * Writing on every op would be two durable writes on the hottest path
     * there is — dragging a gun emits ten ops a second — to move a deadline
     * that is a fortnight away. So the recorded time is allowed to lag by
     * TOUCH_GRANULARITY_MS, and a room can expire that much early out of
     * those fourteen days. `force` is for the first touch of a room's life,
     * where the deadline has to exist rather than merely be approximate.
     */
    async touch(force = false) {
        const now = Date.now();

        if (this.lastActivity === null) {
            this.lastActivity = this.readMeta('lastActivity', 0);
        }

        if (!force && now - this.lastActivity < TOUCH_GRANULARITY_MS) {
            return;
        }

        this.lastActivity = now;
        this.writeMeta('lastActivity', now);

        await this.ctx.storage.setAlarm(now + LIMITS.idleMs);
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
            DELETE FROM guns;
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
            guns: this.rows('guns'),
            origin: this.readMeta('origin'),
            target: this.readMeta('target'),
            weapon: this.readMeta('weapon')
        };
    }

    /*
     * The full document plus everything a client needs to render it. Sent
     * on join and again whenever a client asks to resync, which must not
     * be allowed to drift into two different shapes.
     */
    snapshotMessage(clientId) {
        const roster = this.roster();

        return {
            type: 'snapshot',
            you: clientId,
            peers: roster.length,
            roster,
            limits: {
                drawings: LIMITS.drawings,
                markers: LIMITS.markers,
                targets: LIMITS.targets,
                peers: LIMITS.peers
            },
            doc: this.snapshot()
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

            case 'gun.add':
                return this.insert('guns', LIMITS.guns, op.gun);

            case 'gun.move': {
                const rows = sql
                    .exec('SELECT json FROM guns WHERE id = ?', op.id)
                    .toArray();

                if (!rows.length) {
                    return false;
                }

                const gun = JSON.parse(rows[0].json);

                gun.x = op.x;
                gun.y = op.y;

                sql.exec(
                    'UPDATE guns SET json = ? WHERE id = ?',
                    JSON.stringify(gun),
                    op.id
                );

                return true;
            }

            case 'gun.weapon': {
                const rows = sql
                    .exec('SELECT json FROM guns WHERE id = ?', op.id)
                    .toArray();

                if (!rows.length) {
                    return false;
                }

                const gun = JSON.parse(rows[0].json);

                gun.weapon = op.weapon;

                sql.exec(
                    'UPDATE guns SET json = ? WHERE id = ?',
                    JSON.stringify(gun),
                    op.id
                );

                return true;
            }

            case 'gun.remove':
                return this.remove('guns', op.id);

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

                if (op.scope === 'all') {
                    sql.exec('DELETE FROM guns');
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

                for (const gun of op.guns) {
                    changed = this.insert('guns', LIMITS.guns, gun) || changed;
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
        server.serializeAttachment({ clientId, name: null });

        await this.touch();

        this.send(server, this.snapshotMessage(clientId));

        this.broadcastPeers(null, server);

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

    roster(omit = null) {
        const entries = [];

        for (const socket of this.ctx.getWebSockets()) {
            if (socket === omit) {
                continue;
            }

            const attachment = socket.deserializeAttachment();

            if (!attachment?.clientId) {
                continue;
            }

            entries.push({
                id: attachment.clientId,
                name: typeof attachment.name === 'string'
                    ? attachment.name
                    : null
            });
        }

        return entries;
    }

    /*
     * `except` is who not to tell, `omit` is who not to list: a joining
     * socket is already in getWebSockets() and should be counted, while a
     * closing one is still in getWebSockets() and must not be.
     */
    broadcastPeers(omit = null, except = null) {
        const roster = this.roster(omit);

        this.broadcast(
            {
                type: 'peers',
                count: roster.length,
                roster
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
        return this.spend(
            this.buckets,
            clientId,
            LIMITS.opsPerSecond,
            LIMITS.opsBurst
        );
    }

    allowCursor(clientId) {
        return this.spend(
            this.cursorBuckets,
            clientId,
            LIMITS.cursorsPerSecond,
            LIMITS.cursorBurst
        );
    }

    spend(buckets, clientId, rate, burst) {
        const now = Date.now();

        const bucket = buckets.get(clientId) ?? {
            tokens: burst,
            last: now
        };

        const refill =
            ((now - bucket.last) / 1000) * rate;

        bucket.tokens = Math.min(
            burst,
            bucket.tokens + refill
        );

        bucket.last = now;

        if (bucket.tokens < 1) {
            buckets.set(clientId, bucket);
            return false;
        }

        bucket.tokens -= 1;
        buckets.set(clientId, bucket);

        return true;
    }

    async webSocketMessage(socket, message) {
        if (typeof message !== 'string') {
            this.send(socket, { type: 'error', code: 'binary-unsupported' });
            return;
        }

        /*
         * String .length counts UTF-16 units, so a limit named in bytes has
         * to be measured in bytes: 64K characters of Cyrillic or CJK is
         * ~192 KB. Target names are the reachable path for multibyte text.
         */
        if (
            ENCODER.encode(message).length >
            LIMITS.messageBytes
        ) {
            this.send(socket, { type: 'error', code: 'too-large' });
            return;
        }

        const clientId = this.clientIdFor(socket);

        if (!clientId) {
            socket.close(1011, 'no-identity');
            return;
        }

        let raw;

        try {
            raw = JSON.parse(message);
        } catch {
            this.allow(clientId);
            this.send(socket, { type: 'error', code: 'bad-json' });
            return;
        }

        const isCursor = raw?.type === 'cursor';

        if (isCursor) {
            if (!this.allowCursor(clientId)) {
                return;
            }
        } else if (!this.allow(clientId)) {
            this.send(socket, { type: 'error', code: 'rate-limited' });
            return;
        }

        /*
         * The exact frame `{"type":"ping"}` never reaches here — the auto
         * response set up in the constructor answers it without waking the
         * room. This is the fallback for a ping carrying anything else.
         */
        if (raw?.type === 'ping') {
            this.send(socket, { type: 'pong' });
            return;
        }

        if (raw?.type === 'name') {
            socket.serializeAttachment({
                clientId,
                name: validateName(raw.name)
            });

            this.broadcastPeers();
            return;
        }

        /*
         * Re-send the authoritative document. A client asks for this after
         * an op is rejected, so a local edit the room never accepted does
         * not linger on screen as though everyone could see it.
         */
        if (raw?.type === 'sync') {
            this.send(socket, this.snapshotMessage(clientId));
            return;
        }

        if (isCursor) {
            let frame;

            try {
                frame = validateCursor(raw);
            } catch (error) {
                this.send(socket, {
                    type: 'error',
                    code: isOpError(error)
                        ? error.code
                        : 'bad-cursor'
                });
                return;
            }

            this.broadcast(
                {
                    type: 'cursor',
                    from: clientId,
                    ...frame
                },
                socket
            );

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

    /*
     * No socket.close() here on purpose. The compatibility date this Worker
     * pins (2026-04-07) is the one where the runtime replies to a Close
     * frame itself, so echoing one back is redundant rather than required.
     */
    async webSocketClose(socket) {
        const clientId = this.clientIdFor(socket);

        if (clientId) {
            this.buckets.delete(clientId);
            this.cursorBuckets.delete(clientId);
        }

        this.broadcastPeers(socket, socket);
    }

    async webSocketError(socket) {
        await this.webSocketClose(socket);
    }
}
