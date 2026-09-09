export const SEO_PAGE_CONTENT = {
    en: {
        title: 'WARDOGS Artillery Calculator | L81 Mortar, SPH-2 & Maps',
        description: 'Free WARDOGS L81 Mortar and SPH-2 artillery calculator with Bakurani, Ozeti and Zestafona maps, Terrain3D MIL correction and tactical tools.',
        heading: 'About this calculator',
        intro: 'WARDOGS Artillery Calculator is a free, open-source community tool for L81 Mortar and SPH-2 firing solutions. It includes interactive tactical maps for Bakurani, Ozeti and Zestafona, coordinate-based targeting, distance, azimuth and MIL calculations, terrain contours, and experimental Terrain3D MIL correction for SPH-2 where supported.',
        usage: 'Select a map and weapon, place the artillery and target positions, then read the firing solution. Experimental Terrain3D correction is opt-in and off by default; only SAFE SPH-2 candidates are applied, while uncertain or unsupported cases automatically use the normal firing table. Platform and chassis tilt correction is not enabled.',
        features: [
            'WARDOGS L81 Mortar calculator and firing solutions',
            'SPH-2 LOW and HIGH firing solutions',
            'Experimental Terrain3D MIL correction for SPH-2',
            'Bakurani interactive tactical map with terrain contours',
            'Ozeti tactical map with terrain contours',
            'Zestafona interactive tactical map with terrain contours',
            'Saved target firing summaries',
            'Ruler and drawing tools',
            'Tactical map markers'
        ],
        cluster: {
            heading: 'WARDOGS Artillery Calculator',
            navLabel: 'Calculator and map guide',
            intro: 'WARDOGS Artillery Calculator is a free, open-source community tool for calculating distance, azimuth and MIL from manually placed artillery and target positions. Players looking for a quick WARDOGS arty calc can use the same interface for L81 Mortar and SPH-2 while keeping firing solutions, saved targets and tactical planning tools on the map.',
            sections: [
                {
                    id: 'wardogs-mortar-calculator',
                    heading: 'WARDOGS L81 Mortar Calculator',
                    body: 'Choose L81 Mortar, place the L81 Mortar and target on the map, and the calculator returns distance, azimuth and the firing-table MIL value. Range status shows whether the selected target is inside the supported L81 Mortar range.'
                },
                {
                    id: 'wardogs-sph-2-calculator',
                    heading: 'WARDOGS SPH-2 Calculator',
                    body: 'Choose SPH-2 to calculate distance, azimuth and the available LOW/HIGH firing-table solutions. On maps with Terrain3D data, the app shows elevation context and the height difference (ΔZ) between the artillery and target, and on supported maps it applies that height difference to the MIL on both arcs. The correction is zero on flat ground, so the firing tables stand unchanged there. Vehicle-tilt correction is not enabled.'
                },
                {
                    id: 'bakurani-interactive-map',
                    href: 'maps/bakurani/',
                    heading: 'Bakurani Interactive Map',
                    body: 'The Bakurani interactive map is calibrated to WARDOGS coordinates so artillery positions, targets, saved targets, the ruler, drawings and tactical markers share the same map space. Terrain3D elevation context is available where supported, and Bakurani is a height-corrected map: the height difference between the artillery and the target is applied to the firing-table MIL automatically.'
                },
                {
                    id: 'ozeti-interactive-map',
                    href: 'maps/ozeti/',
                    heading: 'Ozeti Interactive Map',
                    body: 'The Ozeti interactive map uses calibrated WARDOGS coordinates and the corrected playable-area alignment for artillery and tactical planning. Artillery positions, targets, saved targets, the ruler, drawings and markers all use the same coordinate space. Terrain3D elevation and height-difference context is available on supported Ozeti terrain, but Ozeti is not a height-corrected map yet: its coordinate alignment has not been validated to the standard a numeric MIL correction needs, so the firing-table MIL is left alone.'
                },
                {
                    id: 'zestafona-interactive-map',
                    href: 'maps/zestafona/',
                    heading: 'Zestafona Interactive Map',
                    body: 'The Zestafona interactive map uses calibrated WARDOGS coordinates for artillery placement, targets and tactical planning. Multi-resolution map tiles, saved targets, the ruler, drawings, markers, terrain contours and Terrain3D elevation context are available in the same workspace.'
                },
                {
                    id: 'how-to-use',
                    heading: 'How to use',
                    body: 'Select Bakurani, Ozeti, Zestafona or a custom map, choose L81 Mortar or SPH-2, place the artillery position and target, then read distance, azimuth and MIL. For SPH-2 on supported maps, experimental Terrain3D correction can be enabled manually to compare a SAFE terrain-adjusted candidate with the normal firing-table value.'
                }
            ]
        },
        faq: [
            {
                question: 'Does the calculator support the WARDOGS L81 Mortar?',
                answer: 'Yes. Select L81 Mortar, place the L81 Mortar and target positions, and the calculator provides distance, azimuth, range status and the firing-table MIL value.'
            },
            {
                question: 'Does WARDOGS Artillery Calculator support SPH-2?',
                answer: 'Yes. SPH-2 support includes distance, azimuth, LOW/HIGH firing solutions and optional experimental Terrain3D MIL correction on supported terrain.'
            },
            {
                question: 'Which WARDOGS maps are available?',
                answer: 'The calculator includes interactive maps for Bakurani, Ozeti and Zestafona, plus a custom-map mode. All three preset maps use calibrated game-coordinate mapping, support tactical map tools and terrain contour layers, and provide Terrain3D elevation data where coverage is available.'
            },
            {
                question: 'Does Terrain3D automatically correct SPH-2 MIL for terrain or vehicle tilt?',
                answer: 'For terrain height, yes. On supported maps — currently Bakurani — the height difference (ΔZ) between the artillery and the target is applied to the MIL automatically, on the mortar and on both SPH-2 arcs. It is a differential, so it is zero on flat ground and the shipped firing tables stand there unchanged, and the panel says so whenever an arc cannot be corrected or the map is not supported. Vehicle tilt is not corrected, so the SPH-2 still has to be levelled before firing.'
            },
            {
                question: 'Does the WARDOGS map show terrain contours?',
                answer: 'Yes. Terrain contour layers are available on supported WARDOGS maps and can be toggled from the Layers menu together with other tactical overlays.'
            }
        ]
    }
};

export const SEO_ALTERNATE_NAMES = [
    'WARDOGS Artillery Calculator & Tactical Map',
    'WARDOGS Arty Calc',
    'WARDOGS L81 Mortar Calculator'
];
