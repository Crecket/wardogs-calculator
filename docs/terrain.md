## Terrain Elevation & SPH-2 Setup

Terrain elevation is optional map data used to provide vertical context for artillery calculations. It is separate from the visible tile map and from the weapon firing tables.

The first supported terrain dataset is **Bakurani**.

---

## What the Terrain3D feature does

When Bakurani is selected and valid terrain data is available, the calculator samples terrain elevation at:

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

### v1.6.0 release behavior

Terrain3D is informational in v1.6.0.

```text
Distance -> normal coordinate calculation
Azimuth  -> normal coordinate calculation
MIL      -> existing weapon firing table
ΔZ       -> Terrain3D elevation context
```

Automatic terrain or vehicle-attitude MIL correction is **not enabled** in this release.

---

## Data layout

Bakurani elevation resources are stored under:

```text
data/terrain/bakurani/
├── manifest.json
└── chunks/
    ├── ...
    └── *.bin
```

`manifest.json` describes the terrain grid, chunk coverage, coordinate mapping, elevation conversion, and integrity metadata used by the runtime and release verifier.

The binary terrain chunks contain only elevation samples. They are not map-image tiles and should not be placed under `maps/tiles/`.

---

## Runtime loading

Terrain data is loaded on demand.

For each firing solution, the runtime:

1. Checks whether the current map has a supported terrain dataset.
2. Resolves the Artillery and Target coordinates to terrain chunks.
3. Loads missing chunks with `fetch()`.
4. Caches loaded chunks for later samples.
5. Samples Artillery and Target elevation.
6. Computes and displays ΔZ.

Only the chunks needed by the current positions have to be decoded by the browser.

The feature runtime lives in:

```text
js/features/terrain-ballistics.js
```

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

## Validation

Before a terrain-enabled release, run:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File .\scripts\verify-terrain-release.ps1
```

The release verifier checks the installed Bakurani terrain dataset and release safety invariants, including:

- terrain manifest present
- expected terrain chunks present
- chunk SHA-256 integrity
- release metadata
- automatic MIL correction disabled

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

A future map can add its own dataset under:

```text
data/terrain/<map-id>/
```

The implementation should define:

- supported coordinate coverage
- chunk layout and resolution
- coordinate-to-terrain mapping
- elevation decoding rules
- integrity metadata

Maps without a terrain dataset require no changes and continue to use the existing calculator behavior.

---

## Release boundary

Terrain3D extraction and display are separate from ballistic compensation.

A terrain dataset can be considered valid for elevation display without implying that an automatic firing correction is valid. Vehicle pose, suspension, chassis attitude, and final barrel transform may affect real firing elevation independently of map terrain height.

For that reason, v1.6.0 exposes verified elevation context while keeping the existing firing tables authoritative.
