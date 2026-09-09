# Todo

Running list of everything asked for in this session.

## Done

- [x] Fix the `S` shortcut clashing with WASD panning — shapes moved to `G` (its original key, freed by the polygon removal)
- [x] Remove the polygon tool entirely — the `polygons` map layer stays, because it also draws the preset polygons that come from the map JSON
- [x] Remove the padding around the map
- [x] Remove the status label above the map (`SPH-2 · Bakurani · Artillery: … · Target: …`)
- [x] Remove the doubled "Preset map" label under the Map heading
- [x] Remove the doubled "Weapon type" label under the Weapon heading
- [x] Remove the Lock toggle on the artillery/target positions
- [x] Remove the "Swap points" button
- [x] Remove the azimuth hint ("Azimuth: 0° north, 90° east, …")
- [x] Remove the range hint ("The circle shows the maximum range …")
- [x] Remove the bottom bar (site footer)
- [x] Apply all of the above to the mobile shell too
- [x] Drop the locale strings left with no consumer (11 keys × 12 languages)
- [x] Remove the stale plans — `extraction-plan.md`, `docs/superpowers/plans/`, `docs/superpowers/specs/`
- [x] Keep this list
- [x] Keep the SEO metadata but clear the main screen — dropped the on-page SEO cluster, FAQ and about blocks, and the `/maps/<id>/` landing pages
- [x] Turn the low-arc terrain warning into a short bullet list of issues
- [x] Remove the Terrain 3D experimental box and option — the correction is now always on
- [x] Remove the custom map option entirely
- [x] Cut the SPH-2 level warning down, and give it a "Flat ground" button that toggles the flatness layer
- [x] Remove the padlock icons on the Artillery/Target buttons — the whole force-placement feature went with them
- [x] Remove all non-English support
- [x] Remove the top bar
- [x] Always dark mode — theme toggle, light palette and `js/ui/theme.js` all gone
- [x] Move the OBS and popout buttons into the sidebar, under Controls
- [x] Put the copy/paste controls to the right of the X/Y inputs as icons
- [x] Point the README and `CNAME` at this fork — https://wardogs-map.olm.pet/, a short "what it is" opener, an honest list of what the fork deleted, and a docs index that matches the files on disk
- [x] Align the map panel stack with the toolbar (both 14 px from the edge; the old 46 px bottom cleared a legend that no longer renders) and make the whole header of the saved targets, guns, cross-section and target-area panels the fold/expand target
- [x] Trim the saved-target card — dropped the ΔX/ΔY line under the metric cards, and moved the reach checkmark out of the name row to sit under the number badge
- [x] Remove import/export entirely — the per-target export button, Export all / Import in Saved targets, the Import / Export map tool with its popover, `js/core/file-transfer.js`, and every string and style behind them
- [x] Set `TILE_FALLBACK_BASE_URL` to upstream's public asset origin in `.env` and on the Pages project, so Zestafona draws from tiles our own bucket does not have
- [x] Reshape the firing solution — distance and azimuth on the top row, a MIL row underneath with a card per arc (value carries the unit, `160 mil`), turning red when that arc has no solution or the shot assessment rejects it: the same `shot.arcs` verdicts the terrain note bullets come from, so a "Low arc: too close" bullet always has a red LOW ARC card beside it; dropped the km sub-line under the distance; the mobile shell keeps its single MIL value
- [x] Add a zoomed-in minimap of the target area above the cross-section — square, 180 m across, its own layer toggle, tiles reused from the pyramid the map already loads
- [x] Make every tool button turn its tool off on a second click — the menu-backed ones (pencil, shapes, markers, coordinate search, layers, shared session, zones) only did that while their popover happened to be open
- [x] Redo the zone tool as a drag across the area — press and release both sit on the circle, the centre is the midpoint, so nothing has to be guessed before there is a circle on screen to judge
- [x] Give tiles a second host — `TILE_FALLBACK_BASE_URL` writes `tiles.fallbackPath` into the built maps and `loadTile()` retries there, so a map our bucket is missing comes from upstream's public asset origin instead of failing
- [x] Turn the firing positions layer into the go-to spots — a canopy raster baked from the map tiles (`npm run build-canopy`, dark and rough pixels are trees) refuses cells inside woodland and stands thick woods 30 m tall in the clearance march; the tilt cap drops from 8 to 4 degrees; the low arc asks for a flat lane to all but one tower centre instead of every ring point, which had left Bakurani with nothing; survivors are trimmed to 24 m blocks; the outline is neon green

## Next

- [ ] Decide what the built pages should claim as their own URL. `CNAME` is ours now, but the canonical link, `og:url`, hreflang, `sitemap.xml`, `robots.txt` and the OBS docs still name `wardogs-artillery.com` — baked in at `scripts/build-pages.mjs:401`, `:499`, `:682` and `scripts/version-assets.mjs:32`. As it stands the deployed site tells search engines that upstream is the real page.

## Ideas

- [ ] Buildings read as perfect parking. The landscape under a house is stamped flat and the chunks know nothing about what stands on it. The tiles show buildings only as faint pale rectangles, so the tree detector cannot see them; a better signal is the stamp itself, since natural ground at 2 m always has some roughness and a platform fits a plane with near zero residual. Probe from the chunks alone, without tiles, and it would catch yards and roads too.
- [ ] A brush on the map to paint out ground the canopy raster gets wrong, with the painted cells committed next to it and subtracted by the bake.

## Blocked

- [ ] Regenerate the Terrain 3D data for Zestafona. The 256 source chunks were recovered on 2026-09-09 from the parent of upstream's "move terrain data to r2" commit, which had deleted them from git, and every one matches its manifest hash. They sit untracked under `data/terrain/zestafona/chunks/`, 134 MB. Still to do: decide whether to commit them the way Bakurani's are, then run heightfield, hillshade, flatness, contours, canopy (after fetching its tiles) and firing positions, and add the map to the raster map lists.

## Bigger direction, not started

- [ ] Strip the donation links (`js/ui/footer.js` is now donation-only, still used by the mobile side menu)
