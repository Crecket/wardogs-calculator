export const MAP_LANDING_PAGES = [
    {
        id: 'bakurani',
        name: 'Bakurani',
        title: 'WARDOGS Bakurani Map | Interactive Artillery Planner',
        description: 'Open the WARDOGS Bakurani interactive map for L81 Mortar and SPH-2 planning, calibrated coordinates, Terrain3D, contours and map tools.',
        imageAlt: 'WARDOGS Bakurani interactive artillery map and firing planner',
        heading: 'WARDOGS Bakurani Interactive Map',
        lead: 'Plan artillery positions, targets and squad annotations on the calibrated Bakurani map in WARDOGS Artillery Calculator. The map, firing solution and tactical tools stay in one browser workspace.',
        highlights: [
            'Calibrated Bakurani game-coordinate mapping',
            'L81 Mortar and SPH-2 firing solutions',
            'Optional Terrain3D context and terrain contours'
        ],
        sections: [
            {
                id: 'bakurani-tactical-map',
                heading: 'Bakurani Interactive Tactical Map',
                paragraphs: [
                    'The Bakurani page opens the existing WARDOGS calculator with Bakurani already selected. Its tiled map is calibrated to the application\'s game-coordinate space, so artillery points, targets, coordinate search, saved targets and map annotations use the same reference.',
                    'Use the direct map link when you need a clean Bakurani starting point. The landing page itself stays lightweight; map tiles and calculation code load only after you open the calculator.'
                ]
            },
            {
                id: 'bakurani-artillery-planning',
                heading: 'Artillery Planning on Bakurani',
                paragraphs: [
                    'Place an artillery position and a target by clicking the map or by entering coordinates. The calculator reports distance and azimuth, then shows the firing-table result for the selected weapon. Range status helps identify whether the current target is supported by that weapon.',
                    'Saved targets can retain firing information for later use. The ruler and coordinate search provide separate ways to check a position before committing a marker or firing solution.'
                ]
            },
            {
                id: 'bakurani-weapons',
                heading: 'L81 Mortar and SPH-2',
                paragraphs: [
                    'For L81 Mortar, the calculator uses the configured firing table to return a MIL value with distance, azimuth and range status. For SPH-2, it evaluates the available LOW and HIGH firing solutions independently.'
                ]
            },
            {
                id: 'bakurani-terrain3d',
                heading: 'Terrain3D on Bakurani',
                paragraphs: [
                    'Bakurani includes terrain contour data and Terrain3D elevation coverage. Experimental Terrain3D correction for SPH-2 is opt-in and off by default. The normal firing-table value remains visible for comparison.',
                    'A Terrain3D candidate is applied only when the resolver classifies it as SAFE. Uncertain, unsupported or unreachable cases fall back to the normal firing table, and platform or chassis tilt is not corrected.'
                ]
            },
            {
                id: 'bakurani-map-tools',
                heading: 'Bakurani Map Tools',
                paragraphs: [
                    'Use the ruler for measurements, Pencil for freehand notes, Zone and Polygon for areas, Markers for tactical symbols, and Eraser plus Undo or Redo to revise the shared plan. Persistent Map Tools data can also be imported or exported.',
                    'These tools are part of the main calculator rather than a second map application, so the same controls work on desktop and mobile.'
                ]
            }
        ],
        faq: [
            {
                question: 'How do I open Bakurani directly in the calculator?',
                answer: 'Use the Open Bakurani Interactive Map button. It passes a validated map selection to the existing calculator, which opens with Bakurani selected.'
            },
            {
                question: 'Does the Bakurani map support L81 Mortar and SPH-2?',
                answer: 'Yes. The same Bakurani workspace supports L81 Mortar firing-table results and SPH-2 LOW and HIGH solutions.'
            },
            {
                question: 'Is Terrain3D required for Bakurani calculations?',
                answer: 'No. Terrain3D correction is experimental, optional and off by default. The standard firing table remains available and is used as the fallback.'
            }
        ]
    },
    {
        id: 'ozeti',
        name: 'Ozeti',
        title: 'WARDOGS Ozeti Map | Tactical Artillery Calculator',
        description: 'Use the WARDOGS Ozeti interactive map for calibrated L81 Mortar and SPH-2 planning, coordinate search, Terrain3D and tactical tools.',
        imageAlt: 'WARDOGS Ozeti tactical map with artillery planning tools',
        heading: 'WARDOGS Ozeti Interactive Map',
        lead: 'Work from Ozeti\'s calibrated coordinate alignment, calculate L81 Mortar or SPH-2 solutions, and keep tactical annotations connected to the same map reference.',
        highlights: [
            'Corrected Ozeti playable-area alignment',
            'Coordinate search, ruler and saved targets',
            'Terrain contours and opt-in Terrain3D support'
        ],
        sections: [
            {
                id: 'ozeti-tactical-map',
                heading: 'Ozeti Tactical Map with Calibrated Coordinates',
                paragraphs: [
                    'The Ozeti map uses calibrated WARDOGS coordinates and corrected playable-area alignment. The image, grid, coordinate search and point placement therefore operate in one consistent space rather than as an unreferenced map image.',
                    'Opening this page\'s CTA selects Ozeti in the main calculator. The guide does not preload map imagery or the canvas engine, which keeps the search page fast before you begin planning.'
                ]
            },
            {
                id: 'ozeti-artillery-planning',
                heading: 'Coordinate-Based Artillery Planning on Ozeti',
                paragraphs: [
                    'Enter known coordinates or place the artillery and target visually. The result panel calculates distance, azimuth, coordinate deltas and the relevant MIL solution. You can lock a point while adjusting the other, then save useful targets with their firing summary.',
                    'Coordinate search can move the view to a specific location without changing the firing solution. The ruler is available when you want a map measurement that is independent of the active artillery and target pair.'
                ]
            },
            {
                id: 'ozeti-weapons',
                heading: 'Ozeti L81 Mortar and SPH-2 Solutions',
                paragraphs: [
                    'Select L81 Mortar for its configured firing-table MIL value and range status. Select SPH-2 to see the supported LOW and HIGH arcs alongside distance and azimuth.',
                    'The calculator does not turn the Ozeti landing page into a weapon database. It opens the same maintained firing workflow used by every supported map, avoiding duplicated ballistic logic.'
                ]
            },
            {
                id: 'ozeti-terrain3d',
                heading: 'Ozeti Terrain Contours and Terrain3D',
                paragraphs: [
                    'Ozeti has a toggleable contour layer and Terrain3D elevation data for supported SPH-2 previews. Terrain3D correction must be enabled manually and the ordinary firing table remains the default.',
                    'LOW and HIGH candidates are checked separately. Only a SAFE candidate can replace its displayed table result; otherwise the application retains the normal value. Vehicle and platform tilt remain outside the correction model.'
                ]
            },
            {
                id: 'ozeti-map-tools',
                heading: 'Map Tools for an Ozeti Plan',
                paragraphs: [
                    'Sketch routes with Pencil, outline an area with Zone or Polygon, place configured tactical markers, measure with the ruler and remove annotations with Eraser. Undo and Redo are available for map-tool changes.',
                    'Map-tool data can be exported for a recovery or handoff workflow. Saved firing targets use their own import and export controls, keeping calculation records distinct from drawing geometry.'
                ]
            }
        ],
        faq: [
            {
                question: 'Is this a standalone Ozeti calculator?',
                answer: 'No. It is a lightweight Ozeti guide and direct entry point to the existing WARDOGS Artillery Calculator, so calculations are maintained in one application.'
            },
            {
                question: 'Can I search Ozeti by coordinates?',
                answer: 'Yes. The calculator includes coordinate search as well as direct artillery and target coordinate inputs on the calibrated Ozeti map.'
            },
            {
                question: 'Does Ozeti include terrain elevation support?',
                answer: 'Yes. Ozeti provides terrain contours and Terrain3D coverage, but experimental SPH-2 correction is opt-in and falls back to the normal firing table unless a candidate is SAFE.'
            }
        ]
    },
    {
        id: 'zestafona',
        name: 'Zestafona',
        title: 'WARDOGS Zestafona Map | Live Tactical Map Planner',
        description: 'Open the WARDOGS Zestafona interactive map with calibrated artillery planning, L81 Mortar and SPH-2 solutions, Terrain3D and map tools.',
        imageAlt: 'WARDOGS Zestafona live tactical map and artillery calculator',
        heading: 'WARDOGS Zestafona Interactive Map',
        lead: 'Start a Zestafona artillery plan from a direct URL, then combine calibrated point placement, firing calculations and collaborative map tools in the main WARDOGS calculator.',
        highlights: [
            'Multi-resolution Zestafona map tiles',
            'Calibrated artillery and target placement',
            'SPH-2 Terrain3D preview with safe fallback'
        ],
        sections: [
            {
                id: 'zestafona-interactive-map',
                heading: 'Zestafona Interactive Map',
                paragraphs: [
                    'Zestafona is available as a calibrated preset in WARDOGS Artillery Calculator. Its multi-resolution tile set supports close inspection while the grid, point inputs and coordinate search continue to use the configured game-coordinate mapping.',
                    'The Open Zestafona Interactive Map action loads the established calculator with this preset selected. Until that action, this HTML page loads neither tiles nor the map engine.'
                ]
            },
            {
                id: 'zestafona-artillery-planning',
                heading: 'Build a Zestafona Firing Plan',
                paragraphs: [
                    'Set the artillery point, choose a target and read distance, azimuth, MIL and coordinate deltas from the result panel. Positions may be placed on the map or entered directly, and locks let one point stay fixed while the other is changed.',
                    'Saved targets preserve useful firing summaries for later restoration. They can include the associated artillery position when needed, and can be imported or exported separately from tactical drawings.'
                ]
            },
            {
                id: 'zestafona-weapons',
                heading: 'L81 Mortar and SPH-2 on Zestafona',
                paragraphs: [
                    'The L81 Mortar workflow reports the configured firing-table MIL value and whether the current target is within its supported range. SPH-2 planning exposes available LOW and HIGH solutions rather than collapsing them into one result.',
                    'Changing to Zestafona affects the map reference, not the calculator\'s ballistic implementation. The direct landing URL therefore adds a useful map entry point without cloning calculation code.'
                ]
            },
            {
                id: 'zestafona-terrain3d',
                heading: 'Terrain3D Context for Zestafona',
                paragraphs: [
                    'The Zestafona workspace includes a terrain contour overlay and Terrain3D elevation coverage. Experimental SPH-2 correction is disabled by default and is designed to be compared with the standard firing-table output.',
                    'The resolver applies only candidates marked SAFE and evaluates LOW and HIGH arcs independently. Missing, uncertain, unsupported or unreachable terrain results use the normal table, while chassis or platform tilt is not modelled.'
                ]
            },
            {
                id: 'zestafona-map-tools',
                heading: 'Draw, Measure and Mark Zestafona',
                paragraphs: [
                    'The tool palette includes Ruler, Pencil, Zone, Polygon, Markers and Eraser, with Undo and Redo for map changes. These tools support a quick personal sketch.',
                    'Layer controls can show terrain contours and other available overlays. Import and export options provide a portable copy of map-tool data without embedding those annotations into this landing page.'
                ]
            }
        ],
        faq: [
            {
                question: 'How can I launch the Zestafona map directly?',
                answer: 'Select Open Zestafona Interactive Map. The link opens the main calculator with a validated Zestafona map parameter and then stores the selected preset normally.'
            },
            {
                question: 'Which artillery weapons are available on Zestafona?',
                answer: 'The calculator supports L81 Mortar firing-table results and SPH-2 LOW and HIGH solutions on Zestafona.'
            },
            {
                question: 'Can I draw zones and polygons on Zestafona?',
                answer: 'Yes. Zone and Polygon are available with Pencil, Ruler, Markers, Eraser, Undo and Redo in the main map-tool palette.'
            }
        ]
    }
];

export const MAP_LANDING_PAGES_BY_ID =
    Object.fromEntries(
        MAP_LANDING_PAGES.map(page => [page.id, page])
    );

export const SITE_ORIGIN =
    'https://wardogs-artillery.com';

export function mapLandingUrl(id) {
    return `${SITE_ORIGIN}/maps/${id}/`;
}

function escapeHtml(value) {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
}

function renderParagraphs(paragraphs) {
    return paragraphs
        .map(paragraph => `<p>${escapeHtml(paragraph)}</p>`)
        .join('\n');
}

function renderSections(sections) {
    return sections
        .map(section => [
            `<section aria-labelledby="${escapeHtml(section.id)}" class="map-guide-section">`,
            `<h2 id="${escapeHtml(section.id)}">${escapeHtml(section.heading)}</h2>`,
            renderParagraphs(section.paragraphs),
            '</section>'
        ].join('\n'))
        .join('\n');
}

function renderHighlights(items) {
    return items
        .map(item => `<li>${escapeHtml(item)}</li>`)
        .join('\n');
}

function renderFaq(items) {
    return items
        .map(item => [
            '<details class="map-faq-item">',
            `<summary>${escapeHtml(item.question)}</summary>`,
            `<p>${escapeHtml(item.answer)}</p>`,
            '</details>'
        ].join('\n'))
        .join('\n');
}

function renderRelatedMaps(currentId) {
    return MAP_LANDING_PAGES
        .filter(page => page.id !== currentId)
        .map(page => (
            `<a href="maps/${escapeHtml(page.id)}/">${escapeHtml(page.name)} Interactive Map</a>`
        ))
        .join('\n');
}

function structuredData(page) {
    const url = mapLandingUrl(page.id);

    return JSON.stringify({
        '@context': 'https://schema.org',
        '@graph': [
            {
                '@type': 'WebPage',
                '@id': `${url}#webpage`,
                url,
                name: page.title,
                description: page.description,
                inLanguage: 'en',
                isPartOf: {
                    '@type': 'WebApplication',
                    name: 'WARDOGS Artillery Calculator',
                    url: `${SITE_ORIGIN}/`,
                    applicationCategory: 'GameApplication',
                    operatingSystem: 'Any'
                }
            },
            {
                '@type': 'BreadcrumbList',
                itemListElement: [
                    {
                        '@type': 'ListItem',
                        position: 1,
                        name: 'WARDOGS Artillery Calculator',
                        item: `${SITE_ORIGIN}/`
                    },
                    {
                        '@type': 'ListItem',
                        position: 2,
                        name: `${page.name} Interactive Map`,
                        item: url
                    }
                ]
            }
        ]
    }, null, 2).replaceAll('<', '\\u003c');
}

export function renderMapLandingPage(template, page) {
    const replacements = {
        '{{TITLE}}': escapeHtml(page.title),
        '{{DESCRIPTION}}': escapeHtml(page.description),
        '{{CANONICAL}}': escapeHtml(mapLandingUrl(page.id)),
        '{{IMAGE_ALT}}': escapeHtml(page.imageAlt),
        '{{MAP_NAME}}': escapeHtml(page.name),
        '{{MAP_ID}}': escapeHtml(page.id),
        '{{H1}}': escapeHtml(page.heading),
        '{{LEAD}}': escapeHtml(page.lead),
        '{{HIGHLIGHTS}}': renderHighlights(page.highlights),
        '{{SECTIONS}}': renderSections(page.sections),
        '{{FAQ}}': renderFaq(page.faq),
        '{{RELATED_MAPS}}': renderRelatedMaps(page.id),
        '{{JSON_LD}}': structuredData(page)
    };

    let html = template;

    for (const [placeholder, value] of Object.entries(replacements)) {
        html = html.replaceAll(placeholder, value);
    }

    return html;
}
