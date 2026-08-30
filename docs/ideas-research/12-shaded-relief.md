# Research — idea 12, shaded relief under the contour layer

**TL;DR** — Idea 3 shipped contours as vector paths, which is the right architecture and beats what wardogs.zone does. What they have that we don't is *shading*: their topo layer is hillshade and contours baked into one raster, and the shading is most of why it reads as terrain rather than as a wiring diagram. We can add hillshade from the chunk data already in `data/terrain/`, at 2 m native spacing against their 8 m, and keep our contours vector on top. New build script, no new data source, no change to the datum rules.

Backing notes for [ideas.md](ideas.md) § 12. Nothing here is committed work.

This came out of looking at how wardogs.zone renders Kavkazi, after the question "do they have validated main zone areas". They don't publish provenance for anything, but the client bundle is legible and the assets are public, so the comparison below is measured rather than guessed.

---

## What they actually do

Three fields hang off a `terrain` object in their map bundle:

| Field | Value | Role |
| --- | --- | --- |
| `terrain.relief` | `/game/maps/relief/kavkazi.webp` | Drawn as one `<image>` over the map at 0.8 opacity, toggled by the TOPO button |
| `terrain.height` | `/game/maps/height/kavkazi.webp` | Fetched separately, decoded once, cached by URL; never displayed |
| `terrain.contourM` | `10` | Only appears in the UI hint, "Elevation shading and 10 m contours" |

The relief asset is 2048 × 2048, lossless WebP (`VP8L`), 1.6 MB, stretched to the full map extent. Their map is 16.3 km on a side, so the relief is **8 m/px**. Hillshade and contour lines are the same pixels — there is no contour geometry anywhere in their render path, and the TOPO button does nothing but show and hide that one image.

The height asset is a separate lossless WebP with elevation packed into channels, decoded client-side. That is what lets their board read terrain under both markers with no server round-trip, the same job our chunks and heightfield do.

Consequences of baking, all of which we avoid by staying vector: the interval is frozen at 10 m for every map regardless of how much relief it has, the lines soften as soon as you zoom past 1:1, and restyling means regenerating and reshipping the asset.

## Where we already stand

`data/terrain/<map>/manifest.json` is the game's own Terrain3D data, `evidence: VERIFIED`, at **2 m vertex spacing** — 16 × 16 chunks of 511 vertices, 8176 samples per side across 16.35 km. Their 2048² relief is a 4× downsample of the same terrain. We are not behind them on data; we are ahead of them by a factor of four, and we have been since idea 3 landed.

We also already have both derived products: `contours.json` as vector paths, and `heightfield.bin` as u16 at 32 m for the range ring. What is missing is purely a *visual* layer.

## The proposal

A `scripts/build-hillshade.mjs` beside `build-heightfield.mjs`, reading the same chunks through `lib/terrain-source.mjs` and emitting a lossless WebP per map. Contours keep being drawn as vector paths over it.

At 4096² we would be at 4 m/px — twice their detail — and hillshade is smooth enough that it should compress to roughly their 1.6 MB anyway. 8192² at full native 2 m is worth measuring before ruling out, but is likely more bytes than the layer is worth.

The result is strictly better than theirs on every axis we care about: shaded relief *and* crisp lines at any zoom, with the interval still ours to choose per map.

### The datum is not a problem here

`docs/terrain.md` is firm that decoded heights are not altitudes and no absolute height should ever be displayed. Hillshade is a slope calculation over a local neighbourhood, so it consumes only differences, and differences are the part the doc says is trustworthy — chunk seams agree to 0.21 m. The offset cancels before it reaches a pixel. Nothing about this layer displays or implies an altitude.

### Z-exaggeration has to be per-map

Bakurani spans 1077 m of relief (−1006.5 to +70.7). Ozeti spans about 388 m. One fixed exaggeration constant will flatten Ozeti into mush or blow Bakurani's slopes into black. This belongs in the manifest next to the other per-map facts, not as a constant in the script.

### Open questions before writing it

Sun azimuth and altitude — conventional cartographic default is 315° at 45°, but the game's own lighting may make a different azimuth read more naturally against the tile map underneath.

How the shading composites with the existing contour colors and with the tile map. Their 0.8 opacity over the base map is a reasonable starting point to test against, not a number to copy on faith.

Whether the layer stays opt-in like contours, or whether shading is quiet enough to leave on. Their TOPO button suggests opt-in; our contour layer is already opt-in for the same reason.

## What this is not

Not a reason to touch their assets. Everything above is reproducible from data already in this repo, and our source is the better one — copying their WebP would inherit their 10 m interval and their styling permanently, for a quarter of the resolution we already hold.
