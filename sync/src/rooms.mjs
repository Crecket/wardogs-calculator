import { DurableObject } from 'cloudflare:workers';
import { settings } from './config.mjs';
import { hash } from './tokens.mjs';
import { LIMITS, byteLength, normalizeDocument, normalizeOperations, applyOperations, same } from '../../js/collab/protocol.mjs';

const today = () => new Date().toISOString().slice(0, 10);

/* A single small row for global admission and write-credit allocation. No polling. */
export class LobbyBudget extends DurableObject {
    async grant(kind) {
        return this.ctx.blockConcurrencyWhile(async () => {
            const config = settings(this.env);
            const day = today();
            if (!config.enabled) return { amount: 0, day };
            let row = await this.ctx.storage.get('budget');
            if (!row || row.day !== day) row = { day, rooms: 0, batches: 0 };
            let amount = 0;
            if (kind === 'create' && row.rooms < config.maxRoomsPerDay) {
                amount = 1;
                row.rooms++;
            } else if (kind === 'changes') {
                amount = Math.max(0, Math.min(32, config.maxChangeBatchesPerDay - row.batches));
                row.batches += amount;
            }
            if (amount) await this.ctx.storage.put('budget', row);
            return { amount, day };
        });
    }
}

/* Fixed lifetime, one row per commit, no timers/periodic flushes inside the DO. */
export class LobbyRoom extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.record = null;
        this.ctx.blockConcurrencyWhile(async () => { this.record = await ctx.storage.get('room') || null; });
        this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong'));
    }
    async create(doc, expiresAt, ownerHash) {
        return this.ctx.blockConcurrencyWhile(async () => {
            if (this.record || !settings(this.env).enabled) return false;
            this.record = { doc: normalizeDocument(doc), expiresAt, ownerHash, revision: 0, updates: 0, credits: 0, creditDay: '' };
            await this.ctx.storage.put('room', this.record);
            await this.ctx.storage.setAlarm(expiresAt);
            return true;
        });
    }
    alive() { return this.record && this.record.expiresAt > Date.now(); }
    peers() { return this.ctx.getWebSockets().filter(ws => ws.readyState === 1); }
    roster() { return this.peers().map(ws => { const a = ws.deserializeAttachment(); return { id: a.id, name: a.name }; }); }
    send(ws, payload) { try { ws.send(JSON.stringify(payload)); } catch { /* disconnected */ } }
    broadcast(payload) { const text = JSON.stringify(payload); for (const ws of this.peers()) { try { ws.send(text); } catch {} } }
    snapshot(ws, extra = {}) {
        this.send(ws, {
            type: 'snapshot', revision: this.record.revision, doc: this.record.doc,
            you: ws.deserializeAttachment().id, roster: this.roster(),
            maxParticipants: settings(this.env).maxParticipants, expiresAt: this.record.expiresAt,
            remainingUpdates: Math.max(0, settings(this.env).maxChangeBatchesPerRoom - this.record.updates), ...extra
        });
    }
    async fetch(request) {
        if (!settings(this.env).enabled) return new Response('Disabled', { status: 503 });
        if (!this.alive()) return new Response('Expired', { status: 404 });
        if (this.peers().length >= settings(this.env).maxParticipants) return new Response('Room full', { status: 409 });
        const pair = new WebSocketPair();
        const ws = pair[1];
        this.ctx.acceptWebSocket(ws);
        ws.serializeAttachment({ id: crypto.randomUUID(), name: '', tokens: 8, time: Date.now(), strikes: 0, lastId: null });
        this.snapshot(ws);
        this.broadcast({ type: 'peers', roster: this.roster() });
        return new Response(null, { status: 101, webSocket: pair[0] });
    }
    allow(ws) {
        const a = ws.deserializeAttachment();
        const now = Date.now();
        // Includes malformed messages and sync requests. Attachments survive hibernation.
        a.tokens = Math.min(8, a.tokens + (now - a.time) / 1000);
        a.time = now;
        const ok = a.tokens >= 1;
        if (ok) a.tokens--;
        else a.strikes++;
        ws.serializeAttachment(a);
        if (a.strikes >= 3) ws.close(1008, 'rate-limited');
        return ok;
    }
    async webSocketMessage(ws, message) {
        if (!settings(this.env).enabled) { ws.close(1008, 'disabled'); return; }
        if (!this.alive()) { ws.close(1008, 'expired'); return; }
        if (!this.allow(ws)) { this.send(ws, { type: 'error', code: 'rate-limited' }); return; }
        if (typeof message !== 'string' || message.length > LIMITS.messageBytes || byteLength(message) > LIMITS.messageBytes) {
            ws.close(1009, 'message-too-large'); return;
        }
        let raw;
        try { raw = JSON.parse(message); } catch { this.send(ws, { type: 'error', code: 'bad-json' }); return; }
        if (raw?.type === 'name') {
            const a = ws.deserializeAttachment();
            a.name = typeof raw.name === 'string' ? raw.name.replace(/[\u0000-\u001f\u007f]/g, '').trim().slice(0, 24) : '';
            ws.serializeAttachment(a);
            this.broadcast({ type: 'peers', roster: this.roster() });
            return;
        }
        if (raw?.type === 'sync') { this.snapshot(ws); return; }
        if (raw?.type === 'close') {
            if (typeof raw.ownerKey === 'string' && raw.ownerKey.length <= 64 && await hash(raw.ownerKey) === this.record.ownerHash) await this.destroy('closed');
            else this.send(ws, { type: 'error', code: 'not-owner' });
            return;
        }
        if (raw?.type !== 'changes' || typeof raw.id !== 'string' || !/^[\w-]{1,64}$/.test(raw.id)) {
            this.send(ws, { type: 'error', code: 'bad-message' }); return;
        }
        // Serialize validation, quota allocation and commit. No await can interleave another edit.
        await this.ctx.blockConcurrencyWhile(async () => {
            const attachment = ws.deserializeAttachment();
            if (attachment.lastId === raw.id) { this.snapshot(ws, { ack: raw.id }); return; }
            try {
                if (!this.alive()) throw new Error('expired');
                const ops = normalizeOperations(raw.ops, this.record.doc.mapId);
                const next = applyOperations(this.record.doc, ops);
                if (same(next, this.record.doc)) { this.snapshot(ws, { ack: raw.id }); return; }
                const config = settings(this.env);
                if (this.record.updates >= config.maxChangeBatchesPerRoom) throw new Error('room-budget');
                if (this.record.creditDay !== today() || !this.record.credits) {
                    const credit = await this.env.BUDGET.getByName('daily-budget').grant('changes');
                    if (!credit.amount) throw new Error('daily-budget');
                    this.record.credits = credit.amount;
                    this.record.creditDay = credit.day;
                }
                const updated = { ...this.record, doc: next, revision: this.record.revision + 1, updates: this.record.updates + 1, credits: this.record.credits - 1 };
                // Output gate: recipients only see a revision after its durable commit succeeds.
                await this.ctx.storage.put('room', updated);
                this.record = updated;
                attachment.lastId = raw.id;
                ws.serializeAttachment(attachment);
                this.broadcast({ type: 'changes', id: raw.id, from: attachment.id, revision: updated.revision, ops, remainingUpdates: config.maxChangeBatchesPerRoom - updated.updates });
            } catch (error) {
                this.snapshot(ws, { error: error.message, rejected: raw.id });
            }
        });
    }
    async destroy(reason) {
        for (const ws of this.peers()) { this.send(ws, { type: 'closed', reason }); ws.close(1000, reason); }
        this.record = null;
        await this.ctx.storage.deleteAlarm();
        await this.ctx.storage.deleteAll();
    }
    async alarm() { await this.destroy('expired'); }
    webSocketClose(ws, code, reason) {
        try { ws.close(code === 1005 || code === 1006 ? 1000 : code, reason); } catch {}
        this.broadcast({ type: 'peers', roster: this.roster() });
    }
    webSocketError(ws) { try { ws.close(1011, 'connection-error'); } catch {} this.broadcast({ type: 'peers', roster: this.roster() }); }
}
