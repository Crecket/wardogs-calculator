/* =========================
   SAVED TARGETS
   ========================= */

const SAVED_TARGET_EXPORT_TYPE =
    'wardogs-saved-target';

const SAVED_TARGETS_EXPORT_TYPE =
    'wardogs-saved-targets';

const SAVED_TARGET_EXPORT_VERSION = 1;

const SAVED_TARGET_IMPORT_LIMIT = 500;

/*
 * Both sides of the comparison have been through clamp(), which rounds
 * to a fixed precision, so they land on the same quantum — but that
 * rounding is a float division, so === is not safe to lean on.
 */
const SAVED_TARGET_MATCH_EPSILON = 1e-6;

let savedTargetRenameId = null;

let targetingHintVisible = false;

/*
 * Which saved target the list highlights is derived from where the
 * target actually sits, never tracked separately. In a collab room the
 * target moves because a peer moved it just as often as because we
 * clicked a row, and a tracked selection only ever knew about the
 * latter.
 */
function savedTargetPointMatches(point, x, y) {

    return (
        Boolean(point) &&
        Number.isFinite(point.x) &&
        Number.isFinite(point.y) &&
        Math.abs(
            Number(x) -
            point.x
        ) < SAVED_TARGET_MATCH_EPSILON &&
        Math.abs(
            Number(y) -
            point.y
        ) < SAVED_TARGET_MATCH_EPSILON
    );
}

function savedTargetMatchState() {

    const levels = new Map();

    savedTargets.forEach(
        target => {

            if (
                !savedTargetPointMatches(
                    S.target,
                    target.x,
                    target.y
                )
            ) {
                return;
            }

            const origin =
                target.saveArtillery
                    ? savedTargetOrigin(target)
                    : null;

            const full =
                !origin ||
                savedTargetPointMatches(
                    S.origin,
                    origin.x,
                    origin.y
                );

            levels.set(
                String(target.id),
                full
                    ? 'full'
                    : 'partial'
            );
        }
    );

    return levels;
}

function activeSavedTargetIds() {
    return new Set(
        savedTargetMatchState().keys()
    );
}

function savedTargetSyncHidden(id, state) {

    if (!state.size) {
        return false;
    }

    return state.get(
        String(id)
    ) !== 'partial';
}

function applySavedTargetRowState(item, state) {

    const level =
        state.get(
            item.dataset.targetId
        );

    item.classList.toggle(
        'active',
        level !== undefined
    );

    item.classList.toggle(
        'partial',
        level === 'partial'
    );

    const sync =
        item.querySelector(
            '.saved-target-sync'
        );

    if (sync) {
        sync.hidden =
            savedTargetSyncHidden(
                item.dataset.targetId,
                state
            );
    }
}

/*
 * inputs() runs on every frame of a map drag, so this toggles the class
 * on the rows already in the DOM rather than rebuilding the list. A
 * full renderSavedTargets() is still what runs when the targets
 * themselves change.
 */
function refreshSavedTargetHighlight() {

    const container =
        $('savedTargetsList');

    if (!container) {
        return;
    }

    const state =
        savedTargetMatchState();

    container
        .querySelectorAll('.saved-target')
        .forEach(
            item => {
                applySavedTargetRowState(
                    item,
                    state
                );
            }
        );
}

function savedTargetNearest(distanceTo, threshold) {

    if (!savedTargets.length) {
        return null;
    }

    const activeIds =
        activeSavedTargetIds();

    let best = null;

    let bestDistance = threshold;

    for (const target of savedTargets) {

        if (
            activeIds.has(
                String(target.id)
            )
        ) {
            continue;
        }

        const x =
            Number(target.x);

        const y =
            Number(target.y);

        if (
            !Number.isFinite(x) ||
            !Number.isFinite(y)
        ) {
            continue;
        }

        const distance =
            distanceTo(x, y);

        if (distance <= bestDistance) {
            best = target;
            bestDistance = distance;
        }
    }

    return best;
}

function savedTargetAtPoint(point, threshold) {
    return savedTargetNearest(
        (x, y) => Math.hypot(
            point.x - x,
            point.y - y
        ),
        threshold
    );
}

function savedTargetAtScreen(x, y, radiusPx) {
    return savedTargetNearest(
        (targetX, targetY) => {
            const at = toScreen(targetX, targetY);
            return Math.hypot(x - at.x, y - at.y);
        },
        radiusPx
    );
}

function generateTargetId() {

    return (
        Date.now().toString(36) +
        '-' +
        Math.random()
            .toString(36)
            .slice(2, 9)
    );
}

function loadSavedTargets() {

    try {

        const raw =
            localStorage.getItem(
                SAVED_TARGETS_KEY
            );

        if (!raw) {
            savedTargets = [];
            return;
        }

        const parsed =
            JSON.parse(raw);

        if (!Array.isArray(parsed)) {
            savedTargets = [];
            return;
        }

        savedTargets =
            parsed
                .filter(
                    target =>
                        target &&
                        typeof target.id === 'string' &&
                        typeof target.x === 'number' &&
                        typeof target.y === 'number'
                )
                .map(target => ({
                    ...target,

                    name:
                        typeof target.name === 'string' &&
                        target.name.trim()
                            ? target.name
                            : createTargetName()
                }));

    } catch (error) {

        console.error(
            'Failed to load saved targets:',
            error
        );

        savedTargets = [];
    }
}

function persistSavedTargets() {

    /*
     * See saveMapToolState: a shared session never writes room content
     * over your own saved targets.
     */
    if (
        typeof collabSuppressesLocalPersistence === 'function' &&
        collabSuppressesLocalPersistence()
    ) {
        return;
    }

    localStorage.setItem(
        SAVED_TARGETS_KEY,
        JSON.stringify(
            savedTargets
        )
    );
}

/* =========================
   ARTILLERY / TARGET POSITIONS
   ========================= */

/*
 * Where the two points sit is worth keeping across a reload: coming back
 * to a gun laid on the wrong side of the map means placing it again every
 * single time.
 *
 * A room is the exception. There the points belong to the room, not to
 * this browser, so the write is suppressed (see saveMapToolState) and the
 * document the server sends on join is what wins — always the latest,
 * never a stale local copy.
 *
 * The map id rides along because the coordinates are meaningless on a
 * different map, and a mismatch drops them rather than dropping the gun
 * somewhere arbitrary.
 */
const MAP_POINTS_WRITE_DELAY_MS = 300;

let mapPointsWriteTimer = null;

function persistMapPoints() {

    if (
        typeof collabSuppressesLocalPersistence === 'function' &&
        collabSuppressesLocalPersistence()
    ) {
        return;
    }

    /*
     * inputs() runs on every frame of a drag, so the write trails the
     * gesture instead of hitting localStorage a hundred times across it.
     */
    if (mapPointsWriteTimer) {
        return;
    }

    mapPointsWriteTimer = setTimeout(
        () => {
            mapPointsWriteTimer = null;
            writeMapPoints();
        },
        MAP_POINTS_WRITE_DELAY_MS
    );
}

function writeMapPoints() {

    if (
        typeof collabSuppressesLocalPersistence === 'function' &&
        collabSuppressesLocalPersistence()
    ) {
        return;
    }

    try {
        localStorage.setItem(
            MAP_POINTS_KEY,
            JSON.stringify({
                map: S.map,

                /*
                 * Gun 1 is still written as a singular `origin` so a user
                 * who lands back on an older cached build keeps their
                 * artillery position instead of losing it. Drop this after
                 * one release.
                 */
                origin: {
                    x: S.guns[0].position.x,
                    y: S.guns[0].position.y
                },

                target: {
                    x: S.target.x,
                    y: S.target.y
                },

                /*
                 * visible and activeGunId are deliberately absent: they are
                 * view state, and a reload starts from a clean view the way
                 * zoom and pan already do.
                 */
                guns: S.guns.map(gun => ({
                    id: gun.id,
                    name: gun.name,
                    x: gun.position.x,
                    y: gun.position.y,
                    weapon: gun.weapon
                }))
            })
        );
    } catch (error) {
        console.warn(
            'Failed to save map points:',
            error
        );
    }
}

function readStoredPoint(value) {

    return (
        value &&
        Number.isFinite(Number(value.x)) &&
        Number.isFinite(Number(value.y))
    )
        ? {
            x: Number(value.x),
            y: Number(value.y)
        }
        : null;
}

function loadMapPoints() {

    try {
        const raw =
            localStorage.getItem(
                MAP_POINTS_KEY
            );

        if (!raw) {
            return;
        }

        const parsed =
            JSON.parse(raw);

        if (parsed?.map !== S.map) {
            return;
        }

        /*
         * S.target is assigned before the guns are rebuilt on purpose:
         * S.origin's setter writes through activeGun(), so nothing here may
         * touch S.origin while S.guns is mid-replacement.
         */
        const target =
            readStoredPoint(parsed.target);

        if (target) {
            S.target = target;
        }

        /*
         * A record written before guns existed carries only `origin`. It
         * becomes gun 1 rather than being discarded — the position is the
         * thing the user cares about, and losing it on upgrade would be a
         * silent regression.
         */
        const stored = Array.isArray(parsed.guns) && parsed.guns.length
            ? parsed.guns
            : [{
                ...readStoredPoint(parsed.origin),
                name: S.guns[0].name,
                weapon: S.guns[0].weapon
            }];

        const restored = stored
            .slice(0, GUN_LIMIT)
            .map(entry => {
                const point = readStoredPoint(entry);

                if (!point) {
                    return null;
                }

                const gun = createGun({
                    x: point.x,
                    y: point.y,
                    weapon: entry.weapon || null,
                    name: entry.name
                });

                /*
                 * Keep the stored id where it is usable, so a gun keeps its
                 * identity across a reload and a room rejoin does not
                 * duplicate it. Anything the server would reject is
                 * replaced by the freshly minted one.
                 */
                if (
                    typeof entry.id === 'string' &&
                    /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(entry.id)
                ) {
                    gun.id = entry.id;
                }

                clamp(gun.position);

                return gun;
            })
            .filter(Boolean);

        if (restored.length) {
            S.guns = restored;
            S.activeGunId = S.guns[0].id;
        }

    } catch (error) {
        console.warn(
            'Failed to load map points:',
            error
        );
    }
}

function getSaveArtilleryPreference() {

    return (
        localStorage.getItem(
            SAVE_ARTILLERY_KEY
        ) === 'true'
    );
}

function loadSaveArtilleryPreference() {

    const checkbox =
        $('saveArtilleryPosition');

    checkbox.checked =
        getSaveArtilleryPreference();
}

function saveArtilleryPreference() {

    localStorage.setItem(
        SAVE_ARTILLERY_KEY,
        checkboxValue(
            $('saveArtilleryPosition')
        )
            ? 'true'
            : 'false'
    );
}

function checkboxValue(element) {

    return Boolean(
        element &&
        element.checked
    );
}

function createTargetName() {

    let number =
        1;

    const existing =
        new Set(
            savedTargets.map(
                target =>
                    target.name
            )
        );

    while (
        existing.has(
            `Target ${number}`
        )
        ) {
        number++;
    }

    return `Target ${number}`;
}

function savedTargetTransferStatus(
    key = null,
    count = 0,
    isError = false
) {
    const status =
        $('savedTargetsTransferStatus');

    if (!status) {
        return;
    }

    status.textContent = key
        ? tr(key).replace(
            '{count}',
            String(count)
        )
        : '';

    status.classList.toggle(
        'error',
        Boolean(isError)
    );
}

function savedTargetOrigin(target) {

    const x =
        Number(target?.origin?.x);

    const y =
        Number(target?.origin?.y);

    if (
        !Number.isFinite(x) ||
        !Number.isFinite(y)
    ) {
        return null;
    }

    return {
        x,
        y
    };
}

function savedTargetForExport(target) {
    const origin =
        savedTargetOrigin(target);

    return {
        name:
            typeof target.name ===
            'string'
                ? target.name
                : '',
        x: Number(target.x),
        y: Number(target.y),
        saveArtillery:
            Boolean(
                target.saveArtillery &&
                origin
            ),
        origin
    };
}

function exportSavedTarget(target) {
    if (!target) {
        return;
    }

    const payload = {
        type: SAVED_TARGET_EXPORT_TYPE,
        version:
            SAVED_TARGET_EXPORT_VERSION,
        exportedAt:
            new Date().toISOString(),
        target:
            savedTargetForExport(
                target
            )
    };

    const fileName =
        sanitizeWardogsFilenamePart(
            target.name,
            'target'
        );

    downloadWardogsJson(
        `wardogs-target-${fileName}.json`,
        payload
    );

    savedTargetTransferStatus();

    if (
        typeof trackAnalytics ===
        'function'
    ) {
        trackAnalytics(
            'target-exported',
            {
                withArtillery:
                    Boolean(
                        payload.target
                            .saveArtillery
                    )
            }
        );
    }
}

function exportAllSavedTargets() {
    if (!savedTargets.length) {
        return;
    }

    const payload = {
        type: SAVED_TARGETS_EXPORT_TYPE,
        version:
            SAVED_TARGET_EXPORT_VERSION,
        exportedAt:
            new Date().toISOString(),
        targets:
            savedTargets.map(
                savedTargetForExport
            )
    };

    downloadWardogsJson(
        `wardogs-saved-targets-${wardogsExportTimestamp()}.json`,
        payload
    );

    savedTargetTransferStatus();

    if (
        typeof trackAnalytics ===
        'function'
    ) {
        trackAnalytics(
            'targets-exported',
            {
                count:
                    payload.targets.length
            }
        );
    }
}

function uniqueImportedTargetName(
    value,
    takenNames
) {
    const base =
        typeof value === 'string' &&
        value.trim()
            ? value.trim().slice(0, 120)
            : createTargetName();

    if (!takenNames.has(base)) {
        takenNames.add(base);
        return base;
    }

    let suffix = 2;
    let candidate =
        `${base} (${suffix})`;

    while (takenNames.has(candidate)) {
        suffix++;
        candidate =
            `${base} (${suffix})`;
    }

    takenNames.add(candidate);
    return candidate;
}

function normalizeImportedSavedTarget(
    target,
    takenNames
) {
    if (
        !target ||
        typeof target !== 'object' ||
        !Number.isFinite(
            Number(target.x)
        ) ||
        !Number.isFinite(
            Number(target.y)
        )
    ) {
        return null;
    }

    const origin =
        savedTargetOrigin(target);

    return {
        id: generateTargetId(),
        name:
            uniqueImportedTargetName(
                target.name,
                takenNames
            ),
        x: Number(target.x),
        y: Number(target.y),
        saveArtillery:
            Boolean(
                target.saveArtillery &&
                origin
            ),
        origin
    };
}

function extractImportedSavedTargets(
    payload
) {
    if (
        !payload ||
        typeof payload !== 'object'
    ) {
        throw new Error(
            'Invalid saved target payload'
        );
    }

    let source = null;
    let format = 'single';

    if (Array.isArray(payload)) {
        source = payload;
        format = 'list';

    } else if (
        payload.type ===
            SAVED_TARGET_EXPORT_TYPE &&
        payload.target
    ) {
        source = [payload.target];

    } else if (
        payload.type ===
            SAVED_TARGETS_EXPORT_TYPE &&
        Array.isArray(payload.targets)
    ) {
        source = payload.targets;
        format = 'list';

    } else if (
        Array.isArray(payload.targets)
    ) {
        source = payload.targets;
        format = 'list';

    } else if (payload.target) {
        source = [payload.target];

    } else if (
        Number.isFinite(Number(payload.x)) &&
        Number.isFinite(Number(payload.y))
    ) {
        source = [payload];
    }

    if (!source) {
        throw new Error(
            'No saved targets found'
        );
    }

    const takenNames =
        new Set(
            savedTargets.map(
                target => target.name
            )
        );

    const targets =
        source
            .slice(
                0,
                SAVED_TARGET_IMPORT_LIMIT
            )
            .map(
                target =>
                    normalizeImportedSavedTarget(
                        target,
                        takenNames
                    )
            )
            .filter(Boolean);

    if (!targets.length) {
        throw new Error(
            'No valid saved targets found'
        );
    }

    return {
        targets,
        format
    };
}

async function importSavedTargets() {
    try {
        const file =
            await selectWardogsJsonFile();

        if (!file) {
            return;
        }

        const payload =
            await readWardogsJsonFile(
                file
            );

        const imported =
            extractImportedSavedTargets(
                payload
            );

        savedTargets.push(
            ...imported.targets
        );

        persistSavedTargets();

        if (
            typeof collabOnBulkAdd ===
            'function'
        ) {
            collabOnBulkAdd({
                targets: imported.targets
            });
        }

        renderSavedTargets();

        savedTargetTransferStatus(
            'savedTargetsImportSuccess',
            imported.targets.length
        );

        if (
            typeof trackAnalytics ===
            'function'
        ) {
            trackAnalytics(
                'targets-imported',
                {
                    count:
                        imported.targets.length,
                    format:
                        imported.format
                }
            );
        }

    } catch (error) {
        console.warn(
            'Failed to import saved targets:',
            error
        );

        savedTargetTransferStatus(
            'savedTargetsImportInvalid',
            0,
            true
        );
    }
}

function saveCurrentTarget() {

    const saveArtillery =
        checkboxValue(
            $('saveArtilleryPosition')
        );

    const target = {

        id:
            generateTargetId(),

        name:
            createTargetName(),

        x:
            Number(
                S.target.x
            ),

        y:
            Number(
                S.target.y
            ),

        saveArtillery,

        origin: {
            x: Number(
                S.origin.x
            ),
            y: Number(
                S.origin.y
            )
        }
    };

    savedTargets.push(
        target
    );

    persistSavedTargets();

    if (
        typeof collabOnTargetAdded ===
        'function'
    ) {
        collabOnTargetAdded(target);
    }

    if (
        typeof trackAnalytics ===
        'function'
    ) {
        trackAnalytics(
            'target-saved',
            {
                withArtillery:
                    saveArtillery
            }
        );
    }

    renderSavedTargets();
}

function createSavedTargetAtPoint(point) {

    commitPendingSavedTargetRename();

    const x =
        Number(point?.x);

    const y =
        Number(point?.y);

    if (
        !Number.isFinite(x) ||
        !Number.isFinite(y)
    ) {
        return null;
    }

    const target = {

        id:
            generateTargetId(),

        name:
            createTargetName(),

        x,

        y,

        saveArtillery:
            false,

        origin: {
            x: Number(
                S.origin.x
            ),
            y: Number(
                S.origin.y
            )
        }
    };

    clamp(target);

    savedTargets.push(
        target
    );

    persistSavedTargets();

    if (
        typeof collabOnTargetAdded ===
        'function'
    ) {
        collabOnTargetAdded(target);
    }

    if (
        typeof trackAnalytics ===
        'function'
    ) {
        trackAnalytics(
            'target-placed',
            {
                map: S.map
            }
        );
    }

    savedTargetRenameId =
        target.id;

    renderSavedTargets();
    draw();

    return target;
}

function deleteTarget(id) {

    const index =
        savedTargets.findIndex(
            target =>
                target.id === id
        );

    if (index === -1) {
        return;
    }

    const [removed] =
        savedTargets.splice(
            index,
            1
        );

    persistSavedTargets();

    if (
        typeof collabOnTargetRemoved ===
        'function'
    ) {
        collabOnTargetRemoved(removed);
    }

    renderSavedTargets();
}

function editTargetName(id) {

    const target =
        savedTargets.find(
            item =>
                item.id === id
        );

    if (!target) {
        return;
    }

    const name =
        window.prompt(
            tr('targetNamePrompt'),
            target.name
        );

    if (name === null) {
        return;
    }

    const trimmed =
        name.trim();

    if (!trimmed) {
        return;
    }

    renameSavedTarget(
        id,
        trimmed
    );
}

function renameSavedTarget(id, name) {

    const target =
        savedTargets.find(
            item =>
                item.id === id
        );

    if (
        !target ||
        target.name === name
    ) {
        renderSavedTargets();
        return;
    }

    const previousName =
        target.name;

    target.name =
        name;

    persistSavedTargets();

    if (
        typeof collabOnTargetRenamed ===
        'function'
    ) {
        collabOnTargetRenamed(
            id,
            previousName,
            name
        );
    }

    renderSavedTargets();
}

function finishSavedTargetRename(id, value) {

    if (savedTargetRenameId !== id) {
        return;
    }

    savedTargetRenameId = null;

    const trimmed =
        String(value || '').trim();

    if (!trimmed) {
        renderSavedTargets();
        return;
    }

    renameSavedTarget(
        id,
        trimmed
    );
}

function commitPendingSavedTargetRename() {

    if (savedTargetRenameId === null) {
        return;
    }

    const element =
        $('savedTargetsList')
            ?.querySelector(
                `.saved-target[data-target-id="${savedTargetRenameId}"] .saved-target-name`
            );

    finishSavedTargetRename(
        savedTargetRenameId,
        element
            ? element.textContent
            : ''
    );
}

function cancelSavedTargetRename() {

    if (savedTargetRenameId === null) {
        return;
    }

    savedTargetRenameId = null;

    renderSavedTargets();
}

function focusSavedTargetRename(element) {

    element.focus();

    const range =
        document.createRange();

    range.selectNodeContents(element);

    const selection =
        window.getSelection();

    if (!selection) {
        return;
    }

    selection.removeAllRanges();
    selection.addRange(range);
}

function updateTargetingModeHint() {

    const active =
        typeof MAP_TOOL_STATE !== 'undefined' &&
        MAP_TOOL_STATE.tool === 'targeting';

    if (active) {
        savedTargetTransferStatus(
            'targetingModeHint'
        );

        targetingHintVisible = true;
        return;
    }

    if (targetingHintVisible) {
        savedTargetTransferStatus();
        targetingHintVisible = false;
    }
}

function toggleTargetArtillery(id) {

    const target =
        savedTargets.find(
            item =>
                item.id === id
        );

    if (!target) {
        return;
    }

    const previous = {
        ...target,
        origin:
            target.origin
                ? { ...target.origin }
                : null
    };

    const next =
        !target.saveArtillery;

    if (
        next &&
        !savedTargetOrigin(target)
    ) {

        target.origin = {
            x: Number(S.origin.x),
            y: Number(S.origin.y)
        };
    }

    target.saveArtillery = next;

    persistSavedTargets();

    if (
        typeof collabOnTargetMoved ===
        'function'
    ) {
        collabOnTargetMoved(
            { ...target },
            previous
        );
    }

    renderSavedTargets();
}

function syncTargetToCurrent(id) {

    const target =
        savedTargets.find(
            item =>
                item.id === id
        );

    if (
        !target ||
        !S.target ||
        !Number.isFinite(S.target.x) ||
        !Number.isFinite(S.target.y) ||
        savedTargetSyncHidden(
            id,
            savedTargetMatchState()
        )
    ) {
        return;
    }

    const previous = {
        ...target,
        origin:
            target.origin
                ? { ...target.origin }
                : null
    };

    target.x =
        Number(S.target.x);

    target.y =
        Number(S.target.y);

    if (target.saveArtillery) {

        target.origin = {
            x: Number(S.origin.x),
            y: Number(S.origin.y)
        };
    }

    persistSavedTargets();

    if (
        typeof collabOnTargetMoved ===
        'function'
    ) {
        collabOnTargetMoved(
            { ...target },
            previous
        );
    }

    if (
        typeof trackAnalytics ===
        'function'
    ) {
        trackAnalytics(
            'target-synced',
            {
                withArtillery:
                    Boolean(
                        target.saveArtillery
                    )
            }
        );
    }

    renderSavedTargets();

    if (typeof draw === 'function') {
        draw();
    }
}

function restoreTarget(target) {

    if (!target) {
        return;
    }

    pushMapToolHistory();

    S.target = {
        x: Number(target.x),
        y: Number(target.y)
    };

    const origin =
        target.saveArtillery
            ? savedTargetOrigin(target)
            : null;

    if (origin) {
        S.origin = origin;
    }

    clamp(S.target);
    clamp(S.origin);

    if (
        typeof trackAnalytics ===
        'function'
    ) {
        trackAnalytics(
            'target-restored',
            {
                withArtillery:
                    Boolean(origin)
            }
        );
    }

    inputs();
    renderSavedTargets();
}

const SAVED_TARGET_ARTILLERY_ICON =
    '<svg aria-hidden="true" viewBox="0 0 24 24" width="13" height="13"' +
    ' fill="none" stroke="currentColor" stroke-width="1.9"' +
    ' stroke-linecap="round" stroke-linejoin="round">' +
    '<path d="M4 19h9"/>' +
    '<path d="M7 19 20 6"/>' +
    '<circle cx="6.6" cy="19" r="2"/>' +
    '</svg>';

function renderSavedTargets() {

    const container =
        $('savedTargetsList');

    if (!container) {
        return;
    }

    container.innerHTML = '';

    const count =
        $('savedTargetsCount');

    if (count) {
        count.textContent =
            savedTargets.length;
    }

    syncSavedTargetsVisibility();

    const exportAllButton =
        $('exportSavedTargets');

    if (exportAllButton) {
        exportAllButton.disabled =
            savedTargets.length === 0;
    }

    if (!savedTargets.length) {

        const empty =
            document.createElement(
                'div'
            );

        empty.className =
            'saved-target-empty';

        empty.textContent =
            tr('noSavedTargets');

        container.appendChild(
            empty
        );

        return;
    }

    const state =
        savedTargetMatchState();

    savedTargets.forEach(
        (target, index) => {

            const item =
                document.createElement(
                    'div'
                );

            item.className =
                'saved-target';

            item.dataset.targetId =
                target.id;

            item.addEventListener(
                'click',
                () => {
                    restoreTarget(
                        target
                    );
                }
            );

            const number =
                document.createElement(
                    'span'
                );

            number.className =
                'saved-target-index';

            number.textContent =
                String(index + 1);

            const info =
                document.createElement(
                    'div'
                );

            info.className =
                'saved-target-info';

            const name =
                document.createElement(
                    'span'
                );

            name.className =
                'saved-target-name';

            name.textContent =
                target.name;

            const renaming =
                target.id ===
                savedTargetRenameId;

            if (renaming) {

                name.className =
                    'saved-target-name editing';

                name.contentEditable =
                    'true';

                name.spellcheck =
                    false;

                name.addEventListener(
                    'mousedown',
                    event => {
                        event.stopPropagation();
                    }
                );

                name.addEventListener(
                    'click',
                    event => {
                        event.stopPropagation();
                    }
                );

                name.addEventListener(
                    'keydown',
                    event => {

                        if (event.key === 'Enter') {

                            event.preventDefault();

                            finishSavedTargetRename(
                                target.id,
                                name.textContent
                            );

                            return;
                        }

                        if (event.key === 'Escape') {

                            event.preventDefault();

                            cancelSavedTargetRename();
                        }
                    }
                );

                name.addEventListener(
                    'blur',
                    () => {
                        finishSavedTargetRename(
                            target.id,
                            name.textContent
                        );
                    }
                );
            }

            const meta =
                document.createElement(
                    'div'
                );

            meta.className =
                'saved-target-meta';

            const coords =
                document.createElement(
                    'span'
                );

            coords.className =
                'saved-target-coords';

            coords.textContent =
                `X ${formatGameCoordinate(target.x)} · Y ${formatGameCoordinate(target.y)}`;

            const carriesArtillery =
                Boolean(
                    target.saveArtillery &&
                    savedTargetOrigin(target)
                );

            const artillery =
                document.createElement(
                    'button'
                );

            artillery.type =
                'button';

            artillery.className =
                carriesArtillery
                    ? 'saved-target-artillery with-artillery'
                    : 'saved-target-artillery target-only';

            artillery.innerHTML =
                SAVED_TARGET_ARTILLERY_ICON;

            artillery.title =
                carriesArtillery
                    ? tr('targetWithArtilleryHint')
                    : tr('targetOnlyHint');

            artillery.setAttribute(
                'aria-pressed',
                String(carriesArtillery)
            );

            artillery.setAttribute(
                'aria-label',
                carriesArtillery
                    ? tr('targetWithArtillery')
                    : tr('targetOnly')
            );

            artillery.addEventListener(
                'click',
                event => {

                    event.stopPropagation();

                    toggleTargetArtillery(
                        target.id
                    );
                }
            );

            meta.appendChild(
                coords
            );

            meta.appendChild(
                artillery
            );

            info.appendChild(
                name
            );

            info.appendChild(
                meta
            );

            const actions =
                document.createElement(
                    'div'
                );

            actions.className =
                'saved-target-actions-inline';

            const sync =
                document.createElement(
                    'button'
                );

            sync.type =
                'button';

            sync.className =
                'saved-target-icon-button saved-target-sync';

            sync.textContent =
                '\u27f3';

            sync.title =
                tr('syncTarget');

            sync.setAttribute(
                'aria-label',
                tr('syncTarget')
            );


            sync.addEventListener(
                'click',
                event => {

                    event.stopPropagation();

                    syncTargetToCurrent(
                        target.id
                    );
                }
            );

            const exportButton =
                document.createElement(
                    'button'
                );

            exportButton.type =
                'button';

            exportButton.className =
                'saved-target-icon-button saved-target-export';

            exportButton.textContent =
                '⇩';

            exportButton.title =
                tr('exportTarget');

            exportButton.setAttribute(
                'aria-label',
                tr('exportTarget')
            );

            exportButton.addEventListener(
                'click',
                event => {
                    event.stopPropagation();
                    exportSavedTarget(
                        target
                    );
                }
            );

            const edit =
                document.createElement(
                    'button'
                );

            edit.type =
                'button';

            edit.className =
                'saved-target-icon-button';

            edit.textContent =
                '✎';

            edit.title =
                tr('edit');

            edit.setAttribute(
                'aria-label',
                tr('edit')
            );

            edit.addEventListener(
                'click',
                event => {

                    event.stopPropagation();

                    editTargetName(
                        target.id
                    );
                }
            );

            const remove =
                document.createElement(
                    'button'
                );

            remove.type =
                'button';

            remove.className =
                'saved-target-icon-button';

            remove.textContent =
                '×';

            remove.title =
                tr('delete');

            remove.setAttribute(
                'aria-label',
                tr('delete')
            );

            remove.addEventListener(
                'click',
                event => {

                    event.stopPropagation();

                    deleteTarget(
                        target.id
                    );
                }
            );

            actions.appendChild(
                sync
            );

            actions.appendChild(
                exportButton
            );

            actions.appendChild(
                edit
            );

            actions.appendChild(
                remove
            );

            item.appendChild(
                number
            );

            item.appendChild(
                info
            );

            item.appendChild(
                actions
            );

            applySavedTargetRowState(
                item,
                state
            );

            container.appendChild(
                item
            );

            if (renaming) {
                focusSavedTargetRename(
                    name
                );
            }
        }
    );
}


function savedTargetsVisible() {
    return (
        typeof isMapLayerVisible !== 'function' ||
        isMapLayerVisible('savedTargets')
    );
}

function syncSavedTargetsVisibility() {
    const button = $('toggleSavedTargets');

    if (!button) {
        return;
    }

    const visible = savedTargetsVisible();

    button.innerHTML =
        GUN_EYE_ICON[visible ? 'on' : 'off'];

    button.setAttribute(
        'aria-pressed',
        String(visible)
    );

    const label = tr(
        visible
            ? 'hideSavedTargets'
            : 'showSavedTargets'
    );

    button.title = label;

    button.setAttribute(
        'aria-label',
        label
    );
}

function toggleSavedTargetsVisibility() {

    if (typeof setMapLayerVisible !== 'function') {
        return;
    }

    setMapLayerVisible(
        'savedTargets',
        !savedTargetsVisible()
    );

    syncSavedTargetsVisibility();

    if (typeof buildMapLayers === 'function') {
        buildMapLayers();
    }
}
