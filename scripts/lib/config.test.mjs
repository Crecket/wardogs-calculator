import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';

const root = fileURLToPath(new URL('../..', import.meta.url));
const readJson = path => JSON.parse(readFileSync(join(root, path), 'utf8'));

function allowlist(file, name) {
    const source = readFileSync(join(root, file), 'utf8');
    const match = source.match(new RegExp(`${name}\\s*=\\s*\\[([^\\]]*)\\]`));
    assert.ok(match, `${name} found in ${file}`);
    return [...match[1].matchAll(/'([^']+)'/g)].map(m => m[1]).sort();
}

test('every gated table row sits inside the elevation envelope', () => {
    const weapons = readJson('data/weapons.json').weapons;

    for (const weapon of weapons) {
        const minMeters = (weapon.minRangeKm ?? 0) * 1000;
        const maxMeters = (weapon.maxRangeKm ?? weapon.rangeKm) * 1000;

        for (const [arc, rows] of Object.entries(weapon.ballistics ?? {})) {
            for (const [distance, mil] of rows) {
                if (distance + 1e-6 < minMeters || distance > maxMeters + 1e-6) {
                    continue;
                }

                assert.ok(
                    mil + 1e-6 >= weapon.minElevationMil && mil <= weapon.maxElevationMil + 1e-6,
                    `${weapon.id}.${arc} row ${distance} m -> ${mil} mil escapes ${weapon.minElevationMil}..${weapon.maxElevationMil}`
                );
            }
        }
    }
});

test('every weapon has a non-empty elevation stop interval', () => {
    const weapons = readJson('data/weapons.json').weapons;

    for (const weapon of weapons) {
        const min = weapon.minElevationMil;
        const max = weapon.maxElevationMil;

        assert.ok(
            Number.isFinite(min) && Number.isFinite(max),
            `${weapon.id} has non-finite minElevationMil/maxElevationMil (${min}, ${max}); arcAngleStops would return null and both range gates would vanish`
        );
        assert.ok(
            min < max,
            `${weapon.id} has an empty stop interval (minElevationMil ${min} >= maxElevationMil ${max}); arcAngleStops would return null and both range gates would vanish`
        );
    }
});

test('the map allowlists match the terrain files on disk and each other', () => {
    const terrainDirs = readdirSync(join(root, 'data/terrain'), { withFileTypes: true })
        .filter(entry => entry.isDirectory())
        .map(entry => entry.name);

    const withFile = file => terrainDirs.filter(id => existsSync(join(root, 'data/terrain', id, file))).sort();

    assert.deepEqual(allowlist('js/map/heightfield.js', 'HEIGHTFIELD_MAP_IDS'), withFile('heightfield.json'));
    assert.deepEqual(allowlist('js/map/contours.js', 'CONTOUR_MAP_IDS'), withFile('contours.json'));
    assert.deepEqual(allowlist('js/map/hillshade.js', 'HILLSHADE_MAP_IDS'), withFile('hillshade.json'));

    const contextMaps = Object.keys(readJson('data/ballistics/terrain-context.json').terrainMaps).sort();
    assert.deepEqual(allowlist('js/map/heightfield.js', 'HEIGHTFIELD_MAP_IDS'), contextMaps);
});

test('heightfield scale agrees with each map\'s coordinateMetersPerUnit', () => {
    for (const id of allowlist('js/map/heightfield.js', 'HEIGHTFIELD_MAP_IDS')) {
        const field = readJson(`data/terrain/${id}/heightfield.json`);
        const map = readJson(`maps/${id}.json`);

        assert.equal(
            field.spacingMeters / field.grid.stepGameUnits,
            map.coordinateMetersPerUnit,
            `${id} heightfield scale`
        );
    }
});
