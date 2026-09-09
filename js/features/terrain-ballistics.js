/* =========================
   TERRAIN BALLISTICS
   ========================= */

(() => {
    'use strict';

    const CONFIG_URL =
        'data/ballistics/terrain-context.json';

    const DEFAULT_SUPPRESSION_MISS_METERS = 10;

    const state = {
        initialized: false,
        enabled: false,
        config: null,
        terrains: new Map(),
        rerenderQueued: false,
        lastWarning: null,
        confirmedOrigin: null,
        levelControl: null,
        correctionEnabled: false,
        correctedMaps: new Set(),
        suppressionMissMeters: DEFAULT_SUPPRESSION_MISS_METERS,
        correction: null
    };

    function terrainLog(...args) {
        console.info('[terrain-ballistics]', ...args);
    }

    function terrainWarn(message, error = null) {
        const signature = `${message}:${error?.message || ''}`;

        if (state.lastWarning === signature) {
            return;
        }

        state.lastWarning = signature;

        if (error) {
            console.warn('[terrain-ballistics]', message, error);
        } else {
            console.warn('[terrain-ballistics]', message);
        }
    }

    const UI_TEXT = {
        en: {
            warningTitle: 'Level the SPH-2 before firing',
            warningBody: 'Tilt changes range. Park on flat ground, then centre the two side markers under STABILIZED / ASL in the gunner HUD. Uphill and downhill count too.',
            flatLayer: 'Flat ground',
            flatLayerHint: 'Show where the ground is flat enough to park the SPH-2'
        }
    };

    function uiText() {
        return UI_TEXT.en;
    }

    function installWarningStyle() {
        if (document.getElementById('sphLevelWarningStyle')) {
            return;
        }

        const style = document.createElement('style');
        style.id = 'sphLevelWarningStyle';
        style.textContent = `
            .sph-level-warning {
                margin-top: 9px;
                padding: 7px 9px;
                border: 1px solid color-mix(in srgb, #f0b24a 55%, var(--border-light, #424a50));
                border-left: 3px solid #f0b24a;
                border-radius: 6px;
                background: color-mix(in srgb, #f0b24a 9%, var(--panel-bg, #171b1f));
            }

            .sph-level-warning[hidden] {
                display: none !important;
            }

            .sph-level-warning-title {
                display: flex;
                align-items: center;
                gap: 6px;
                color: #f0b24a;
                font-size: 10px;
                font-weight: 700;
                line-height: 1.3;
            }

            .sph-level-warning-icon {
                flex: 0 0 auto;
                font-size: 12px;
                line-height: 1;
            }

            .sph-level-warning-body {
                margin-top: 5px;
                color: var(--muted, #9aa4ae);
                font-size: 10px;
                line-height: 1.45;
            }

            .sph-level-warning-copy {
                margin: 0;
            }

            .sph-level-warning-actions {
                margin-top: 6px;
                display: flex;
            }

            button.sph-level-warning-layer {
                width: auto;
                min-height: 0;
                margin: 0;
                padding: 3px 7px;
                border: 1px solid var(--border, #2b3238);
                border-radius: 5px;
                background: none;
                color: var(--muted, #9aa4ae);
                font-size: 9px;
                font-weight: 600;
                cursor: pointer;
            }

            button.sph-level-warning-layer[aria-pressed="true"] {
                border-color: #f0b24a;
                color: #f0b24a;
            }

            body:not(.mobile-app) button.sph-level-warning-title {
                width: 100%;
                min-height: 0;
                margin: 0;
                padding: 0;
                border: 0;
                border-radius: 0;
                background: none;
                text-align: left;
                cursor: pointer;
            }

            body:not(.mobile-app)
            .sph-level-warning:not(.is-open)
            .sph-level-warning-body {
                display: none;
            }

            .sph-level-warning-caret {
                margin-left: auto;
                flex: 0 0 auto;
                font-size: 10px;
                line-height: 1;
                transition: transform .15s ease;
            }

            .sph-level-warning.is-open .sph-level-warning-caret {
                transform: rotate(180deg);
            }
        `;
        document.head.appendChild(style);
    }

    function ensureSphLevelWarning() {
        let root = $('sphLevelWarning');

        if (root) {
            return root;
        }

        const isMobile =
            document.body.classList.contains(
                'mobile-app'
            );

        const resultCard =
            isMobile
                ? $q(
                    '.mobile-result-details'
                )
                : $q(
                    '.solution-result'
                );

        const fallbackCard =
            resultCard ||
            $q(
                '.mobile-result-details'
            ) ||
            $q(
                '.solution-result'
            );

        if (!fallbackCard) {
            return null;
        }

        installWarningStyle();

        root = document.createElement('div');
        root.id = 'sphLevelWarning';
        root.className = 'sph-level-warning';
        root.setAttribute('role', 'note');

        const title = document.createElement(
            isMobile ? 'div' : 'button'
        );

        title.className = 'sph-level-warning-title';

        if (!isMobile) {
            title.type = 'button';
            title.setAttribute('aria-expanded', 'false');
        }

        const icon = document.createElement('span');
        icon.className = 'sph-level-warning-icon';
        icon.setAttribute('aria-hidden', 'true');
        icon.textContent = '⚠';

        const titleText = document.createElement('span');
        titleText.className = 'sph-level-warning-title-text';

        const body = document.createElement('div');
        body.className = 'sph-level-warning-body';

        const copy = document.createElement('p');
        copy.className = 'sph-level-warning-copy';
        body.append(copy);

        title.append(icon, titleText);

        if (!isMobile) {

            const caret = document.createElement('span');

            caret.className = 'sph-level-warning-caret';
            caret.setAttribute('aria-hidden', 'true');
            caret.textContent = '▾';

            title.append(caret);

            title.addEventListener('click', () => {

                const open =
                    root.classList.toggle('is-open');

                title.setAttribute(
                    'aria-expanded',
                    String(open)
                );
            });
        }

        const actions = document.createElement('div');
        actions.className = 'sph-level-warning-actions';

        const layerButton = document.createElement('button');

        layerButton.type = 'button';
        layerButton.id = 'sphLevelWarningLayer';
        layerButton.className = 'sph-level-warning-layer';

        layerButton.addEventListener('click', event => {
            event.stopPropagation();

            if (typeof setMapLayerVisible !== 'function') {
                return;
            }

            setMapLayerVisible(
                'flatness',
                !isMapLayerVisible('flatness')
            );

            syncSphLevelWarningLayerButton();
        });

        actions.append(layerButton);
        body.append(actions);

        root.append(title, body);

        fallbackCard.insertAdjacentElement('afterend', root);

        return root;
    }

    function syncSphLevelWarningLayerButton() {
        const button = $('sphLevelWarningLayer');

        if (!button) {
            return;
        }

        const text = uiText();
        const shown =
            typeof isMapLayerVisible === 'function' &&
            isMapLayerVisible('flatness');

        button.textContent = text.flatLayer;
        button.title = text.flatLayerHint;
        button.setAttribute('aria-pressed', String(shown));
    }

    function syncSphLevelWarning() {
        const root = ensureSphLevelWarning();

        if (!root) {
            return;
        }

        const isSph =
            typeof S === 'object' &&
            S &&
            S.weapon === 'spg';

        root.hidden = !isSph;

        if (!isSph) {
            return;
        }

        const text = uiText();
        const title = root.querySelector('.sph-level-warning-title-text');

        if (title) {
            title.textContent = text.warningTitle;
        }

        const copy = root.querySelector('.sph-level-warning-copy');

        if (copy) {
            copy.textContent = text.warningBody;
        }

        syncSphLevelWarningLayerButton();
    }

    async function fetchJson(url) {
        const response = await fetch(url, {
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(
                `${response.status} ${response.statusText} for ${url}`
            );
        }

        return response.json();
    }

    function validateConfig(config) {
        if (!config || typeof config !== 'object') {
            throw new Error('Invalid terrain ballistic config');
        }

        if (config.schema !== 'wardogs-terrain-ballistics-v1') {
            throw new Error(
                `Unsupported terrain config schema: ${config.schema}`
            );
        }

        const hasRegistry =
            config.terrainMaps &&
            typeof config.terrainMaps === 'object' &&
            Object.keys(config.terrainMaps).length > 0;

        const hasLegacySingleMap =
            Boolean(config.mapId && config.terrainManifest);

        if (!hasRegistry && !hasLegacySingleMap) {
            throw new Error('Terrain config has no supported map manifests');
        }
    }

    function normalizeTerrainMaps(config) {
        const maps = new Map();

        if (
            config.terrainMaps &&
            typeof config.terrainMaps === 'object'
        ) {
            for (const [mapId, definition] of Object.entries(config.terrainMaps)) {
                const manifest =
                    typeof definition === 'string'
                        ? definition
                        : definition?.terrainManifest;

                if (mapId && manifest) {
                    maps.set(mapId, {
                        mapId,
                        terrainManifest: manifest
                    });
                }
            }
        }

        /*
         * Backward compatibility with the original single-map v1 config.
         * It also keeps Bakurani functional if terrainMaps is accidentally
         * stripped by an older deployment step.
         */
        if (
            config.mapId &&
            config.terrainManifest &&
            !maps.has(config.mapId)
        ) {
            maps.set(config.mapId, {
                mapId: config.mapId,
                terrainManifest: config.terrainManifest
            });
        }

        return maps;
    }

    function validateTerrainManifest(manifest, expectedMapId) {
        if (
            !manifest ||
            manifest.format !== 'wardogs-landscape-collision-u16-v1' ||
            manifest.verticesPerSide !== 511 ||
            manifest.chunkQuads !== 510 ||
            !manifest.chunks
        ) {
            throw new Error('Unsupported or incomplete Terrain3D manifest');
        }

        if (
            manifest.mapId &&
            expectedMapId &&
            manifest.mapId !== expectedMapId
        ) {
            throw new Error(
                `Terrain manifest mapId ${manifest.mapId} != ${expectedMapId}`
            );
        }

        const mappingValues = [
            Number(manifest.globalQuadOffsetX),
            Number(manifest.globalQuadOffsetY),
            landscapeQuadsPerGameUnit(manifest, 'X'),
            landscapeQuadsPerGameUnit(manifest, 'Y')
        ];

        if (
            !mappingValues.every(Number.isFinite) ||
            mappingValues[2] === 0 ||
            mappingValues[3] === 0
        ) {
            throw new Error('Terrain manifest has invalid coordinate mapping');
        }
    }

    async function loadTerrainDefinition(definition) {
        const manifestUrl = new URL(
            definition.terrainManifest,
            document.baseURI
        ).href;

        const manifest = await fetchJson(manifestUrl);
        validateTerrainManifest(manifest, definition.mapId);

        return {
            mapId: definition.mapId,
            manifest,
            manifestUrl,
            chunkCache: new Map(),
            chunkPending: new Map()
        };
    }

    async function initTerrainBallistics() {
        if (state.initialized) {
            return state.enabled;
        }

        state.initialized = true;

        try {
            const config = await fetchJson(CONFIG_URL);
            validateConfig(config);

            const definitions = [
                ...normalizeTerrainMaps(config).values()
            ];

            const results = await Promise.allSettled(
                definitions.map(loadTerrainDefinition)
            );

            for (let i = 0; i < results.length; i++) {
                const result = results[i];
                const definition = definitions[i];

                if (result.status === 'fulfilled') {
                    const terrain = result.value;
                    state.terrains.set(terrain.mapId, terrain);

                    terrainLog(
                        'loaded',
                        `map=${terrain.mapId}`,
                        `chunks=${Object.keys(terrain.manifest.chunks).length}`
                    );
                } else {
                    terrainWarn(
                        `Failed to initialize Terrain3D for map ${definition.mapId}; that map will use flat-table fallback.`,
                        result.reason
                    );
                }
            }

            state.config = config;

            state.correction = null;

            const correctionUrl = config.releasePolicy?.heightCorrection;

            if (correctionUrl) {
                try {
                    const correction = await fetchJson(correctionUrl);

                    if (
                        correction?.schema !== 'wardogs-height-correction-v1'
                    ) {
                        throw new Error(
                            `Unsupported height correction schema: ${correction?.schema}`
                        );
                    }

                    state.correction = correction;

                    terrainLog(
                        'height correction loaded',
                        `source=${correction.modelSource}`
                    );
                } catch (error) {
                    terrainWarn(
                        'Could not load the height correction grid; the flat table remains authoritative.',
                        error
                    );
                }
            }
            state.enabled = state.terrains.size > 0;

            if (!state.enabled) {
                throw new Error('No Terrain3D map manifests could be loaded');
            }

            const policy = config.releasePolicy ?? {};

            state.correctionEnabled = Boolean(
                policy.automaticMilCorrection
            );

            /*
             * Maps whose coordinate alignment we actually trust. A numeric
             * correction tolerates a misalignment far worse than a caption
             * does, so an absent or empty list corrects nothing rather than
             * defaulting to every map.
             */
            state.correctedMaps = new Set(
                Array.isArray(policy.correctedMaps)
                    ? policy.correctedMaps
                    : []
            );

            const suppression = Number(policy.suppressionMissMeters);

            state.suppressionMissMeters =
                Number.isFinite(suppression) && suppression >= 0
                    ? suppression
                    : DEFAULT_SUPPRESSION_MISS_METERS;

            if (!state.correctionEnabled) {
                terrainWarn(
                    'Runtime hook is installed but releasePolicy.automaticMilCorrection=false; the flat table remains authoritative.'
                );
            }

            /*
             * Safe release: Terrain3D is informational only.
             * Never modify the firing solution automatically.
             */
            syncSphLevelWarning();
            queueResultRerender();

            return true;
        } catch (error) {
            state.enabled = false;
            terrainWarn(
                'Failed to initialize terrain ballistics; using flat-table fallback.',
                error
            );
            return false;
        }
    }

    function isFinitePoint(point) {
        return Boolean(
            point &&
            Number.isFinite(Number(point.x)) &&
            Number.isFinite(Number(point.y))
        );
    }

    function landscapeQuadsPerGameUnit(manifest, axis) {
        const specific = Number(
            manifest?.[`gameUnitsToLandscapeQuads${axis}`]
        );

        if (Number.isFinite(specific) && specific !== 0) {
            return specific;
        }

        const legacy = Number(
            manifest?.gameUnitsToLandscapeQuads
        );

        return legacy;
    }

    function withinCoverage(gameX, gameY, manifest) {
        const coverage = manifest.coverage;

        if (!coverage) {
            return true;
        }

        const epsilon = 1e-7;

        return (
            gameX >= coverage.gameXMin - epsilon &&
            gameX <= coverage.gameXMax + epsilon &&
            gameY >= coverage.gameYMin - epsilon &&
            gameY <= coverage.gameYMax + epsilon
        );
    }

    function clamp(value, min, max) {
        return Math.min(max, Math.max(min, value));
    }

    function locateTerrainPoint(terrain, point) {
        const manifest = terrain.manifest;
        const gameX = Number(point.x);
        const gameY = Number(point.y);

        if (!withinCoverage(gameX, gameY, manifest)) {
            return null;
        }

        const quadX =
            Number(manifest.globalQuadOffsetX) +
            gameX * landscapeQuadsPerGameUnit(manifest, 'X');

        const quadY =
            Number(manifest.globalQuadOffsetY) +
            gameY * landscapeQuadsPerGameUnit(manifest, 'Y');

        const chunkQuads = Number(manifest.chunkQuads);

        let chunkX = Math.floor(quadX / chunkQuads);
        let chunkY = Math.floor(quadY / chunkQuads);

        chunkX = clamp(
            chunkX,
            Number(manifest.chunkXMin),
            Number(manifest.chunkXMax)
        );

        chunkY = clamp(
            chunkY,
            Number(manifest.chunkYMin),
            Number(manifest.chunkYMax)
        );

        const localX = clamp(
            quadX - chunkX * chunkQuads,
            0,
            chunkQuads
        );

        const localY = clamp(
            quadY - chunkY * chunkQuads,
            0,
            chunkQuads
        );

        return {
            chunkX,
            chunkY,
            localX,
            localY,
            key: `${chunkX},${chunkY}`
        };
    }

    function getChunkEntry(terrain, key) {
        return terrain.manifest?.chunks?.[key] || null;
    }

    function resolveChunkUrl(terrain, entry) {
        return new URL(
            entry.file,
            terrain.manifestUrl
        ).href;
    }

    async function loadChunk(terrain, key) {
        if (terrain.chunkCache.has(key)) {
            return terrain.chunkCache.get(key);
        }

        if (terrain.chunkPending.has(key)) {
            return terrain.chunkPending.get(key);
        }

        const entry = getChunkEntry(terrain, key);

        if (!entry) {
            throw new Error(
                `Terrain chunk ${terrain.mapId}:${key} is missing from manifest`
            );
        }

        const promise = (async () => {
            const response = await fetch(resolveChunkUrl(terrain, entry));

            if (!response.ok) {
                throw new Error(
                    `${response.status} ${response.statusText} loading terrain chunk ${terrain.mapId}:${key}`
                );
            }

            const buffer = await response.arrayBuffer();
            const expectedBytes = Number(entry.bytes || 0);

            if (
                expectedBytes > 0 &&
                buffer.byteLength !== expectedBytes
            ) {
                throw new Error(
                    `Terrain chunk ${terrain.mapId}:${key} byte length ${buffer.byteLength} != ${expectedBytes}`
                );
            }

            const chunk = {
                entry,
                view: new DataView(buffer)
            };

            terrain.chunkCache.set(key, chunk);
            return chunk;
        })();

        terrain.chunkPending.set(key, promise);

        try {
            return await promise;
        } finally {
            terrain.chunkPending.delete(key);
        }
    }

    function queueResultRerender() {
        if (state.rerenderQueued) {
            return;
        }

        state.rerenderQueued = true;

        requestAnimationFrame(() => {
            state.rerenderQueued = false;

            if (typeof result === 'function') {
                result();
            }
        });
    }

    function primeTerrainForPoints(terrain, points) {
        const keys = new Set();

        for (const point of points) {
            const located = locateTerrainPoint(terrain, point);

            if (located) {
                keys.add(located.key);
            }
        }

        const missing = [...keys].filter(
            key => !terrain.chunkCache.has(key)
        );

        if (!missing.length) {
            return;
        }

        Promise.all(missing.map(key => loadChunk(terrain, key)))
            .then(queueResultRerender)
            .catch(error => {
                terrainWarn(
                    `Could not load required ${terrain.mapId} terrain payload; using flat-table fallback.`,
                    error
                );
            });
    }

    function rawHeightAt(terrain, chunk, x, y) {
        const side = Number(terrain.manifest.verticesPerSide);
        const index = y * side + x;
        return chunk.view.getUint16(index * 2, true);
    }

    function decodeRawHeight(terrain, raw, entry) {
        const minLocalZ = Number(entry.minLocalZ);
        const maxLocalZ = Number(entry.maxLocalZ);

        if (
            !Number.isFinite(minLocalZ) ||
            !Number.isFinite(maxLocalZ)
        ) {
            return null;
        }

        const localZ =
            minLocalZ +
            (raw / 65535) * (maxLocalZ - minLocalZ);

        return (
            Number(terrain.manifest.worldZOffsetMeters) +
            localZ * Number(terrain.manifest.worldZScaleMetersPerLocalUnit)
        );
    }

    function terrainHeightAtPointSync(terrain, point) {
        const located = locateTerrainPoint(terrain, point);

        if (!located) {
            return null;
        }

        const chunk = terrain.chunkCache.get(located.key);

        if (!chunk) {
            return null;
        }

        const maxVertex =
            Number(terrain.manifest.verticesPerSide) - 1;

        const x0 = clamp(Math.floor(located.localX), 0, maxVertex);
        const y0 = clamp(Math.floor(located.localY), 0, maxVertex);
        const x1 = clamp(x0 + 1, 0, maxVertex);
        const y1 = clamp(y0 + 1, 0, maxVertex);

        const fx = located.localX - x0;
        const fy = located.localY - y0;

        const z00 = decodeRawHeight(
            terrain,
            rawHeightAt(terrain, chunk, x0, y0),
            chunk.entry
        );

        const z10 = decodeRawHeight(
            terrain,
            rawHeightAt(terrain, chunk, x1, y0),
            chunk.entry
        );

        const z01 = decodeRawHeight(
            terrain,
            rawHeightAt(terrain, chunk, x0, y1),
            chunk.entry
        );

        const z11 = decodeRawHeight(
            terrain,
            rawHeightAt(terrain, chunk, x1, y1),
            chunk.entry
        );

        if (
            ![z00, z10, z01, z11].every(Number.isFinite)
        ) {
            return null;
        }

        const top = z00 + (z10 - z00) * fx;
        const bottom = z01 + (z11 - z01) * fx;

        return top + (bottom - top) * fy;
    }

    function interpolateSeries(points, x) {
        if (!Array.isArray(points) || !points.length) {
            return null;
        }

        const sorted = points
            .map(item => [Number(item[0]), Number(item[1])])
            .filter(item => item.every(Number.isFinite))
            .sort((a, b) => a[0] - b[0]);

        if (!sorted.length) {
            return null;
        }

        const epsilon = 1e-9;

        for (const [pointX, pointY] of sorted) {
            if (Math.abs(pointX - x) <= epsilon) {
                return pointY;
            }
        }

        if (
            x < sorted[0][0] ||
            x > sorted[sorted.length - 1][0]
        ) {
            return null;
        }

        for (let i = 0; i < sorted.length - 1; i++) {
            const left = sorted[i];
            const right = sorted[i + 1];

            if (x > left[0] && x < right[0]) {
                const t = (x - left[0]) / (right[0] - left[0]);
                return left[1] + (right[1] - left[1]) * t;
            }
        }

        return null;
    }

    function bracket(values, x) {
        if (!Array.isArray(values) || values.length < 2) {
            return null;
        }

        const nums = values.map(Number);

        if (!nums.every(Number.isFinite)) {
            return null;
        }

        if (x < nums[0] || x > nums[nums.length - 1]) {
            return null;
        }

        for (let i = 0; i < nums.length; i++) {
            if (Math.abs(nums[i] - x) <= 1e-9) {
                return {
                    i0: i,
                    i1: i,
                    t: 0
                };
            }
        }

        for (let i = 0; i < nums.length - 1; i++) {
            if (x > nums[i] && x < nums[i + 1]) {
                return {
                    i0: i,
                    i1: i + 1,
                    t: (x - nums[i]) / (nums[i + 1] - nums[i])
                };
            }
        }

        return null;
    }

    function interpolateHeightCorrection(grid, distanceMeters, deltaZMeters) {
        const distances = grid?.distancesMeters;
        const deltaZValues = grid?.deltaZMeters;
        const values = grid?.milCorrections;

        if (
            !Array.isArray(distances) ||
            !Array.isArray(deltaZValues) ||
            !Array.isArray(values)
        ) {
            return null;
        }

        const bx = bracket(distances, distanceMeters);
        const bz = bracket(deltaZValues, deltaZMeters);

        if (!bx || !bz) {
            return null;
        }

        const row0 = values[bz.i0];
        const row1 = values[bz.i1];

        if (!Array.isArray(row0) || !Array.isArray(row1)) {
            return null;
        }

        /*
         * The grid writes null for a cell the model cannot reach, and
         * Number(null) is 0 rather than NaN. Left to the plain conversion an
         * unreachable corner reads as "no correction needed" -- silently, and
         * worse, a single null corner drags a real bilinear result toward
         * zero. Map the empties to NaN so the finite check below rejects
         * them.
         */
        const cell = value =>
            value === null || value === undefined ? NaN : Number(value);

        const q00 = cell(row0[bx.i0]);
        const q10 = cell(row0[bx.i1]);
        const q01 = cell(row1[bx.i0]);
        const q11 = cell(row1[bx.i1]);

        if (![q00, q10, q01, q11].every(Number.isFinite)) {
            return null;
        }

        const top = q00 + (q10 - q00) * bx.t;
        const bottom = q01 + (q11 - q01) * bx.t;

        return top + (bottom - top) * bz.t;
    }

    function cloneSolutions(solutions) {
        return {
            inRange: Boolean(solutions?.inRange),
            single: solutions?.single
                ? { ...solutions.single }
                : null,
            low: solutions?.low
                ? { ...solutions.low }
                : null,
            high: solutions?.high
                ? { ...solutions.high }
                : null
        };
    }

    const ARCS = ['single', 'low', 'high'];

    /*
     * Classifies one arc, and corrects it when that is both possible and
     * worth doing. `outcome` is what the caption keys off:
     *
     *   corrected  - the correction was applied
     *   negligible - the miss is under the suppression threshold, so
     *                leaving the arc alone changes nothing worth saying
     *   offgrid    - no correction could be computed: the target sits off
     *                the grid's coverage. This is a correction-coverage
     *                fact, not a reachability fact -- reachability comes
     *                only from assessShot
     *   nogrid     - no model ships for this arc
     *
     * Only the last two are worth a warning. Warning about `negligible`
     * trains the reader to ignore the caption, which costs more than the
     * three metres it was reporting.
     */
    function classifyArc(solution, grid, distanceMeters, deltaZMeters, weapon) {
        if (!solution) {
            return null;
        }

        if (!grid) {
            return { solution, outcome: 'nogrid', missMeters: null };
        }

        const distances = Array.isArray(grid.distancesMeters)
            ? grid.distancesMeters.map(Number)
            : null;

        const last = distances?.length
            ? distances[distances.length - 1]
            : null;

        const lookupDistance =
            Number.isFinite(last) &&
            distanceMeters > last &&
            distanceMeters - last <= 18
                ? last
                : distanceMeters;

        const miss = interpolateHeightCorrection(
            {
                distancesMeters: grid.distancesMeters,
                deltaZMeters: grid.deltaZMeters,
                milCorrections: grid.missMeters
            },
            lookupDistance,
            deltaZMeters
        );

        const deltaMil = interpolateHeightCorrection(
            grid,
            lookupDistance,
            deltaZMeters
        );

        if (!Number.isFinite(miss) || !Number.isFinite(deltaMil)) {
            return { solution, outcome: 'offgrid', missMeters: null };
        }

        if (Math.abs(miss) < state.suppressionMissMeters) {
            return { solution, outcome: 'negligible', missMeters: miss };
        }

        const minStop = Number(weapon?.minElevationMil);
        const maxStop = Number(weapon?.maxElevationMil);

        const clampMil = value => {
            let clamped = value;

            if (Number.isFinite(minStop) && clamped < minStop) {
                clamped = minStop;
            }

            if (Number.isFinite(maxStop) && clamped > maxStop) {
                clamped = maxStop;
            }

            return clamped;
        };

        const rawMinMil = solution.minMil + deltaMil;
        const rawMaxMil = solution.maxMil + deltaMil;
        const rawMil = Number.isFinite(solution.mil)
            ? solution.mil + deltaMil
            : solution.mil;

        const minMil = clampMil(rawMinMil);
        const maxMil = clampMil(rawMaxMil);
        const mil = Number.isFinite(rawMil) ? clampMil(rawMil) : rawMil;

        const envelopeClamped =
            minMil !== rawMinMil ||
            maxMil !== rawMaxMil ||
            mil !== rawMil;

        return {
            solution: { ...solution, mil, minMil, maxMil, envelopeClamped },
            outcome: 'corrected',
            missMeters: miss
        };
    }

    function getTerrainBallisticSolutions(context) {
        const fallback = {
            solutions: context?.solutions,
            meta: null
        };

        if (
            !context?.solutions ||
            !state.enabled ||
            !state.config ||
            !isFinitePoint(context.origin) ||
            !isFinitePoint(context.target)
        ) {
            return fallback;
        }

        const terrain = state.terrains.get(context.mapId);

        if (!terrain) {
            return fallback;
        }

        const originLocation =
            locateTerrainPoint(terrain, context.origin);

        const targetLocation =
            locateTerrainPoint(terrain, context.target);

        /*
         * Outside verified coverage is a normal safe-fallback condition.
         * Do not label it as "terrain loading" and never clamp an unsupported
         * coordinate to the final recovered edge chunk.
         */
        if (!originLocation || !targetLocation) {
            return fallback;
        }

        if (context.prime !== false) {
            primeTerrainForPoints(
                terrain,
                [context.origin, context.target]
            );
        }

        const originZ =
            terrainHeightAtPointSync(terrain, context.origin);

        const targetZ =
            terrainHeightAtPointSync(terrain, context.target);

        if (
            !Number.isFinite(originZ) ||
            !Number.isFinite(targetZ)
        ) {
            return {
                solutions: context.solutions,
                meta: {
                    available: true,
                    pendingTerrain: true,
                    applied: false,
                    reason: 'terrain-pending',
                    mapId: terrain.mapId
                }
            };
        }

        const deltaZ = targetZ - originZ;

        const grids =
            state.correction?.weapons?.[context.weapon?.id] ?? null;

        const allowed =
            state.correctionEnabled &&
            state.correctedMaps.has(terrain.mapId);

        const meta = {
            available: true,
            pendingTerrain: false,
            applied: false,
            reason: 'information-only',
            mapId: terrain.mapId,
            originZ,
            targetZ,
            correctionDeltaZ: deltaZ,
            arcsCorrected: [],
            arcsUncorrected: [],
            arcsWithheld: [],
            arcsUnavailable: [],
            missMeters: null,
            envelopeClamped: false
        };

        /*
         * Arcs are classified even when the correction will not be applied.
         * Whether the caption should warn depends on how big the uncorrected
         * miss would be, and that is only knowable by asking the grid.
         */
        const corrected = cloneSolutions(context.solutions);
        let worstMiss = null;
        let changed = false;

        for (const arc of ARCS) {
            const result = classifyArc(
                corrected[arc],
                grids?.[arc] ?? null,
                context.distanceMeters,
                deltaZ,
                context.weapon
            );

            if (!result) {
                continue;
            }

            if (result.outcome === 'corrected' && allowed) {
                corrected[arc] = result.solution;
                meta.arcsCorrected.push(arc);
                changed = true;
            } else {
                meta.arcsUncorrected.push(arc);

                if (result.outcome === 'corrected') {
                    /* Correctable, and a real miss, but policy said no. */
                    meta.arcsWithheld.push(arc);
                } else if (
                    result.outcome === 'offgrid' ||
                    result.outcome === 'nogrid'
                ) {
                    meta.arcsUnavailable.push(arc);
                }
            }

            if (
                Number.isFinite(result.missMeters) &&
                (worstMiss === null ||
                    Math.abs(result.missMeters) > Math.abs(worstMiss))
            ) {
                worstMiss = result.missMeters;
            }
        }

        meta.missMeters = worstMiss;
        meta.applied = changed;
        meta.reason = changed ? 'terrain-corrected' : 'information-only';
        meta.envelopeClamped = meta.arcsCorrected.length
            ? meta.arcsCorrected.some(arc => corrected[arc]?.envelopeClamped) === true
            : false;

        return {
            solutions: changed ? corrected : context.solutions,
            meta
        };
    }

    function getTerrainBallisticsState() {
        let cachedChunks = 0;

        for (const terrain of state.terrains.values()) {
            cachedChunks += terrain.chunkCache.size;
        }

        return {
            initialized: state.initialized,
            enabled: state.enabled,
            ready: state.terrains.size > 0,
            calibrated: Boolean(state.config?.calibration?.ready),
            autoCorrectionEnabled: state.correctionEnabled,
            mode: state.correctionEnabled
                ? 'terrain-corrected'
                : 'terrain-information-only',
            supportedMaps: [...state.terrains.keys()],
            cachedChunks
        };
    }

    window.initTerrainBallistics =
        initTerrainBallistics;

    window.getTerrainBallisticSolutions =
        getTerrainBallisticSolutions;

    window.getTerrainBallisticsState =
        getTerrainBallisticsState;

    window.syncSphLevelWarning =
        syncSphLevelWarning;
})();
