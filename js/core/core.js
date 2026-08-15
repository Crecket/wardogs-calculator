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


/* =========================
   ZOOM
   ========================= */

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 8;

const ZOOM_BUTTON_FACTOR = 1.25;
const ZOOM_WHEEL_IN = 1.15;
const ZOOM_WHEEL_OUT = 0.87;


/* =========================
   TILE DEFAULTS
   ========================= */

/*
 * These are only fallback values.
 *
 * Real map-specific values belong
 * inside the map JSON.
 */
const DEFAULT_TILE_SIZE = 256;
const DEFAULT_TILE_MIN_ZOOM = 0;
const DEFAULT_TILE_MAX_ZOOM = 5;
const DEFAULT_TILE_EXTENSION = 'webp';

const TILE_CACHE =
    new Map();


/* =========================
   DOM
   ========================= */

const $ = id =>
    document.getElementById(id);

const c =
    $('canvas');

const wrap =
    document.querySelector('.map');

const ctx =
    c.getContext('2d');

const BASE_PATH =
    new URL(
        '.',
        document.baseURI
    );