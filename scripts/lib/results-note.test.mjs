import test from 'node:test';
import assert from 'node:assert/strict';
import { loadRuntime, callRuntime, setRuntimeGlobal } from './runtime-globals.mjs';

function noteCtx() {
    const ctx = loadRuntime(['js/features/results.js'], {
        tr: key => key,
        $: () => null,
        setText: () => {},
        setStyle: () => {},
        S: { map: 'm' },
        WEAPONS: {}
    });
    return ctx;
}

const arcOk = { status: 'hit', masked: false };

test('terrainNoteText is empty for a clean hit and names arcs per verdict group', () => {
    const ctx = noteCtx();
    setRuntimeGlobal(ctx, '__shot', {
        state: 'ready', deltaZ: 12.34,
        arcs: { single: null, low: { status: 'tooClose', masked: false }, high: arcOk }
    });
    assert.equal(callRuntime(ctx, 'terrainNoteText({ state: "ready", deltaZ: 0, arcs: { single: null, low: null, high: { status: "hit", masked: false } } }, null)'), '');
    const text = callRuntime(ctx, 'terrainNoteText(__shot, null)');
    assert.ok(text.startsWith('noteDeltaZ'));
    assert.ok(text.includes('noteTooClose'));
    assert.ok(text.includes('lowArc'));
});

test('terrainNoteText covers pending, offmap and the all-arcs collapse', () => {
    const ctx = noteCtx();
    assert.equal(callRuntime(ctx, 'terrainNoteText({ state: "pending" }, null)'), 'crossSectionLoadingTerrain');
    assert.equal(callRuntime(ctx, 'terrainNoteText({ state: "offmap" }, null)'), 'noteOffMap');
    setRuntimeGlobal(ctx, '__shot', {
        state: 'ready', deltaZ: -5,
        arcs: { single: null, low: { status: 'tooFar', masked: false }, high: { status: 'tooFar', masked: false } }
    });
    const text = callRuntime(ctx, 'terrainNoteText(__shot, null)');
    assert.ok(text.includes('noteAllArcs'));
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
