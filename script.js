const WEAPONS = {
    mortar: {
        name: 'Mortar',
        range: 0.6
    },
    spg: {
        name: 'SPG',
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

const $ = id => document.getElementById(id);

const c = $('canvas');
const wrap = document.querySelector('.map');
const ctx = c.getContext('2d');

async function fetchJSON(url) {
    const response = await fetch(url);

    if (!response.ok) {
        throw new Error(
            `Failed to load ${url}: ${response.status} ${response.statusText}`
        );
    }

    return response.json();
}

async function loadLanguages() {
    const index = await fetchJSON('locales/index.json');

    DEFAULT_LANG =
        index.default || 'en';

    LANGUAGES =
        Array.isArray(index.languages)
            ? index.languages
            : [];

    if (!LANGUAGES.length) {
        throw new Error('No languages found in locales/index.json');
    }

    await Promise.all(
        LANGUAGES.map(async language => {
            I18N[language.id] =
                await fetchJSON(
                    `locales/${language.file}`
                );
        })
    );

    populateLanguageSelect();

    LANG =
        detectLanguage();

    $('language').value = LANG;
}

function populateLanguageSelect() {
    const select = $('language');

    select.innerHTML = '';

    LANGUAGES.forEach(language => {
        const option =
            document.createElement('option');

        option.value =
            language.id;

        option.textContent =
            `${language.flag || ''} ${language.nativeName || language.name}`;

        select.appendChild(option);
    });
}

function detectLanguage() {
    const available =
        new Set(
            LANGUAGES.map(
                language => language.id
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

    for (const language of browserLanguages) {
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

    return DEFAULT_LANG;
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
                tr(element.dataset.i18n);
        });

    $('language').value =
        LANG;

    updatePresetLock();
    result();
    draw();
}

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
            files.map(async item => {
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
            })
        );

    MAPS = {};

    loaded
        .filter(Boolean)
        .forEach(map => {
            MAPS[map.id] = map;
        });

    populateMapSelect();
}

function populateMapSelect() {
    const select =
        $('mapSelect');

    select.innerHTML = '';

    const custom =
        document.createElement('option');

    custom.value =
        'custom';

    custom.dataset.i18n =
        'customMap';

    custom.textContent =
        tr('customMap');

    select.appendChild(custom);

    Object.values(MAPS).forEach(map => {
        const option =
            document.createElement('option');

        option.value =
            map.id;

        option.textContent =
            map.name;

        select.appendChild(option);
    });

    select.value =
        S.map;
}

function resize() {
    const d =
        devicePixelRatio || 1;

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

    const p = 34;

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

    ctx.lineWidth = 2;

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

    map.zones.forEach(zone => {
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

        ctx.lineWidth = 2;

        ctx.setLineDash([
            7,
            5
        ]);

        ctx.stroke();

        ctx.setLineDash([]);
    });
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

    map.markers.forEach(item => {
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
    });
}

function hexToRgba(color, alpha) {
    if (!color) {
        return `rgba(215,164,82,${alpha})`;
    }

    if (
        color.startsWith('rgba(')
    ) {
        return color;
    }

    if (
        color.startsWith('rgb(')
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
                .map(
                    char =>
                        char + char
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

    ctx.fillStyle =
        getComputedStyle(
            document.documentElement
        ).getPropertyValue(
            '--map-bg'
        ).trim() ||
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
        getComputedStyle(
            document.documentElement
        ).getPropertyValue(
            '--panel-bg'
        ).trim() ||
        '#151a1d';

    ctx.fillRect(
        0,
        0,
        v.mw,
        v.mh
    );

    const styles =
        getComputedStyle(
            document.documentElement
        );

    const major =
        styles.getPropertyValue(
            '--grid-major'
        ).trim() ||
        '#465058';

    const minor =
        styles.getPropertyValue(
            '--grid-minor'
        ).trim() ||
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

        ctx.moveTo(
            x,
            0
        );

        ctx.lineTo(
            x,
            v.mh
        );

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

        ctx.moveTo(
            0,
            y
        );

        ctx.lineTo(
            v.mw,
            y
        );

        ctx.stroke();
    }

    ctx.fillStyle =
        styles.getPropertyValue(
            '--muted'
        ).trim() ||
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
            formatCoord(
                x * 1000
            ),
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
            formatCoord(
                y * 1000
            ),
            -8,
            (S.h - y) *
            v.scale
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
        ' км';

    $('distm').textContent =
        Math.round(
            d * 1000
        ) +
        ' м';

    $('dx').textContent =
        (
            dx >= 0
                ? '+'
                : '-'
        ) +
        formatCoord(
            Math.abs(
                dx * 1000
            )
        ) +
        ' м';

    $('dy').textContent =
        (
            dy >= 0
                ? '+'
                : '-'
        ) +
        formatCoord(
            Math.abs(
                dy * 1000
            )
        ) +
        ' м';

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
        `${WEAPONS[S.weapon].name} · ` +
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

function inputs() {
    $('mapSelect').value =
        S.map;

    $('weapon').value =
        S.weapon;

    $('ox').value =
        formatCoord(
            S.origin.x * 1000
        );

    $('oy').value =
        formatCoord(
            S.origin.y * 1000
        );

    $('tx').value =
        formatCoord(
            S.target.x * 1000
        );

    $('ty').value =
        formatCoord(
            S.target.y * 1000
        );

    $('w').value =
        S.w;

    $('h').value =
        S.h;

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

function bindEvents() {
    $('mapSelect').onchange =
        () => {
            const key =
                $('mapSelect').value;

            if (
                key !== 'custom'
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

            clamp(S.origin);
            clamp(S.target);

            S.zoom = 1;
            S.panX = 0;
            S.panY = 0;

            updatePresetLock();
            inputs();
        };

    $('language').onchange =
        () => {
            LANG =
                $('language').value;

            localStorage.setItem(
                'wardogs-language',
                LANG
            );

            applyLanguage();
        };

    $('weapon').onchange =
        () => {
            S.weapon =
                $('weapon').value;

            draw();
        };

    $('apply').onclick =
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
        };

    $('originMode').onclick =
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
        };

    $('targetMode').onclick =
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
        };

    ['ox', 'oy'].forEach(id => {
        $(id).onchange =
            () =>
                inputPoint(
                    'origin'
                );
    });

    ['tx', 'ty'].forEach(id => {
        $(id).onchange =
            () =>
                inputPoint(
                    'target'
                );
    });

    $('zoomIn').onclick =
        () => {
            S.zoom =
                Math.min(
                    3,
                    S.zoom * 1.2
                );

            draw();
        };

    $('zoomOut').onclick =
        () => {
            S.zoom =
                Math.max(
                    0.4,
                    S.zoom / 1.2
                );

            draw();
        };

    $('fit').onclick =
        () => {
            S.zoom = 1;
            S.panX = 0;
            S.panY = 0;

            draw();
        };

    $('swap').onclick =
        () => {
            [
                S.origin,
                S.target
            ] = [
                S.target,
                S.origin
            ];

            inputs();
        };

    $('clear').onclick =
        () => {
            S.origin = {
                x: 0,
                y: 0
            };

            S.target = {
                x: 0,
                y: 0
            };

            inputs();
        };

    c.onmousedown =
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
                e.button === 2
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
        };

    window.onmousemove =
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
        };

    c.oncontextmenu =
        e => {
            e.preventDefault();
        };

    c.onmouseleave =
        () => {
            if (!pan) {
                $('cursorCoords')
                    .style.display =
                    'none';
            }
        };

    window.onmouseup =
        () => {
            drag = null;
            pan = null;
        };

    c.onwheel =
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
        };

    window.onresize =
        resize;
}

async function init() {
    try {
        await loadLanguages();

        await loadMaps();

        bindEvents();

        updatePresetLock();

        applyLanguage();

        inputs();

        resize();
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