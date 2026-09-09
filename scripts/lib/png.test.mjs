/*
 * Round-trips the minimal PNG encoder through its decoder, so a broken
 * CRC, filter or header would fail rather than silently ship a file no
 * browser will open — and so a bake reading another bake's raster gets the
 * bytes that were written.
 *
 * Run with: npm run test:scripts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { decodePng, encodePng } from './png.mjs';

test('a damaged file is refused rather than decoded into something', () => {
    const encoded = encodePng(new Uint8Array([1, 2, 3, 4]), 2, 2);
    const damaged = Buffer.from(encoded);

    damaged[damaged.length - 5] ^= 0xff;

    assert.throws(() => decodePng(damaged), /CRC/);
    assert.throws(() => decodePng(Buffer.from('not a png')), /Not a PNG/);
});

test('grey+alpha round-trips through encode and decode', () => {
    const width = 37;
    const height = 23;
    const pixels = new Uint8Array(width * height * 2);

    for (let y = 0; y < height; y += 1) {
        for (let x = 0; x < width; x += 1) {
            const i = (y * width + x) * 2;

            pixels[i] = (x * 7 + y * 13) & 0xff;
            pixels[i + 1] = (x * x + y) & 0xff;
        }
    }

    const decoded = decodePng(encodePng(pixels, width, height));

    assert.equal(decoded.width, width);
    assert.equal(decoded.height, height);
    assert.equal(decoded.colourType, 4);
    assert.equal(decoded.channels, 2);
    assert.deepEqual([...decoded.pixels], [...pixels]);
});

test('a flat grey image round-trips and compresses hard', () => {
    const width = 64;
    const height = 64;
    const pixels = new Uint8Array(width * height).fill(200);

    const encoded = encodePng(pixels, width, height);
    const decoded = decodePng(encoded);

    assert.equal(decoded.colourType, 0);
    assert.deepEqual([...decoded.pixels], [...pixels]);
    assert.ok(
        encoded.length < 1024,
        `a uniform 64x64 grey should not need ${encoded.length} bytes`
    );
});

test('rgba round-trips', () => {
    const width = 5;
    const height = 4;

    const pixels = Uint8Array.from(
        { length: width * height * 4 },
        (unused, i) => (i * 31) & 0xff
    );

    const decoded = decodePng(encodePng(pixels, width, height));

    assert.equal(decoded.colourType, 6);
    assert.deepEqual([...decoded.pixels], [...pixels]);
});

test('a buffer length that is not whole channels is rejected', () => {
    assert.throws(
        () => encodePng(new Uint8Array(7), 2, 2),
        /whole number of channels/
    );
});
