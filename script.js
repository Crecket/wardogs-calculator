const MAPS = {
    bakurani: {
        name: 'Bakurani',
        w: 10,
        h: 10
    }
};

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

const I18N = {
    en: {
        title: 'WARDOGS // ARTILLERY CALCULATOR',
        gridInfo: '1 km → 10×10 cells of 100 m',
        map: 'Map',
        presetMap: 'Preset map',
        customMap: 'Custom map',
        width: 'Width, km',
        height: 'Height, km',
        apply: 'Apply',
        weapon: 'Weapon',
        weaponType: 'Weapon type',
        mortar: 'Mortar',
        spg: 'SPG',
        maxRange: 'Max range',
        targetStatus: 'Target status',
        inRange: 'In range',
        outRange: 'OUT OF RANGE',
        rangeHint: 'The circle shows the maximum range of the selected weapon from the artillery position.',
        pointSelection: 'Point selection',
        artillery: 'Artillery',
        target: 'Target',
        artilleryXY: 'Artillery X / Y',
        targetXY: 'Target X / Y',
        result: 'Result',
        azimuth: 'AZIMUTH',
        distance: 'Distance',
        meters: 'Meters',
        azimuthHint: 'Azimuth: 0° north, 90° east, 180° south, 270° west.',
        controls: 'Controls',
        fit: 'Fit map',
        swap: 'Swap points',
        clear: 'Reset',
        controlsHint: 'LMB — place point · Drag markers — move points · Scroll — zoom · RMB — move map.',
        lmb: 'LMB',
        point: 'point',
        grid: 'grid',
        majorGrid: 'major line',
        lightTheme: 'Light',
        darkTheme: 'Dark'
    },

    ru: {
        title: 'WARDOGS // АРТИЛЛЕРИЙСКИЙ КАЛЬКУЛЯТОР',
        gridInfo: '1 км → 10×10 клеток по 100 м',
        map: 'Карта',
        presetMap: 'Готовая карта',
        customMap: 'Своя карта',
        width: 'Ширина, км',
        height: 'Высота, км',
        apply: 'Применить',
        weapon: 'Оружие',
        weaponType: 'Тип оружия',
        mortar: 'Миномёт',
        spg: 'SPG',
        maxRange: 'Макс. дальность',
        targetStatus: 'Статус цели',
        inRange: 'В пределах',
        outRange: 'ВНЕ дальности',
        rangeHint: 'Круг показывает максимальный радиус действия выбранного оружия от позиции орудия.',
        pointSelection: 'Выбор точки',
        artillery: 'Орудие',
        target: 'Цель',
        artilleryXY: 'Орудие X / Y',
        targetXY: 'Цель X / Y',
        result: 'Результат',
        azimuth: 'АЗИМУТ',
        distance: 'Дистанция',
        meters: 'В метрах',
        azimuthHint: 'Азимут: 0° — север, 90° — восток, 180° — юг, 270° — запад.',
        controls: 'Управление',
        fit: 'Вписать поле',
        swap: 'Поменять точки',
        clear: 'Сбросить',
        controlsHint: 'ЛКМ — поставить точку · Перетаскивание маркеров — перемещение точек · Скролл — масштаб · ПКМ — передвижение карты.',
        lmb: 'ЛКМ',
        point: 'точка',
        grid: 'сетка',
        majorGrid: 'жирная линия',
        lightTheme: 'Светлая',
        darkTheme: 'Тёмная'
    }
};

let LANG = 'en';

const S = {
    w: 10,
    h: 10,
    zoom: 1,
    panX: 0,
    panY: 0,
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
    }
};

const $ = id => document.getElementById(id);
const canvas = $('canvas');
const wrap = document.querySelector('.map');
const ctx = canvas.getContext('2d');

function displayCoordinate(value) {
    return (value * 10).toFixed(2);
}

function parseDisplayCoordinate(value) {
    return Number(value) / 10;
}

function tr(key) {
    return I18N[LANG][key] || key;
}

function applyLanguage() {
    document.documentElement.lang = LANG;

    document.querySelectorAll('[data-i18n]').forEach(element => {
        element.textContent = tr(element.dataset.i18n);
    });

    $('language').value = LANG;

    updateThemeButton();
    updatePresetLock();
    draw();
}

function applyTheme(theme) {
    document.documentElement.dataset.theme = theme;

    localStorage.setItem(
        'wardogs-theme',
        theme
    );

    updateThemeButton();
    draw();
}

function updateThemeButton() {
    const theme =
        document.documentElement.dataset.theme || 'dark';

    $('themeIcon').textContent =
        theme === 'dark'
            ? '☀'
            : '☾';

    $('themeText').textContent =
        theme === 'dark'
            ? tr('lightTheme')
            : tr('darkTheme');
}

function resize() {
    const d = devicePixelRatio || 1;

    canvas.width = wrap.clientWidth * d;
    canvas.height = wrap.clientHeight * d;

    ctx.setTransform(d, 0, 0, d, 0, 0);

    draw();
}

function view() {
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    const padding = 34;

    const scale =
        Math.min(
            (W - padding * 2) / S.w,
            (H - padding * 2) / S.h
        ) * S.zoom;

    const mw = S.w * scale;
    const mh = S.h * scale;

    return {
        scale,
        left: (W - mw) / 2 + S.panX,
        top: (H - mh) / 2 + S.panY,
        mw,
        mh
    };
}

function toScreen(x, y) {
    const v = view();

    return {
        x: v.left + x * v.scale,
        y: v.top + (S.h - y) * v.scale
    };
}

function toWorld(x, y) {
    const v = view();

    return {
        x: (x - v.left) / v.scale,
        y: S.h - (y - v.top) / v.scale
    };
}

function clamp(point) {
    point.x = Math.max(0, Math.min(S.w, point.x));
    point.y = Math.max(0, Math.min(S.h, point.y));
}

function marker(point, text) {
    const v = view();
    const x = point.x * v.scale;
    const y = (S.h - point.y) * v.scale;

    ctx.beginPath();
    ctx.arc(x, y, 8, 0, Math.PI * 2);

    ctx.fillStyle =
        text === 'O'
            ? '#5fa8d3'
            : '#d86666';

    ctx.fill();

    ctx.strokeStyle = '#fff';
    ctx.lineWidth = 2;
    ctx.stroke();

    ctx.fillStyle = '#fff';
    ctx.font = 'bold 10px system-ui';
    ctx.textAlign = 'center';

    ctx.fillText(text, x, y + 4);
}

function draw() {
    const W = wrap.clientWidth;
    const H = wrap.clientHeight;
    const v = view();

    const theme =
        document.documentElement.dataset.theme || 'dark';

    const colors =
        theme === 'light'
            ? {
                background: '#e4e8eb',
                map: '#f1f3f4',
                major: '#8a959c',
                minor: '#cbd1d5',
                text: '#68747d',
                accent: '#a87924'
            }
            : {
                background: '#0d1012',
                map: '#151a1d',
                major: '#465058',
                minor: '#252c31',
                text: '#89959e',
                accent: '#d7a452'
            };

    ctx.clearRect(0, 0, W, H);

    ctx.fillStyle = colors.background;
    ctx.fillRect(0, 0, W, H);

    ctx.save();

    ctx.translate(v.left, v.top);

    ctx.fillStyle = colors.map;
    ctx.fillRect(0, 0, v.mw, v.mh);

    for (let i = 0; i <= S.w * 10; i++) {
        const x = i * v.scale / 10;

        ctx.strokeStyle =
            i % 10 === 0
                ? colors.major
                : colors.minor;

        ctx.lineWidth = 1;

        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, v.mh);
        ctx.stroke();
    }

    for (let i = 0; i <= S.h * 10; i++) {
        const y = i * v.scale / 10;

        ctx.strokeStyle =
            i % 10 === 0
                ? colors.major
                : colors.minor;

        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(v.mw, y);
        ctx.stroke();
    }

    ctx.fillStyle = colors.text;
    ctx.font = '10px system-ui';
    ctx.textBaseline = 'top';
    ctx.textAlign = 'center';

    for (let x = 0; x <= S.w; x++) {
        ctx.fillText(
            x,
            x * v.scale,
            v.mh + 9
        );
    }

    ctx.textBaseline = 'middle';
    ctx.textAlign = 'right';

    for (let y = 0; y <= S.h; y++) {
        ctx.fillText(
            y,
            -8,
            (S.h - y) * v.scale
        );
    }

    ctx.textBaseline = 'alphabetic';

    const a = toScreen(
        S.origin.x,
        S.origin.y
    );

    const b = toScreen(
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
        theme === 'light'
            ? 'rgba(168,121,36,.10)'
            : 'rgba(215,164,82,.08)';

    ctx.fill();

    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);

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

    marker(S.origin, 'O');
    marker(S.target, 'T');

    ctx.restore();

    result();
}

function result() {
    const dx =
        S.target.x - S.origin.x;

    const dy =
        S.target.y - S.origin.y;

    const distance =
        Math.hypot(dx, dy);

    let azimuth =
        Math.atan2(dx, dy) *
        180 /
        Math.PI;

    if (azimuth < 0) {
        azimuth += 360;
    }

    $('angle').textContent =
        azimuth.toFixed(1) + '°';

    $('dist').textContent =
        distance.toFixed(2) + ' км';

    $('distm').textContent =
        Math.round(distance * 1000) + ' м';

    $('dx').textContent =
        (dx >= 0 ? '+' : '') +
        dx.toFixed(3) +
        ' км';

    $('dy').textContent =
        (dy >= 0 ? '+' : '') +
        dy.toFixed(3) +
        ' км';

    const inRange =
        distance <=
        WEAPONS[S.weapon].range + 1e-9;

    $('range').textContent =
        Math.round(
            WEAPONS[S.weapon].range * 1000
        ) + ' м';

    $('rangeStatus').textContent =
        inRange
            ? tr('inRange')
            : tr('outRange');

    $('rangeStatus').style.color =
        inRange
            ? '#82c596'
            : '#d86666';

    $('status').textContent =
        `${WEAPONS[S.weapon].name} · ${
            S.map === 'custom'
                ? tr('customMap')
                : MAPS[S.map].name
        } · ${
            tr('artillery')
        }: ${
            displayCoordinate(S.origin.x)
        }, ${
            displayCoordinate(S.origin.y)
        } · ${
            tr('target')
        }: ${
            displayCoordinate(S.target.x)
        }, ${
            displayCoordinate(S.target.y)
        }`;
}

function inputs() {
    $('mapSelect').value = S.map;
    $('weapon').value = S.weapon;

    $('ox').value =
        displayCoordinate(S.origin.x);

    $('oy').value =
        displayCoordinate(S.origin.y);

    $('tx').value =
        displayCoordinate(S.target.x);

    $('ty').value =
        displayCoordinate(S.target.y);

    $('w').value = S.w;
    $('h').value = S.h;

    draw();
}

function inputPoint(type) {
    const point = S[type];

    const xInput =
        type === 'origin'
            ? $('ox')
            : $('tx');

    const yInput =
        type === 'origin'
            ? $('oy')
            : $('ty');

    point.x =
        parseDisplayCoordinate(
            xInput.value
        ) || 0;

    point.y =
        parseDisplayCoordinate(
            yInput.value
        ) || 0;

    clamp(point);

    inputs();
}

function updatePresetLock() {
    const locked =
        $('mapSelect').value !== 'custom';

    $('customMapSizing').style.display =
        locked
            ? 'none'
            : '';
}

$('themeToggle').onclick = () => {
    const current =
        document.documentElement.dataset.theme || 'dark';

    applyTheme(
        current === 'dark'
            ? 'light'
            : 'dark'
    );
};

$('mapSelect').onchange = () => {
    const key =
        $('mapSelect').value;

    if (key !== 'custom') {
        S.map = key;
        S.w = MAPS[key].w;
        S.h = MAPS[key].h;
    } else {
        S.map = 'custom';
    }

    clamp(S.origin);
    clamp(S.target);

    S.zoom = 1;
    S.panX = 0;
    S.panY = 0;

    updatePresetLock();
    inputs();
};

$('language').onchange = () => {
    LANG = $('language').value;
    applyLanguage();
};

$('weapon').onchange = () => {
    S.weapon = $('weapon').value;
    draw();
};

$('apply').onclick = () => {
    S.map = 'custom';

    S.w = Math.max(
        1,
        Math.min(
            100,
            Number($('w').value) || 10
        )
    );

    S.h = Math.max(
        1,
        Math.min(
            100,
            Number($('h').value) || 10
        )
    );

    clamp(S.origin);
    clamp(S.target);

    S.zoom = 1;
    S.panX = 0;
    S.panY = 0;

    inputs();
};

$('originMode').onclick = () => {
    S.mode = 'origin';

    $('originMode')
        .classList
        .add('active');

    $('targetMode')
        .classList
        .remove('active');
};

$('targetMode').onclick = () => {
    S.mode = 'target';

    $('targetMode')
        .classList
        .add('active');

    $('originMode')
        .classList
        .remove('active');
};

['ox', 'oy'].forEach(id => {
    $(id).onchange = () =>
        inputPoint('origin');
});

['tx', 'ty'].forEach(id => {
    $(id).onchange = () =>
        inputPoint('target');
});

$('zoomIn').onclick = () => {
    S.zoom =
        Math.min(
            3,
            S.zoom * 1.2
        );

    draw();
};

$('zoomOut').onclick = () => {
    S.zoom =
        Math.max(
            0.4,
            S.zoom / 1.2
        );

    draw();
};

$('fit').onclick = () => {
    S.zoom = 1;
    S.panX = 0;
    S.panY = 0;

    draw();
};

$('swap').onclick = () => {
    [S.origin, S.target] =
        [S.target, S.origin];

    inputs();
};

$('clear').onclick = () => {
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

let drag = null;
let pan = null;

function updateCursor(e) {
    if (pan) {
        $('cursorCoords').style.display = 'none';
        return null;
    }

    const canvasRect =
        canvas.getBoundingClientRect();

    const cursorX =
        e.clientX - canvasRect.left;

    const cursorY =
        e.clientY - canvasRect.top;

    const point =
        toWorld(
            cursorX,
            cursorY
        );

    const element =
        $('cursorCoords');

    if (
        point.x >= 0 &&
        point.x <= S.w &&
        point.y >= 0 &&
        point.y <= S.h
    ) {
        element.innerHTML = `
            <span class="cursor-y">
                y${displayCoordinate(point.y)}
            </span>
            <span class="cursor-x">
                x${displayCoordinate(point.x)}
            </span>
        `;

        element.style.display = 'block';
        element.style.left = cursorX + 'px';
        element.style.top = cursorY + 'px';
    } else {
        element.style.display = 'none';
    }

    return point;
}

canvas.onmousedown = e => {
    if (e.button === 2) {
        e.preventDefault();

        $('cursorCoords').style.display = 'none';

        pan = {
            lastX: e.clientX,
            lastY: e.clientY
        };

        canvas.style.cursor = 'grabbing';

        return;
    }

    if (e.button !== 0) {
        return;
    }

    const rect =
        canvas.getBoundingClientRect();

    const point =
        toWorld(
            e.clientX - rect.left,
            e.clientY - rect.top
        );

    const distanceOrigin =
        Math.hypot(
            point.x - S.origin.x,
            point.y - S.origin.y
        );

    const distanceTarget =
        Math.hypot(
            point.x - S.target.x,
            point.y - S.target.y
        );

    drag =
        Math.min(
            distanceOrigin,
            distanceTarget
        ) < 0.3
            ? (
                distanceOrigin < distanceTarget
                    ? 'origin'
                    : 'target'
            )
            : S.mode;

    S[drag] = {
        x: point.x,
        y: point.y
    };

    clamp(S[drag]);

    inputs();
    updateCursor(e);
};

window.onmousemove = e => {
    if (pan) {
        $('cursorCoords').style.display = 'none';

        const dx =
            e.clientX - pan.lastX;

        const dy =
            e.clientY - pan.lastY;

        S.panX += dx;
        S.panY += dy;

        pan.lastX = e.clientX;
        pan.lastY = e.clientY;

        draw();

        return;
    }

    const point =
        updateCursor(e);

    if (!drag || !point) {
        return;
    }

    const rect =
        canvas.getBoundingClientRect();

    const worldPoint =
        toWorld(
            e.clientX - rect.left,
            e.clientY - rect.top
        );

    S[drag] = worldPoint;

    clamp(S[drag]);

    inputs();
    updateCursor(e);
};

window.onmouseup = e => {
    if (e.button === 2) {
        pan = null;
        canvas.style.cursor = 'crosshair';
        updateCursor(e);
    }

    if (e.button === 0) {
        drag = null;
    }
};

canvas.oncontextmenu = e => {
    e.preventDefault();
};

canvas.onmouseleave = () => {
    if (!pan) {
        $('cursorCoords').style.display = 'none';
    }
};

canvas.onwheel = e => {
    e.preventDefault();

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

    draw();
};

window.onresize = resize;

LANG =
    localStorage.getItem('wardogs-language') || 'en';

const savedTheme =
    localStorage.getItem('wardogs-theme') || 'dark';

document.documentElement.dataset.theme =
    savedTheme;

$('language').value = LANG;

$('language').onchange = () => {
    LANG = $('language').value;

    localStorage.setItem(
        'wardogs-language',
        LANG
    );

    applyLanguage();
};

updatePresetLock();
applyLanguage();
inputs();
resize();