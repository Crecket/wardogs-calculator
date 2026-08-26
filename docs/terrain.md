## Terrain Elevation & SPH-2 Setup

Terrain elevation is optional map data used to provide vertical context for artillery calculations. It is separate from the visible tile map and from the weapon firing tables.

Supported Terrain3D datasets:

- **Bakurani**
- **Ozeti**

---

## What the Terrain3D feature does

When a supported map is selected and valid terrain data is available, the calculator samples terrain elevation at:

- the current **Artillery** coordinate
- the current **Target** coordinate

It then displays the height difference:

```text
ΔZ = target elevation - artillery elevation
```

Examples:

```text
ΔZ +24.0 m  -> target is 24 m above the artillery position
ΔZ -18.5 m  -> target is 18.5 m below the artillery position
```

The value is shown as secondary firing-solution context.

### Current release behavior

Terrain3D drives an automatic elevation correction, applied where we trust the
inputs and switched off where we do not.

```text
Distance -> normal coordinate calculation
Azimuth  -> normal coordinate calculation
MIL      -> existing weapon firing table
ΔZ       -> Terrain3D elevation context
```

Automatic terrain, ΔZ, or vehicle-attitude MIL correction is **not enabled**.

### The elevation datum is offset

Decoded heights are not altitudes. Sampled across its playable bounds,
Bakurani runs about -1007 m to +75 m and Ozeti about -1008 m to -620 m, so
the height field sits roughly 900 m below anything a player would recognise
as an altitude.

The field is internally consistent — chunk seams agree to 0.21 m — so every
**difference** is trustworthy, which is all the ΔZ readout and the contour
layer use. No absolute height should ever be displayed. `worldZOffsetMeters`
is 0.5 on Bakurani and 0.04 on Ozeti and does not encode this correction;
nothing in the repository currently records where the datum went.

Calibrating it needs one known in-game altitude readout per map. Until then,
contour lines are drawn unlabelled and coloured by height *relative to the
map's own lowest sample*.

---

## Data layout

Each supported map stores its elevation dataset under its own directory:

```text
data/terrain/<map-id>/
├── manifest.json
├── contours.json
└── chunks/
    ├── ...
    └── *.bin
```

Current datasets:

```text
data/terrain/bakurani/
data/terrain/ozeti/
```

`manifest.json` describes the terrain grid, verified coordinate coverage, coordinate-to-Landscape mapping, elevation conversion, and integrity metadata used by the runtime.

The binary terrain chunks contain only elevation samples. They are not map-image tiles and should not be placed under `maps/tiles/`.

`contours.json` is generated, not extracted. `npm run build-contours` samples
the chunks on a 4 m grid across the map's playable bounds and writes 20 m
contour lines as delta-encoded vectors — a few hundred KB, against 129 MB of
chunks. It is committed, and regenerating it is the correct response to any
change in the heightfield or in a map's `bounds`.

The runtime cannot build these itself: `js/features/terrain-ballistics.js`
loads chunks lazily, two per firing solution, while a contour layer needs the
whole map at once. `js/map/contours.js` fetches the generated file only when
somebody turns the Contours layer on.

---

## Multi-map runtime registry

`data/ballistics/terrain-context.json` contains the Terrain3D map registry.

The runtime keeps the original top-level `mapId` / `terrainManifest` fields as a backward-compatible single-map fallback and uses `terrainMaps` for the current multi-map configuration.

Example shape:

```json
{
  "mapId": "bakurani",
  "terrainManifest": "data/terrain/bakurani/manifest.json",
  "terrainMaps": {
    "bakurani": {
      "terrainManifest": "data/terrain/bakurani/manifest.json"
    },
    "ozeti": {
      "terrainManifest": "data/terrain/ozeti/manifest.json"
    }
  }
}
```

Each map has an independent manifest and independent in-browser chunk cache. Failure to load one map's terrain dataset does not disable Terrain3D for other successfully loaded maps.

---

## Runtime loading

For each firing solution, the runtime:

1. Checks whether the current map has a registered Terrain3D dataset.
2. Checks whether Artillery and Target are inside that dataset's verified coverage.
3. Resolves both coordinates to terrain chunks.
4. Loads missing chunks with `fetch()`.
5. Caches loaded chunks for later samples.
6. Samples Artillery and Target elevation.
7. Computes and displays ΔZ.

Only the chunks needed by the current positions have to be decoded by the browser.

The feature runtime lives in:

```text
js/features/terrain-ballistics.js
```

---

## Coordinate-axis orientation

Terrain chunks store Landscape collision rows in native Landscape +Y order. Game/UI map coordinates use +Y toward the north/top of the tactical map, which is the opposite absolute Landscape-Y direction for the captured regions.

The runtime therefore supports independent per-axis factors:

```text
gameUnitsToLandscapeQuadsX = +50
gameUnitsToLandscapeQuadsY = -50
```

Bakurani reference mapping:

```text
WorldX(m) = GameX * 100 - 16320
WorldY(m) = -4080 - GameY * 100

GlobalQuadX = 8160 + GameX * 50
GlobalQuadY = 14280 - GameY * 50
```

The sign correction does not alter decoded height samples, chunk ordering, or seam validation. It only fixes which native Landscape Y location corresponds to a given game/UI Y coordinate.

---

## Ozeti coordinate mapping

Ozeti was reconstructed from the cooked Europe Landscape collision heightfields and aligned to the UI WorldCapture data.

Verified Landscape transform:

```text
Landscape root = (-1632200, -1632200, 4) cm
Landscape scale = (200, 200, 900)
```

Verified UI capture XY bounds from `DA_UI_Europe.uasset`:

```text
Min = (-1616000, -1616000) cm
Max = (   16000,    16000) cm
```

Therefore:

```text
WorldX(m) = GameX * 100 - 16160
WorldY(m) = 160 - GameY * 100

GlobalQuadX = 81 + GameX * 50
GlobalQuadY = 8241 - GameY * 50
```

Ozeti height conversion:

```text
worldZ(m) = 0.04 + localZ * 9
```

The recovered proxy set is `0..15 × 0..15`. The capture is offset by 81 quads from the recovered Landscape on both sides. Because game +Y runs opposite Landscape +Y, exact recovered coverage is:

```text
Game X: 0 .. 161.58
Game Y: 1.62 .. 163.20
```

The visible Ozeti map itself extends farther. Coordinates outside the verified Terrain3D coverage deliberately fall back to the normal firing table instead of clamping to the last terrain edge.

---

## Fallback behavior

Terrain elevation is not a hard dependency for the calculator.

If terrain data is missing, still loading, outside supported coverage, or otherwise unavailable:

- Distance remains available.
- Azimuth remains available.
- The configured weapon firing table remains available.
- MIL is not replaced by a guessed value.

This allows the calculator to keep working even when Terrain3D cannot provide a sample.

---

## SPH-2 vehicle leveling

SPH-2 vehicle attitude changes the real projectile range. Terrain height at the vehicle coordinate does not fully describe the final barrel angle, so the calculator shows a visible leveling warning whenever SPH-2 is selected.

### Checking lateral tilt in game

In the SPH-2 gunner HUD:

1. Find the vehicle silhouette below the `STABILIZED / ASL` area.
2. Look at the two small markers on the left and right sides of the silhouette.
3. Those side markers indicate lateral vehicle tilt.
4. Reposition the SPH-2 until the markers are as centered and aligned as possible.

Front/back slope also affects real range. There is currently no reliable numeric front/back tilt value available to the calculator, so for precision fire the vehicle should be parked on the flattest ground available and obvious uphill/downhill positions should be avoided.

The warning is guidance, not an automatic correction input.

---

## Validation requirements

Before publishing a terrain-enabled build, verify every registered dataset:

- manifest exists and parses as JSON
- `format` is `wardogs-landscape-collision-u16-v1`
- `verticesPerSide = 511`
- `chunkQuads = 510`
- every manifest chunk file exists
- every chunk has the declared byte length
- every chunk SHA-256 matches the manifest
- map-specific coordinate coverage is verified
- `releasePolicy.automaticMilCorrection` remains `false`
- `releasePolicy.flatTableAuthoritative` remains `true`
- `calibration.ready` remains `false` until projectile/platform correction is independently validated

Then build normally:

```bash
npm run build
```

On Windows PowerShell systems where `npm.ps1` is blocked by Execution Policy, use:

```powershell
npm.cmd run build
```

---

## Adding terrain data to another map

Terrain elevation is optional and should stay map-specific.

A new map should add its dataset under:

```text
data/terrain/<map-id>/
```

and add one entry to `terrainMaps` in:

```text
data/ballistics/terrain-context.json
```

The map dataset must define:

- supported coordinate coverage
- chunk layout and resolution
- coordinate-to-terrain mapping
- elevation decoding rules
- integrity metadata

Maps without a terrain dataset require no changes and continue to use the existing calculator behavior.

---

## Ballistic compensation

Terrain3D supplies ΔZ to an elevation correction that is **on**.
`data/ballistics/terrain-context.json` carries
`releasePolicy.automaticMilCorrection`; while it is `true`, the correction is
looked up from `data/ballistics/height-correction.json` and **added** to the
flat-table mil. It is a differential from a model, so it is exactly zero at
ΔZ = 0 and the shipped tables stay authoritative on flat ground.

The correction applies to **every arc** — mortar `single`, SPG-2 `low` and
SPG-2 `high`. It is withheld in two cases, each of which reports itself in the
panel caption rather than failing quietly:

| Case | Why | Where it is configured |
|---|---|---|
| Any map outside `correctedMaps` | Bakurani's coordinate alignment was validated by visual overlay after the Y-flip fix in `5c462a173`; Ozeti's never was, and a numeric correction tolerates misalignment far worse than a caption does. | `releasePolicy.correctedMaps` |
| A miss under 10 m | Below this the correction is not worth acting on, and printing one implies a precision the model does not have. Applied per arc, so a shallow ΔZ can leave the steep arc alone while correcting the flat one. | `releasePolicy.suppressionMissMeters` |

The panel caption is a **warning**, not a status line: on a supported map with
everything corrected it shows nothing at all. It appears only when the printed
MIL cannot be trusted —

- an arc cannot be corrected at all, because the target sits above that arc's
  apex or beyond the model's reach. The flat-table MIL beside it does not
  describe a shot that lands on the target, and the caption says so
  (*"low arc cannot reach this target"*, or *"cannot reach this target"* when
  no arc can).
- a correction was possible and material, and policy withheld it — an
  unsupported map, or the gate off (*"not corrected for height"*).

An arc skipped because its miss is under the suppression threshold is
deliberately silent: leaving it alone changed nothing, and a caption that
warns about nothing is one people stop reading.

SPG-2 `low` was withheld until 2026-08-27 on the grounds that its break-even
impact angle is 25° in research against 13° in this fit. A sweep of 1,652
(arc, range, ΔZ) cells found no case where correcting is worse than ignoring;
on the low arc, the flattest of the three, it is the difference between roughly
600 m of miss and 25 m against a model perturbed 2% in muzzle velocity.

An absent or empty `correctedMaps` corrects **nothing**. It does not fall back
to correcting every map.

The caption says which of these applies: "corrected for height", "high arc
corrected for height, low arc not", or "not corrected for height". Strings live
in `UI_TEXT` in `js/features/terrain-ballistics.js` — not in `locales/*.json`,
except `zh-cn`, which also has entries there and a wrapper in
`js/ui/locale-overrides.js` that must be kept in step.

The model in `data/ballistics/projectile-model.json` is still a vacuum fit to
our own firing tables, marked `source: "vacuum-fit"`. It is meant to be replaced
by pak extraction, not refined. See
[the design doc](superpowers/specs/2026-08-26-elevation-correction-design.md).

Regenerate both files with:

    npm run fit-ballistics
    npm run build-height-correction
