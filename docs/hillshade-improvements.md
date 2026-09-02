# Shaded relief — making it read

The shaded relief layer shipped as a plain grey hillshade: a single sun at 315° azimuth and 45° altitude, Horn slope/aspect over an 8 m grid, composited as grey-with-alpha at 50% opacity between the map tiles and the contour lines. It works, but on a screen that already carries grid lines, contour lines, range rings, the gun-to-target line and markers, it is hard to tell whether the layer is even on. This file collects the ways that could be fixed. Nothing here is committed work.

The problem is not that the shading is too weak in isolation — it is that a low-contrast grey wash is exactly the signal that loses to every high-contrast line drawn on top of it. Turning the opacity up is the obvious lever and the worst one: it mutes the satellite imagery the layer is supposed to be describing, and it makes the map muddy rather than legible.

## What tools in this genre normally do

Three conventions dominate, and they are not alternatives so much as layers of the same idea.

**Plain hillshade over imagery**, which is what shipped. Standard in web mapping because it is honest — it adds shape without adding colour that could be mistaken for data. It reads well over muted basemaps and poorly over busy satellite imagery, which is our case.

**Hypsometric tinting**, a colour ramp keyed to absolute elevation, with the hillshade multiplied over it. This is what paper topographic maps do and what the low-to-high green-to-brown-to-white convention comes from. It is by far the most legible of the three because elevation becomes colour, which the eye reads pre-attentively, rather than luminance, which it does not. Our contour layer already ramps by relative height, so a hypsometric fill would be the same signal at fill strength instead of line strength.

**Slope shading**, colouring by gradient rather than by elevation or by sun angle. Common in mountaineering and military mapping because "how steep is this" is often the actual question. For an artillery tool this is arguably the most useful of the three — dead ground, defilade and whether a vehicle can climb something are all slope questions — but it answers a different question from relief.

Multi-directional hillshade (blending two to four sun angles) is the standard refinement over single-sun shading and removes the flat, featureless faces that appear where a slope faces directly away from the light. It costs nothing at runtime because it is baked.

## Options, roughly cheapest first

**Raise contrast rather than opacity.** Apply a gamma or an S-curve to the shade value before quantising, so mid-slopes stay subtle but real slopes darken and lighten hard. Purely a change to `shadeToGreyAlpha` in `scripts/lib/hillshade.mjs` plus a re-bake. Keeps the layer honest and costs one constant.

**Lower the sun.** A 45° sun is the cartographic default and it is a compromise. Dropping to 30° or 25° lengthens shadows and exaggerates relief substantially, which is the cheapest way to make an 8 m hillshade feel three-dimensional. One CLI flag, one re-bake, no code change at all.

**Multi-directional hillshade.** Blend three or four sun azimuths — the usual recipe weights 225°, 270°, 315° and 360° — so no slope goes unlit. Moderate work in `scripts/lib/hillshade.mjs`, no client change, no size change.

**Hypsometric fill under the shading.** Colour the terrain by relative elevation using the same ramp `js/map/contours.js` already computes from `reliefMeters`, and multiply the existing hillshade over it. This is the option most likely to fix the "can't tell it's on" complaint outright, because it changes hue rather than luminance and therefore does not compete with the lines drawn on top. It needs an RGBA raster rather than grey-alpha — the PNG encoder in `scripts/lib/png.mjs` already supports RGBA, so the change is in the builder and in how the client composites, not in the encoder. Cost: the rasters get larger, and colour choice becomes a real design decision, because a green-to-red ramp on a military map competes with the meaning those colours already carry for friendly and hostile.

**Slope shading as a separate layer.** Colour by gradient with an explicit legend. This is a different feature rather than an improvement to this one, and it should be evaluated against ranked idea 17 (dead ground) and the terrain-solved range ring, which already answer specific slope questions more precisely than a colour wash would.

## Things to decide before building any of it

Whether the layer is meant to be read or merely felt. If it is meant to be read — someone looking at it to judge terrain — it needs a legend and a stated scale, and the per-map Z-exaggeration currently in the builder (`clamp(1000 / reliefMeters, 0.5, 4)`, giving Bakurani 0.9283 and Ozeti 2.6151) becomes a problem, because identical real slopes render with different apparent steepness on the two maps. `docs/height-audit.md` §3.21 records this. If it is meant to be felt — background texture that makes the map look like terrain — the exaggeration is fine and no legend is needed.

Whether it should suppress or coexist with the contour layer. Hypsometric tinting plus contour lines plus a grid plus range rings is a lot of simultaneous encoding of the same underlying quantity. It may be that hillshade and contours should be one control with three states (off, shaded, shaded with contours) rather than two independent toggles.

Whether colour is available at all. The palette is already carrying meaning: red and green for arc reachability, the contour ramp for height, marker colours for the pencil and shapes. A terrain fill that uses hue has to fit into that without colliding, which argues for a desaturated ramp rather than the saturated green-to-red the paper convention suggests.
