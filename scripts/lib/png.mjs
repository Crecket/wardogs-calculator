/*
 * Minimal PNG encoder.
 *
 * package.json has no dependencies and the deploy clones the repo, so an
 * image library is not an option. A PNG is a signature, three chunks, and
 * a deflate stream, and node:zlib does the only hard part.
 *
 * Channel count is taken from the buffer length, so an 8-bit grey,
 * grey+alpha, RGB or RGBA image all encode through the same call.
 */

import { deflateSync } from 'node:zlib';

const SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

const COLOUR_TYPES = {
    1: 0,
    2: 4,
    3: 2,
    4: 6
};

const CRC_TABLE = (() => {
    const table = new Int32Array(256);

    for (let n = 0; n < 256; n += 1) {
        let c = n;

        for (let k = 0; k < 8; k += 1) {
            c = (c & 1)
                ? (0xedb88320 ^ (c >>> 1))
                : (c >>> 1);
        }

        table[n] = c;
    }

    return table;
})();

function crc32(buffer) {
    let c = 0xffffffff;

    for (let i = 0; i < buffer.length; i += 1) {
        c = CRC_TABLE[(c ^ buffer[i]) & 0xff] ^ (c >>> 8);
    }

    return (c ^ 0xffffffff) >>> 0;
}

function chunk(type, data) {
    const head = Buffer.alloc(8);

    head.writeUInt32BE(data.length, 0);
    head.write(type, 4, 'ascii');

    const crc = Buffer.alloc(4);

    crc.writeUInt32BE(
        crc32(Buffer.concat([head.subarray(4), data])),
        0
    );

    return Buffer.concat([head, data, crc]);
}

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

/*
 * Per-scanline adaptive filtering with the sum-of-absolute-differences
 * heuristic from the PNG spec's own recommendation. On a hillshade it is
 * worth roughly a factor of two over storing the rows unfiltered.
 */
function filterScanlines(pixels, width, height, channels) {
    const stride = width * channels;
    const out = Buffer.alloc((stride + 1) * height);

    const candidate = Buffer.alloc(stride);
    const best = Buffer.alloc(stride);

    for (let y = 0; y < height; y += 1) {
        const row = y * stride;
        const prior = row - stride;

        let bestType = 0;
        let bestScore = Infinity;

        for (let type = 0; type < 5; type += 1) {
            let score = 0;

            for (let i = 0; i < stride; i += 1) {
                const raw = pixels[row + i];

                const left = i >= channels
                    ? pixels[row + i - channels]
                    : 0;

                const up = y > 0
                    ? pixels[prior + i]
                    : 0;

                const upLeft = (y > 0 && i >= channels)
                    ? pixels[prior + i - channels]
                    : 0;

                let value = raw;

                if (type === 1) {
                    value = raw - left;
                } else if (type === 2) {
                    value = raw - up;
                } else if (type === 3) {
                    value = raw - ((left + up) >> 1);
                } else if (type === 4) {
                    value = raw - paeth(left, up, upLeft);
                }

                value &= 0xff;
                candidate[i] = value;

                score += value < 128
                    ? value
                    : 256 - value;
            }

            if (score < bestScore) {
                bestScore = score;
                bestType = type;
                candidate.copy(best);
            }
        }

        out[y * (stride + 1)] = bestType;
        best.copy(out, y * (stride + 1) + 1);
    }

    return out;
}

export function encodePng(pixels, width, height, options = {}) {
    if (
        !Number.isInteger(width) ||
        !Number.isInteger(height) ||
        width <= 0 ||
        height <= 0
    ) {
        throw new Error('PNG dimensions must be positive integers');
    }

    if (pixels.length % (width * height) !== 0) {
        throw new Error(
            `${pixels.length} bytes is not a whole number of channels ` +
            `for ${width}x${height}`
        );
    }

    const channels = pixels.length / (width * height);
    const colourType = COLOUR_TYPES[channels];

    if (colourType === undefined) {
        throw new Error(`Unsupported channel count ${channels}`);
    }

    const header = Buffer.alloc(13);

    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8;
    header[9] = colourType;
    header[10] = 0;
    header[11] = 0;
    header[12] = 0;

    const bytes = ArrayBuffer.isView(pixels)
        ? Buffer.from(pixels.buffer, pixels.byteOffset, pixels.length)
        : Buffer.from(pixels);

    const filtered = filterScanlines(bytes, width, height, channels);

    const deflated = deflateSync(filtered, {
        level: options.level ?? 9
    });

    return Buffer.concat([
        SIGNATURE,
        chunk('IHDR', header),
        chunk('IDAT', deflated),
        chunk('IEND', Buffer.alloc(0))
    ]);
}
