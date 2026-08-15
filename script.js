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
    w: 10,
    h: 10,

    zoom: 1,

    mode: 'origin',

    map: 'custom',

    weapon: 'mortar',

    origin: {
        x: 2,
        y: 2
    },

    target: {
        x: 2.5,
        y: 2.5
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

            /*
             * Clicking the save itself loads it.
             */
            item.addEventListener(
                'click',
                () => {
                    restoreTarget(target);
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

            info.appendChild(name);
            info.appendChild(coords);

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

            actions.appendChild(edit);
            actions.appendChild(remove);

            item.appendChild(info);
            item.appendChild(actions);

            container.appendChild(item);
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

    populateMapSelect();
}

function populateMapSelect() {

    const select =
        $('mapSelect');

    select.innerHTML = '';

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

    select.value =
        S.map;
}


/* =========================
   CANVAS
   ========================= */

function resize() {

    const d =
        window.devicePixelRatio || 1;

    c.width =
        wrap.clientWidth * d;

    c.height =
        wrap.clientHeight * d;

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

    const p =
        34;

    const scale =
        Math.min(
            (W - p * 2) / S.w,
            (H - p * 2) / S.h
        ) * S.zoom;

    const mw =
        S.w * scale;

    const mh =
        S.h * scale;

    return {
        scale,

        left:
            (W - mw) / 2 +
            S.panX,

        top:
            (H - mh) / 2 +
            S.panY,

        mw,
        mh
    };
}

function toScreen(x, y) {

    const v =
        view();

    return {
        x:
            v.left +
            x * v.scale,

        y:
            v.top +
            (S.h - y) *
            v.scale
    };
}

function toWorld(x, y) {

    const v =
        view();

    return {
        x:
            (x - v.left) /
            v.scale,

        y:
            S.h -
            (y - v.top) /
            v.scale
    };
}

function clamp(p) {

    p.x =
        Math.max(
            0,
            Math.min(
                S.w,
                Math.round(
                    p.x * 1000
                ) / 1000
            )
        );

    p.y =
        Math.max(
            0,
            Math.min(
                S.h,
                Math.round(
                    p.y * 1000
                ) / 1000
            )
        );
}

function marker(p, text) {

    const v =
        view();

    const x =
        p.x * v.scale;

    const y =
        (S.h - p.y) *
        v.scale;

    ctx.beginPath();

    ctx.arc(
        x,
        y,
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

    ctx.fillText(
        text,
        x,
        y + 4
    );
}

function drawPresetZones(map) {

    if (
        !map ||
        !Array.isArray(map.zones)
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

            const x =
                (zone.x / 1000) *
                v.scale;

            const y =
                (S.h - zone.y / 1000) *
                v.scale;

            const radius =
                (zone.radius / 1000) *
                v.scale;

            ctx.beginPath();

            ctx.arc(
                x,
                y,
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

function drawPresetMarkers(map) {

    if (
        !map ||
        !Array.isArray(map.markers)
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

            const x =
                (item.x / 1000) *
                v.scale;

            const y =
                (S.h - item.y / 1000) *
                v.scale;

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
                        v.scale * 0.35
                    )
                );

            ctx.font =
                `${emojiSize}px "Segoe UI Emoji", "Apple Color Emoji", sans-serif`;

            ctx.fillText(
                item.emoji || '📍',
                x,
                y
            );

            if (item.label) {

                const labelSize =
                    Math.max(
                        10,
                        Math.min(
                            14,
                            v.scale * 0.15
                        )
                    );

                ctx.font =
                    `${labelSize}px system-ui, sans-serif`;

                const metrics =
                    ctx.measureText(
                        item.label
                    );

                const paddingX = 6;
                const paddingY = 3;

                const labelWidth =
                    metrics.width +
                    paddingX * 2;

                const labelHeight =
                    labelSize +
                    paddingY * 2;

                const labelX =
                    x -
                    labelWidth / 2;

                const labelY =
                    y +
                    emojiSize / 2 +
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

                ctx.lineWidth = 1;

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
                    labelHeight / 2
                );
            }

            ctx.restore();
        }
    );
}

function hexToRgba(color, alpha) {

    if (!color) {
        return `rgba(215,164,82,${alpha})`;
    }

    if (color.startsWith('rgba(')) {
        return color;
    }

    if (color.startsWith('rgb(')) {
        return color
            .replace('rgb(', 'rgba(')
            .replace(')', `,${alpha})`);
    }

    const hex =
        color.replace('#', '');

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
                .map(char => char + char)
                .join('')
            : hex;

    const r =
        parseInt(
            normalized.substring(0, 2),
            16
        );

    const g =
        parseInt(
            normalized.substring(2, 4),
            16
        );

    const b =
        parseInt(
            normalized.substring(4, 6),
            16
        );

    return `rgba(${r},${g},${b},${alpha})`;
}

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
            .getPropertyValue('--map-bg')
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
            .getPropertyValue('--panel-bg')
            .trim() ||
        '#151a1d';

    ctx.fillRect(
        0,
        0,
        v.mw,
        v.mh
    );

    const major =
        styles
            .getPropertyValue('--grid-major')
            .trim() ||
        '#465058';

    const minor =
        styles
            .getPropertyValue('--grid-minor')
            .trim() ||
        '#252c31';

    for (
        let i = 0;
        i <= S.w * 10;
        i++
    ) {

        const x =
            i * v.scale / 10;

        ctx.strokeStyle =
            i % 10 === 0
                ? major
                : minor;

        ctx.lineWidth = 1;

        ctx.beginPath();

        ctx.moveTo(x, 0);
        ctx.lineTo(x, v.mh);

        ctx.stroke();
    }

    for (
        let i = 0;
        i <= S.h * 10;
        i++
    ) {

        const y =
            i * v.scale / 10;

        ctx.strokeStyle =
            i % 10 === 0
                ? major
                : minor;

        ctx.beginPath();

        ctx.moveTo(0, y);
        ctx.lineTo(v.mw, y);

        ctx.stroke();
    }

    ctx.fillStyle =
        styles
            .getPropertyValue('--muted')
            .trim() ||
        '#89959e';

    ctx.font =
        '10px system-ui';

    ctx.textBaseline =
        'top';

    ctx.textAlign =
        'center';

    for (
        let x = 0;
        x <= S.w;
        x++
    ) {

        ctx.fillText(
            formatCoord(x * 1000),
            x * v.scale,
            v.mh + 9
        );
    }

    ctx.textBaseline =
        'middle';

    ctx.textAlign =
        'right';

    for (
        let y = 0;
        y <= S.h;
        y++
    ) {

        ctx.fillText(
            formatCoord(y * 1000),
            -8,
            (S.h - y) * v.scale
        );
    }

    ctx.textBaseline =
        'alphabetic';

    const currentMap =
        MAPS[S.map];

    drawPresetZones(
        currentMap
    );

    const a =
        toScreen(
            S.origin.x,
            S.origin.y
        );

    const b =
        toScreen(
            S.target.x,
            S.target.y
        );

    const rangePx =
        WEAPONS[S.weapon].range *
        v.scale;

    ctx.beginPath();

    ctx.arc(
        a.x - v.left,
        a.y - v.top,
        rangePx,
        0,
        Math.PI * 2
    );

    ctx.fillStyle =
        'rgba(215,164,82,.08)';

    ctx.fill();

    ctx.strokeStyle =
        '#d7a452';

    ctx.lineWidth = 2;

    ctx.setLineDash([
        7,
        5
    ]);

    ctx.stroke();

    ctx.setLineDash([]);

    ctx.strokeStyle =
        '#d7a452';

    ctx.lineWidth = 2;

    ctx.setLineDash([
        8,
        6
    ]);

    ctx.beginPath();

    ctx.moveTo(
        a.x - v.left,
        a.y - v.top
    );

    ctx.lineTo(
        b.x - v.left,
        b.y - v.top
    );

    ctx.stroke();

    ctx.setLineDash([]);

    marker(
        S.origin,
        'O'
    );

    marker(
        S.target,
        'T'
    );

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

    if (a < 0) {
        a += 360;
    }

    $('angle').textContent =
        a.toFixed(1) + '°';

    $('dist').textContent =
        d.toFixed(2) +
        ' km';

    $('distm').textContent =
        Math.round(d * 1000) +
        ' m';

    $('dx').textContent =
        (
            dx >= 0
                ? '+'
                : '-'
        ) +
        Math.round(
            Math.abs(dx * 1000)
        ) +
        ' m';

    $('dy').textContent =
        (
            dy >= 0
                ? '+'
                : '-'
        ) +
        Math.round(
            Math.abs(dy * 1000)
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
        S.map === 'custom'
            ? tr('customMap')
            : MAPS[S.map]?.name ||
            S.map;

    $('status').textContent =
        `${tr(WEAPONS[S.weapon].nameKey)} · ` +
        `${mapName} · ` +
        `${tr('artillery')}: ` +
        `${formatCoord(
            S.origin.x * 1000
        )}, ` +
        `${formatCoord(
            S.origin.y * 1000
        )} · ` +
        `${tr('target')}: ` +
        `${formatCoord(
            S.target.x * 1000
        )}, ` +
        `${formatCoord(
            S.target.y * 1000
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
            S.origin.x * 1000
        );

    $('oy').value =
        Math.round(
            S.origin.y * 1000
        );

    $('tx').value =
        Math.round(
            S.target.x * 1000
        );

    $('ty').value =
        Math.round(
            S.target.y * 1000
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
            ) || 0
        ) / 1000;

    p.y =
        (
            Number(
                yInput.value
            ) || 0
        ) / 1000;

    clamp(p);

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

    if (
        world.x < 0 ||
        world.x > S.w ||
        world.y < 0 ||
        world.y > S.h
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
            world.x * 1000
        )}`;

    cursor.querySelector(
        '.cursor-y'
    ).textContent =
        `y${formatCoord(
            world.y * 1000
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

            if (key !== 'custom') {

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

            clamp(S.origin);
            clamp(S.target);

            S.zoom = 1;
            S.panX = 0;
            S.panY = 0;

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
                        ) || 10
                    )
                );

            S.h =
                Math.max(
                    1,
                    Math.min(
                        100,
                        Number(
                            $('h').value
                        ) || 10
                    )
                );

            clamp(S.origin);
            clamp(S.target);

            S.zoom = 1;
            S.panX = 0;
            S.panY = 0;

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
                .classList.add('active');

            $('targetMode')
                .classList.remove('active');
        }
    );

    $('targetMode').addEventListener(
        'click',
        () => {

            S.mode =
                'target';

            $('targetMode')
                .classList.add('active');

            $('originMode')
                .classList.remove('active');
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
                    3,
                    S.zoom * 1.2
                );

            draw();
        }
    );

    $('zoomOut').addEventListener(
        'click',
        () => {

            S.zoom =
                Math.max(
                    0.4,
                    S.zoom / 1.2
                );

            draw();
        }
    );

    $('fit').addEventListener(
        'click',
        () => {

            S.zoom = 1;
            S.panX = 0;
            S.panY = 0;

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

            S.origin = {
                x: 0,
                y: 0
            };

            S.target = {
                x: 0,
                y: 0
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

            if (e.button === 2) {

                pan = {
                    startX: e.clientX,
                    startY: e.clientY,
                    originX: S.panX,
                    originY: S.panY
                };

                $('cursorCoords')
                    .style.display =
                    'none';

                return;
            }

            const d1 =
                Math.hypot(
                    p.x - S.origin.x,
                    p.y - S.origin.y
                );

            const d2 =
                Math.hypot(
                    p.x - S.target.x,
                    p.y - S.target.y
                );

            drag =
                Math.min(d1, d2) < 0.3
                    ? (
                        d1 < d2
                            ? 'origin'
                            : 'target'
                    )
                    : S.mode;

            S[drag] = {
                x: p.x,
                y: p.y
            };

            clamp(
                S[drag]
            );

            inputs();
            updateCursor(e);
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

            updateCursor(e);

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
            updateCursor(e);
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

            drag = null;
            pan = null;
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
                    0.4,
                    Math.min(
                        3,
                        S.zoom *
                        (
                            e.deltaY < 0
                                ? 1.1
                                : 0.9
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
            passive: false
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