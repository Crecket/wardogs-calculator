/*
 * Reads the cooked Terrain3D heightfield chunks and samples them in game
 * coordinates.
 *
 * Mirrors locateTerrainPoint / decodeRawHeight in
 * js/features/terrain-ballistics.js. The three must agree: if they drift,
 * the range ring and the elevation readout describe different ground.
 *
 * Heights are metres on the map's own offset datum, roughly 900 m below
 * anything a player would call an altitude. Only differences are meaningful.
 */

import { readFile } from 'node:fs/promises';
import { join } from 'node:path';

/*
 * Loads only the chunks the map's playable bounds actually touch. Bakurani
 * needs 144 of its 256, and skipping the rest is 58 MB of reads.
 */
export async function loadTerrainChunks(manifest, terrainDir, bounds) {
    const chunkQuads = Number(manifest.chunkQuads);

    const quadsX = [
        Number(manifest.globalQuadOffsetX) +
            bounds.minX * Number(manifest.gameUnitsToLandscapeQuadsX),
        Number(manifest.globalQuadOffsetX) +
            bounds.maxX * Number(manifest.gameUnitsToLandscapeQuadsX)
    ];

    const quadsY = [
        Number(manifest.globalQuadOffsetY) +
            bounds.minY * Number(manifest.gameUnitsToLandscapeQuadsY),
        Number(manifest.globalQuadOffsetY) +
            bounds.maxY * Number(manifest.gameUnitsToLandscapeQuadsY)
    ];

    const range = (values, min, max) => {
        const low = Math.max(
            min,
            Math.floor(Math.min(...values) / chunkQuads)
        );

        const high = Math.min(
            max,
            Math.floor(Math.max(...values) / chunkQuads)
        );

        return [low, high];
    };

    const [chunkXMin, chunkXMax] = range(
        quadsX,
        Number(manifest.chunkXMin),
        Number(manifest.chunkXMax)
    );

    const [chunkYMin, chunkYMax] = range(
        quadsY,
        Number(manifest.chunkYMin),
        Number(manifest.chunkYMax)
    );

    const chunks = new Map();

    for (let y = chunkYMin; y <= chunkYMax; y += 1) {
        for (let x = chunkXMin; x <= chunkXMax; x += 1) {
            const key = `${x},${y}`;
            const entry = manifest.chunks?.[key];

            if (!entry) {
                continue;
            }

            const buffer = await readFile(join(terrainDir, entry.file));

            if (buffer.byteLength !== Number(entry.bytes)) {
                throw new Error(
                    `Terrain chunk ${key} is ${buffer.byteLength} bytes, ` +
                    `manifest says ${entry.bytes}`
                );
            }

            chunks.set(key, {
                entry,
                view: new DataView(
                    buffer.buffer,
                    buffer.byteOffset,
                    buffer.byteLength
                )
            });
        }
    }

    return chunks;
}

export function createTerrainSampler(manifest, chunks) {
    const side = Number(manifest.verticesPerSide);
    const chunkQuads = Number(manifest.chunkQuads);
    const quadsPerUnitX = Number(manifest.gameUnitsToLandscapeQuadsX);
    const quadsPerUnitY = Number(manifest.gameUnitsToLandscapeQuadsY);
    const zOffset = Number(manifest.worldZOffsetMeters);
    const zScale = Number(manifest.worldZScaleMetersPerLocalUnit);

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function heightAt(chunk, x, y) {
        const raw = chunk.view.getUint16((y * side + x) * 2, true);

        const localZ =
            chunk.entry.minLocalZ +
            (raw / 65535) *
            (chunk.entry.maxLocalZ - chunk.entry.minLocalZ);

        return zOffset + localZ * zScale;
    }

    return function sample(gameX, gameY) {
        const quadX =
            Number(manifest.globalQuadOffsetX) + gameX * quadsPerUnitX;

        const quadY =
            Number(manifest.globalQuadOffsetY) + gameY * quadsPerUnitY;

        const chunkX = clamp(
            Math.floor(quadX / chunkQuads),
            Number(manifest.chunkXMin),
            Number(manifest.chunkXMax)
        );

        const chunkY = clamp(
            Math.floor(quadY / chunkQuads),
            Number(manifest.chunkYMin),
            Number(manifest.chunkYMax)
        );

        const chunk = chunks.get(`${chunkX},${chunkY}`);

        if (!chunk) {
            return null;
        }

        const localX = clamp(quadX - chunkX * chunkQuads, 0, chunkQuads);
        const localY = clamp(quadY - chunkY * chunkQuads, 0, chunkQuads);

        const x0 = Math.floor(localX);
        const y0 = Math.floor(localY);
        const x1 = Math.min(chunkQuads, x0 + 1);
        const y1 = Math.min(chunkQuads, y0 + 1);

        const fx = localX - x0;
        const fy = localY - y0;

        return (
            heightAt(chunk, x0, y0) * (1 - fx) * (1 - fy) +
            heightAt(chunk, x1, y0) * fx * (1 - fy) +
            heightAt(chunk, x0, y1) * (1 - fx) * fy +
            heightAt(chunk, x1, y1) * fx * fy
        );
    };
}
