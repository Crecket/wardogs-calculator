/*
 * Guns across a shared session, two real browser contexts.
 *
 *   cd sync && npm run dev       # shell 1
 *   PORT=8000 npm run dev        # shell 2
 *   node test/guns-collab.mjs    # shell 3
 *
 * Port 8000 on purpose: the Worker's dev ALLOWED_ORIGINS is
 * localhost:8000 / 127.0.0.1:8000, and room creation is a cross-origin
 * fetch, so anything else is refused by CORS before a room ever exists.
 *
 * The room helpers are collab.js's real names: collabCreateRoom() connects
 * rather than returning a code, collabConnect() is the join, collabLeave()
 * is the leave.
 */
import { launch, counter } from './helpers.mjs';

const PORT = process.env.PORT || '8000';
const URL = `http://localhost:${PORT}/`;
const state = counter();
const check = state.check;

const settle = () => new Promise(r => setTimeout(r, 900));

const browser = await launch();
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
    await collabCreateRoom(false);
    return COLLAB.roomCode;
});
await settle();

check('a room was created', Boolean(code), String(code));

const peer = await openApp();
await peer.evaluate(roomCode => collabConnect(roomCode, false), code);
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

/*
 * The reported bug: the host swaps gun 2's weapon while the peer has gun 1
 * selected. The change has to land on gun 2 on the peer as well, and leave
 * the peer's own selection alone.
 *
 * The two guns are given different weapons first, so a swap landing on the
 * wrong gun cannot pass by coincidence.
 */
const swapped = await host.evaluate(() => {
    const [first, second] = Object.keys(WEAPONS);

    selectGun(S.guns[0].id);
    S.weapon = second;
    inputs();

    return { first, second };
});
await settle();

await host.evaluate(weapon => {
    selectGun(S.guns[1].id);
    S.weapon = weapon;
    inputs();
}, swapped.first);
await settle();

check('a peer applies the swap to the gun it was made on',
    await peer.evaluate(() => S.guns[1].weapon) === swapped.first);

check('a peer\'s own selected gun keeps its weapon',
    await peer.evaluate(() => S.guns[0].weapon) === swapped.second);

check('the swap did not move the peer\'s selection',
    await peer.evaluate(() => S.activeGunId === S.guns[0].id));

/* --- swapping gun 1 still mirrors to the legacy weapon --- */

await host.evaluate(weapon => {
    selectGun(S.guns[0].id);
    S.weapon = weapon;
    inputs();
}, swapped.first);
await settle();

check('a peer receives a gun 1 swap on gun 1',
    await peer.evaluate(() => S.guns[0].weapon) === swapped.first);

check('gun 1\'s weapon is what the legacy mirror tracks',
    await peer.evaluate(() => COLLAB.lastShared.weapon) === swapped.first);

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
await late.evaluate(roomCode => collabConnect(roomCode, false), code);
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

await host.evaluate(() => collabLeave());
await settle();

check('the host got its solo state back',
    await host.evaluate(() => S.guns.length >= 1));

check('no page errors', errors.length === 0, errors.join('; '));

console.log(`\n${state.pass} passed, ${state.fail} failed`);
await browser.close();
process.exit(state.fail ? 1 : 0);
