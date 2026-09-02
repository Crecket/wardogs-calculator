/*
 * Round-trips the minimal PNG encoder through a decoder written here, so a
 * broken CRC, filter or header would fail rather than silently ship a file
 * no browser will open.
 *
 * Run with: npm run test:scripts
 */

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { inflateSync } from 'node:zlib';

import { encodePng } from './png.mjs';

const CHANNELS_FOR_COLOUR_TYPE = {
    0: 1,
    2: 3,
    4: 2,
    6: 4
};

function paeth(a, b, c) {
    const p = a + b - c;
    const pa = Math.abs(p - a);
    const pb = Math.abs(p - b);
    const pc = Math.abs(p - c);

    if (pa <= pb && pa <= pc) {
        return a;
    }

    return pb <= pc ? b : c;
}

function crc32(buffer) {
    let c = 0xffffffff;

    for (let i = 0; i < buffer.length; i += 1) {
        c ^= buffer[i];

        for (let k = 0; k < 8; k += 1) {
            c = (c & 1)
                ? (0xedb88320 ^ (c >>> 1))
                : (c >>> 1);
        }
    }

    return (c ^ 0xffffffff) >>> 0;
}

function decodePng(buffer) {
    assert.deepEqual(
        [...buffer.subarray(0, 8)],
        [137, 80, 78, 71, 13, 10, 26, 10],
        'PNG signature'
    );

    const chunks = new Map();

    const idat = [];

    let offset = 8;

    while (offset < buffer.length) {
        const length = buffer.readUInt32BE(offset);
        const type = buffer.toString('ascii', offset + 4, offset + 8);
        const data = buffer.subarray(offset + 8, offset + 8 + length);
        const crc = buffer.readUInt32BE(offset + 8 + length);

        assert.equal(
            crc32(buffer.subarray(offset + 4, offset + 8 + length)),
            crc,
            `CRC of ${type}`
        );

        if (type === 'IDAT') {
            idat.push(Buffer.from(data));
        } else {
            chunks.set(type, Buffer.from(data));
        }

        offset += 12 + length;
    }

    const header = chunks.get('IHDR');

    assert.ok(header, 'IHDR present');
    assert.ok(chunks.has('IEND'), 'IEND present');

    const width = header.readUInt32BE(0);
    const height = header.readUInt32BE(4);
    const depth = header[8];
    const colourType = header[9];

    assert.equal(depth, 8, 'bit depth');

    const channels = CHANNELS_FOR_COLOUR_TYPE[colourType];

    assert.ok(channels, `known colour type ${colourType}`);

    const raw = inflateSync(Buffer.concat(idat));
    const stride = width * channels;

    assert.equal(raw.length, (stride + 1) * height, 'scanline count');

    const pixels = Buffer.alloc(stride * height);

    for (let y = 0; y < height; y += 1) {
        const type = raw[y * (stride + 1)];
        const row = y * stride;
        const prior = row - stride;

        for (let i = 0; i < stride; i += 1) {
            const value = raw[y * (stride + 1) + 1 + i];

            const left = i >= channels
                ? pixels[row + i - channels]
                : 0;

            const up = y > 0
                ? pixels[prior + i]
                : 0;

            const upLeft = (y > 0 && i >= channels)
                ? pixels[prior + i - channels]
                : 0;

            let restored = value;

            if (type === 1) {
                restored = value + left;
            } else if (type === 2) {
                restored = value + up;
            } else if (type === 3) {
                restored = value + ((left + up) >> 1);
            } else if (type === 4) {
                restored = value + paeth(left, up, upLeft);
            } else {
                assert.equal(type, 0, `filter type ${type}`);
            }

            pixels[row + i] = restored & 0xff;
        }
    }

    return { width, height, channels, colourType, pixels };
}

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
