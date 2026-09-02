/*
 * A second press of a map tool disarms it, whether the tool opens a
 * popup or not, and whether it was reached by button or by hotkey.
 *
 *   PORT=8123 npm run dev          # in one shell
 *   node test/map-tool-toggle.mjs  # in another
 */
import { launch, counter } from './helpers.mjs';

const PORT = process.env.PORT || '8123';
const state = counter();
const check = state.check;

const browser = await launch();
const page = await browser.newPage({ viewport: { width: 1400, height: 950 } });
const errors = [];
page.on('pageerror', e => errors.push(e.message));
await page.goto(`http://127.0.0.1:${PORT}/`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);
await page.evaluate(() => document.querySelector('.motd')?.remove());

const tool = () => page.evaluate(() => MAP_TOOL_STATE.tool);
const menuOpen = id => page.evaluate(m => isMapToolMenuOpen(m), id);

const popupTools = [
    ['mapToolPencil', 'pencil', 'pencilPalette'],
    ['mapToolShapes', 'shapes', 'shapePalette'],
    ['mapToolMarker', 'marker', 'markerPicker'],
    ['mapToolCoordinateSearch', 'coordinateSearch', 'coordinateSearchPopover'],
    ['mapToolLayers', 'layers', 'mapLayersPopover'],
    ['mapToolDataTransfer', 'dataTransfer', 'mapDataTransferPopover'],
    ['mapToolCollab', 'collab', 'collabPopover']
];

for (const [button, name, menu] of popupTools) {
    await page.evaluate(() => {
        MAP_TOOL_STATE.tool = null;
        closeMapToolMenus();
    });

    await page.click(`#${button}`);
    await page.waitForTimeout(120);

    check(`${name}: one press arms the tool`, await tool() === name);
    check(`${name}: one press opens the popup`, await menuOpen(menu) === true);

    await page.click(`#${button}`);
    await page.waitForTimeout(120);

    check(`${name}: a second press disarms the tool`,
        await tool() === null, `tool is ${await tool()}`);
    check(`${name}: a second press closes the popup`,
        await menuOpen(menu) === false);
}

const plainTools = [
    ['mapToolRuler', 'ruler'],
    ['mapToolEraser', 'eraser'],
    ['mapToolTargeting', 'targeting']
];

for (const [button, name] of plainTools) {
    await page.evaluate(() => {
        MAP_TOOL_STATE.tool = null;
        closeMapToolMenus();
    });

    await page.click(`#${button}`);
    await page.waitForTimeout(120);
    check(`${name}: one press arms the tool`, await tool() === name);

    await page.click(`#${button}`);
    await page.waitForTimeout(120);
    check(`${name}: a second press disarms the tool`, await tool() === null);
}

const hotkeyTools = [
    ['pencil', 'pencilPalette'],
    ['shapes', 'shapePalette'],
    ['marker', 'markerPicker'],
    ['coordinateSearch', 'coordinateSearchPopover'],
    ['layers', 'mapLayersPopover']
];

for (const [name, menu] of hotkeyTools) {
    await page.evaluate(() => {
        MAP_TOOL_STATE.tool = null;
        closeMapToolMenus();
    });

    const key = await page.evaluate(n => getMapToolShortcut(n), name);

    await page.keyboard.press(key);
    await page.waitForTimeout(120);

    check(`${name} hotkey: one press arms the tool`,
        await tool() === name, `tool is ${await tool()}`);
    check(`${name} hotkey: one press opens the popup`,
        await menuOpen(menu) === true);

    if (name === 'coordinateSearch') {
        check('coordinateSearch hotkey: the key reaches the focused input',
            await page.evaluate(
                () => document.activeElement?.id === 'coordinateSearchX'
            ));

        await page.keyboard.press(key);
        await page.waitForTimeout(120);

        check('coordinateSearch hotkey: typing in the box does not toggle',
            await tool() === name, `tool is ${await tool()}`);

        await page.evaluate(() => document.activeElement?.blur());
    }

    await page.keyboard.press(key);
    await page.waitForTimeout(120);

    check(`${name} hotkey: a second press disarms the tool`,
        await tool() === null, `tool is ${await tool()}`);
    check(`${name} hotkey: a second press closes the popup`,
        await menuOpen(menu) === false);
}

check('no page errors', errors.length === 0, errors.join('; '));

console.log(`\n${state.pass} passed, ${state.fail} failed`);
await browser.close();
process.exit(state.fail ? 1 : 0);
