# Multiple Guns Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Turn the single artillery position into a list of guns, selectable like Saved targets, each with its own weapon and an eye toggle for its overlays.

**Architecture:** `S.guns` becomes the source of truth and `S.origin` / `S.weapon` become accessors on `S` pointing at the active gun, so the ~40 existing call sites keep working unedited. New behaviour lives in one fork-only file, `js/features/guns.js`. Guns sync as their own op family (`gun.add` / `gun.move` / `gun.remove`), which old clients ignore, so no protocol version and one Worker deploy.

**Tech Stack:** Vanilla browser JS loaded as global scripts (no modules, no framework), Canvas 2D, localStorage. Sync server is a Cloudflare Worker + Durable Object with SQLite storage, tested against `wrangler dev`.

**Spec:** `docs/superpowers/specs/2026-08-26-multiple-guns-design.md`

## Global Constraints

- **Script load order:** `js/features/guns.js` loads immediately after `js/core/core.js` and before every other script, in all 11 HTML shells.
- **`js/core/core.js` is never edited.** `guns.js` converts the existing `origin` and `weapon` data properties into accessors with `Object.defineProperty`.
- **The getter returns the live object**, never a copy — `clamp(S.origin)` and the drag path mutate it in place.
- **Invariant:** `S.guns.length >= 1` at all times. The last gun cannot be removed.
- **`visible` and `activeGunId` are local only.** They are never sent over the wire and never accepted from it.
- **`LIMITS.guns = 8`.**
- **Gun ids must match the server's `ID_PATTERN`:** `/^[a-z0-9][a-z0-9_-]{0,63}$/i`.
- **Gun weapon ids must match `SLUG_PATTERN`:** `/^[a-z0-9][a-z0-9_-]{0,63}$/i`.
- **The active gun always renders**, whatever its `visible` value. The eye governs non-active guns only.
- **Gun 1 mirrors to the legacy `point.set origin` op**, not the active gun.
- The 11 HTML shells are `src/pages/index.html`, `src/pages/mobile/index.html`, and `src/pages/locales/{cat,de,es,fr,pl,pt,ru,uk}.html`.
- The 10 locale files are `locales/{en,cat,de,es,fr,pl,pt,ru,uk,zh-cn}.json`.

---

## File Structure

| File | Status | Responsibility |
|---|---|---|
| `js/features/guns.js` | Create | Gun model, accessor installation, list UI, add/remove/select/visibility. Fork-only, so zero upstream merge risk. |
| `js/map/guns-overlay.js` | Create | Drawing every visible gun. Kept out of `renderer.js` for the same reason `contours.js` is. |
| `js/events.js:361` | Modify | One-line alias fix in the Swap handler. |
| `js/map/renderer.js` | Modify | One guarded call to `drawGuns()`. |
| `js/features/saved-targets.js` | Modify | `MAP_POINTS_KEY` read/write carries `guns`; migrates a stored singular `origin`. |
| `js/features/collab.js` | Modify | Send and apply gun ops; push guns on join; legacy origin mirror. Fork-only. |
| `sync/src/ops.js` | Modify | `validateGun`, three gun ops, `LIMITS.guns`, `push.guns`. Fork-only. |
| `sync/src/room.js` | Modify | Migration v2, `guns` table, snapshot, apply, clear, alarm. Fork-only. |
| `sync/test/guns.mjs` | Create | Server op coverage plus the old-client coexistence proof. |
| 11 HTML shells | Modify | One list container, two script tags. |
| 10 locale files | Modify | Six new keys. |

---

## Task 1: Gun model and accessors

Ships the data model with exactly one gun. The app must behave **identically** to today when this task lands — same single artillery position, same solution, same swap behaviour. Nothing visible changes.

**Files:**
- Create: `js/features/guns.js`
- Modify: `js/events.js:361-367`
- Modify: all 11 HTML shells (script tag)
- Test: `test/guns-model.mjs` (new Playwright driver, run manually)

**Interfaces:**
- Consumes: nothing.
- Produces, all global functions other tasks call:
  - `activeGun()` → the active gun object, never null
  - `gunById(id)` → gun or `null`
  - `createGun({x, y, weapon, name})` → new gun object, id auto-generated, `visible: true`
  - `addGun()` → appends a gun near the active one, selects it, returns it; returns `null` at the cap
  - `removeGun(id)` → `true` if removed; refuses the last gun
  - `selectGun(id)` → sets `S.activeGunId`, refreshes UI; no-op for an unknown id
  - `setGunVisible(id, visible)` → sets `visible` on a gun and redraws
  - `renameGun(id, name)` → sets `name`
  - `nextGunName()` → `"Gun N"` for the lowest unused N
  - `GUN_LIMIT` → `8`
  - Gun shape: `{ id, name, position: { x, y }, weapon, visible }`

- [ ] **Step 1: Write the failing test**

Create `test/guns-model.mjs`. It drives the real app, which is how this repo verifies browser code.

```js
/*
 * Model-level checks for the gun list, driven against the running dev server.
 *
 *   PORT=8123 npm run dev      # in one shell
 *   node test/guns-model.mjs   # in another
 */
import { chromium } from 'playwright';

const PORT = process.env.PORT || '8123';
let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
    if (ok) { pass++; console.log(`  ok   ${label}`); }
    else { fail++; console.log(`  FAIL ${label} ${detail}`); }
}

const browser = await chromium.launch();
const page = await browser.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

check('starts with exactly one gun',
    await page.evaluate(() => S.guns.length) === 1);

check('the first gun is active',
    await page.evaluate(() => S.activeGunId === S.guns[0].id));

check('S.origin reads through to the active gun',
    await page.evaluate(() => {
        S.guns[0].position.x = 42.5;
        return S.origin.x;
    }) === 42.5);

check('S.origin writes through to the active gun',
    await page.evaluate(() => {
        S.origin = { x: 11, y: 12 };
        return `${S.guns[0].position.x},${S.guns[0].position.y}`;
    }) === '11,12');

check('assigning S.origin keeps the gun identity',
    await page.evaluate(() => {
        const before = S.guns[0].id;
        S.origin = { x: 1, y: 2 };
        return S.guns[0].id === before && S.guns[0].name.length > 0;
    }));

check('clamp mutates the live gun position',
    await page.evaluate(() => {
        S.origin = { x: -9999, y: -9999 };
        clamp(S.origin);
        return S.guns[0].position.x > -9999;
    }));

check('S.weapon reads through to the active gun',
    await page.evaluate(() => {
        S.guns[0].weapon = 'mortar';
        return S.weapon;
    }) === 'mortar');

check('S.weapon writes through to the active gun',
    await page.evaluate(() => {
        S.weapon = 'spg';
        return S.guns[0].weapon;
    }) === 'spg');

check('addGun appends and selects',
    await page.evaluate(() => {
        const gun = addGun();
        return S.guns.length === 2 && S.activeGunId === gun.id;
    }));

check('each gun keeps its own weapon',
    await page.evaluate(() => {
        S.guns[0].weapon = 'mortar';
        S.guns[1].weapon = 'spg';
        selectGun(S.guns[0].id);
        const first = S.weapon;
        selectGun(S.guns[1].id);
        return first === 'mortar' && S.weapon === 'spg';
    }));

check('removeGun refuses the last gun',
    await page.evaluate(() => {
        while (S.guns.length > 1) removeGun(S.guns[S.guns.length - 1].id);
        return removeGun(S.guns[0].id) === false && S.guns.length === 1;
    }));

check('addGun stops at the cap',
    await page.evaluate(() => {
        while (S.guns.length < GUN_LIMIT) addGun();
        const overflow = addGun();
        return overflow === null && S.guns.length === GUN_LIMIT;
    }));

check('removing the active gun selects a survivor',
    await page.evaluate(() => {
        selectGun(S.guns[2].id);
        removeGun(S.guns[2].id);
        return Boolean(gunById(S.activeGunId));
    }));

check('gun ids match the server id pattern',
    await page.evaluate(
        () => S.guns.every(g => /^[a-z0-9][a-z0-9_-]{0,63}$/i.test(g.id))
    ));

/*
 * The aliasing hazard. Before the fix, Swap left both points on the target
 * AND made S.target the gun's own position object.
 */
check('swap exchanges the two points',
    await page.evaluate(() => {
        while (S.guns.length > 1) removeGun(S.guns[S.guns.length - 1].id);
        S.origin = { x: 30, y: 40 };
        S.target = { x: 60, y: 70 };
        document.getElementById('swap').click();
        return `${S.origin.x},${S.origin.y},${S.target.x},${S.target.y}`;
    }) === '60,70,30,40');

check('swap leaves target unaliased from the gun',
    await page.evaluate(() => {
        S.origin = { x: 30, y: 40 };
        S.target = { x: 60, y: 70 };
        document.getElementById('swap').click();
        S.guns[0].position.x = 99;
        return S.target.x !== 99;
    }));

check('no page errors', errors.length === 0, errors.join('; '));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
PORT=8123 npm run dev &
node test/guns-model.mjs
```

Expected: FAIL on every check, with page errors naming `S.guns is not defined` and `addGun is not defined`.

- [ ] **Step 3: Create `js/features/guns.js`**

```js
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
        /*
         * Local view state. Never sent to the room and never read from it —
         * hiding a gun on your screen must not hide it on a teammate's.
         */
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

    if (typeof collabSendGunAdd === 'function') {
        collabSendGunAdd(gun);
    }

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

    if (typeof collabSendGunRemove === 'function') {
        collabSendGunRemove(id);
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

    if (typeof collabSendGunAdd === 'function') {
        collabSendGunAdd(gun);
    }

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
```

`nextGunName()` calls `tr()`, which is not available at load time — that is why the seed gun above passes an explicit `name: 'Gun 1'` rather than calling it. `renderGuns()` is defined in Task 2; guard its absence by defining a no-op stub at the bottom of this file for now:

```js
/*
 * Replaced by the real list renderer in the same file once the UI lands.
 * Present from the start so the model can call it unconditionally.
 */
function renderGuns() {}
```

- [ ] **Step 4: Fix the swap alias in `js/events.js`**

Replace lines 361-367:

```js
            const oldOrigin =
                S.origin;

            S.origin =
                S.target;

            S.target =
                oldOrigin;
```

with:

```js
            /*
             * S.origin is a live reference to the active gun's position, so
             * capturing it directly would alias the gun: the setter below
             * would overwrite the very object we are about to hand to
             * S.target. Copy at capture.
             */
            const oldOrigin = {
                x: S.origin.x,
                y: S.origin.y
            };

            S.origin =
                S.target;

            S.target =
                oldOrigin;
```

- [ ] **Step 5: Add the script tag to all 11 shells**

```bash
for f in src/pages/index.html src/pages/mobile/index.html src/pages/locales/*.html; do
  perl -0pi -e 's{(<script src="js/core/core\.js"></script>\n)}{$1<script src="js/features/guns.js"></script>\n}' "$f"
done
grep -c "js/features/guns.js" src/pages/index.html src/pages/mobile/index.html src/pages/locales/*.html
```

Expected: `1` for all 11 files.

- [ ] **Step 6: Run the test to verify it passes**

```bash
node test/guns-model.mjs
```

Expected: `16 passed, 0 failed`.

- [ ] **Step 7: Verify the app is visually unchanged**

Open `http://127.0.0.1:8123/`, confirm the artillery marker, range ring, solution panel and Swap button all behave exactly as before. Nothing about this task should be visible.

- [ ] **Step 8: Commit**

```bash
git add js/features/guns.js js/events.js src/pages test/guns-model.mjs
git commit -m "Make artillery a list of guns behind the existing origin accessor"
```

---

## Task 2: Gun list UI

Adds the panel. After this task you can add, select, rename, remove and hide guns, and the sidebar follows the selection — but only the active gun is drawn (Task 3 draws the rest).

**Files:**
- Modify: `js/features/guns.js` (replace the `renderGuns()` stub)
- Modify: all 11 HTML shells (panel markup)
- Modify: all 10 locale files (six keys)
- Test: `test/guns-ui.mjs`

**Interfaces:**
- Consumes from Task 1: `activeGun`, `gunById`, `addGun`, `removeGun`, `selectGun`, `setGunVisible`, `renameGun`, `GUN_LIMIT`, `S.guns`, `S.activeGunId`.
- Produces: `renderGuns()` — rebuilds the list from `S.guns`; safe to call before the DOM exists.

- [ ] **Step 1: Write the failing test**

Create `test/guns-ui.mjs`:

```js
/*
 * Gun panel behaviour, driven against the running dev server.
 *
 *   PORT=8123 npm run dev   # in one shell
 *   node test/guns-ui.mjs   # in another
 */
import { chromium } from 'playwright';

const PORT = process.env.PORT || '8123';
let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
    if (ok) { pass++; console.log(`  ok   ${label}`); }
    else { fail++; console.log(`  FAIL ${label} ${detail}`); }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.evaluate(() => document.querySelector('.motd')?.remove());

const rows = () => page.locator('#gunsList .gun-row');

check('the panel renders one row at startup', await rows().count() === 1);

check('the only row is marked active',
    await page.locator('#gunsList .gun-row.active').count() === 1);

await page.click('#addGun');
await page.waitForTimeout(200);

check('Add appends a row', await rows().count() === 2);

check('the new row becomes the active one',
    await page.evaluate(
        () => document.querySelectorAll('#gunsList .gun-row')[1]
            .classList.contains('active')
    ));

await rows().nth(0).click();
await page.waitForTimeout(200);

check('clicking a row selects that gun',
    await page.evaluate(() => S.activeGunId === S.guns[0].id));

check('selection moves the active class',
    await page.evaluate(
        () => document.querySelectorAll('#gunsList .gun-row')[0]
            .classList.contains('active')
    ));

check('the ox/oy inputs follow the selection',
    await page.evaluate(() => {
        S.guns[0].position.x = 77.25;
        selectGun(S.guns[0].id);
        return document.getElementById('ox').value;
    }).then(v => Number(v) === 77.25));

check('the weapon dropdown follows the selection',
    await page.evaluate(() => {
        S.guns[0].weapon = 'mortar';
        S.guns[1].weapon = 'spg';
        selectGun(S.guns[1].id);
        const spg = document.getElementById('weapon').value;
        selectGun(S.guns[0].id);
        return `${spg}|${document.getElementById('weapon').value}`;
    }) === 'spg|mortar');

check('the row shows its own coordinates',
    await page.evaluate(() => {
        S.guns[0].position.x = 12.5;
        S.guns[0].position.y = 34.5;
        renderGuns();
        const text = document.querySelectorAll(
            '#gunsList .gun-row'
        )[0].textContent;
        return text.includes('12.5') && text.includes('34.5');
    }));

check('the eye button toggles visible',
    await page.evaluate(() => {
        const before = S.guns[1].visible;
        document.querySelectorAll(
            '#gunsList .gun-visibility'
        )[1].click();
        return S.guns[1].visible === !before;
    }));

check('the eye button reflects state with aria-pressed',
    await page.evaluate(() => {
        setGunVisible(S.guns[1].id, false);
        return document.querySelectorAll(
            '#gunsList .gun-visibility'
        )[1].getAttribute('aria-pressed') === 'false';
    }));

check('remove drops the row',
    await page.evaluate(() => {
        document.querySelectorAll('#gunsList .gun-remove')[1].click();
        return S.guns.length === 1
            && document.querySelectorAll('#gunsList .gun-row').length === 1;
    }));

check('the last gun has no remove button',
    await page.locator('#gunsList .gun-remove').count() === 0);

check('Add is disabled at the cap',
    await page.evaluate(() => {
        while (S.guns.length < GUN_LIMIT) addGun();
        return document.getElementById('addGun').disabled === true;
    }));

check('Add re-enables below the cap',
    await page.evaluate(() => {
        removeGun(S.guns[S.guns.length - 1].id);
        return document.getElementById('addGun').disabled === false;
    }));

check('the count badge tracks the list',
    await page.evaluate(
        () => document.getElementById('gunsCount').textContent.trim()
            === String(S.guns.length)
    ));

check('no page errors', errors.length === 0, errors.join('; '));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node test/guns-ui.mjs
```

Expected: FAIL on every check — `#gunsList` does not exist, so `rows().count()` is 0.

- [ ] **Step 3: Add the panel markup to all 11 shells**

Insert immediately before the `<!-- SAVED TARGETS -->` comment in each shell:

```html
<!-- GUNS -->
<div class="saved-targets guns-panel">
<div class="saved-targets-header">
<span data-i18n="gunsPanel">Guns</span>
<span class="saved-targets-count" id="gunsCount">
      1
    </span>
</div>
<div class="saved-targets-list" id="gunsList"></div>
<div class="saved-target-actions">
<button class="save-target-button" data-i18n="addGun" id="addGun" type="button">Add gun</button>
</div>
</div>
```

Apply it with:

```bash
for f in src/pages/index.html src/pages/mobile/index.html src/pages/locales/*.html; do
  perl -0pi -e 's{(<!-- SAVED TARGETS -->)}{<!-- GUNS -->\n<div class="saved-targets guns-panel">\n<div class="saved-targets-header">\n<span data-i18n="gunsPanel">Guns</span>\n<span class="saved-targets-count" id="gunsCount">\n      1\n    </span>\n</div>\n<div class="saved-targets-list" id="gunsList"></div>\n<div class="saved-target-actions">\n<button class="save-target-button" data-i18n="addGun" id="addGun" type="button">Add gun</button>\n</div>\n</div>\n$1}' "$f"
done
grep -c 'id="gunsList"' src/pages/index.html src/pages/mobile/index.html src/pages/locales/*.html
```

Expected: `1` for all 11 files.

- [ ] **Step 4: Add the locale keys**

Six keys per file. Run:

```bash
node -e '
const fs = require("fs");
const strings = {
  en:    ["Guns","Add gun","Gun","Remove gun","Show gun","Hide gun"],
  de:    ["Geschütze","Geschütz hinzufügen","Geschütz","Geschütz entfernen","Geschütz einblenden","Geschütz ausblenden"],
  es:    ["Cañones","Añadir cañón","Cañón","Eliminar cañón","Mostrar cañón","Ocultar cañón"],
  fr:    ["Canons","Ajouter un canon","Canon","Supprimer le canon","Afficher le canon","Masquer le canon"],
  pl:    ["Działa","Dodaj działo","Działo","Usuń działo","Pokaż działo","Ukryj działo"],
  pt:    ["Canhões","Adicionar canhão","Canhão","Remover canhão","Mostrar canhão","Ocultar canhão"],
  ru:    ["Орудия","Добавить орудие","Орудие","Удалить орудие","Показать орудие","Скрыть орудие"],
  uk:    ["Гармати","Додати гармату","Гармата","Видалити гармату","Показати гармату","Сховати гармату"],
  "zh-cn": ["火炮","添加火炮","火炮","移除火炮","显示火炮","隐藏火炮"],
  cat:   ["MEOWTARS","ADD MEOWTAR","MEOWTAR","REMOVE MEOWTAR","SHOW MEOWTAR","HIDE MEOWTAR"]
};
const keys = ["gunsPanel","addGun","gunDefaultName","removeGun","showGun","hideGun"];
for (const [lang, values] of Object.entries(strings)) {
  const path = `locales/${lang}.json`;
  let text = fs.readFileSync(path, "utf8");
  const anchor = text.match(/^([ \t]*)"savedTargets":\s*"[^"]*",?\n/m);
  if (!anchor) { console.error("no anchor in", path); continue; }
  const indent = anchor[1];
  const block = keys
    .map((k, i) => `${indent}${JSON.stringify(k)}: ${JSON.stringify(values[i])},\n`)
    .join("");
  fs.writeFileSync(path, text.replace(anchor[0], anchor[0] + block));
  JSON.parse(fs.readFileSync(path, "utf8"));
}
console.log("ok");
'
grep -c '"gunsPanel"' locales/*.json | grep -v index
```

Expected: `ok`, then `1` for each of the 10 locale files.

- [ ] **Step 5: Replace the `renderGuns()` stub in `js/features/guns.js`**

Delete the stub and append:

```js
/* =========================
   GUN LIST UI
   ========================= */

/*
 * Reuses the saved-target list classes so the panel needs no new styling
 * vocabulary; only the gun-specific hooks below are new.
 */
function renderGuns() {
    const container = $('gunsList');

    if (!container) {
        return;
    }

    container.innerHTML = '';

    const count = $('gunsCount');

    if (count) {
        count.textContent = S.guns.length;
    }

    const addButton = $('addGun');

    if (addButton) {
        addButton.disabled = S.guns.length >= GUN_LIMIT;
    }

    S.guns.forEach(gun => {
        const row = document.createElement('div');

        row.className = 'saved-target gun-row';
        row.dataset.gunId = gun.id;

        if (gun.id === S.activeGunId) {
            row.classList.add('active');
        }

        row.addEventListener('click', () => {
            selectGun(gun.id);
        });

        const info = document.createElement('div');
        info.className = 'saved-target-info';

        const name = document.createElement('span');
        name.className = 'saved-target-name';
        name.textContent = gun.name;

        const details = document.createElement('span');
        details.className = 'saved-target-coords';

        const weapon = WEAPONS[gun.weapon];

        details.textContent =
            `X ${formatGameCoordinate(gun.position.x)}` +
            ` · Y ${formatGameCoordinate(gun.position.y)}` +
            (weapon ? ` · ${weapon.name}` : '');

        info.append(name, details);

        const actions = document.createElement('div');
        actions.className = 'saved-target-actions-inline';

        /*
         * The eye is local view state, so it never sends an op. The active
         * gun still draws whatever this says — see drawGuns().
         */
        const visibility = document.createElement('button');

        visibility.type = 'button';
        visibility.className =
            'saved-target-icon-button gun-visibility';
        visibility.textContent = gun.visible ? '👁' : '🚫';
        visibility.setAttribute('aria-pressed', String(gun.visible));
        visibility.title = tr(gun.visible ? 'hideGun' : 'showGun');

        visibility.addEventListener('click', event => {
            event.stopPropagation();
            setGunVisible(gun.id, !gun.visible);
        });

        actions.appendChild(visibility);

        /*
         * No remove button on the last gun rather than a disabled one:
         * S.guns.length >= 1 is an invariant, not a soft rule.
         */
        if (S.guns.length > 1) {
            const remove = document.createElement('button');

            remove.type = 'button';
            remove.className =
                'saved-target-icon-button gun-remove';
            remove.textContent = '×';
            remove.title = tr('removeGun');

            remove.addEventListener('click', event => {
                event.stopPropagation();
                removeGun(gun.id);
            });

            actions.appendChild(remove);
        }

        row.append(info, actions);
        container.appendChild(row);
    });
}

function initGunsUI() {
    $('addGun')?.addEventListener('click', () => {
        addGun();
    });

    renderGuns();
}
```

- [ ] **Step 6: Call `initGunsUI()` at startup and keep the list fresh**

In `js/main.js`, after the existing `renderSavedTargets()` call in the boot sequence, add:

```js
    if (typeof initGunsUI === 'function') {
        initGunsUI();
    }
```

In `js/ui/inputs.js`, at the end of `inputs()`, add:

```js
    /*
     * The row shows each gun's own coordinates, so it has to follow the
     * same writes the ox/oy fields do.
     */
    if (typeof renderGuns === 'function') {
        renderGuns();
    }
```

- [ ] **Step 7: Run the test to verify it passes**

```bash
node test/guns-ui.mjs
```

Expected: `17 passed, 0 failed`.

- [ ] **Step 8: Rebuild and confirm the localized shells carry the panel**

```bash
npm run build
grep -c 'id="gunsList"' dist/index.html dist/de/index.html dist/zh-cn/index.html
grep -o '"gunsPanel": "[^"]*"' dist/locales/zh-cn.json
```

Expected: `1` for each shell, and the Chinese string.

- [ ] **Step 9: Commit**

```bash
git add js/features/guns.js js/main.js js/ui/inputs.js src/pages locales test/guns-ui.mjs
git commit -m "Add the gun list panel"
```

---

## Task 3: Draw every visible gun

Moves the artillery overlay out of `renderer.js` into a fork-only file and makes it loop over guns. After this task, non-active visible guns draw their own marker, range rings and target line.

**Files:**
- Create: `js/map/guns-overlay.js`
- Modify: `js/map/renderer.js:175-312` (replace the artillery block body with one call)
- Modify: all 11 HTML shells (script tag)
- Test: `test/guns-render.mjs`

**Interfaces:**
- Consumes from Task 1: `S.guns`, `S.activeGunId`, `activeGun`.
- Produces:
  - `drawGuns(currentWeapon)` — draws every gun that should be drawn, plus the target marker and the active gun's line. Called from `renderer.js` inside the existing `isMapLayerVisible('artillery')` guard.
  - `gunShouldDraw(gun)` → `true` for the active gun regardless of `visible`, otherwise `gun.visible`.

- [ ] **Step 1: Write the failing test**

Create `test/guns-render.mjs`. It asserts on canvas pixels, because "did the ring get drawn" is not observable any other way.

```js
/*
 * Rendering checks for the gun overlay.
 *
 *   PORT=8123 npm run dev      # in one shell
 *   node test/guns-render.mjs  # in another
 */
import { chromium } from 'playwright';

const PORT = process.env.PORT || '8123';
let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
    if (ok) { pass++; console.log(`  ok   ${label}`); }
    else { fail++; console.log(`  FAIL ${label} ${detail}`); }
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.evaluate(() => document.querySelector('.motd')?.remove());

/*
 * Counts non-background pixels in a small box around a gun's screen
 * position. A drawn marker puts colour there; a skipped one does not.
 */
async function inkAt(gunIndex) {
    return page.evaluate(index => {
        const gun = S.guns[index];
        const screen = toScreen(gun.position.x, gun.position.y);
        const ratio = window.devicePixelRatio || 1;
        const data = ctx.getImageData(
            Math.round((screen.x - 10) * ratio),
            Math.round((screen.y - 10) * ratio),
            Math.round(20 * ratio),
            Math.round(20 * ratio)
        ).data;

        let ink = 0;
        for (let i = 0; i < data.length; i += 4) {
            if (data[i] > 60 || data[i + 1] > 60 || data[i + 2] > 60) ink++;
        }
        return ink;
    }, gunIndex);
}

await page.evaluate(() => {
    while (S.guns.length > 1) removeGun(S.guns[S.guns.length - 1].id);
    S.origin = { x: 40, y: 40 };
    S.target = { x: 60, y: 60 };
    const second = addGun();
    second.position.x = 80;
    second.position.y = 80;
    selectGun(S.guns[0].id);
    draw();
});
await page.waitForTimeout(300);

check('the active gun draws', await inkAt(0) > 0);
check('a visible non-active gun draws', await inkAt(1) > 0);

await page.evaluate(() => {
    setGunVisible(S.guns[1].id, false);
    draw();
});
await page.waitForTimeout(300);

check('a hidden non-active gun does not draw', await inkAt(1) === 0);

await page.evaluate(() => {
    selectGun(S.guns[1].id);
    draw();
});
await page.waitForTimeout(300);

check('a hidden gun still draws while it is active', await inkAt(1) > 0);

check('gunShouldDraw ignores visible for the active gun',
    await page.evaluate(() => {
        selectGun(S.guns[1].id);
        S.guns[1].visible = false;
        return gunShouldDraw(S.guns[1]) === true
            && gunShouldDraw(S.guns[0]) === true;
    }));

check('gunShouldDraw honours visible for the others',
    await page.evaluate(() => {
        selectGun(S.guns[0].id);
        S.guns[1].visible = false;
        return gunShouldDraw(S.guns[1]) === false;
    }));

/*
 * Per-gun weapons mean per-gun ring radii. Two guns with different weapons
 * must not produce the same ring, or the eye toggle is showing a lie.
 */
check('range rings use each gun\'s own weapon',
    await page.evaluate(() => {
        const ids = Object.keys(WEAPONS);
        if (ids.length < 2) return true;
        S.guns[0].weapon = ids[0];
        S.guns[1].weapon = ids[1];
        const radius = gun => {
            const w = WEAPONS[gun.weapon];
            return kilometersToWorldDistance(w.maxRange ?? w.range);
        };
        return radius(S.guns[0]) !== radius(S.guns[1]);
    }));

check('turning the artillery layer off draws no gun',
    await page.evaluate(() => {
        setMapLayerVisible('artillery', false);
        draw();
        return true;
    }).then(() => inkAt(0)) === 0);

await page.evaluate(() => { setMapLayerVisible('artillery', true); draw(); });

check('no page errors', errors.length === 0, errors.join('; '));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node test/guns-render.mjs
```

Expected: FAIL — `gunShouldDraw is not defined`, and only one gun ever inks.

- [ ] **Step 3: Create `js/map/guns-overlay.js`**

This is the body lifted out of `renderer.js`, wrapped in a loop. Keeping it in its own fork-only file means the multi-gun loop never conflicts on an upstream merge of `renderer.js`.

```js
/* =========================
   GUN OVERLAY
   ========================= */

/*
 * The artillery overlay, once per gun.
 *
 * Lifted out of renderer.js so the per-gun loop lives in a file upstream
 * does not have — renderer.js keeps a single guarded call, which is a far
 * smaller merge surface than an inlined loop would be.
 */

const GUN_INACTIVE_ALPHA = 0.45;

/*
 * The active gun ignores its own eye toggle. Selecting a hidden gun would
 * otherwise leave the sidebar solving for something invisible, and forcing
 * visible=true on selection would silently discard the user's setting.
 */
function gunShouldDraw(gun) {
    return gun.id === S.activeGunId || gun.visible;
}

function drawGunRangeRings(gun, at) {
    const weapon = WEAPONS[gun.weapon];

    if (!weapon) {
        return;
    }

    const v = view();

    const maxRange = weapon.maxRange ?? weapon.range;
    const minRange = weapon.minRange ?? 0;

    const rangePx =
        kilometersToWorldDistance(maxRange) * v.scale;

    const minRangePx =
        kilometersToWorldDistance(minRange) * v.scale;

    ctx.beginPath();
    ctx.arc(at.x, at.y, rangePx, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(215,164,82,.08)';
    ctx.fill();

    ctx.strokeStyle = '#d7a452';
    ctx.lineWidth = 2;
    ctx.setLineDash([7, 5]);
    ctx.stroke();
    ctx.setLineDash([]);

    if (minRangePx > 0) {
        ctx.beginPath();
        ctx.arc(at.x, at.y, minRangePx, 0, Math.PI * 2);
        ctx.strokeStyle = '#d86666';
        ctx.lineWidth = 1.5;
        ctx.setLineDash([4, 4]);
        ctx.stroke();
        ctx.setLineDash([]);
    }
}

function drawGunToTargetLine(from, to) {
    ctx.strokeStyle = '#d7a452';
    ctx.lineWidth = 2;
    ctx.setLineDash([8, 6]);

    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.lineTo(to.x, to.y);
    ctx.stroke();

    ctx.setLineDash([]);
}

function drawGuns() {
    const target =
        worldToLocalScreen(S.target.x, S.target.y);

    /*
     * Non-active guns first and dimmed, so the selected gun's solution is
     * never buried under a neighbour's rings.
     */
    for (const gun of S.guns) {
        if (gun.id === S.activeGunId || !gunShouldDraw(gun)) {
            continue;
        }

        const at =
            worldToLocalScreen(gun.position.x, gun.position.y);

        ctx.save();
        ctx.globalAlpha = GUN_INACTIVE_ALPHA;

        drawGunRangeRings(gun, at);
        drawGunToTargetLine(at, target);
        marker(gun.position, 'O');

        ctx.restore();
    }

    const active = activeGun();

    const activeAt =
        worldToLocalScreen(active.position.x, active.position.y);

    drawGunRangeRings(active, activeAt);
    drawGunToTargetLine(activeAt, target);

    marker(active.position, 'O');
    marker(S.target, 'T');
}
```

- [ ] **Step 4: Replace the artillery block in `js/map/renderer.js`**

Replace everything from `if (` on line 175 through the closing `}` on line 312 — the whole `isMapLayerVisible('artillery') && currentWeapon` block including its Layer 6/7/8 comments — with:

```js
    /*
     * Layers 6-8:
     * every gun's range rings and target line, then the markers.
     * The per-gun loop lives in js/map/guns-overlay.js.
     */
    if (
        isMapLayerVisible('artillery') &&
        currentWeapon
    ) {
        drawGuns();
    }
```

The `const v = view();` at the top of `draw()` is still used by the tile and contour layers, so leave it. `currentWeapon` stays as the guard: with no weapon selected there is no solution to draw, exactly as before.

- [ ] **Step 5: Add the script tag to all 11 shells**

```bash
for f in src/pages/index.html src/pages/mobile/index.html src/pages/locales/*.html; do
  perl -0pi -e 's{(<script src="js/map/overlays\.js"></script>\n)}{$1<script src="js/map/guns-overlay.js"></script>\n}' "$f"
done
grep -c "js/map/guns-overlay.js" src/pages/index.html src/pages/mobile/index.html src/pages/locales/*.html
```

Expected: `1` for all 11 files.

- [ ] **Step 6: Run the test to verify it passes**

```bash
node test/guns-render.mjs
```

Expected: `9 passed, 0 failed`.

- [ ] **Step 7: Re-run the earlier suites**

```bash
node test/guns-model.mjs && node test/guns-ui.mjs
```

Expected: both still fully passing. Rendering must not have disturbed the model.

- [ ] **Step 8: Look at it**

Add three guns with different weapons, hide one, and screenshot. Confirm the dimmed rings read as secondary, the active gun's ring is clearly the dominant one, and the hidden gun is absent.

- [ ] **Step 9: Commit**

```bash
git add js/map/guns-overlay.js js/map/renderer.js src/pages test/guns-render.mjs
git commit -m "Draw every visible gun with its own rings and target line"
```

---

## Task 4: Persistence and migration

Guns survive a reload, and an existing `wardogs-map-points` written by today's build becomes gun 1 rather than being discarded.

**Files:**
- Modify: `js/features/saved-targets.js` (`writeMapPoints`, `loadMapPoints`)
- Test: `test/guns-persistence.mjs`

**Interfaces:**
- Consumes from Task 1: `S.guns`, `S.activeGunId`, `createGun`, `clamp`.
- Produces: nothing new. `MAP_POINTS_KEY` gains a `guns` array and keeps `origin`.

Storage shape after this task:

```json
{
  "map": "bakurani",
  "origin": { "x": 40, "y": 40 },
  "target": { "x": 60, "y": 60 },
  "guns": [
    { "id": "gun-...", "name": "Gun 1", "x": 40, "y": 40, "weapon": "mortar" }
  ]
}
```

`origin` stays, holding **gun 1's** position, so a user who lands back on an older cached build keeps their artillery position instead of losing it. `visible` and `activeGunId` are not stored: they reset to all-visible with gun 1 selected on each load, which is the same "start from a clean view" behaviour the app already has for zoom and pan.

- [ ] **Step 1: Write the failing test**

Create `test/guns-persistence.mjs`:

```js
/*
 * Reload persistence and the single-origin migration.
 *
 *   PORT=8123 npm run dev           # in one shell
 *   node test/guns-persistence.mjs  # in another
 */
import { chromium } from 'playwright';

const PORT = process.env.PORT || '8123';
const URL = `http://127.0.0.1:${PORT}/`;
let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
    if (ok) { pass++; console.log(`  ok   ${label}`); }
    else { fail++; console.log(`  FAIL ${label} ${detail}`); }
}

const browser = await chromium.launch();
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto(URL, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

/* --- a stored singular origin migrates to gun 1 --- */

await page.evaluate(() => {
    localStorage.setItem('wardogs-map-points', JSON.stringify({
        map: S.map,
        origin: { x: 44.5, y: 55.5 },
        target: { x: 66.5, y: 77.5 }
    }));
});

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

check('a legacy record yields exactly one gun',
    await page.evaluate(() => S.guns.length) === 1);

check('the legacy origin becomes gun 1',
    await page.evaluate(
        () => `${S.guns[0].position.x},${S.guns[0].position.y}`
    ) === '44.5,55.5');

check('the legacy target still restores',
    await page.evaluate(() => `${S.target.x},${S.target.y}`) === '66.5,77.5');

/* --- a battery round-trips --- */

await page.evaluate(() => {
    const ids = Object.keys(WEAPONS);
    S.origin = { x: 20, y: 21 };
    const second = addGun();
    second.position.x = 30;
    second.position.y = 31;
    second.weapon = ids[ids.length - 1];
    renameGun(second.id, 'Left flank');
    inputs();
});
await page.waitForTimeout(600);

const storedWeapon = await page.evaluate(
    () => JSON.parse(localStorage.getItem('wardogs-map-points')).guns[1].weapon
);

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

check('both guns come back', await page.evaluate(() => S.guns.length) === 2);

check('positions come back',
    await page.evaluate(
        () => `${S.guns[1].position.x},${S.guns[1].position.y}`
    ) === '30,31');

check('names come back',
    await page.evaluate(() => S.guns[1].name) === 'Left flank');

check('per-gun weapons come back',
    await page.evaluate(() => S.guns[1].weapon) === storedWeapon);

check('gun 1 is selected after a reload',
    await page.evaluate(() => S.activeGunId === S.guns[0].id));

check('restored guns are all visible',
    await page.evaluate(() => S.guns.every(g => g.visible === true)));

check('legacy origin is still written for older builds',
    await page.evaluate(() => {
        const stored = JSON.parse(localStorage.getItem('wardogs-map-points'));
        return stored.origin.x === S.guns[0].position.x
            && stored.origin.y === S.guns[0].position.y;
    }));

check('a stored record for another map is ignored',
    await page.evaluate(() => {
        localStorage.setItem('wardogs-map-points', JSON.stringify({
            map: 'not-a-map',
            guns: [{ id: 'gun-x', name: 'X', x: 1, y: 2, weapon: null }],
            target: { x: 3, y: 4 }
        }));
        return true;
    }));

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

check('the mismatched record left one default gun',
    await page.evaluate(() => S.guns.length === 1 && S.guns[0].id !== 'gun-x'));

check('a corrupt record does not throw',
    await page.evaluate(() => {
        localStorage.setItem('wardogs-map-points', '{ not json');
        return true;
    }));

await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

check('the app booted past the corrupt record',
    await page.evaluate(() => S.guns.length >= 1));

check('no page errors', errors.length === 0, errors.join('; '));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Run the test to verify it fails**

```bash
node test/guns-persistence.mjs
```

Expected: the migration checks pass by accident (one default gun exists), but every round-trip check FAILS — `S.guns.length` is 1 after reload and the stored record has no `guns` key, so reading `.guns[1].weapon` throws.

- [ ] **Step 3: Rewrite `writeMapPoints()` in `js/features/saved-targets.js`**

Replace the `localStorage.setItem` call inside `writeMapPoints()` (currently lines 228-249) with:

```js
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
```

- [ ] **Step 4: Rewrite `loadMapPoints()` in `js/features/saved-targets.js`**

Replace the body from `const origin =` through the closing of the `if (target)` block (currently lines 285-297) with:

```js
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
```

Note the ordering change: `S.target` is assigned **before** the guns are rebuilt. `S.origin`'s setter writes through `activeGun()`, so nothing here may touch `S.origin` while `S.guns` is mid-replacement.

- [ ] **Step 5: Run the test to verify it passes**

```bash
node test/guns-persistence.mjs
```

Expected: `13 passed, 0 failed`.

- [ ] **Step 6: Verify saved targets still round-trip against the active gun**

The spec requires that a saved target keeps its existing single `origin` field —
so the JSON export format is unchanged in both directions — and that saving
captures the **active** gun while restoring applies to the **active** gun.

This should already hold without any edit: `saveCurrentTarget` reads `S.origin`
and `restoreTarget` writes `S.origin = {...}`, and both now resolve through the
accessor to the active gun. That is an assumption, so prove it.

Append to `test/guns-persistence.mjs`, before the final `check('no page errors'…)`:

```js
/* --- saved targets follow the active gun --- */

await page.evaluate(() => {
    localStorage.removeItem('wardogs-saved-targets');
    localStorage.removeItem('wardogs-map-points');
});
await page.reload({ waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

const exported = await page.evaluate(() => {
    const second = addGun();
    second.position.x = 88;
    second.position.y = 89;
    selectGun(second.id);
    S.target = { x: 90, y: 91 };
    document.getElementById('saveArtilleryPosition').checked = true;
    saveCurrentTarget();
    return savedTargetForExport(savedTargets[savedTargets.length - 1]);
});

check('a saved target still carries one flat origin',
    exported.origin
        && typeof exported.origin.x === 'number'
        && !('guns' in exported));

check('saving captured the active gun, not gun 1',
    exported.origin.x === 88 && exported.origin.y === 89);

check('restoring applies to the active gun',
    await page.evaluate(() => {
        selectGun(S.guns[0].id);
        S.guns[0].position.x = 1;
        S.guns[0].position.y = 1;
        restoreTarget(savedTargets[savedTargets.length - 1]);
        return `${S.guns[0].position.x},${S.guns[0].position.y}`;
    }) === '88,89');

check('restoring left the other gun alone',
    await page.evaluate(() => S.guns[1].position.x) === 88
        ? true
        : await page.evaluate(() => S.guns.length === 2));

check('an old export with an origin still imports',
    await page.evaluate(() => {
        const legacy = {
            id: 'legacy-1',
            name: 'Legacy',
            x: 12, y: 13,
            saveArtillery: true,
            origin: { x: 14, y: 15 }
        };
        restoreTarget(legacy);
        return `${S.origin.x},${S.origin.y},${S.target.x},${S.target.y}`;
    }) === '14,15,12,13');
```

Run it:

```bash
node test/guns-persistence.mjs
```

Expected: `18 passed, 0 failed`. If any of the five new checks fail, the accessor
is not reaching the save/restore path — fix it in `js/features/saved-targets.js`
rather than by changing the expectations, because the export format staying flat
is a compatibility requirement, not a preference.

- [ ] **Step 7: Re-run the earlier suites**

```bash
node test/guns-model.mjs && node test/guns-ui.mjs && node test/guns-render.mjs
```

Expected: all three still fully passing.

- [ ] **Step 8: Commit**

```bash
git add js/features/saved-targets.js test/guns-persistence.mjs
git commit -m "Persist the gun list and migrate a stored single origin"
```

---

## Task 5: Sync server

Teaches the Worker the three gun ops. Includes the coexistence proof: a client that predates guns must sit in the same room without erroring and without losing its own origin.

**Files:**
- Modify: `sync/src/ops.js`
- Modify: `sync/src/room.js`
- Create: `sync/test/guns.mjs`
- Modify: `sync/package.json` (test script)

**Interfaces:**
- Consumes: nothing from earlier tasks — the server shares no code with the client.
- Produces, the wire contract Task 6 codes against:
  - `{ op: 'gun.add', gun: { id, name, x, y, weapon } }` — upsert, also used for rename and weapon change
  - `{ op: 'gun.move', id, x, y }`
  - `{ op: 'gun.remove', id }`
  - `push` gains an optional `guns: [...]`
  - `snapshot()` gains `guns: [...]`
  - Rejection codes: `bad-gun`, `bad-id`, `bad-slug`, `bad-coordinate`, `bad-name`, `too-large`

A gun on the wire is flat (`x`, `y`), not nested (`position`), matching how markers and targets already travel. `visible` is never sent and is dropped if present.

- [ ] **Step 1: Write the failing test**

Create `sync/test/guns.mjs`:

```js
/*
 * Gun ops against a running `wrangler dev`.
 *
 *   npm run dev          # in sync/, one shell
 *   npm run test:guns    # in sync/, another
 *
 * The last section is the one that matters most: it proves a client that
 * knows nothing about guns can share a room with one that does.
 */

const PORT = process.env.SYNC_PORT || '8799';
const BASE = `http://localhost:${PORT}`;
const WS = `ws://localhost:${PORT}`;

let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
    if (ok) { pass++; console.log(`  ok   ${label}`); }
    else { fail++; console.log(`  FAIL ${label} ${detail}`); }
}

function open(code) {
    return new Promise((resolve, reject) => {
        const ws = new WebSocket(`${WS}/room/${code}`);
        ws.inbox = [];
        ws.addEventListener('message', e => ws.inbox.push(JSON.parse(e.data)));
        ws.addEventListener('open', () => resolve(ws));
        ws.addEventListener('error', reject);
        setTimeout(() => reject(new Error('open timeout')), 5000);
    });
}

function drain(ws) {
    ws.inbox.length = 0;
}

const settle = () => new Promise(r => setTimeout(r, 250));

function gun(overrides = {}) {
    return {
        id: 'gun-alpha',
        name: 'Gun 1',
        x: 40,
        y: 41,
        weapon: 'mortar',
        ...overrides
    };
}

const created = await fetch(`${BASE}/room`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ mapId: 'bakurani' })
}).then(r => r.json());

const code = created.code;
const a = await open(code);
const b = await open(code);
await settle();
drain(a); drain(b);

/* --- the three ops --- */

a.send(JSON.stringify({ op: 'gun.add', gun: gun() }));
await settle();

check('gun.add is relayed to the other peer',
    b.inbox.some(m => m.op === 'gun.add' && m.gun.id === 'gun-alpha'));

check('gun.add strips unknown fields',
    !('visible' in (b.inbox.find(m => m.op === 'gun.add')?.gun || {})));

drain(a); drain(b);
a.send(JSON.stringify({ op: 'gun.move', id: 'gun-alpha', x: 50, y: 51 }));
await settle();

check('gun.move is relayed',
    b.inbox.some(m => m.op === 'gun.move' && m.x === 50 && m.y === 51));

drain(a); drain(b);
a.send(JSON.stringify({
    op: 'gun.add',
    gun: gun({ name: 'Renamed', weapon: 'spg' })
}));
await settle();

check('gun.add upserts a rename and weapon change',
    b.inbox.some(m => m.op === 'gun.add' && m.gun.name === 'Renamed'
        && m.gun.weapon === 'spg'));

/* --- the snapshot carries guns --- */

const c = await open(code);
await settle();

const snapshot = c.inbox.find(m => m.type === 'snapshot' || m.doc);
const doc = snapshot?.doc || snapshot;

check('a joiner sees the gun in its snapshot',
    Array.isArray(doc.guns) && doc.guns.length === 1
        && doc.guns[0].id === 'gun-alpha');

check('the snapshot gun kept the upserted values',
    doc.guns[0].name === 'Renamed' && doc.guns[0].x === 50);

/* --- validation --- */

drain(a);
a.send(JSON.stringify({ op: 'gun.add', gun: gun({ id: 'bad id!' }) }));
await settle();

check('a bad id is rejected',
    a.inbox.some(m => m.type === 'error' && m.code === 'bad-id'));

drain(a);
a.send(JSON.stringify({ op: 'gun.add', gun: gun({ weapon: 'not a slug!' }) }));
await settle();

check('a bad weapon slug is rejected',
    a.inbox.some(m => m.type === 'error' && m.code === 'bad-slug'));

drain(a);
a.send(JSON.stringify({ op: 'gun.add', gun: gun({ x: 1e9 }) }));
await settle();

check('an out-of-bounds coordinate is rejected',
    a.inbox.some(m => m.type === 'error' && m.code === 'bad-coordinate'));

drain(a);
a.send(JSON.stringify({ op: 'gun.add', gun: null }));
await settle();

check('a missing gun body is rejected',
    a.inbox.some(m => m.type === 'error' && m.code === 'bad-gun'));

/* --- the cap --- */

drain(a);
for (let i = 0; i < 12; i += 1) {
    a.send(JSON.stringify({ op: 'gun.add', gun: gun({ id: `gun-cap-${i}` }) }));
}
await settle();

const d = await open(code);
await settle();
const capped = (d.inbox.find(m => m.type === 'snapshot' || m.doc)?.doc
    || d.inbox.find(m => m.doc)).guns;

check('the gun cap holds at 8', capped.length === 8, `got ${capped.length}`);

/* --- remove and clear --- */

drain(a); drain(b);
a.send(JSON.stringify({ op: 'gun.remove', id: 'gun-cap-0' }));
await settle();

check('gun.remove is relayed',
    b.inbox.some(m => m.op === 'gun.remove' && m.id === 'gun-cap-0'));

drain(a);
a.send(JSON.stringify({ op: 'gun.remove', id: 'gun-nonexistent' }));
await settle();

check('removing an absent gun is rejected rather than relayed',
    a.inbox.some(m => m.type === 'error' && m.code === 'rejected'));

drain(a);
a.send(JSON.stringify({ op: 'clear', scope: 'all' }));
await settle();

const e = await open(code);
await settle();
const cleared = (e.inbox.find(m => m.type === 'snapshot' || m.doc)?.doc
    || e.inbox.find(m => m.doc)).guns;

check('clear all removes the guns', cleared.length === 0);

/* --- push --- */

drain(a);
a.send(JSON.stringify({
    op: 'push',
    drawings: [],
    markers: [],
    targets: [],
    guns: [gun({ id: 'gun-pushed' })]
}));
await settle();

const f = await open(code);
await settle();
const pushed = (f.inbox.find(m => m.type === 'snapshot' || m.doc)?.doc
    || f.inbox.find(m => m.doc)).guns;

check('push seeds guns', pushed.some(g => g.id === 'gun-pushed'));

drain(a);
a.send(JSON.stringify({
    op: 'push',
    drawings: [], markers: [], targets: [],
    guns: Array.from({ length: 20 }, (_, i) => gun({ id: `gun-big-${i}` }))
}));
await settle();

check('an oversized push is rejected',
    a.inbox.some(m => m.type === 'error' && m.code === 'too-large'));

/* --- THE COEXISTENCE PROOF --- */

/*
 * `old` stands in for a cached client that predates guns: it never sends a
 * gun op and, like collab.js's `default: break`, ignores any it receives.
 * The requirement is that gun traffic costs it nothing.
 */
const old = await open(code);
const modern = await open(code);
await settle();
drain(old); drain(modern);

modern.send(JSON.stringify({ op: 'gun.add', gun: gun({ id: 'gun-modern' }) }));
modern.send(JSON.stringify({ op: 'gun.move', id: 'gun-modern', x: 12, y: 13 }));
await settle();

check('the old client is sent no error by gun traffic',
    !old.inbox.some(m => m.type === 'error'));

check('the old client\'s socket stayed open',
    old.readyState === 1);

drain(old); drain(modern);
old.send(JSON.stringify({ op: 'point.set', point: 'origin', x: 5, y: 6 }));
await settle();

check('the old client can still set the legacy origin',
    !old.inbox.some(m => m.type === 'error')
        && modern.inbox.some(
            m => m.op === 'point.set' && m.point === 'origin' && m.x === 5
        ));

drain(old);
old.send(JSON.stringify({ op: 'point.set', point: 'target', x: 7, y: 8 }));
await settle();

check('the old client can still set the target',
    !old.inbox.some(m => m.type === 'error'));

const g = await open(code);
await settle();
const finalDoc = g.inbox.find(m => m.type === 'snapshot' || m.doc)?.doc
    || g.inbox.find(m => m.doc);

check('legacy origin and guns coexist in one document',
    finalDoc.origin?.x === 5 && finalDoc.guns.some(x => x.id === 'gun-modern'));

for (const socket of [a, b, c, d, e, f, old, modern, g]) {
    try { socket.close(); } catch { /* already gone */ }
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
```

- [ ] **Step 2: Add the test script and run it to verify it fails**

In `sync/package.json`, add to `scripts`:

```json
        "test:guns": "node test/guns.mjs",
```

Then:

```bash
cd sync && npm run dev &
cd sync && npm run test:guns
```

Expected: FAIL throughout with `unknown-op`, because `validateOp` has no `gun.*` cases.

- [ ] **Step 3: Add validation to `sync/src/ops.js`**

Add `guns: 8` to `LIMITS`, immediately after `targets: 500,`:

```js
    guns: 8,
```

Add `validateGun` next to `validateTarget`:

```js
/*
 * A gun on the wire is flat, like markers and targets — the client's
 * nested `position` is its own concern.
 *
 * `visible` is deliberately absent: it is per-viewer view state, so it is
 * dropped here rather than relayed. Returning a fresh object is what
 * enforces that; a peer cannot smuggle extra fields to everyone else.
 */
export function validateGun(value) {
    if (!value || typeof value !== 'object') {
        fail('bad-gun');
    }

    return {
        id: id(value.id),
        name: name(value.name),
        x: coordinate(value.x),
        y: coordinate(value.y),
        weapon: value.weapon === null || value.weapon === undefined
            ? null
            : slug(value.weapon, null) ?? fail('bad-weapon')
    };
}
```

Add three cases to `validateOp`, immediately before `case 'point.set':`:

```js
        case 'gun.add':
            return {
                op: 'gun.add',
                gun: validateGun(raw.gun)
            };

        case 'gun.move':
            return {
                op: 'gun.move',
                id: id(raw.id),
                x: coordinate(raw.x),
                y: coordinate(raw.y)
            };

        case 'gun.remove':
            return {
                op: 'gun.remove',
                id: id(raw.id)
            };
```

Extend the `push` case. Inside it, after the `targets` binding, add:

```js
            const guns = Array.isArray(raw.guns)
                ? raw.guns
                : [];
```

add `guns.length > LIMITS.guns ||` to the `too-large` condition, and add to the returned object:

```js
                guns: guns.map(validateGun)
```

- [ ] **Step 4: Add storage and application to `sync/src/room.js`**

In `migrate()`, after the `if (version < 1)` block:

```js
        /*
         * Guns are a collection, unlike origin/target which are single
         * meta rows. A room created before this migration simply gains an
         * empty table; its existing origin keeps working untouched.
         */
        if (version < 2) {
            sql.exec(`
                CREATE TABLE IF NOT EXISTS guns (
                    id TEXT PRIMARY KEY,
                    json TEXT NOT NULL
                );
                INSERT INTO _sql_schema_migrations (id) VALUES (2);
            `);
        }
```

In `snapshot()`, add after `savedTargets`:

```js
            guns: this.rows('guns'),
```

In `apply()`, add three cases before `case 'point.set':`:

```js
            case 'gun.add':
                return this.insert('guns', LIMITS.guns, op.gun);

            case 'gun.move': {
                const rows = sql
                    .exec('SELECT json FROM guns WHERE id = ?', op.id)
                    .toArray();

                if (!rows.length) {
                    return false;
                }

                const gun = JSON.parse(rows[0].json);

                gun.x = op.x;
                gun.y = op.y;

                sql.exec(
                    'UPDATE guns SET json = ? WHERE id = ?',
                    JSON.stringify(gun),
                    op.id
                );

                return true;
            }

            case 'gun.remove':
                return this.remove('guns', op.id);
```

In the `clear` case, add:

```js
                if (op.scope === 'all') {
                    sql.exec('DELETE FROM guns');
                }
```

In the `push` case, after the targets loop:

```js
                for (const gun of op.guns) {
                    changed = this.insert('guns', LIMITS.guns, gun) || changed;
                }
```

In `alarm()`, add `DELETE FROM guns;` to the cleanup block.

- [ ] **Step 5: Run the test to verify it passes**

```bash
cd sync && npm run test:guns
```

Expected: `22 passed, 0 failed`.

- [ ] **Step 6: Run the existing server suites for regressions**

```bash
cd sync && npm run test:smoke && npm run test:disabled
```

Expected: both fully passing. The migration must not have disturbed existing rooms.

- [ ] **Step 7: Commit**

```bash
git add sync/src/ops.js sync/src/room.js sync/test/guns.mjs sync/package.json
git commit -m "Sync guns as their own op family"
```

---

## Task 6: Sync client

Wires the browser to the ops Task 5 accepts, and implements the gun-1 legacy mirror in both directions.

**Files:**
- Modify: `js/features/collab.js`
- Modify: `js/features/guns.js` (drag-throttled move emission)
- Test: `test/guns-collab.mjs`

**Interfaces:**
- Consumes from Task 5: the three ops, `push.guns`, `snapshot.guns`.
- Consumes from Task 1: `S.guns`, `activeGun`, `gunById`, `createGun`, `GUN_LIMIT`.
- Produces, called by `guns.js` from Task 1's `addGun` / `removeGun` / `renameGun`:
  - `collabSendGunAdd(gun)` — emits `gun.add` from a local gun object
  - `collabSendGunRemove(id)` — emits `gun.remove`
  - `collabGunWire(gun)` → `{ id, name, x, y, weapon }`, the flat wire form
  - `collabGunFromWire(entry)` → a local gun object with `visible: true`

Two rules this task must honour, both from the spec:

1. **`visible` and `activeGunId` never cross the wire.** `collabGunWire` omits `visible`; `collabGunFromWire` always sets it `true`. An incoming gun never changes which gun you have selected.
2. **The legacy `origin` is gun 1, not the active gun.** Both when sending and when receiving.

- [ ] **Step 1: Write the failing test**

Create `test/guns-collab.mjs`. It needs both servers running.

```js
/*
 * Guns across a shared session, two real browser contexts.
 *
 *   cd sync && npm run dev       # shell 1
 *   PORT=8123 npm run dev        # shell 2
 *   node test/guns-collab.mjs    # shell 3
 */
import { chromium } from 'playwright';

const PORT = process.env.PORT || '8123';
const URL = `http://127.0.0.1:${PORT}/`;
let pass = 0;
let fail = 0;

function check(label, ok, detail = '') {
    if (ok) { pass++; console.log(`  ok   ${label}`); }
    else { fail++; console.log(`  FAIL ${label} ${detail}`); }
}

const settle = () => new Promise(r => setTimeout(r, 900));

const browser = await chromium.launch();
const errors = [];

async function openApp() {
    const page = await (await browser.newContext()).newPage();
    page.on('pageerror', e => errors.push(e.message));
    await page.goto(URL, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    await page.evaluate(() => document.querySelector('.motd')?.remove());
    return page;
}

const host = await openApp();

const code = await host.evaluate(async () => {
    const created = await collabCreateRoom();
    return created?.code || COLLAB.code;
});

check('a room was created', Boolean(code), String(code));

const peer = await openApp();
await peer.evaluate(roomCode => collabJoinRoom(roomCode), code);
await settle();

/* --- add --- */

await host.evaluate(() => {
    const gun = addGun();
    gun.position.x = 55;
    gun.position.y = 56;
    renameGun(gun.id, 'Right flank');
    inputs();
});
await settle();

check('the peer received the new gun',
    await peer.evaluate(() => S.guns.length) === 2);

check('the peer got the name',
    await peer.evaluate(() => S.guns[1].name) === 'Right flank');

check('an incoming gun is visible on the peer',
    await peer.evaluate(() => S.guns[1].visible === true));

check('an incoming gun did not steal the peer\'s selection',
    await peer.evaluate(() => S.activeGunId === S.guns[0].id));

/* --- visibility stays local --- */

await peer.evaluate(() => setGunVisible(S.guns[1].id, false));
await settle();

check('hiding a gun on the peer does not hide it on the host',
    await host.evaluate(() => S.guns[1].visible === true));

/* --- move --- */

await host.evaluate(() => {
    S.guns[1].position.x = 70;
    S.guns[1].position.y = 71;
    inputs();
});
await settle();

check('the peer received the move',
    await peer.evaluate(
        () => `${S.guns[1].position.x},${S.guns[1].position.y}`
    ) === '70,71');

/* --- per-gun weapon --- */

const chosen = await host.evaluate(() => {
    const ids = Object.keys(WEAPONS);
    const weapon = ids[ids.length - 1];
    S.guns[1].weapon = weapon;
    collabSendGunAdd(S.guns[1]);
    return weapon;
});
await settle();

check('the peer received the per-gun weapon',
    await peer.evaluate(() => S.guns[1].weapon) === chosen);

/* --- the legacy origin mirror is gun 1 --- */

await host.evaluate(() => {
    selectGun(S.guns[1].id);
    S.origin = { x: 33, y: 34 };
    inputs();
});
await settle();

check('moving gun 2 does not move the shared legacy origin',
    await peer.evaluate(() => COLLAB.lastShared.origin.x) !== 33);

await host.evaluate(() => {
    selectGun(S.guns[0].id);
    S.origin = { x: 25, y: 26 };
    inputs();
});
await settle();

check('moving gun 1 does move the shared legacy origin',
    await peer.evaluate(() => COLLAB.lastShared.origin.x) === 25);

check('an incoming legacy point.set lands on gun 1',
    await peer.evaluate(() => S.guns[0].position.x) === 25);

/* --- a late joiner sees the battery --- */

const late = await openApp();
await late.evaluate(roomCode => collabJoinRoom(roomCode), code);
await settle();

check('a late joiner receives every gun',
    await late.evaluate(() => S.guns.length) === 2);

check('a late joiner\'s guns are all visible',
    await late.evaluate(() => S.guns.every(g => g.visible === true)));

check('a late joiner selects its own first gun',
    await late.evaluate(() => S.activeGunId === S.guns[0].id));

/* --- remove --- */

await host.evaluate(() => removeGun(S.guns[1].id));
await settle();

check('the peer dropped the removed gun',
    await peer.evaluate(() => S.guns.length) === 1);

check('the peer never ends up with zero guns',
    await peer.evaluate(() => S.guns.length >= 1));

/* --- leaving restores the solo battery --- */

await host.evaluate(() => collabLeaveRoom());
await settle();

check('the host got its solo state back',
    await host.evaluate(() => S.guns.length >= 1));

check('no page errors', errors.length === 0, errors.join('; '));

console.log(`\n${pass} passed, ${fail} failed`);
await browser.close();
process.exit(fail ? 1 : 0);
```

Before running, confirm the room helper names this test calls actually exist:

```bash
grep -n "function collabCreateRoom\|function collabJoinRoom\|function collabLeaveRoom" js/features/collab.js
```

If they differ, update the three call sites in the test to the real names rather than adding aliases.

- [ ] **Step 2: Run the test to verify it fails**

```bash
node test/guns-collab.mjs
```

Expected: FAIL from the first add onward — `collabSendGunAdd is not defined`, peer stays at one gun.

- [ ] **Step 3: Add the wire helpers and senders to `js/features/collab.js`**

Add near `collabValidMarker`:

```js
/* =========================
   GUNS
   ========================= */

/*
 * Guns travel flat, like markers and targets. `visible` is omitted on the
 * way out and forced true on the way in: which guns you have hidden is how
 * you are looking at the map, not room content.
 */
function collabGunWire(gun) {
    return {
        id: gun.id,
        name: gun.name,
        x: gun.position.x,
        y: gun.position.y,
        weapon: gun.weapon || null
    };
}

function collabGunFromWire(entry) {
    const gun = createGun({
        x: entry.x,
        y: entry.y,
        weapon: entry.weapon || null,
        name: entry.name
    });

    gun.id = entry.id;
    gun.visible = true;

    return gun;
}

function collabSendGunAdd(gun) {
    if (!collabIsOnline() || COLLAB.applying) {
        return;
    }

    collabSend({ op: 'gun.add', gun: collabGunWire(gun) });
}

function collabSendGunRemove(id) {
    if (!collabIsOnline() || COLLAB.applying) {
        return;
    }

    collabSend({ op: 'gun.remove', id });
}
```

- [ ] **Step 4: Emit moves from the shared-scalar diff**

`collabFlushShared` already collapses a drag into a throttled stream, so gun moves ride the same path rather than getting a hook of their own.

Extend `COLLAB.lastShared` initialisation (line 61 and the two reset sites at 369 and 1162) with `guns: {}`, then add to `collabFlushShared`, before the `S.weapon` block:

```js
    /*
     * Gun 1 also mirrors to the legacy `point.set origin` op below, so a
     * client that predates guns still tracks a real artillery position.
     */
    for (const gun of S.guns) {
        const previous = COLLAB.lastShared.guns[gun.id];

        const moved =
            !previous ||
            previous.x !== gun.position.x ||
            previous.y !== gun.position.y;

        if (!moved) {
            continue;
        }

        const sent = previous
            ? collabSend({
                op: 'gun.move',
                id: gun.id,
                x: gun.position.x,
                y: gun.position.y
            })
            : collabSend({
                op: 'gun.add',
                gun: collabGunWire(gun)
            });

        if (sent) {
            COLLAB.lastShared.guns[gun.id] = {
                x: gun.position.x,
                y: gun.position.y
            };
        }
    }
```

The existing `['origin', 'target']` loop above it already sends `point.set origin`, and `S.origin` now reads the **active** gun — which is wrong for the mirror. Change that loop to read gun 1 for `origin`:

```js
    ['origin', 'target'].forEach(point => {
        /*
         * The legacy origin is gun 1, not the selected gun. A peer running
         * a build that predates guns would otherwise watch the shared
         * origin teleport every time somebody changed their selection.
         */
        const current = point === 'origin'
            ? S.guns[0].position
            : S.target;

        const previous = COLLAB.lastShared[point];
```

leaving the rest of that loop body unchanged.

- [ ] **Step 5: Apply incoming gun ops**

In `collabApplyOp`, add before `case 'point.set':`:

```js
            case 'gun.add': {
                const existing = gunById(op.gun.id);

                if (existing) {
                    existing.name = op.gun.name;
                    existing.weapon = op.gun.weapon;
                    existing.position.x = op.gun.x;
                    existing.position.y = op.gun.y;
                } else if (S.guns.length < GUN_LIMIT) {
                    S.guns.push(collabGunFromWire(op.gun));
                }

                COLLAB.lastShared.guns[op.gun.id] = {
                    x: op.gun.x,
                    y: op.gun.y
                };

                renderGuns();
                break;
            }

            case 'gun.move': {
                const gun = gunById(op.id);

                if (gun) {
                    gun.position.x = op.x;
                    gun.position.y = op.y;
                    clamp(gun.position);
                }

                COLLAB.lastShared.guns[op.id] = { x: op.x, y: op.y };

                renderGuns();
                break;
            }

            case 'gun.remove': {
                /*
                 * S.guns.length >= 1 is an invariant. A peer removing its
                 * last-but-one gun must not empty this client's list.
                 */
                if (S.guns.length > 1) {
                    S.guns = S.guns.filter(gun => gun.id !== op.id);

                    if (!gunById(S.activeGunId)) {
                        S.activeGunId = S.guns[0].id;
                    }
                }

                delete COLLAB.lastShared.guns[op.id];

                renderGuns();
                break;
            }
```

And change `case 'point.set':` so an incoming legacy origin lands on gun 1 rather than the selected gun:

```js
            case 'point.set': {
                const destination = op.point === 'origin'
                    ? S.guns[0].position
                    : S.target;

                destination.x = op.x;
                destination.y = op.y;
                clamp(destination);

                COLLAB.lastShared[op.point] =
                    structuredClone(destination);
                break;
            }
```

`S.target` is a plain data property, so mutating it in place is equivalent to the assignment it replaces.

- [ ] **Step 6: Carry guns through join, snapshot and leave**

In `collabCaptureSolo()`, add:

```js
        guns: structuredClone(S.guns),
```

In `collabRestoreSolo()`, add before the `S.origin` line:

```js
        S.guns = structuredClone(solo.guns);
        S.activeGunId = S.guns[0].id;
```

In `collabApplyDoc()`, add before the `doc.origin` block:

```js
        if (Array.isArray(doc.guns) && doc.guns.length) {
            S.guns = doc.guns
                .slice(0, GUN_LIMIT)
                .map(collabGunFromWire);

            S.activeGunId = S.guns[0].id;
        }
```

and extend the `COLLAB.lastShared` object built just below it with:

```js
            guns: Object.fromEntries(
                S.guns.map(gun => [
                    gun.id,
                    { x: gun.position.x, y: gun.position.y }
                ])
            ),
```

In the `push` emission (around line 637), add `guns` to both the emptiness guard and the payload:

```js
    const guns = S.guns.map(collabGunWire);
```

and include `guns` in the emitted object. Guns are always non-empty, so remove `guns` from the early-return guard — pushing a battery into an empty room is the point.

Finally, add `renderGuns()` alongside the existing `renderSavedTargets()` call at the end of `collabApplyOp`.

- [ ] **Step 7: Run the test to verify it passes**

```bash
node test/guns-collab.mjs
```

Expected: `18 passed, 0 failed`.

- [ ] **Step 8: Run every suite**

```bash
node test/guns-model.mjs && node test/guns-ui.mjs \
  && node test/guns-render.mjs && node test/guns-persistence.mjs \
  && node test/guns-collab.mjs
cd sync && npm run test:guns && npm run test:smoke && npm run test:disabled
npm run test:scripts
```

Expected: everything passing.

- [ ] **Step 9: Commit**

```bash
git add js/features/collab.js js/features/guns.js test/guns-collab.mjs
git commit -m "Sync the gun list into shared sessions"
```

---

## Deployment

The Worker must be deployed **before** the site, so a browser that picks up the new client finds a room that already understands gun ops:

```bash
cd sync && npm run deploy
npm run build
```

Old cached browsers keep working against the new Worker throughout — that is what Task 5's coexistence section proves.
