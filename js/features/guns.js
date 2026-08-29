/* =========================
   GUNS
   ========================= */

/*
 * Artillery is a list. S.origin and S.weapon stay as the names the rest of
 * the code already uses, but become accessors onto whichever gun is
 * selected — which is what keeps events.js, results.js, inputs.js,
 * point-locks.js, terrain-ballistics.js and mobile.js out of this feature
 * entirely, and keeps js/core/core.js untouched so it never conflicts on an
 * upstream merge.
 */

const GUN_LIMIT = 8;

/*
 * Offset applied to a new gun so it does not land exactly under the one it
 * was copied from, in game units (1 unit = 100 m).
 */
const GUN_SPAWN_OFFSET = 0.5;

function gunId() {
    return (
        'gun-' +
        Date.now().toString(36) +
        '-' +
        Math.random().toString(36).slice(2, 8)
    );
}

function nextGunName() {
    for (let n = 1; ; n += 1) {
        const candidate = `${tr('gunDefaultName')} ${n}`;

        if (!S.guns.some(gun => gun.name === candidate)) {
            return candidate;
        }
    }
}

function createGun({ x, y, weapon, name } = {}) {
    return {
        id: gunId(),
        name: name || nextGunName(),
        position: {
            x: Number(x) || 0,
            y: Number(y) || 0
        },
        weapon: weapon || null,
        visible: true
    };
}

function gunById(id) {
    return S.guns.find(gun => gun.id === id) || null;
}

/*
 * Never returns null. Every reader of S.origin depends on this, so a
 * missing or stale activeGunId falls back to the first gun rather than
 * throwing halfway through a render.
 */
function activeGun() {
    return gunById(S.activeGunId) || S.guns[0];
}

function selectGun(id) {
    if (!gunById(id)) {
        return;
    }

    S.activeGunId = id;

    renderGuns();
    inputs();
    draw();
}

function addGun() {
    if (S.guns.length >= GUN_LIMIT) {
        return null;
    }

    const from = activeGun();

    const gun = createGun({
        x: from.position.x + GUN_SPAWN_OFFSET,
        y: from.position.y,
        weapon: from.weapon
    });

    clamp(gun.position);

    S.guns.push(gun);
    S.activeGunId = gun.id;

    renderGuns();
    inputs();
    draw();

    return gun;
}

function removeGun(id) {
    if (S.guns.length <= 1) {
        return false;
    }

    const index = S.guns.findIndex(gun => gun.id === id);

    if (index === -1) {
        return false;
    }

    S.guns.splice(index, 1);

    if (S.activeGunId === id) {
        S.activeGunId = S.guns[Math.min(index, S.guns.length - 1)].id;
    }

    renderGuns();
    inputs();
    draw();

    return true;
}

function renameGun(id, name) {
    const gun = gunById(id);

    if (!gun) {
        return;
    }

    gun.name = String(name).trim() || gun.name;

    renderGuns();
}

function setGunVisible(id, visible) {
    const gun = gunById(id);

    if (!gun) {
        return;
    }

    gun.visible = Boolean(visible);

    renderGuns();
    draw();
}

/*
 * Converts core.js's origin/weapon literals into accessors, seeding the
 * first gun from whatever they already hold. Runs once, at load, before
 * anything else reads them.
 *
 * The getter hands back the gun's live position object rather than a copy:
 * clamp() and the map drag both mutate it in place.
 */
function installGunAccessors() {
    S.guns = [
        createGun({
            x: S.origin.x,
            y: S.origin.y,
            weapon: S.weapon,
            name: 'Gun 1'
        })
    ];

    S.activeGunId = S.guns[0].id;

    Object.defineProperty(S, 'origin', {
        configurable: true,
        enumerable: true,
        get() {
            return activeGun().position;
        },
        /*
         * Assigns onto the existing object instead of replacing it, so the
         * gun's id, name and weapon survive every `S.origin = {x, y}` in
         * the codebase.
         */
        set(value) {
            const position = activeGun().position;

            position.x = Number(value.x);
            position.y = Number(value.y);
        }
    });

    Object.defineProperty(S, 'weapon', {
        configurable: true,
        enumerable: true,
        get() {
            return activeGun().weapon;
        },
        set(value) {
            activeGun().weapon = value;
        }
    });
}

installGunAccessors();

/*
 * Replaced by the real list renderer in the same file once the UI lands.
 * Present from the start so the model can call it unconditionally.
 */
function renderGuns() {}
