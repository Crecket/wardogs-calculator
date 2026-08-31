/*
 * The second-monitor pop-out: the firing solution moved into a Document
 * Picture-in-Picture window and back again.
 *
 * The panel node is moved, not cloned, so what this really checks is that
 * result() keeps writing into it from another document and that it returns
 * to the exact slot it left.
 *
 *   PORT=8931 npm run dev          # in one shell
 *   node test/panel-popout.mjs     # in another
 */
import { launch, counter } from './helpers.mjs';

const PORT = process.env.PORT || '8931';
const URL = `http://127.0.0.1:${PORT}/`;
const state = counter();
const check = state.check;

const browser = await launch();
const context = await browser.newContext();
const page = await context.newPage();
const errors = [];
page.on('pageerror', e => errors.push(e.message));

await page.goto(URL, { waitUntil: 'domcontentloaded' });
await page.waitForTimeout(2500);

const supported = await page.evaluate(
    () => 'documentPictureInPicture' in window
);

if (!supported) {
    console.log(
        '  SKIP Document Picture-in-Picture is unavailable in this browser build'
    );
    await browser.close();
    process.exit(0);
}

/* --- the control exists, and the panel starts in the sidebar --- */

const before = await page.evaluate(() => {
    const panel = document.getElementById('mil').closest('.section');

    return {
        hasButton: Boolean(document.getElementById('solutionPopoutToggle')),
        inSidebar: Boolean(panel.closest('main > aside')),
        index: Array.from(panel.parentNode.children).indexOf(panel),
        siblings: panel.parentNode.children.length
    };
});

check('the pop-out control is rendered', before.hasButton);
check('the panel starts in the sidebar', before.inSidebar);

/* --- opening moves the node into the pop-out document --- */

await page.click('#solutionPopoutToggle');
await page.waitForTimeout(600);

const opened = await page.evaluate(() => {
    const popout = documentPictureInPicture.window;

    return {
        open: Boolean(popout),
        panelInPopout: Boolean(
            popout &&
            popout.document.getElementById('mil')
        ),
        goneFromMain: document.getElementById('mil') === null,
        lookupStillWorks: Boolean($('mil')),
        placeholder: Boolean(
            document.getElementById('solutionPopoutPlaceholder')
        ),
        placeholderIndex: Array.from(
            document
                .getElementById('solutionPopoutPlaceholder')
                .parentNode.children
        ).indexOf(document.getElementById('solutionPopoutPlaceholder')),
        stylesheets: popout
            ? popout.document.querySelectorAll(
                'link[rel="stylesheet"], style'
            ).length
            : 0,
        theme: popout
            ? popout.document.documentElement.dataset.theme ?? ''
            : 'none'
    };
});

check('a pop-out window is open', opened.open);
check('the panel node lives in the pop-out document', opened.panelInPopout);
check('the main document no longer holds it', opened.goneFromMain);
check('$() still finds the moved panel', opened.lookupStillWorks);
check('a placeholder holds the panel slot', opened.placeholder);
check(
    'the placeholder sits where the panel was',
    opened.placeholderIndex === before.index,
    `${opened.placeholderIndex} vs ${before.index}`
);
check('stylesheets came along', opened.stylesheets > 0, opened.stylesheets);

/* --- the solution keeps updating while popped out --- */

const live = await page.evaluate(() => {
    S.weapon = 'mortar';
    S.origin = { x: 50, y: 50 };
    S.target = { x: 53, y: 50 };

    result();

    const doc = documentPictureInPicture.window.document;

    return {
        distance: doc.getElementById('distm').textContent,
        angle: doc.getElementById('angle').textContent,
        mil: doc.getElementById('mil').textContent
    };
});

check(
    'the distance readout updates in the pop-out',
    live.distance === '300 m',
    live.distance
);

check(
    'the azimuth updates in the pop-out',
    live.angle === '90.0°',
    live.angle
);

check('the MIL readout is filled in', live.mil !== '', live.mil);

/* --- theme changes reach the second document --- */

await page.evaluate(() => toggleTheme());
await page.waitForTimeout(100);

const themed = await page.evaluate(() => {
    return {
        main: document.documentElement.dataset.theme ?? '',
        popout:
            documentPictureInPicture
                .window
                .document
                .documentElement
                .dataset.theme ?? ''
    };
});

check(
    'the pop-out follows the theme',
    themed.main === themed.popout && themed.main === 'light',
    `${themed.main} / ${themed.popout}`
);

await page.evaluate(() => toggleTheme());
await page.waitForTimeout(100);

const restored = await page.evaluate(() => ({
    main: document.documentElement.dataset.theme ?? '',
    popout:
        documentPictureInPicture
            .window
            .document
            .documentElement
            .dataset.theme ?? ''
}));

check(
    'and follows it back',
    restored.main === '' && restored.popout === '',
    `${restored.main} / ${restored.popout}`
);

/* --- the user closing the window returns the panel --- */

await page.evaluate(() => documentPictureInPicture.window.close());
await page.waitForTimeout(500);

const closed = await page.evaluate(() => {
    const panel = document.getElementById('mil')?.closest('.section') ?? null;

    return {
        back: Boolean(panel),
        inSidebar: Boolean(panel?.closest('main > aside')),
        index: panel ? Array.from(panel.parentNode.children).indexOf(panel) : -1,
        siblings: panel ? panel.parentNode.children.length : -1,
        placeholderGone:
            document.getElementById('solutionPopoutPlaceholder') === null,
        popoutClosed: documentPictureInPicture.window === null
    };
});

check('closing the window returns the panel', closed.back);
check('it lands back in the sidebar', closed.inSidebar);
check(
    'in exactly its original slot',
    closed.index === before.index && closed.siblings === before.siblings,
    `${closed.index}/${closed.siblings} vs ${before.index}/${before.siblings}`
);
check('the placeholder is gone', closed.placeholderGone);
check('the pop-out window is closed', closed.popoutClosed);

const afterClose = await page.evaluate(() => {
    S.target = { x: 55, y: 50 };
    result();

    return document.getElementById('distm').textContent;
});

check(
    'the in-page panel updates again',
    afterClose === '500 m',
    afterClose
);

/* --- the placeholder button is the other way home --- */

await page.click('#solutionPopoutToggle');
await page.waitForTimeout(600);

const reopened = await page.evaluate(
    () => Boolean(documentPictureInPicture.window)
);

check('it reopens', reopened);

await page.click('#solutionPopoutPlaceholder .panel-popout-return');
await page.waitForTimeout(500);

const returned = await page.evaluate(() => ({
    back: Boolean(document.getElementById('mil')),
    index: Array.from(
        document.getElementById('mil').closest('.section').parentNode.children
    ).indexOf(document.getElementById('mil').closest('.section')),
    popoutClosed: documentPictureInPicture.window === null
}));

check('the return button brings the panel back', returned.back);
check('to the same slot', returned.index === before.index, returned.index);
check('and closes the window', returned.popoutClosed);

check('no page errors', errors.length === 0, errors.join(' | '));

await browser.close();

console.log(`\n${state.pass} passed, ${state.fail} failed`);
process.exit(state.fail ? 1 : 0);
