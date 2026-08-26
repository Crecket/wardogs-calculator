/*
 * Precomputes the elevation correction grid from the fitted projectile
 * model, and writes data/ballistics/height-correction.json, which is
 * committed.
 *
 *     node scripts/build-height-correction.mjs
 *
 * The runtime reads this with a bilinear lookup and ADDS the result to the
 * flat-table mil. Every value here is a DIFFERENCE between two points on
 * the same model curve, so the deltaZ = 0 column is exactly zero and flat
 * ground is untouched. See the design doc section 1.
 *
 * spg.low is deliberately written as null: research section 5 puts its
 * break-even impact angle at 25 degrees where the vacuum fit says 13, so a
 * correction there is a coin flip. null means "policy says do not correct",
 * as distinct from a missing arc.
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { GRAVITY, milCorrection, missMeters } from './lib/ballistics.mjs';

const root = resolve(
    dirname(fileURLToPath(import.meta.url)),
    '..'
);

const CORRECTION_SCHEMA = 'wardogs-height-correction-v1';

/*
 * Arcs the correction ships on. Anything absent is written as null.
 *
 * spg.low was withheld until 2026-08-27 on the grounds that its break-even
 * impact angle is 25 degrees in research against 13 in this fit. Sweeping
 * every arc, range and deltaZ says that caution was misplaced: correcting
 * beats ignoring in all 1652 cells, and on the low arc it is the difference
 * between ~600 m of miss and ~25 m, measured against a model perturbed 2% in
 * muzzle velocity. It is the flattest arc, so it is the one height hurts most.
 */
const CORRECTED_ARCS = {
    mortar: ['single'],
    spg: ['low', 'high']
};

const DISTANCE_SAMPLES = 40;
const DELTA_Z_MIN_METERS = -800;
const DELTA_Z_MAX_METERS = 800;
const DELTA_Z_STEP_METERS = 50;

const round = (value, places) =>
    value === null ? null : Number(value.toFixed(places));

/*
 * The axis stops at the model's own reach, not the table's.
 *
 * A vacuum trajectory cannot exceed v^2/g, and the SPG high table's last row
 * (2629 m) sits just past its fitted ceiling (2622.6 m). Sampling out to the
 * table maximum puts a column of nulls at the right edge, and because the
 * bilinear lookup needs both bracketing columns, that column poisons every
 * shot above the last valid sample -- 49 m of range that could be corrected
 * and was not. Clamping costs the few metres the model genuinely cannot
 * reach instead.
 */
function distanceAxis(rows, arcModel) {
    const distances = rows
        .map(row => Number(row[0]))
        .filter(Number.isFinite);

    const ceiling =
        arcModel.muzzleVelocity * arcModel.muzzleVelocity / GRAVITY;

    const min = Math.min(...distances);
    const max = Math.min(Math.max(...distances), ceiling * 0.9995);
    const step = (max - min) / (DISTANCE_SAMPLES - 1);

    return Array.from(
        { length: DISTANCE_SAMPLES },
        (unused, i) => Number((min + step * i).toFixed(1))
    );
}

function deltaZAxis() {
    const axis = [];

    for (
        let dz = DELTA_Z_MIN_METERS;
        dz <= DELTA_Z_MAX_METERS;
        dz += DELTA_Z_STEP_METERS
    ) {
        axis.push(dz);
    }

    return axis;
}

function buildGrid(arcModel, rows) {
    const distancesMeters = distanceAxis(rows, arcModel);
    const deltaZMeters = deltaZAxis();

    const milCorrections = deltaZMeters.map(
        dz => distancesMeters.map(
            distance => round(milCorrection(arcModel, distance, dz), 3)
        )
    );

    const missMatrix = deltaZMeters.map(
        dz => distancesMeters.map(
            distance => round(missMeters(arcModel, distance, dz), 2)
        )
    );

    return {
        distancesMeters,
        deltaZMeters,
        milCorrections,
        missMeters: missMatrix
    };
}

async function main() {
    const weapons = JSON.parse(
        await readFile(join(root, 'data/weapons.json'), 'utf8')
    );

    const model = JSON.parse(
        await readFile(
            join(root, 'data/ballistics/projectile-model.json'),
            'utf8'
        )
    );

    const output = {
        schema: CORRECTION_SCHEMA,
        generatedFrom: 'data/ballistics/projectile-model.json',
        modelSource: model.source,
        generatedAt: new Date().toISOString().slice(0, 10),
        weapons: {}
    };

    for (const weapon of weapons.weapons) {
        const arcs = weapon.ballistics;

        if (!arcs) {
            continue;
        }

        output.weapons[weapon.id] = {};

        const corrected = CORRECTED_ARCS[weapon.id] ?? [];

        for (const arc of Object.keys(arcs)) {
            if (!corrected.includes(arc)) {
                output.weapons[weapon.id][arc] = null;
                console.log(`${weapon.id}.${arc}: null (uncorrected by policy)`);
                continue;
            }

            const arcModel = model.weapons?.[weapon.id]?.[arc];

            if (!arcModel) {
                throw new Error(
                    `No fitted model for ${weapon.id}.${arc}`
                );
            }

            const grid = buildGrid(arcModel, arcs[arc]);

            output.weapons[weapon.id][arc] = grid;

            const unreachable = grid.milCorrections
                .flat()
                .filter(value => value === null)
                .length;

            const total =
                grid.milCorrections.length *
                grid.distancesMeters.length;

            console.log(
                `${weapon.id}.${arc}: ` +
                `${grid.distancesMeters.length} x ${grid.deltaZMeters.length} ` +
                `(${grid.distancesMeters[0]}-` +
                `${grid.distancesMeters.at(-1)} m), ` +
                `${unreachable}/${total} unreachable`
            );
        }
    }

    await writeFile(
        join(root, 'data/ballistics/height-correction.json'),
        `${JSON.stringify(output)}\n`
    );
}

await main();
