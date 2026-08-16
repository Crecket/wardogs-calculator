/* =========================
   WEAPONS
   ========================= */

let DEFAULT_WEAPON = null;

function normalizeWeapon(item) {
    if (!item || typeof item.id !== 'string' || !item.id.trim()) {
        return null;
    }

    const rangeKm = Number(item.rangeKm ?? item.range);

    if (!Number.isFinite(rangeKm) || rangeKm <= 0) {
        return null;
    }

    const names =
        item.names && typeof item.names === 'object'
            ? { ...item.names }
            : {};

    return {
        id: item.id.trim(),
        names,
        range: rangeKm
    };
}

function getWeaponName(weapon) {
    if (!weapon) {
        return '';
    }

    return (
        weapon.names?.[LANG] ??
        weapon.names?.[DEFAULT_LANG] ??
        weapon.names?.en ??
        weapon.id
    );
}

async function loadWeapons() {
    const data = await fetchJSON('data/weapons.json');
    const source = Array.isArray(data) ? data : data?.weapons;

    if (!Array.isArray(source) || !source.length) {
        throw new Error('No weapons found in data/weapons.json');
    }

    WEAPONS = {};

    source
        .map(normalizeWeapon)
        .filter(Boolean)
        .forEach(weapon => {
            WEAPONS[weapon.id] = weapon;
        });

    const ids = Object.keys(WEAPONS);

    if (!ids.length) {
        throw new Error('No valid weapons found in data/weapons.json');
    }

    DEFAULT_WEAPON =
        typeof data?.default === 'string' && WEAPONS[data.default]
            ? data.default
            : ids[0];

    if (!S.weapon || !WEAPONS[S.weapon]) {
        S.weapon = DEFAULT_WEAPON;
    }

    populateWeaponSelect();
}

function populateWeaponSelect() {
    const select = $('weapon');

    if (!select) {
        return;
    }

    select.innerHTML = '';

    Object.values(WEAPONS).forEach(weapon => {
        const option = document.createElement('option');
        option.value = weapon.id;
        option.textContent = getWeaponName(weapon);
        select.appendChild(option);
    });

    select.value = S.weapon;
}
