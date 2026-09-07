/* Optional classic-script adapter. Loading this file does not contact the Worker. */
async function initLobby() {
    if (lobby || APP_CONFIG.collab?.enabled !== true) return;
    const config = APP_CONFIG.collab;
    const server = new URL(config.serverUrl);
    if (server.username || server.password || server.search || server.hash ||
        (server.protocol !== 'https:' && !(server.protocol === 'http:' && ['localhost', '127.0.0.1'].includes(server.hostname)))) {
        throw new Error('Lobby server must use HTTPS (HTTP is allowed only on localhost).');
    }
    const base = server.href.replace(/\/$/, '');
    const P = await import(versionRuntimeAsset(new URL('js/collab/protocol.mjs', BASE_PATH).href));
    const { createReplicaClass } = await import(versionRuntimeAsset(new URL('js/collab/replica.mjs', BASE_PATH).href));
    const Replica = createReplicaClass(P);
    const words = {
        en: {
            title: 'Lobby', name: 'Your name', invite: 'Invite link or code', create: 'Create lobby', join: 'Join',
            include: 'Share my saved targets too', privacy: 'Drawings and map markers are shared. Gun, target and weapon stay personal. Teammates see labelled points without range circles.',
            copy: 'Copy invite', leave: 'Leave', close: 'Close for everyone', reconnect: 'Reconnect', export: 'Export recovery copy',
            idle: 'No connection until you create or join a lobby.', connecting: 'Connecting…', ready: 'Connected · synchronised',
            pending: 'Sending changes…', offline: 'Disconnected. Editing paused; reconnect manually or leave.',
            failed: 'Cannot connect: the lobby may be full, expired or disabled. Check the invite and server settings.',
            conflict: 'Conflicting change was not applied. Latest room state restored; your version is available as a recovery copy.',
            quota: 'Change limit reached. Editing paused. Export the room before leaving.', invalid: 'Room limits exceeded or unsupported data. Your version is available as a recovery copy.',
            copied: 'Invite copied.', closeConfirm: 'Close this lobby for everyone and delete its shared state?',
            leaveConfirm: 'Some changes are not confirmed by the server. Leave anyway? A recovery copy will remain available until reload.',
            reconnectConfirm: 'Reconnect and load the server version? Unconfirmed changes will be kept as a recovery copy.',
            closed: 'Lobby closed or expired. Your personal workspace has been restored.',
            map: 'Room map is fixed. Leave to change it.', remaining: 'Batches left', expires: 'Expires',
            budget: 'Daily room creation limit reached. Try after 00:00 UTC.', limited: 'Too many requests. Wait a minute and try again.',
            fallback: 'Participant', recovery: 'A recovery copy is available below. It is kept only in this tab until reload.'
        },
        ru: {
            title: 'Лобби', name: 'Твоё имя', invite: 'Ссылка или код приглашения', create: 'Создать лобби', join: 'Войти',
            include: 'Поделиться и моими сохранёнными целями', privacy: 'Рисунки и метки общие. Орудие, цель и оружие личные. Союзники видят подписанные точки без кругов дальности.',
            copy: 'Скопировать приглашение', leave: 'Выйти', close: 'Закрыть для всех', reconnect: 'Переподключиться', export: 'Скачать резервную копию',
            idle: 'Подключение начнётся только после создания лобби или входа.', connecting: 'Подключение…', ready: 'Подключено · синхронизировано',
            pending: 'Отправка изменений…', offline: 'Связь потеряна. Правки приостановлены; переподключись вручную или выйди.',
            failed: 'Не удалось войти: лобби может быть заполнено, закрыто или отключено. Проверь приглашение и настройки сервера.',
            conflict: 'Конфликтующая правка не применена. Загружено состояние комнаты; твой вариант доступен в резервной копии.',
            quota: 'Достигнут лимит изменений. Правки приостановлены. Скачай состояние комнаты перед выходом.', invalid: 'Превышены лимиты комнаты или есть неподдерживаемые данные. Твой вариант доступен в резервной копии.',
            copied: 'Приглашение скопировано.', closeConfirm: 'Закрыть лобби для всех и удалить его совместное состояние?',
            leaveConfirm: 'Сервер ещё не подтвердил часть изменений. Всё равно выйти? Резервная копия будет доступна до перезагрузки страницы.',
            reconnectConfirm: 'Переподключиться и загрузить серверный вариант? Неподтверждённые правки останутся в резервной копии.',
            closed: 'Лобби закрыто или истекло. Личное состояние карты восстановлено.',
            map: 'Карта лобби фиксирована. Для смены выйди из него.', remaining: 'Пакетов правок осталось', expires: 'Истекает',
            budget: 'Достигнут суточный лимит создания комнат. Попробуй после 00:00 UTC.', limited: 'Слишком много запросов. Подожди минуту.',
            fallback: 'Участник', recovery: 'Ниже доступна резервная копия. Она хранится только в этой вкладке до перезагрузки.'
        }
    };
    const t = key => (words[LANG] || words.en)[key] || key;
    const root = document.createElement('div');
    root.id = 'lobbyControls';
    root.className = 'lobby-controls';
    // Static markup only. Names, URLs and server data always use textContent/value.
    root.innerHTML = `
        <section id="lobbyPanel" class="lobby-panel" aria-labelledby="lobbyHeading" hidden>
            <h3 id="lobbyHeading" data-lobby-text="title"></h3>
            <p class="lobby-status" role="status" aria-live="polite"></p>
            <div class="lobby-setup">
                <label><span data-lobby-text="name"></span><input class="lobby-name" maxlength="24" autocomplete="nickname"></label>
                <label><span data-lobby-text="invite"></span><input class="lobby-invite" maxlength="2000" autocomplete="off" spellcheck="false"></label>
                <button type="button" data-action="join" data-lobby-text="join"></button>
                <label class="lobby-check"><input type="checkbox" class="lobby-include"><span data-lobby-text="include"></span></label>
                <button type="button" data-action="create" data-lobby-text="create"></button>
            </div>
            <div class="lobby-session" hidden>
                <p class="lobby-count"></p><p class="lobby-map"></p><ul class="lobby-peers"></ul>
                <p class="lobby-budget"></p><p class="lobby-expires"></p>
                <label><span data-lobby-text="invite"></span><input class="lobby-link" readonly></label>
                <div class="lobby-actions">
                    <button type="button" data-action="copy" data-lobby-text="copy"></button>
                    <button type="button" data-action="reconnect" data-lobby-text="reconnect"></button>
                    <button type="button" data-action="leave" data-lobby-text="leave"></button>
                    <button type="button" data-action="close" data-lobby-text="close"></button>
                </div>
            </div>
            <p class="lobby-privacy" data-lobby-text="privacy"></p>
            <p class="lobby-recovery" data-lobby-text="recovery" hidden></p>
            <button type="button" data-action="export" data-lobby-text="export" hidden></button>
        </section>
        <button type="button" class="lobby-toggle" aria-controls="lobbyPanel" aria-expanded="false">
            <span class="lobby-icon" aria-hidden="true">
                <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">
                    <circle cx="9" cy="8" r="3"/><path d="M3.5 19v-1.5A4.5 4.5 0 0 1 8 13h2a4.5 4.5 0 0 1 4.5 4.5V19"/>
                    <circle cx="17" cy="9" r="2.2"/><path d="M15.5 14h1.8a3.2 3.2 0 0 1 3.2 3.2V19"/>
                </svg>
                <span class="lobby-dot"></span>
            </span>
            <span class="lobby-badge"></span>
        </button>`;
    document.querySelector('.map').append(root);
    const q = selector => root.querySelector(selector);
    const action = name => q(`[data-action="${name}"]`);
    let socket = null, replica = null, backup = null, observed = null;
    let batchTimer, presenceTimer, connectTimer, ackTimer, heartbeat;
    let applying = false, needsRender = false, joining = false, readOnly = false;
    let code = '', ownerKey = '', you = '', roster = [], maximum = config.maxParticipants;
    let expiresAt = 0, remaining = 0, notice = '', recovery = null;
    let sentPresence = null;
    const delay = Math.max(250, Math.min(5000, Number(config.batchDelayMs) || 300));
    const busy = () => Boolean(drag || MAP_TOOL_STATE.pencilDragging || MAP_TOOL_STATE.zoneDragging || MAP_TOOL_STATE.polygonDraft);
    const connected = () => socket?.readyState === WebSocket.OPEN && !joining;
    const rawDocument = (includeSaved = true) => ({
        mapId: S.map, w: S.w, h: S.h,
        ...Object.fromEntries(P.COLLECTIONS.map(key => [key, key === 'savedTargets' ? (includeSaved ? savedTargets : []) : MAP_TOOL_STATE[key].filter(item => item.mapId === S.map)]))
    });
    const rawPresence = () => P.normalizePresence({ origin: S.origin, target: S.target });
    function validDocument(raw) {
        const doc = P.normalizeDocument(raw);
        if (doc.mapId !== 'custom' && !Object.hasOwn(MAPS, doc.mapId)) throw new Error('unsupported-room');
        if (doc.mapId !== 'custom' && (doc.w !== MAPS[doc.mapId].w || doc.h !== MAPS[doc.mapId].h)) throw new Error('unsupported-map-size');
        return doc;
    }
    function resetGesture() {
        drag = null;
        pan = null;
        setMapTool(null);
    }
    function render() {
        if (!lobby.active || !replica) return;
        if (busy()) { needsRender = true; return; }
        applying = true;
        try {
            const doc = replica.view();
            const different = S.map !== doc.mapId;
            Object.assign(S, { map: doc.mapId, w: doc.w, h: doc.h });
            if (different) {
                if (typeof loadMapPoints === 'function') loadMapPoints();
                clamp(S.origin);
                clamp(S.target);
                Object.assign(S, { zoom: 1, panX: 0, panY: 0 });
            }
            for (const key of P.COLLECTIONS) {
                if (key === 'savedTargets') savedTargets = structuredClone(doc[key]);
                else MAP_TOOL_STATE[key] = structuredClone(doc[key]);
            }
            observed = P.normalizeDocument(rawDocument());
            needsRender = false;
            updatePresetLock();
            inputs();
            renderSavedTargets();
        } finally { applying = false; }
        updateUI();
    }
    function capture() {
        if (!lobby.active || applying || !replica || busy()) return;
        if (!connected() || readOnly) { render(); return; }
        try {
            schedulePresence();
            const current = validDocument(rawDocument());
            const changes = P.diffDocuments(observed, current);
            if (changes.length) {
                replica.edit(changes);
                observed = current;
                notice = '';
                schedule();
            }
            if (needsRender) render();
        } catch {
            recovery = structuredClone(rawDocument());
            notice = 'invalid';
            render();
            open(true);
        }
        updateUI();
    }
    function flushPresence(force = false) {
        if (!connected() || readOnly) return;
        const presence = rawPresence();
        if (!force && P.same(presence, sentPresence)) return;
        const text = JSON.stringify({
            type: 'presence',
            name: q('.lobby-name').value,
            ...presence
        });
        if (P.byteLength(text) > P.LIMITS.messageBytes) throw new Error('bad-presence');
        socket.send(text);
        sentPresence = structuredClone(presence);
    }
    function schedulePresence(force = false) {
        if (!connected() || readOnly) return;
        const presence = rawPresence();
        if (!force && P.same(presence, sentPresence)) return;
        if (force) {
            clearTimeout(presenceTimer);
            presenceTimer = null;
            flushPresence(true);
            return;
        }
        if (!presenceTimer) {
            presenceTimer = setTimeout(() => {
                presenceTimer = null;
                try { flushPresence(); }
                catch { notice = 'invalid'; open(true); }
                updateUI();
            }, delay);
        }
        updateUI();
    }
    function schedule() {
        if (!batchTimer && replica?.queue.length && !replica.flight && connected() && !readOnly) {
            batchTimer = setTimeout(() => { batchTimer = null; flush(); }, delay);
        }
    }
    function send(message) {
        if (!message) return;
        const text = JSON.stringify(message);
        if (P.byteLength(text) > P.LIMITS.messageBytes) throw new Error('message-too-large');
        socket.send(text);
        clearTimeout(ackTimer);
        ackTimer = setTimeout(() => { if (socket) socket.close(4000, 'ack-timeout'); }, 15000);
        updateUI();
    }
    function flush() {
        if (!connected() || readOnly || !replica || replica.flight || busy()) { schedule(); return; }
        try { send(replica.take(crypto.randomUUID())); }
        catch {
            recovery = replica.view();
            replica.snapshot(replica.doc, replica.revision, { rejected: true });
            notice = 'invalid'; render(); open(true);
        }
    }
    function history(mode) {
        if (!connected() || readOnly || busy()) return false;
        capture();
        try {
            const message = replica.history(mode, crypto.randomUUID());
            if (!message) return false;
            send(message); render(); return true;
        } catch {
            notice = 'conflict';
            replica.undoStack = []; replica.redoStack = [];
            updateUI(); open(true); return false;
        }
    }
    function updateHistoryUI() {
        const disabled = !connected() || readOnly || !replica || replica.dirty;
        if ($('mapToolUndoButton')) $('mapToolUndoButton').disabled = disabled || !replica.undoStack.length;
        if ($('mapToolRedoButton')) $('mapToolRedoButton').disabled = disabled || !replica.redoStack.length;
    }
    function updateUI() {
        for (const node of root.querySelectorAll('[data-lobby-text]')) node.textContent = t(node.dataset.lobbyText);
        q('.lobby-toggle').setAttribute('aria-label', t('title'));
        q('.lobby-toggle').title = t('title');
        q('.lobby-setup').hidden = lobby.active;
        q('.lobby-session').hidden = !lobby.active;
        const status = joining ? 'connecting' : notice || (lobby.active ? (!connected() ? 'offline' : readOnly ? 'quota' : (replica?.dirty || presenceTimer) ? 'pending' : 'ready') : 'idle');
        q('.lobby-status').textContent = t(status);
        root.dataset.state = connected() ? (readOnly ? 'paused' : 'connected') : lobby.active ? 'offline' : 'idle';
        q('.lobby-count').textContent = `${roster.length} / ${maximum}`;
        q('.lobby-map').textContent = replica ? `${replica.doc.mapId} · ${t('map')}` : '';
        q('.lobby-badge').textContent = lobby.active ? `${roster.length}/${maximum}` : '';
        q('.lobby-budget').textContent = `${t('remaining')}: ${remaining}`;
        q('.lobby-expires').textContent = `${t('expires')}: ${expiresAt ? new Date(expiresAt).toLocaleTimeString(LANG, { hour: '2-digit', minute: '2-digit' }) : '—'}`;
        q('.lobby-peers').replaceChildren(...roster.map((peer, index) => {
            const li = document.createElement('li');
            li.textContent = `${peer.name || `${t('fallback')} ${index + 1}`}${peer.id === you ? ' •' : ''}`;
            return li;
        }));
        action('create').disabled = joining;
        action('join').disabled = joining;
        action('reconnect').hidden = connected(); action('reconnect').disabled = joining;
        action('close').hidden = !ownerKey; action('close').disabled = !connected();
        action('export').hidden = !recovery && !lobby.active;
        q('.lobby-recovery').hidden = !recovery;
        if (lobby.active) updateHistoryUI();
    }
    function open(value) {
        q('#lobbyPanel').hidden = !value;
        q('.lobby-toggle').setAttribute('aria-expanded', String(value));
    }
    function rememberPersonal() {
        clearTimeout(mapPointsWriteTimer); mapPointsWriteTimer = null;
        writeMapPoints();
        backup = { state: structuredClone(S), tools: structuredClone(MAP_TOOL_STATE), targets: structuredClone(savedTargets), disabled: {} };
        for (const id of ['mapSelect', 'apply', 'w', 'h']) {
            if ($(id)) { backup.disabled[id] = $(id).disabled; $(id).disabled = true; }
        }
        lobby.active = true;
        resetGesture();
    }
    function clearTimers() {
        clearTimeout(batchTimer); clearTimeout(presenceTimer); clearTimeout(connectTimer); clearTimeout(ackTimer); clearInterval(heartbeat);
        batchTimer = null; presenceTimer = null;
    }
    function preserve() {
        if (replica?.dirty) recovery = replica.view();
    }
    function leave(force = false) {
        if (!force && replica?.dirty && !confirm(t('leaveConfirm'))) return;
        preserve();
        const old = socket; socket = null; old?.close(1000, 'left'); clearTimers();
        joining = false;
        if (backup) {
            applying = true;
            resetGesture();
            Object.assign(S, backup.state); Object.assign(MAP_TOOL_STATE, backup.tools); savedTargets = backup.targets;
            for (const [id, disabled] of Object.entries(backup.disabled)) $(id).disabled = disabled;
            // Keep active until rendering finishes: no personal write hook sees room data.
            updatePresetLock(); inputs(); renderSavedTargets();
            lobby.active = false; applying = false; backup = null;
            updateMapToolsUI(); updateMapToolHistoryUI(); draw();
        }
        replica = null; observed = null; sentPresence = null; code = ''; ownerKey = ''; roster = []; readOnly = false; needsRender = false;
        updateUI();
    }
    function parseInvite(value) {
        let candidate = value.trim();
        if (candidate.includes('://')) candidate = new URLSearchParams(new URL(candidate).hash.slice(1)).get('room') || '';
        if (!/^[\w-]{22}\.[a-z0-9]{8,12}\.[\w-]{43}$/.test(candidate)) throw new Error('invalid-invite');
        return candidate;
    }
    function inviteLink() { const url = new URL(location.href); url.hash = `room=${code}`; return url.href; }
    function connect() {
        clearTimers();
        const old = socket; socket = null; old?.close(1000, 'reconnect');
        joining = true; notice = ''; sentPresence = null;
        const url = new URL(`${base}/rooms/${code}`); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
        const current = new WebSocket(url);
        socket = current;
        connectTimer = setTimeout(() => current.close(4000, 'connect-timeout'), 15000);
        current.addEventListener('message', event => {
            if (socket !== current || event.data === 'pong') return;
            try {
                if (typeof event.data !== 'string' || event.data.length > P.LIMITS.messageBytes) throw new Error('bad-message');
                const msg = JSON.parse(event.data);
                if (msg.type === 'snapshot') {
                    const doc = validDocument(msg.doc);
                    const joinedNow = joining;
                    if (joinedNow) {
                        preserve();
                        if (!backup) rememberPersonal();
                        replica = new Replica(doc, msg.revision);
                        joining = false; readOnly = msg.remainingUpdates === 0; notice = '';
                        clearTimeout(connectTimer);
                        heartbeat = setInterval(() => { if (current.readyState === WebSocket.OPEN) current.send('ping'); }, 60000);
                    } else {
                        recovery = replica.snapshot(doc, msg.revision, msg) || recovery;
                        if (msg.error) {
                            notice = ['room-budget', 'daily-budget'].includes(msg.error) ? 'quota' : msg.error === 'conflict' ? 'conflict' : 'invalid';
                            readOnly = notice === 'quota'; open(true);
                        }
                    }
                    if (!replica.flight) clearTimeout(ackTimer);
                    you = P.slug(msg.you); roster = P.normalizeRoster(msg.roster); maximum = msg.maxParticipants; expiresAt = msg.expiresAt; remaining = msg.remainingUpdates;
                    q('.lobby-link').value = inviteLink();
                    render();
                    if (joinedNow) schedulePresence(true);
                    schedule();
                } else if (msg.type === 'changes') {
                    replica.receive(msg);
                    remaining = msg.remainingUpdates;
                    if (!remaining) readOnly = true;
                    if (!replica.flight) clearTimeout(ackTimer);
                    render(); schedule();
                } else if (msg.type === 'peers') { roster = P.normalizeRoster(msg.roster); updateUI(); draw(); }
                else if (msg.type === 'closed') { notice = 'closed'; leave(true); open(true); }
                else if (msg.type === 'error') { notice = msg.code === 'rate-limited' ? 'limited' : 'failed'; updateUI(); }
            } catch {
                preserve(); notice = 'failed'; current.close(4000, 'invalid-state');
            }
        });
        current.addEventListener('close', () => {
            if (socket !== current) return;
            clearTimers(); joining = false;
            notice = lobby.active ? 'offline' : 'failed';
            preserve();
            if (lobby.active) { resetGesture(); render(); }
            updateUI(); open(true);
        });
        current.addEventListener('error', () => { notice = 'failed'; updateUI(); });
        updateUI();
    }
    async function create() {
        joining = true; notice = ''; updateUI();
        try {
            const doc = validDocument(rawDocument(q('.lobby-include').checked));
            const response = await fetch(`${base}/rooms`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ doc }), credentials: 'omit', referrerPolicy: 'no-referrer', signal: AbortSignal.timeout(15000)
            });
            const data = await response.json();
            if (!response.ok) throw new Error(data.error);
            code = parseInvite(data.code); ownerKey = data.ownerKey;
            q('.lobby-invite').value = inviteLink();
            connect();
        } catch (error) {
            joining = false;
            notice = error.message === 'daily-room-limit' ? 'budget' : error.message === 'rate-limited' ? 'limited' : 'failed';
            updateUI();
        }
    }
    function exportCopy() {
        const doc = recovery || (replica ? replica.view() : null);
        if (!doc) return;
        // Existing target importers understand data/targets; player firing solutions are intentionally not exported.
        const payload = { type: 'wardogs-lobby-recovery', version: 1, doc, data: doc, targets: doc.savedTargets };
        const url = URL.createObjectURL(new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' }));
        const link = document.createElement('a'); link.href = url; link.download = 'wardogs-lobby-recovery.json'; link.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
    }
    const peerColours = ['#64b5f6', '#81c784', '#ba68c8', '#ffb74d', '#4dd0e1', '#f06292', '#aed581', '#90a4ae'];
    function peerColour(id) {
        let hash = 0;
        for (const char of id) hash = ((hash << 5) - hash + char.charCodeAt(0)) | 0;
        return peerColours[Math.abs(hash) % peerColours.length];
    }
    function visiblePeers() {
        return roster.flatMap((peer, index) => {
            if (peer.id === you || !peer.origin || !peer.target) return [];
            return [{ ...peer, displayName: peer.name || `${t('fallback')} ${index + 1}` }];
        });
    }
    function drawPeerMarker(point, kind, label, colour) {
        const pos = worldToLocalScreen(point.x, point.y);
        ctx.save();
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, 7, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(13,16,18,.92)';
        ctx.fill();
        ctx.strokeStyle = colour;
        ctx.lineWidth = 2;
        ctx.stroke();
        ctx.fillStyle = colour;
        ctx.font = 'bold 9px system-ui, sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(kind, pos.x, pos.y + 0.5);

        const text = `${label} · ${kind}`;
        ctx.font = '600 11px system-ui, sans-serif';
        const width = Math.min(156, Math.max(44, ctx.measureText(text).width + 10));
        const labelY = pos.y + (kind === 'O' ? -21 : 21);
        ctx.fillStyle = 'rgba(13,16,18,.88)';
        ctx.fillRect(pos.x - width / 2, labelY - 8, width, 16);
        ctx.strokeStyle = colour;
        ctx.lineWidth = 1;
        ctx.strokeRect(pos.x - width / 2, labelY - 8, width, 16);
        ctx.fillStyle = '#fff';
        ctx.fillText(text, pos.x, labelY, width - 8);
        ctx.restore();
    }
    function drawPeers() {
        for (const peer of visiblePeers()) {
            const colour = peerColour(peer.id);
            const origin = worldToLocalScreen(peer.origin.x, peer.origin.y);
            const target = worldToLocalScreen(peer.target.x, peer.target.y);
            ctx.save();
            ctx.globalAlpha = 0.7;
            ctx.strokeStyle = colour;
            ctx.lineWidth = 1.5;
            ctx.setLineDash([5, 5]);
            ctx.beginPath();
            ctx.moveTo(origin.x, origin.y);
            ctx.lineTo(target.x, target.y);
            ctx.stroke();
            ctx.restore();
            drawPeerMarker(peer.origin, 'O', peer.displayName, colour);
            drawPeerMarker(peer.target, 'T', peer.displayName, colour);
        }
    }
    lobby = {
        active: false,
        capture,
        updateUI,
        updateHistoryUI,
        visiblePeers,
        drawPeers,
        undo: () => history('undo'),
        redo: () => history('redo')
    };
    q('.lobby-toggle').addEventListener('click', () => open(q('#lobbyPanel').hidden));
    action('create').addEventListener('click', create);
    action('join').addEventListener('click', () => {
        try { const next = parseInvite(q('.lobby-invite').value); if (next !== code) ownerKey = ''; code = next; connect(); }
        catch { notice = 'failed'; updateUI(); }
    });
    action('leave').addEventListener('click', () => { notice = ''; leave(); });
    action('reconnect').addEventListener('click', () => { if (!replica?.dirty || confirm(t('reconnectConfirm'))) connect(); });
    action('close').addEventListener('click', () => { if (connected() && confirm(t('closeConfirm'))) socket.send(JSON.stringify({ type: 'close', ownerKey })); });
    action('copy').addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(inviteLink()); notice = 'copied'; updateUI(); }
        catch { q('.lobby-link').focus(); q('.lobby-link').select(); }
    });
    action('export').addEventListener('click', exportCopy);
    // Do not leak control clicks / text typing to map gestures and hotkeys.
    for (const type of ['pointerdown', 'mousedown', 'touchstart', 'dblclick', 'wheel', 'click', 'keydown']) {
        root.addEventListener(type, event => {
            event.stopPropagation();
            if (type === 'keydown' && event.key === 'Escape') { open(false); q('.lobby-toggle').focus(); }
        });
    }
    // Finish drags once. Mousemove/pointermove never cause network messages.
    for (const type of ['pointerup', 'mouseup', 'touchend', 'touchcancel', 'keyup']) {
        window.addEventListener(type, () => queueMicrotask(capture));
    }
    // Freeze mutations when disconnected/limited, but keep the lobby exit controls usable.
    for (const type of ['pointerdown', 'mousedown', 'touchstart', 'click', 'keydown', 'change', 'input', 'drop']) {
        window.addEventListener(type, event => {
            if (!lobby.active || (connected() && !readOnly) || root.contains(event.target)) return;
            if (type === 'keydown' && (event.key === 'Tab' || event.key === 'F5' || ((event.ctrlKey || event.metaKey) && ['r', 'R'].includes(event.key)))) return;
            event.preventDefault(); event.stopImmediatePropagation(); open(true);
        }, { capture: true, passive: false });
    }
    window.addEventListener('beforeunload', event => { if (replica?.dirty) { event.preventDefault(); event.returnValue = ''; } });
    const initial = new URLSearchParams(location.hash.slice(1)).get('room');
    if (initial) { q('.lobby-invite').value = initial; open(true); }
    updateUI();
}
