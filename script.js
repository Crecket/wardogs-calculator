const WEAPONS = {
    mortar: {
        nameKey: 'mortar',
        range: 0.6
    },

    spg: {
        nameKey: 'spg',
        range: 2
    }
};

const S = {
    w: 16,
    h: 16,

    zoom: 1,

    mode: 'origin',

    map: 'bakurani',

    weapon: 'mortar',

    origin: {
        x: 5,
        y: 5
    },

    target: {
        x: 5.5,
        y: 5.5
    },

    panX: 0,
    panY: 0
};

let LANG = 'en';
let DEFAULT_LANG = 'en';

let LANGUAGES = [];
let I18N = {};
let MAPS = {};

let drag = null;
let pan = null;

let savedTargets = [];
let selectedSavedTargetId = null;

const SAVED_TARGETS_KEY =
    'wardogs-saved-targets';

const SAVE_ARTILLERY_KEY =
    'wardogs-save-artillery-position';

const TILE_SIZE = 256;
const TILE_MIN_ZOOM = 0;
const TILE_MAX_ZOOM = 5;

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 8;

const ZOOM_BUTTON_FACTOR = 1.25;
const ZOOM_WHEEL_IN = 1.15;
const ZOOM_WHEEL_OUT = 0.87;

const BAKURANI_BOUNDS = {
    minX: 3.445,
    maxX: 12.340,

    minY: 3.016,
    maxY: 11.926
};

const TILE_CACHE =
    new Map();

const $ = id =>
    document.getElementById(id);

const c =
    $('canvas');

const wrap =
    document.querySelector('.map');

const ctx =
    c.getContext('2d');

const BASE_PATH =
    new URL('.', document.baseURI);


/* =========================
   RESOURCES
   ========================= */

function resourceURL(path) {
    return new URL(
        path,
        BASE_PATH
    ).href;
}

async function fetchJSON(path) {

    const url =
        resourceURL(path);

    const response =
        await fetch(
            url,
            {
                cache: 'no-cache'
            }
        );

    if (!response.ok) {
        throw new Error(
            `Failed to load ${url}: ${response.status} ${response.statusText}`
        );
    }

    return response.json();
}


/* =========================
   LANGUAGES
   ========================= */

async function loadLanguages() {

    const index =
        await fetchJSON(
            'locales/index.json'
        );

    DEFAULT_LANG =
        index.default || 'en';

    LANGUAGES =
        Array.isArray(index.languages)
            ? index.languages
            : [];

    if (!LANGUAGES.length) {
        throw new Error(
            'No languages found in locales/index.json'
        );
    }

    await Promise.all(
        LANGUAGES.map(
            async language => {

                if (
                    !language.id ||
                    !language.file
                ) {
                    return;
                }

                I18N[language.id] =
                    await fetchJSON(
                        `locales/${language.file}`
                    );
            }
        )
    );

    populateLanguageSelect();

    LANG =
        detectLanguage();

    $('language').value =
        LANG;
}

function populateLanguageSelect() {

    const select =
        $('language');

    select.innerHTML = '';

    LANGUAGES.forEach(
        language => {

            const option =
                document.createElement(
                    'option'
                );

            option.value =
                language.id;

            option.textContent =
                `${language.flag || ''} ${
                    language.nativeName ||
                    language.name ||
                    language.id
                }`;

            select.appendChild(
                option
            );
        }
    );
}

function detectLanguage() {

    const available =
        new Set(
            LANGUAGES.map(
                language =>
                    language.id
            )
        );

    const saved =
        localStorage.getItem(
            'wardogs-language'
        );

    if (
        saved &&
        available.has(saved)
    ) {
        return saved;
    }

    const browserLanguages =
        navigator.languages &&
        navigator.languages.length
            ? navigator.languages
            : [navigator.language];

    for (
        const language
        of browserLanguages
        ) {

        if (!language) {
            continue;
        }

        const exact =
            language.toLowerCase();

        if (available.has(exact)) {
            return exact;
        }

        const base =
            exact.split('-')[0];

        if (available.has(base)) {
            return base;
        }
    }

    return available.has(DEFAULT_LANG)
        ? DEFAULT_LANG
        : LANGUAGES[0].id;
}

function tr(key) {

    const language =
        I18N[LANG];

    const fallback =
        I18N[DEFAULT_LANG];

    return (
        language?.[key] ??
        fallback?.[key] ??
        key
    );
}

function applyLanguage() {

    document.documentElement.lang =
        LANG;

    document
        .querySelectorAll('[data-i18n]')
        .forEach(element => {

            element.textContent =
                tr(
                    element.dataset.i18n
                );
        });

    $('language').value =
        LANG;

    updatePresetLock();
    updateThemeButton();
    renderSavedTargets();

    result();
    draw();
}


/* =========================
   THEME
   ========================= */

function getTheme() {

    const saved =
        localStorage.getItem(
            'wardogs-theme'
        );

    if (
        saved === 'light' ||
        saved === 'dark'
    ) {
        return saved;
    }

    return 'dark';
}

function loadTheme() {
    applyTheme(
        getTheme()
    );
}

function applyTheme(theme) {

    const root =
        document.documentElement;

    const isLight =
        theme === 'light';

    if (isLight) {
        root.dataset.theme =
            'light';
    } else {
        delete root.dataset.theme;
    }

    localStorage.setItem(
        'wardogs-theme',
        isLight
            ? 'light'
            : 'dark'
    );

    updateThemeButton();
    draw();
}

function updateThemeButton() {

    const icon =
        $('themeIcon');

    if (!icon) {
        return;
    }

    const isLight =
        document.documentElement
            .dataset.theme === 'light';

    icon.textContent =
        isLight
            ? '☾'
            : '☼';

    $('themeToggle').setAttribute(
        'aria-label',
        isLight
            ? 'Switch to dark theme'
            : 'Switch to light theme'
    );

    $('themeToggle').title =
        isLight
            ? 'Switch to dark theme'
            : 'Switch to light theme';
}

function toggleTheme() {

    const current =
        document.documentElement
            .dataset.theme === 'light'
            ? 'light'
            : 'dark';

    applyTheme(
        current === 'light'
            ? 'dark'
            : 'light'
    );
}


/* =========================
   SAVED TARGETS
   ========================= */

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

    localStorage.setItem(
        SAVED_TARGETS_KEY,
        JSON.stringify(
            savedTargets
        )
    );
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

        origin:
            saveArtillery
                ? {
                    x: Number(
                        S.origin.x
                    ),
                    y: Number(
                        S.origin.y
                    )
                }
                : null
    };

    savedTargets.push(
        target
    );

    selectedSavedTargetId =
        target.id;

    persistSavedTargets();

    renderSavedTargets();
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

    savedTargets.splice(
        index,
        1
    );

    if (
        selectedSavedTargetId === id
    ) {
        selectedSavedTargetId =
            null;
    }

    persistSavedTargets();

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

    target.name =
        trimmed;

    persistSavedTargets();

    renderSavedTargets();
}

function restoreTarget(target) {

    if (!target) {
        return;
    }

    S.target = {
        x: Number(target.x),
        y: Number(target.y)
    };

    if (
        target.saveArtillery &&
        target.origin &&
        typeof target.origin.x === 'number' &&
        typeof target.origin.y === 'number'
    ) {

        S.origin = {
            x: Number(target.origin.x),
            y: Number(target.origin.y)
        };
    }

    clamp(S.target);
    clamp(S.origin);

    selectedSavedTargetId =
        target.id;

    inputs();
    renderSavedTargets();
}

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

    savedTargets.forEach(
        target => {

            const item =
                document.createElement(
                    'div'
                );

            item.className =
                'saved-target';

            if (
                target.id ===
                selectedSavedTargetId
            ) {
                item.classList.add(
                    'active'
                );
            }

            item.addEventListener(
                'click',
                () => {
                    restoreTarget(
                        target
                    );
                }
            );

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

            const coords =
                document.createElement(
                    'span'
                );

            coords.className =
                'saved-target-coords';

            coords.textContent =
                `X ${Math.round(target.x * 1000)} · Y ${Math.round(target.y * 1000)}`;

            info.appendChild(
                name
            );

            info.appendChild(
                coords
            );

            const actions =
                document.createElement(
                    'div'
                );

            actions.className =
                'saved-target-actions-inline';

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
                edit
            );

            actions.appendChild(
                remove
            );

            item.appendChild(
                info
            );

            item.appendChild(
                actions
            );

            container.appendChild(
                item
            );
        }
    );
}


/* =========================
   MAPS
   ========================= */

function formatCoord(value) {

    return Math.round(value)
        .toString()
        .padStart(4, '0');
}

async function loadMaps() {

    const index =
        await fetchJSON(
            'maps/index.json'
        );

    const files =
        Array.isArray(index)
            ? index
            : Array.isArray(index.maps)
                ? index.maps
                : [];

    if (!files.length) {
        throw new Error(
            'No maps found in maps/index.json'
        );
    }

    const loaded =
        await Promise.all(
            files.map(
                async item => {

                    const file =
                        typeof item === 'string'
                            ? item
                            : item.file;

                    if (!file) {
                        return null;
                    }

                    const map =
                        await fetchJSON(
                            `maps/${file}`
                        );

                    if (!map.id) {
                        throw new Error(
                            `Map ${file} has no id`
                        );
                    }

                    return map;
                }
            )
        );

    MAPS = {};

    loaded
        .filter(Boolean)
        .forEach(
            map => {
                MAPS[map.id] =
                    map;
            }
        );

    if (MAPS.bakurani) {

        MAPS.bakurani.w =
            16;

        MAPS.bakurani.h =
            16;

        MAPS.bakurani.tilePath =
            'maps/tiles/bakurani';
    }

    populateMapSelect();
}

function populateMapSelect() {

    const select =
        $('mapSelect');

    select.innerHTML = '';

    /*
     * Preset maps first.
     */
    Object.values(MAPS)
        .forEach(
            map => {

                const option =
                    document.createElement(
                        'option'
                    );

                option.value =
                    map.id;

                option.textContent =
                    map.name;

                select.appendChild(
                    option
                );
            }
        );

    /*
     * Custom map is always last.
     */
    const custom =
        document.createElement(
            'option'
        );

    custom.value =
        'custom';

    custom.textContent =
        tr('customMap');

    select.appendChild(
        custom
    );

    select.value =
        S.map;
}

/* =========================
   WORLD / VIEW BOUNDS
   ========================= */

function getViewBounds() {

    if (
        S.map === 'bakurani'
    ) {

        return {
            minX:
            BAKURANI_BOUNDS.minX,

            maxX:
            BAKURANI_BOUNDS.maxX,

            minY:
            BAKURANI_BOUNDS.minY,

            maxY:
            BAKURANI_BOUNDS.maxY
        };
    }

    return {
        minX: 0,
        maxX: S.w,

        minY: 0,
        maxY: S.h
    };
}


/* =========================
   TILE MAP
   ========================= */

function getTileZoom() {

    const bounds =
        BAKURANI_BOUNDS;

    const worldWidth =
        bounds.maxX -
        bounds.minX;

    const basePixelsPerKm =
        TILE_SIZE /
        worldWidth;

    const desiredPixelsPerKm =
        view().scale;

    const raw =
        Math.log2(
            desiredPixelsPerKm /
            basePixelsPerKm
        );

    return Math.max(
        TILE_MIN_ZOOM,
        Math.min(
            TILE_MAX_ZOOM,
            Math.round(raw)
        )
    );
}

function tileKey(
    mapId,
    zoom,
    x,
    y
) {

    return `${mapId}:${zoom}:${x}:${y}`;
}

function loadTile(
    mapId,
    zoom,
    x,
    y
) {

    const key =
        tileKey(
            mapId,
            zoom,
            x,
            y
        );

    if (
        TILE_CACHE.has(key)
    ) {
        return TILE_CACHE.get(
            key
        );
    }

    const image =
        new Image();

    image.decoding =
        'async';

    const tile = {
        image,
        loaded: false,
        failed: false
    };

    image.onload =
        () => {

            tile.loaded =
                true;

            draw();
        };

    image.onerror =
        () => {

            tile.failed =
                true;

            console.warn(
                `Failed to load tile: ${mapId}/zoom_${zoom}/${x}_${y}.webp`
            );

            draw();
        };

    image.src =
        resourceURL(
            `maps/tiles/${mapId}/zoom_${zoom}/${x}_${y}.webp`
        );

    TILE_CACHE.set(
        key,
        tile
    );

    return tile;
}

function drawTileMap(map) {

    if (
        !map ||
        map.id !== 'bakurani'
    ) {
        return;
    }

    const v =
        view();

    const bounds =
        BAKURANI_BOUNDS;

    const zoom =
        getTileZoom();

    const tileCount =
        Math.pow(
            2,
            zoom
        );

    const worldWidth =
        bounds.maxX -
        bounds.minX;

    const worldHeight =
        bounds.maxY -
        bounds.minY;

    const tileWorldWidth =
        worldWidth /
        tileCount;

    const tileWorldHeight =
        worldHeight /
        tileCount;

    const tileScreenWidth =
        tileWorldWidth *
        v.scale;

    const tileScreenHeight =
        tileWorldHeight *
        v.scale;

    const topLeft =
        toWorld(
            0,
            0
        );

    const bottomRight =
        toWorld(
            wrap.clientWidth,
            wrap.clientHeight
        );

    const visibleLeft =
        Math.min(
            topLeft.x,
            bottomRight.x
        );

    const visibleRight =
        Math.max(
            topLeft.x,
            bottomRight.x
        );

    const visibleBottom =
        Math.min(
            topLeft.y,
            bottomRight.y
        );

    const visibleTop =
        Math.max(
            topLeft.y,
            bottomRight.y
        );

    const worldLeft =
        Math.max(
            bounds.minX,
            visibleLeft
        );

    const worldRight =
        Math.min(
            bounds.maxX,
            visibleRight
        );

    const worldBottom =
        Math.max(
            bounds.minY,
            visibleBottom
        );

    const worldTop =
        Math.min(
            bounds.maxY,
            visibleTop
        );

    if (
        worldLeft >= worldRight ||
        worldBottom >= worldTop
    ) {
        return;
    }

    const minTileX =
        Math.max(
            0,
            Math.floor(
                (
                    worldLeft -
                    bounds.minX
                ) /
                tileWorldWidth
            ) - 1
        );

    const maxTileX =
        Math.min(
            tileCount - 1,
            Math.floor(
                (
                    worldRight -
                    bounds.minX
                ) /
                tileWorldWidth
            ) + 1
        );

    const minTileY =
        Math.max(
            0,
            Math.floor(
                (
                    bounds.maxY -
                    worldTop
                ) /
                tileWorldHeight
            ) - 1
        );

    const maxTileY =
        Math.min(
            tileCount - 1,
            Math.floor(
                (
                    bounds.maxY -
                    worldBottom
                ) /
                tileWorldHeight
            ) + 1
        );

    ctx.save();

    for (
        let tileY =
            minTileY;

        tileY <=
        maxTileY;

        tileY++
    ) {

        const tileWorldTop =
            bounds.maxY -
            tileY *
            tileWorldHeight;

        for (
            let tileX =
                minTileX;

            tileX <=
            maxTileX;

            tileX++
        ) {

            const tileWorldLeft =
                bounds.minX +
                tileX *
                tileWorldWidth;

            const screen =
                worldToLocalScreen(
                    tileWorldLeft,
                    tileWorldTop
                );

            const tile =
                loadTile(
                    map.id,
                    zoom,
                    tileX,
                    tileY
                );

            if (
                tile.loaded &&
                !tile.failed
            ) {

                ctx.drawImage(
                    tile.image,
                    screen.x,
                    screen.y,
                    tileScreenWidth + 0.5,
                    tileScreenHeight + 0.5
                );

            } else {

                ctx.fillStyle =
                    '#151a1d';

                ctx.fillRect(
                    screen.x,
                    screen.y,
                    tileScreenWidth + 0.5,
                    tileScreenHeight + 0.5
                );
            }
        }
    }

    ctx.restore();
}


/* =========================
   CANVAS
   ========================= */

function resize() {

    const d =
        window.devicePixelRatio ||
        1;

    c.width =
        wrap.clientWidth *
        d;

    c.height =
        wrap.clientHeight *
        d;

    ctx.setTransform(
        d,
        0,
        0,
        d,
        0,
        0
    );

    draw();
}

function view() {

    const W =
        wrap.clientWidth;

    const H =
        wrap.clientHeight;

    const padding =
        34;

    const bounds =
        getViewBounds();

    const worldWidth =
        bounds.maxX -
        bounds.minX;

    const worldHeight =
        bounds.maxY -
        bounds.minY;

    const scale =
        Math.min(
            (
                W -
                padding *
                2
            ) /
            worldWidth,

            (
                H -
                padding *
                2
            ) /
            worldHeight
        ) *
        S.zoom;

    const mw =
        worldWidth *
        scale;

    const mh =
        worldHeight *
        scale;

    return {
        scale,

        bounds,

        worldWidth,
        worldHeight,

        left:
            (
                W -
                mw
            ) /
            2 +
            S.panX,

        top:
            (
                H -
                mh
            ) /
            2 +
            S.panY,

        mw,
        mh
    };
}

function worldToLocalScreen(
    x,
    y
) {

    const v =
        view();

    return {
        x:
            (
                x -
                v.bounds.minX
            ) *
            v.scale,

        y:
            (
                v.bounds.maxY -
                y
            ) *
            v.scale
    };
}

function toScreen(
    x,
    y
) {

    const v =
        view();

    const local =
        worldToLocalScreen(
            x,
            y
        );

    return {
        x:
            v.left +
            local.x,

        y:
            v.top +
            local.y
    };
}

function toWorld(
    x,
    y
) {

    const v =
        view();

    return {
        x:
            v.bounds.minX +
            (
                x -
                v.left
            ) /
            v.scale,

        y:
            v.bounds.maxY -
            (
                y -
                v.top
            ) /
            v.scale
    };
}

function clamp(p) {

    if (
        S.map === 'bakurani'
    ) {

        p.x =
            Math.max(
                BAKURANI_BOUNDS.minX,
                Math.min(
                    BAKURANI_BOUNDS.maxX,
                    Math.round(
                        p.x *
                        1000
                    ) /
                    1000
                )
            );

        p.y =
            Math.max(
                BAKURANI_BOUNDS.minY,
                Math.min(
                    BAKURANI_BOUNDS.maxY,
                    Math.round(
                        p.y *
                        1000
                    ) /
                    1000
                )
            );

        return;
    }

    p.x =
        Math.max(
            0,
            Math.min(
                S.w,
                Math.round(
                    p.x *
                    1000
                ) /
                1000
            )
        );

    p.y =
        Math.max(
            0,
            Math.min(
                S.h,
                Math.round(
                    p.y *
                    1000
                ) /
                1000
            )
        );
}


/* =========================
   USER MARKERS
   ========================= */

function marker(
    p,
    text
) {

    const pos =
        worldToLocalScreen(
            p.x,
            p.y
        );

    ctx.beginPath();

    ctx.arc(
        pos.x,
        pos.y,
        8,
        0,
        Math.PI * 2
    );

    ctx.fillStyle =
        text === 'O'
            ? '#5fa8d3'
            : '#d86666';

    ctx.fill();

    ctx.strokeStyle =
        '#fff';

    ctx.lineWidth =
        2;

    ctx.stroke();

    ctx.fillStyle =
        '#fff';

    ctx.font =
        'bold 10px system-ui';

    ctx.textAlign =
        'center';

    ctx.textBaseline =
        'alphabetic';

    ctx.fillText(
        text,
        pos.x,
        pos.y + 4
    );
}


/* =========================
   PRESET ZONES
   ========================= */

function drawPresetZones(map) {

    if (
        !map ||
        !Array.isArray(
            map.zones
        )
    ) {
        return;
    }

    const v =
        view();

    map.zones.forEach(
        zone => {

            if (
                typeof zone.x !== 'number' ||
                typeof zone.y !== 'number' ||
                typeof zone.radius !== 'number'
            ) {
                return;
            }

            const pos =
                worldToLocalScreen(
                    zone.x /
                    1000,

                    zone.y /
                    1000
                );

            const radius =
                (
                    zone.radius /
                    1000
                ) *
                v.scale;

            ctx.beginPath();

            ctx.arc(
                pos.x,
                pos.y,
                radius,
                0,
                Math.PI * 2
            );

            ctx.fillStyle =
                hexToRgba(
                    zone.color,
                    0.12
                );

            ctx.fill();

            ctx.strokeStyle =
                zone.color ||
                '#d7a452';

            ctx.lineWidth =
                2;

            ctx.setLineDash([
                7,
                5
            ]);

            ctx.stroke();

            ctx.setLineDash([]);
        }
    );
}


/* =========================
   PRESET POLYGONS
   ========================= */

function getPolygonCenter(points) {

    if (
        !Array.isArray(points) ||
        points.length === 0
    ) {
        return null;
    }

    let signedArea =
        0;

    let centroidX =
        0;

    let centroidY =
        0;

    for (
        let i = 0;
        i < points.length;
        i++
    ) {

        const current =
            points[i];

        const next =
            points[
            (
                i + 1
            ) %
            points.length
                ];

        const cross =
            current.x *
            next.y -
            next.x *
            current.y;

        signedArea +=
            cross;

        centroidX +=
            (
                current.x +
                next.x
            ) *
            cross;

        centroidY +=
            (
                current.y +
                next.y
            ) *
            cross;
    }

    signedArea *=
        0.5;

    if (
        Math.abs(
            signedArea
        ) <
        1e-9
    ) {

        const sum =
            points.reduce(
                (
                    result,
                    point
                ) => {

                    result.x +=
                        point.x;

                    result.y +=
                        point.y;

                    return result;
                },
                {
                    x: 0,
                    y: 0
                }
            );

        return {
            x:
                sum.x /
                points.length,

            y:
                sum.y /
                points.length
        };
    }

    centroidX /=
        6 *
        signedArea;

    centroidY /=
        6 *
        signedArea;

    return {
        x:
        centroidX,

        y:
        centroidY
    };
}

function drawPolygonLabel(
    polygon,
    validPoints
) {

    if (
        !polygon.label
    ) {
        return;
    }

    const center =
        getPolygonCenter(
            validPoints
        );

    if (!center) {
        return;
    }

    const screen =
        worldToLocalScreen(
            center.x /
            1000,

            center.y /
            1000
        );

    ctx.save();

    ctx.font =
        'bold 11px system-ui, sans-serif';

    ctx.textAlign =
        'center';

    ctx.textBaseline =
        'middle';

    const metrics =
        ctx.measureText(
            polygon.label
        );

    const paddingX =
        7;

    const paddingY =
        4;

    const labelWidth =
        metrics.width +
        paddingX *
        2;

    const labelHeight =
        11 +
        paddingY *
        2;

    ctx.fillStyle =
        polygon.labelBackground ||
        'rgba(16, 19, 22, .85)';

    ctx.fillRect(
        screen.x -
        labelWidth /
        2,

        screen.y -
        labelHeight /
        2,

        labelWidth,
        labelHeight
    );

    ctx.strokeStyle =
        polygon.labelBorder ||
        'rgba(255,255,255,.15)';

    ctx.lineWidth =
        1;

    ctx.strokeRect(
        screen.x -
        labelWidth /
        2,

        screen.y -
        labelHeight /
        2,

        labelWidth,
        labelHeight
    );

    ctx.fillStyle =
        polygon.labelColor ||
        '#ffffff';

    ctx.fillText(
        polygon.label,
        screen.x,
        screen.y
    );

    ctx.restore();
}

function drawPresetPolygons(map) {

    if (
        !map ||
        !Array.isArray(
            map.polygons
        )
    ) {
        return;
    }

    map.polygons.forEach(
        polygon => {

            if (
                !polygon ||
                !Array.isArray(
                    polygon.points
                )
            ) {
                return;
            }

            const validPoints =
                polygon.points.filter(
                    point =>
                        point &&
                        typeof point.x === 'number' &&
                        typeof point.y === 'number'
                );

            if (
                validPoints.length <
                3
            ) {
                return;
            }

            const first =
                worldToLocalScreen(
                    validPoints[0].x /
                    1000,

                    validPoints[0].y /
                    1000
                );

            ctx.save();

            ctx.beginPath();

            ctx.moveTo(
                first.x,
                first.y
            );

            for (
                let i = 1;
                i < validPoints.length;
                i++
            ) {

                const point =
                    validPoints[i];

                const screen =
                    worldToLocalScreen(
                        point.x /
                        1000,

                        point.y /
                        1000
                    );

                ctx.lineTo(
                    screen.x,
                    screen.y
                );
            }

            ctx.closePath();

            const color =
                polygon.color ||
                '#d7a452';

            const fillOpacity =
                typeof polygon.fillOpacity ===
                'number'
                    ? Math.max(
                        0,
                        Math.min(
                            1,
                            polygon.fillOpacity
                        )
                    )
                    : 0.15;

            if (
                polygon.fillColor
            ) {

                ctx.fillStyle =
                    hexToRgba(
                        polygon.fillColor,
                        fillOpacity
                    );

            } else {

                ctx.fillStyle =
                    hexToRgba(
                        color,
                        fillOpacity
                    );
            }

            ctx.fill();

            ctx.strokeStyle =
                color;

            ctx.lineWidth =
                typeof polygon.strokeWidth ===
                'number'
                    ? Math.max(
                        0.5,
                        polygon.strokeWidth
                    )
                    : 2;

            if (
                polygon.dashed
            ) {

                ctx.setLineDash(
                    Array.isArray(
                        polygon.dash
                    )
                        ? polygon.dash
                        : [
                            8,
                            6
                        ]
                );

            } else {

                ctx.setLineDash([]);
            }

            ctx.lineJoin =
                'round';

            ctx.lineCap =
                'round';

            ctx.stroke();

            ctx.setLineDash([]);

            ctx.restore();

            drawPolygonLabel(
                polygon,
                validPoints
            );
        }
    );
}


/* =========================
   PRESET MARKERS
   ========================= */

function drawPresetMarkers(map) {

    if (
        !map ||
        !Array.isArray(
            map.markers
        )
    ) {
        return;
    }

    const v =
        view();

    map.markers.forEach(
        item => {

            if (
                typeof item.x !== 'number' ||
                typeof item.y !== 'number'
            ) {
                return;
            }

            const pos =
                worldToLocalScreen(
                    item.x /
                    1000,

                    item.y /
                    1000
                );

            const x =
                pos.x;

            const y =
                pos.y;

            ctx.save();

            ctx.textAlign =
                'center';

            ctx.textBaseline =
                'middle';

            const emojiSize =
                Math.max(
                    14,
                    Math.min(
                        32,
                        v.scale *
                        0.35
                    )
                );

            ctx.font =
                `${emojiSize}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;

            ctx.fillText(
                item.emoji ||
                '📍',
                x,
                y
            );

            if (item.label) {

                const labelSize =
                    Math.max(
                        10,
                        Math.min(
                            14,
                            v.scale *
                            0.15
                        )
                    );

                ctx.font =
                    `${labelSize}px system-ui, sans-serif`;

                const metrics =
                    ctx.measureText(
                        item.label
                    );

                const paddingX =
                    6;

                const paddingY =
                    3;

                const labelWidth =
                    metrics.width +
                    paddingX *
                    2;

                const labelHeight =
                    labelSize +
                    paddingY *
                    2;

                const labelX =
                    x -
                    labelWidth /
                    2;

                const labelY =
                    y +
                    emojiSize /
                    2 +
                    5;

                ctx.fillStyle =
                    'rgba(16, 19, 22, .88)';

                ctx.fillRect(
                    labelX,
                    labelY,
                    labelWidth,
                    labelHeight
                );

                ctx.strokeStyle =
                    'rgba(255, 255, 255, .12)';

                ctx.lineWidth =
                    1;

                ctx.strokeRect(
                    labelX,
                    labelY,
                    labelWidth,
                    labelHeight
                );

                ctx.fillStyle =
                    '#e7edf2';

                ctx.fillText(
                    item.label,
                    x,
                    labelY +
                    labelHeight /
                    2
                );
            }

            ctx.restore();
        }
    );
}


/* =========================
   COLORS
   ========================= */

function hexToRgba(
    color,
    alpha
) {

    if (!color) {
        return `rgba(215,164,82,${alpha})`;
    }

    if (
        color.startsWith(
            'rgba('
        )
    ) {
        return color;
    }

    if (
        color.startsWith(
            'rgb('
        )
    ) {

        return color
            .replace(
                'rgb(',
                'rgba('
            )
            .replace(
                ')',
                `,${alpha})`
            );
    }

    const hex =
        color.replace(
            '#',
            ''
        );

    if (
        hex.length !== 3 &&
        hex.length !== 6
    ) {
        return `rgba(215,164,82,${alpha})`;
    }

    const normalized =
        hex.length === 3
            ? hex
                .split('')
                .map(
                    char =>
                        char +
                        char
                )
                .join('')
            : hex;

    const r =
        parseInt(
            normalized.substring(
                0,
                2
            ),
            16
        );

    const g =
        parseInt(
            normalized.substring(
                2,
                4
            ),
            16
        );

    const b =
        parseInt(
            normalized.substring(
                4,
                6
            ),
            16
        );

    return `rgba(${r},${g},${b},${alpha})`;
}


/* =========================
   GRID
   ========================= */

function drawGrid() {

    const v =
        view();

    const major =
        '#6f7a82';

    const minor =
        '#3b444b';

    const minorStep =
        0.1;

    const startX =
        Math.ceil(
            v.bounds.minX /
            minorStep
        ) *
        minorStep;

    const endX =
        Math.floor(
            v.bounds.maxX /
            minorStep
        ) *
        minorStep;

    const startY =
        Math.ceil(
            v.bounds.minY /
            minorStep
        ) *
        minorStep;

    const endY =
        Math.floor(
            v.bounds.maxY /
            minorStep
        ) *
        minorStep;

    for (
        let x =
            startX;

        x <=
        endX +
        1e-9;

        x +=
            minorStep
    ) {

        const rounded =
            Math.round(
                x *
                10
            ) /
            10;

        const local =
            worldToLocalScreen(
                rounded,
                v.bounds.maxY
            );

        const isMajor =
            Math.abs(
                rounded -
                Math.round(
                    rounded
                )
            ) <
            1e-8;

        ctx.strokeStyle =
            isMajor
                ? major
                : minor;

        ctx.lineWidth =
            isMajor
                ? 1.3
                : 1;

        ctx.beginPath();

        ctx.moveTo(
            local.x,
            0
        );

        ctx.lineTo(
            local.x,
            v.mh
        );

        ctx.stroke();
    }

    for (
        let y =
            startY;

        y <=
        endY +
        1e-9;

        y +=
            minorStep
    ) {

        const rounded =
            Math.round(
                y *
                10
            ) /
            10;

        const local =
            worldToLocalScreen(
                v.bounds.minX,
                rounded
            );

        const isMajor =
            Math.abs(
                rounded -
                Math.round(
                    rounded
                )
            ) <
            1e-8;

        ctx.strokeStyle =
            isMajor
                ? major
                : minor;

        ctx.lineWidth =
            isMajor
                ? 1.3
                : 1;

        ctx.beginPath();

        ctx.moveTo(
            0,
            local.y
        );

        ctx.lineTo(
            v.mw,
            local.y
        );

        ctx.stroke();
    }
}

function drawCoordinateLabels() {

    const v =
        view();

    const styles =
        getComputedStyle(
            document.documentElement
        );

    ctx.fillStyle =
        styles
            .getPropertyValue(
                '--muted'
            )
            .trim() ||
        '#89959e';

    ctx.font =
        '10px system-ui';

    const firstX =
        Math.ceil(
            v.bounds.minX
        );

    const lastX =
        Math.floor(
            v.bounds.maxX
        );

    const firstY =
        Math.ceil(
            v.bounds.minY
        );

    const lastY =
        Math.floor(
            v.bounds.maxY
        );

    ctx.textBaseline =
        'top';

    ctx.textAlign =
        'center';

    for (
        let x =
            firstX;

        x <=
        lastX;

        x++
    ) {

        const local =
            worldToLocalScreen(
                x,
                v.bounds.minY
            );

        ctx.fillText(
            formatCoord(
                x *
                1000
            ),
            local.x,
            v.mh +
            9
        );
    }

    ctx.textBaseline =
        'middle';

    ctx.textAlign =
        'right';

    for (
        let y =
            firstY;

        y <=
        lastY;

        y++
    ) {

        const local =
            worldToLocalScreen(
                v.bounds.minX,
                y
            );

        ctx.fillText(
            formatCoord(
                y *
                1000
            ),
            -8,
            local.y
        );
    }

    ctx.textBaseline =
        'alphabetic';
}


/* =========================
   DRAW
   ========================= */

function draw() {

    if (!wrap) {
        return;
    }

    const W =
        wrap.clientWidth;

    const H =
        wrap.clientHeight;

    const v =
        view();

    ctx.clearRect(
        0,
        0,
        W,
        H
    );

    const styles =
        getComputedStyle(
            document.documentElement
        );

    ctx.fillStyle =
        styles
            .getPropertyValue(
                '--map-bg'
            )
            .trim() ||
        '#0d1012';

    ctx.fillRect(
        0,
        0,
        W,
        H
    );

    ctx.save();

    ctx.translate(
        v.left,
        v.top
    );

    ctx.fillStyle =
        styles
            .getPropertyValue(
                '--panel-bg'
            )
            .trim() ||
        '#151a1d';

    ctx.fillRect(
        0,
        0,
        v.mw,
        v.mh
    );

    const currentMap =
        MAPS[S.map];

    /*
     * Layer 1:
     * base map tiles.
     */
    if (
        currentMap &&
        currentMap.id ===
        'bakurani'
    ) {

        drawTileMap(
            currentMap
        );
    }

    /*
     * Layer 2:
     * coordinate grid.
     */
    drawGrid();

    drawCoordinateLabels();

    /*
     * Layer 3:
     * circular zones.
     */
    drawPresetZones(
        currentMap
    );

    /*
     * Layer 4:
     * arbitrary polygons.
     */
    drawPresetPolygons(
        currentMap
    );

    const a =
        worldToLocalScreen(
            S.origin.x,
            S.origin.y
        );

    const b =
        worldToLocalScreen(
            S.target.x,
            S.target.y
        );

    const rangePx =
        WEAPONS[S.weapon].range *
        v.scale;

    /*
     * Layer 5:
     * artillery range.
     */
    ctx.beginPath();

    ctx.arc(
        a.x,
        a.y,
        rangePx,
        0,
        Math.PI * 2
    );

    ctx.fillStyle =
        'rgba(215,164,82,.08)';

    ctx.fill();

    ctx.strokeStyle =
        '#d7a452';

    ctx.lineWidth =
        2;

    ctx.setLineDash([
        7,
        5
    ]);

    ctx.stroke();

    ctx.setLineDash([]);

    /*
     * Layer 6:
     * origin -> target line.
     */
    ctx.strokeStyle =
        '#d7a452';

    ctx.lineWidth =
        2;

    ctx.setLineDash([
        8,
        6
    ]);

    ctx.beginPath();

    ctx.moveTo(
        a.x,
        a.y
    );

    ctx.lineTo(
        b.x,
        b.y
    );

    ctx.stroke();

    ctx.setLineDash([]);

    /*
     * Layer 7:
     * artillery / target markers.
     */
    marker(
        S.origin,
        'O'
    );

    marker(
        S.target,
        'T'
    );

    /*
     * Layer 8:
     * preset icons are ALWAYS drawn last.
     *
     * This prevents tiles, grid, zones,
     * polygons and artillery overlays from
     * covering map icons.
     */
    drawPresetMarkers(
        currentMap
    );

    ctx.restore();

    result();
}


/* =========================
   RESULT
   ========================= */

function result() {

    const dx =
        S.target.x -
        S.origin.x;

    const dy =
        S.target.y -
        S.origin.y;

    const d =
        Math.hypot(
            dx,
            dy
        );

    let a =
        Math.atan2(
            dx,
            dy
        ) *
        180 /
        Math.PI;

    if (
        a <
        0
    ) {
        a +=
            360;
    }

    $('angle').textContent =
        a.toFixed(
            1
        ) +
        '°';

    $('dist').textContent =
        d.toFixed(
            2
        ) +
        ' km';

    $('distm').textContent =
        Math.round(
            d *
            1000
        ) +
        ' m';

    $('dx').textContent =
        (
            dx >=
            0
                ? '+'
                : '-'
        ) +
        Math.round(
            Math.abs(
                dx *
                1000
            )
        ) +
        ' m';

    $('dy').textContent =
        (
            dy >=
            0
                ? '+'
                : '-'
        ) +
        Math.round(
            Math.abs(
                dy *
                1000
            )
        ) +
        ' m';

    const inRange =
        d <=
        WEAPONS[S.weapon].range +
        1e-9;

    $('range').textContent =
        Math.round(
            WEAPONS[S.weapon].range *
            1000
        ) +
        ' m';

    $('rangeStatus').textContent =
        inRange
            ? tr('inRange')
            : tr('outRange');

    $('rangeStatus').style.color =
        inRange
            ? '#82c596'
            : '#d86666';

    const mapName =
        S.map ===
        'custom'
            ? tr('customMap')
            : MAPS[S.map]?.name ||
            S.map;

    $('status').textContent =
        `${tr(WEAPONS[S.weapon].nameKey)} · ` +
        `${mapName} · ` +
        `${tr('artillery')}: ` +
        `${formatCoord(
            S.origin.x *
            1000
        )}, ` +
        `${formatCoord(
            S.origin.y *
            1000
        )} · ` +
        `${tr('target')}: ` +
        `${formatCoord(
            S.target.x *
            1000
        )}, ` +
        `${formatCoord(
            S.target.y *
            1000
        )}`;
}


/* =========================
   INPUTS
   ========================= */

function inputs() {

    $('mapSelect').value =
        S.map;

    $('weapon').value =
        S.weapon;

    $('ox').value =
        Math.round(
            S.origin.x *
            1000
        );

    $('oy').value =
        Math.round(
            S.origin.y *
            1000
        );

    $('tx').value =
        Math.round(
            S.target.x *
            1000
        );

    $('ty').value =
        Math.round(
            S.target.y *
            1000
        );

    $('w').value =
        S.w;

    $('h').value =
        S.h;

    result();
    draw();
}

function inputPoint(type) {

    const p =
        S[type];

    const xInput =
        type === 'origin'
            ? $('ox')
            : $('tx');

    const yInput =
        type === 'origin'
            ? $('oy')
            : $('ty');

    p.x =
        (
            Number(
                xInput.value
            ) ||
            0
        ) /
        1000;

    p.y =
        (
            Number(
                yInput.value
            ) ||
            0
        ) /
        1000;

    clamp(
        p
    );

    inputs();
}

function updatePresetLock() {

    const locked =
        $('mapSelect').value !==
        'custom';

    $('customMapSizing').style.display =
        locked
            ? 'none'
            : '';
}


/* =========================
   CURSOR
   ========================= */

function updateCursor(e) {

    const rect =
        c.getBoundingClientRect();

    const x =
        e.clientX -
        rect.left;

    const y =
        e.clientY -
        rect.top;

    const world =
        toWorld(
            x,
            y
        );

    const bounds =
        getViewBounds();

    if (
        world.x <
        bounds.minX ||
        world.x >
        bounds.maxX ||
        world.y <
        bounds.minY ||
        world.y >
        bounds.maxY
    ) {

        $('cursorCoords')
            .style.display =
            'none';

        return;
    }

    const cursor =
        $('cursorCoords');

    cursor.style.display =
        'block';

    cursor.style.left =
        `${x + 14}px`;

    cursor.style.top =
        `${y + 14}px`;

    cursor.querySelector(
        '.cursor-x'
    ).textContent =
        `x${formatCoord(
            world.x *
            1000
        )}`;

    cursor.querySelector(
        '.cursor-y'
    ).textContent =
        `y${formatCoord(
            world.y *
            1000
        )}`;
}


/* =========================
   EVENTS
   ========================= */

function bindThemeToggle() {

    const toggle =
        $('themeToggle');

    if (!toggle) {
        return;
    }

    toggle.addEventListener(
        'click',
        toggleTheme
    );
}

function bindEvents() {

    $('mapSelect').addEventListener(
        'change',
        () => {

            const key =
                $('mapSelect').value;

            if (
                key !==
                'custom'
            ) {

                S.map =
                    key;

                S.w =
                    MAPS[key].w;

                S.h =
                    MAPS[key].h;

            } else {

                S.map =
                    'custom';
            }

            clamp(
                S.origin
            );

            clamp(
                S.target
            );

            S.zoom =
                1;

            S.panX =
                0;

            S.panY =
                0;

            updatePresetLock();

            inputs();
        }
    );

    $('language').addEventListener(
        'change',
        () => {

            LANG =
                $('language').value;

            localStorage.setItem(
                'wardogs-language',
                LANG
            );

            applyLanguage();
        }
    );

    $('weapon').addEventListener(
        'change',
        () => {

            S.weapon =
                $('weapon').value;

            draw();
        }
    );

    $('apply').addEventListener(
        'click',
        () => {

            S.map =
                'custom';

            S.w =
                Math.max(
                    1,
                    Math.min(
                        100,
                        Number(
                            $('w').value
                        ) ||
                        10
                    )
                );

            S.h =
                Math.max(
                    1,
                    Math.min(
                        100,
                        Number(
                            $('h').value
                        ) ||
                        10
                    )
                );

            clamp(
                S.origin
            );

            clamp(
                S.target
            );

            S.zoom =
                1;

            S.panX =
                0;

            S.panY =
                0;

            updatePresetLock();

            inputs();
        }
    );

    $('originMode').addEventListener(
        'click',
        () => {

            S.mode =
                'origin';

            $('originMode')
                .classList.add(
                'active'
            );

            $('targetMode')
                .classList.remove(
                'active'
            );
        }
    );

    $('targetMode').addEventListener(
        'click',
        () => {

            S.mode =
                'target';

            $('targetMode')
                .classList.add(
                'active'
            );

            $('originMode')
                .classList.remove(
                'active'
            );
        }
    );

    ['ox', 'oy'].forEach(
        id => {

            $(id).addEventListener(
                'change',
                () =>
                    inputPoint(
                        'origin'
                    )
            );
        }
    );

    ['tx', 'ty'].forEach(
        id => {

            $(id).addEventListener(
                'change',
                () =>
                    inputPoint(
                        'target'
                    )
            );
        }
    );

    $('zoomIn').addEventListener(
        'click',
        () => {

            S.zoom =
                Math.min(
                    MAX_ZOOM,
                    S.zoom *
                    ZOOM_BUTTON_FACTOR
                );

            draw();
        }
    );

    $('zoomOut').addEventListener(
        'click',
        () => {

            S.zoom =
                Math.max(
                    MIN_ZOOM,
                    S.zoom /
                    ZOOM_BUTTON_FACTOR
                );

            draw();
        }
    );

    $('fit').addEventListener(
        'click',
        () => {

            S.zoom =
                1;

            S.panX =
                0;

            S.panY =
                0;

            draw();
        }
    );

    $('swap').addEventListener(
        'click',
        () => {

            const oldOrigin =
                S.origin;

            S.origin =
                S.target;

            S.target =
                oldOrigin;

            inputs();
        }
    );

    $('clear').addEventListener(
        'click',
        () => {

            const bounds =
                getViewBounds();

            S.origin = {
                x:
                bounds.minX,

                y:
                bounds.minY
            };

            S.target = {
                x:
                bounds.minX,

                y:
                bounds.minY
            };

            selectedSavedTargetId =
                null;

            inputs();

            renderSavedTargets();
        }
    );


    /* =========================
       SAVED TARGETS
       ========================= */

    $('saveTarget').addEventListener(
        'click',
        saveCurrentTarget
    );

    $('saveArtilleryPosition')
        .addEventListener(
            'change',
            saveArtilleryPreference
        );


    /* =========================
       CANVAS
       ========================= */

    c.addEventListener(
        'mousedown',
        e => {

            e.preventDefault();

            const rect =
                c.getBoundingClientRect();

            const p =
                toWorld(
                    e.clientX -
                    rect.left,

                    e.clientY -
                    rect.top
                );

            if (
                e.button ===
                2
            ) {

                pan = {
                    startX:
                    e.clientX,

                    startY:
                    e.clientY,

                    originX:
                    S.panX,

                    originY:
                    S.panY
                };

                $('cursorCoords')
                    .style.display =
                    'none';

                return;
            }

            const d1 =
                Math.hypot(
                    p.x -
                    S.origin.x,

                    p.y -
                    S.origin.y
                );

            const d2 =
                Math.hypot(
                    p.x -
                    S.target.x,

                    p.y -
                    S.target.y
                );

            drag =
                Math.min(
                    d1,
                    d2
                ) < 0.3
                    ? (
                        d1 <
                        d2
                            ? 'origin'
                            : 'target'
                    )
                    : S.mode;

            S[drag] = {
                x:
                p.x,

                y:
                p.y
            };

            clamp(
                S[drag]
            );

            inputs();

            updateCursor(
                e
            );
        }
    );

    window.addEventListener(
        'mousemove',
        e => {

            if (pan) {

                S.panX =
                    pan.originX +
                    (
                        e.clientX -
                        pan.startX
                    );

                S.panY =
                    pan.originY +
                    (
                        e.clientY -
                        pan.startY
                    );

                draw();

                return;
            }

            updateCursor(
                e
            );

            if (!drag) {
                return;
            }

            const rect =
                c.getBoundingClientRect();

            const world =
                toWorld(
                    e.clientX -
                    rect.left,

                    e.clientY -
                    rect.top
                );

            S[drag] =
                world;

            clamp(
                S[drag]
            );

            inputs();

            updateCursor(
                e
            );
        }
    );

    c.addEventListener(
        'contextmenu',
        e => {

            e.preventDefault();
        }
    );

    c.addEventListener(
        'mouseleave',
        () => {

            if (!pan) {

                $('cursorCoords')
                    .style.display =
                    'none';
            }
        }
    );

    window.addEventListener(
        'mouseup',
        () => {

            drag =
                null;

            pan =
                null;
        }
    );

    c.addEventListener(
        'wheel',
        e => {

            e.preventDefault();

            const rect =
                c.getBoundingClientRect();

            const mouseX =
                e.clientX -
                rect.left;

            const mouseY =
                e.clientY -
                rect.top;

            const before =
                toWorld(
                    mouseX,
                    mouseY
                );

            S.zoom =
                Math.max(
                    MIN_ZOOM,
                    Math.min(
                        MAX_ZOOM,
                        S.zoom *
                        (
                            e.deltaY <
                            0
                                ? ZOOM_WHEEL_IN
                                : ZOOM_WHEEL_OUT
                        )
                    )
                );

            const after =
                toWorld(
                    mouseX,
                    mouseY
                );

            S.panX +=
                (
                    after.x -
                    before.x
                ) *
                view().scale;

            S.panY -=
                (
                    after.y -
                    before.y
                ) *
                view().scale;

            draw();
        },
        {
            passive:
                false
        }
    );

    window.addEventListener(
        'resize',
        resize
    );
}


/* =========================
   INIT
   ========================= */

async function init() {

    try {

        applyTheme(
            getTheme()
        );

        bindThemeToggle();

        loadSavedTargets();

        await loadLanguages();

        await loadMaps();

        bindEvents();

        loadSaveArtilleryPreference();

        updatePresetLock();

        applyLanguage();

        inputs();

        resize();

        renderSavedTargets();

    } catch (error) {

        console.error(
            'Failed to initialize application:',
            error
        );

        document.body.innerHTML = `
            <div style="
                padding:40px;
                font-family:system-ui;
                color:#d86666;
                background:#101316;
            ">
                <h1>Failed to initialize application</h1>
                <pre>${error.message}</pre>
            </div>
        `;
    }
}

init();