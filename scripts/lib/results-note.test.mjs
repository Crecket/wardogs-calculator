import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

const TR_TEXT = {
    lowArc: 'Low arc',
    highArc: 'High arc',
    noteArc: 'arc',
    noteAllArcs: 'all arcs',
    noteMasked: '{arcs}: masked by terrain',
    noteTooClose: '{arcs}: inside minimum range',
    noteTooFar: '{arcs}: out of reach at this height',
    noteUncorrected: 'not corrected for height',
    noteElevationLimit: "MIL clamped at the gun's elevation limit",
    noteOffMap: 'no terrain data here',
    noteDeltaZ: 'ΔZ {dz} m',
    crossSectionLoadingTerrain: 'Loading terrain…',
    reachMasked: 'Masked by terrain',
    reachTooClose: 'Too close — inside minimum range',
    reachPending: 'Still solving',
    outRange: 'OUT OF RANGE',
    inRangeModelled: 'In range (modelled)',
    inRange: 'In range'
};

function noteCtx() {
    const ctx = loadRuntime(['js/features/results.js'], {
        tr: key => TR_TEXT[key] ?? key,
        $: () => null,
        setText: () => {},
        setStyle: () => {},
        S: { map: 'm' },
        WEAPONS: {}
    });
    return ctx;
}

const arcOk = { status: 'hit', masked: false };

test('terrainNoteText is empty for a clean hit and renders the substituted note for a mixed verdict', () => {
    const ctx = noteCtx();
    setRuntimeGlobal(ctx, '__shot', {
        state: 'ready', deltaZ: 12.34,
        arcs: { single: null, low: { status: 'tooClose', masked: false }, high: arcOk }
    });
    assert.equal(callRuntime(ctx, 'terrainNoteText({ state: "ready", deltaZ: 0, arcs: { single: null, low: null, high: { status: "hit", masked: false } } }, null)'), '');
    const text = callRuntime(ctx, 'terrainNoteText(__shot, null)');
    assert.equal(text, 'ΔZ +12.3 m · Low arc: inside minimum range');
});

test('terrainNoteText covers pending, offmap, nodata, a null shot and the all-arcs collapse', () => {
    const ctx = noteCtx();
    assert.equal(callRuntime(ctx, 'terrainNoteText({ state: "pending" }, null)'), 'Loading terrain…');
    assert.equal(callRuntime(ctx, 'terrainNoteText({ state: "offmap" }, null)'), 'no terrain data here');
    assert.equal(callRuntime(ctx, 'terrainNoteText({ state: "nodata" }, null)'), '');
    assert.equal(callRuntime(ctx, 'terrainNoteText(null, null)'), '');
    setRuntimeGlobal(ctx, '__shot', {
        state: 'ready', deltaZ: -5,
        arcs: { single: null, low: { status: 'tooFar', masked: false }, high: { status: 'tooFar', masked: false } }
    });
    const text = callRuntime(ctx, 'terrainNoteText(__shot, null)');
    assert.equal(text, 'ΔZ -5.0 m · all arcs: out of reach at this height');
});

test('fillModelledSolutions fills only fireable table-less arcs and never invents deltaZ', () => {
    const ctx = noteCtx();
    setRuntimeGlobal(ctx, '__shot', {
        state: 'ready', deltaZ: -100,
        arcs: {
            single: null,
            low: { status: 'tooFar', masked: false, tableRow: false, mil: null, tan: null },
            high: { status: 'hit', masked: false, tableRow: false, mil: 640.5, tan: 1.2 }
        }
    });
    const filled = callRuntime(ctx, 'fillModelledSolutions({ id: "spg" }, 2650, { single: null, low: null, high: null }, __shot)');
    assert.equal(filled.low, null);
    assert.equal(filled.high.modelled, true);
    assert.ok(Math.abs(filled.high.mil - 640.5) < 1e-9);
    const pending = callRuntime(ctx, 'fillModelledSolutions({ id: "spg" }, 2650, { single: null, low: null, high: null }, { state: "pending" })');
    assert.equal(pending.high, null);
});

test('fillModelledSolutions excludes masked hits and table-covered arcs', () => {
    const ctx = noteCtx();
    setRuntimeGlobal(ctx, '__shot', {
        state: 'ready', deltaZ: 10,
        arcs: {
            single: null,
            low: { status: 'hit', masked: true, tableRow: false, mil: 500, tan: 1.0 },
            high: { status: 'hit', masked: false, tableRow: true, mil: 640.5, tan: 1.2 }
        }
    });
    const filled = callRuntime(ctx, 'fillModelledSolutions({ id: "spg" }, 2000, { single: null, low: null, high: null }, __shot)');
    assert.equal(filled.low, null);
    assert.equal(filled.high, null);
});

test('rangeStatusView renders the right text and colour for every verdict, pending, and the offmap/nodata fallback', () => {
    const ctx = noteCtx();

    const cases = [
        {
            name: 'hit, plain table value',
            elevation: { shot: { state: 'ready', verdict: 'hit' }, solved: true, modelled: false },
            expected: { text: 'In range', color: '#82c596' }
        },
        {
            name: 'hit, modelled',
            elevation: { shot: { state: 'ready', verdict: 'hit' }, solved: true, modelled: true },
            expected: { text: 'In range (modelled)', color: '#f0b24a' }
        },
        {
            name: 'masked',
            elevation: { shot: { state: 'ready', verdict: 'masked' }, solved: true, modelled: false },
            expected: { text: 'Masked by terrain', color: '#f0b24a' }
        },
        {
            name: 'tooClose',
            elevation: { shot: { state: 'ready', verdict: 'tooClose' }, solved: true, modelled: false },
            expected: { text: 'Too close — inside minimum range', color: '#d86666' }
        },
        {
            name: 'tooFar',
            elevation: { shot: { state: 'ready', verdict: 'tooFar' }, solved: false, modelled: false },
            expected: { text: 'OUT OF RANGE', color: '#d86666' }
        },
        {
            name: 'unreachable',
            elevation: { shot: { state: 'ready', verdict: 'unreachable' }, solved: false, modelled: false },
            expected: { text: 'OUT OF RANGE', color: '#d86666' }
        },
        {
            name: 'pending',
            elevation: { shot: { state: 'pending' }, solved: false, modelled: false },
            expected: { text: 'Still solving', color: '#9aa4ae' }
        },
        {
            name: 'offmap fallback, unsolved',
            elevation: { shot: { state: 'offmap' }, solved: false, modelled: false },
            expected: { text: 'OUT OF RANGE', color: '#d86666' }
        },
        {
            name: 'nodata fallback, solved flat',
            elevation: { shot: { state: 'nodata' }, solved: true, modelled: false },
            expected: { text: 'In range', color: '#82c596' }
        }
    ];

    for (const { name, elevation, expected } of cases) {
        setRuntimeGlobal(ctx, '__elevation', elevation);
        const view = callRuntime(ctx, 'rangeStatusView(__elevation)');
        assert.equal(view.text, expected.text, `${name}: text`);
        assert.equal(view.color, expected.color, `${name}: color`);
    }
});
