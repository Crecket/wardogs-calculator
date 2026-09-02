/*
 * Refits the vacuum arcs of data/ballistics/projectile-model.json to the
 * tables in data/weapons.json and rewrites the file, which is committed.
 *
 *     node scripts/fit-ballistics.mjs
 *
 * Only arcs whose source is "vacuum-fit" are touched. Arcs fitted to
 * in-game measurements ("firing-range-fit", see
 * docs/firing-range-measurements.md) are carried over verbatim, because a
 * table generated from a drag model cannot be refitted in vacuum without
 * throwing the measurement away. Pak extraction is meant to replace both
 * kinds in the end; see the design doc section 8.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { fitArc, GRAVITY, MODEL_SCHEMA } from './lib/ballistics.mjs';

const root = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..'
);

const VACUUM_SOURCE = 'vacuum-fit';

/*
 * Which branch each table sits on. sin(2 theta) is symmetric about the
 * maximum-range angle, so range alone cannot say; this is read off the
 * tables' own naming, where the SPG "high" table carries uniformly higher
 * mil than "low", and the mortar's single table follows the same convention.
 * The firing-range timings of 2026-09-02 confirmed the mortar convention.
 */
const BRANCHES = {
    mortar: { single: 'high' },
    spg: { low: 'low', high: 'high' }
};

const round = (value, places) =>
    Number(value.toFixed(places));

async function main() {
    const weapons = JSON.parse(
        await readFile(join(root, 'data/weapons.json'), 'utf8')
    );

    const modelPath = join(root, 'data/ballistics/projectile-model.json');
    const existing = JSON.parse(await readFile(modelPath, 'utf8'));

    if (existing.schema !== MODEL_SCHEMA) {
        throw new Error(
            `projectile-model.json is ${existing.schema}, expected ${MODEL_SCHEMA}`
        );
    }

    const output = {
        schema: MODEL_SCHEMA,
        sourceNote: existing.sourceNote,
        generatedAt: new Date().toISOString().slice(0, 10),
        gravity: GRAVITY,
        weapons: {}
    };

    for (const weapon of weapons.weapons) {
        const branches = BRANCHES[weapon.id];

        if (!branches) {
            console.warn(`skipping ${weapon.id}: no branch mapping`);
            continue;
        }

        output.weapons[weapon.id] = {};

        for (const [arc, branch] of Object.entries(branches)) {
            const current = existing.weapons?.[weapon.id]?.[arc];

            if (current && current.source !== VACUUM_SOURCE) {
                output.weapons[weapon.id][arc] = current;
                console.log(`${weapon.id}.${arc}: kept (${current.source})`);
                continue;
            }

            const rows = weapon.ballistics?.[arc];

            if (!Array.isArray(rows) || !rows.length) {
                console.warn(`skipping ${weapon.id}.${arc}: no table`);
                continue;
            }

            const fit = fitArc(rows, branch);

            output.weapons[weapon.id][arc] = {
                ...current,
                branch: fit.branch,
                source: VACUUM_SOURCE,
                muzzleVelocity: round(fit.muzzleVelocity, 1),
                dragPerMeter: 0,
                angleOffsetDeg: round(fit.angleOffsetDeg, 2),
                anglePerMilDeg: round(fit.anglePerMilDeg, 5),
                rmsMeters: round(fit.rmsMeters, 2)
            };

            console.log(
                `${weapon.id}.${arc}: v=${round(fit.muzzleVelocity, 1)} m/s ` +
                `theta=${round(fit.angleOffsetDeg, 2)}+` +
                `${round(fit.anglePerMilDeg, 5)}*mil deg ` +
                `RMS=${round(fit.rmsMeters, 2)} m`
            );
        }
    }

    await writeFile(
        modelPath,
        `${JSON.stringify(output, null, 4)}\n`
    );
}

await main();
