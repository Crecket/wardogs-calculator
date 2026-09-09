/* =========================
   EXPERIMENTAL TERRAIN CORRECTION
   ========================= */

(() => {
    'use strict';

    const CONFIG_URL =
        'data/ballistics/terrain-context.json';

    const state = {
        initialized: false,
        available: false,
        ready: false,
        loading: false,
        config: null,
        payloads: {
            lowMain: null,
            lowExtension: null,
            highV2: null
        },
        loadPromise: null,
        baseResolver: null,
        lastDisplayMeta: null,
        lastError: null,
        rerenderQueued: false
    };

    function finite(value) {
        return Number.isFinite(
            Number(value)
        );
    }

    async function sha256Hex(value) {
        if (
            !globalThis.crypto?.subtle ||
            typeof TextEncoder === 'undefined'
        ) {
            return null;
        }

        const digest =
            await crypto.subtle.digest(
                'SHA-256',
                new TextEncoder().encode(
                    value
                )
            );

        return [...new Uint8Array(digest)]
            .map(
                byte =>
                    byte
                        .toString(16)
                        .padStart(2, '0')
            )
            .join('');
    }

    async function fetchJson(url) {
        const response =
            await fetch(
                url,
                {
                    cache: 'no-store'
                }
            );

        if (!response.ok) {
            throw new Error(
                `${response.status} ${response.statusText} for ${url}`
            );
        }

        return response.json();
    }

    async function fetchVerifiedPayload(
        definition,
        label
    ) {
        const url =
            typeof definition === 'string'
                ? definition
                : definition?.url;

        const expectedSha =
            typeof definition === 'object'
                ? definition?.sha256
                : null;

        if (!url) {
            throw new Error(
                `Missing ${label} payload URL`
            );
        }

        const response =
            await fetch(
                url,
                {
                    cache: 'no-store'
                }
            );

        if (!response.ok) {
            throw new Error(
                `${response.status} ${response.statusText} loading ${label}`
            );
        }

        const raw =
            await response.text();

        if (expectedSha) {
            const actualSha =
                await sha256Hex(raw);

            if (
                actualSha &&
                actualSha.toLowerCase() !==
                String(expectedSha).toLowerCase()
            ) {
                throw new Error(
                    `${label} SHA256 mismatch: ${actualSha}`
                );
            }
        }

        return JSON.parse(raw);
    }

    function lowMainInterval(
        nodes,
        distance
    ) {
        if (
            !Array.isArray(nodes) ||
            nodes.length < 2
        ) {
            return -1;
        }

        if (
            distance < nodes[0] ||
            distance >
                nodes[
                    nodes.length - 1
                ]
        ) {
            return -1;
        }

        if (
            distance ===
            Number(
                nodes[
                    nodes.length - 1
                ]
            )
        ) {
            return (
                nodes.length -
                2
            );
        }

        let lo = 0;
        let hi =
            nodes.length - 1;

        while (lo + 1 < hi) {
            const mid =
                (lo + hi) >> 1;

            if (
                Number(nodes[mid]) <=
                distance
            ) {
                lo = mid;
            } else {
                hi = mid;
            }
        }

        return lo;
    }

    function lowMainEnvelope(
        payload,
        boundaryIndex,
        distance
    ) {
        const representation =
            payload.representation;

        const nodes =
            representation.distanceNodes;

        const mins =
            representation
                .minDeltaZMetersByBoundary[
                    boundaryIndex
                ];

        const maxs =
            representation
                .maxDeltaZMetersByBoundary[
                    boundaryIndex
                ];

        const interval =
            lowMainInterval(
                nodes,
                distance
            );

        if (interval < 0) {
            return null;
        }

        const d0 =
            Number(nodes[interval]);

        const d1 =
            Number(
                nodes[
                    interval + 1
                ]
            );

        const factor =
            d1 === d0
                ? 0
                : (
                    distance -
                    d0
                ) / (
                    d1 -
                    d0
                );

        return {
            minDeltaZM:
                Number(mins[interval]) +
                (
                    Number(
                        mins[
                            interval + 1
                        ]
                    ) -
                    Number(
                        mins[
                            interval
                        ]
                    )
                ) *
                factor,
            maxDeltaZM:
                Number(maxs[interval]) +
                (
                    Number(
                        maxs[
                            interval + 1
                        ]
                    ) -
                    Number(
                        maxs[
                            interval
                        ]
                    )
                ) *
                factor
        };
    }

    function validateLowMain(payload) {
        if (
            !payload ||
            payload.schema !==
                'wardogs-current-155he-low-command-surface-candidate-v2'
        ) {
            throw new Error(
                'Unsupported LOW main candidate schema'
            );
        }

        const representation =
            payload.representation;

        if (
            !Array.isArray(
                representation?.distanceNodes
            ) ||
            representation
                .distanceNodes
                .length !==
                345 ||
            !Array.isArray(
                representation?.boundariesMrad
            ) ||
            representation
                .boundariesMrad
                .length !==
                45 ||
            !finite(
                representation?.guardMeters
            )
        ) {
            throw new Error(
                'Invalid LOW main candidate payload'
            );
        }

        return true;
    }

    function resolveLowMain(
        payload,
        distanceM,
        flatMrad,
        deltaZM
    ) {
        const distance =
            Number(distanceM);

        const flat =
            Number(flatMrad);

        const dz =
            Number(deltaZM);

        if (
            ![
                distance,
                flat,
                dz
            ].every(
                Number.isFinite
            )
        ) {
            return {
                status: 'fallback',
                reason:
                    'non-finite-input'
            };
        }

        const domain =
            payload?.domain;

        const selectable =
            payload
                ?.selectableCommandMrad;

        const representation =
            payload?.representation;

        if (
            !domain ||
            !representation ||
            !Array.isArray(selectable) ||
            selectable.length !== 2
        ) {
            return {
                status: 'fallback',
                reason:
                    'invalid-payload'
            };
        }

        if (
            distance <
                domain
                    .distanceMinMeters ||
            distance >
                domain
                    .distanceMaxMeters ||
            flat <
                domain.flatMilMin ||
            flat >
                domain.flatMilMax ||
            dz <
                domain
                    .deltaZMinMeters ||
            dz >
                domain
                    .deltaZMaxMeters
        ) {
            return {
                status: 'fallback',
                reason:
                    'outside-supported-domain'
            };
        }

        const boundaries =
            representation
                .boundariesMrad;

        const guard =
            Number(
                representation
                    .guardMeters
            );

        const first =
            lowMainEnvelope(
                payload,
                0,
                distance
            );

        if (
            !first ||
            !finite(guard)
        ) {
            return {
                status: 'fallback',
                reason:
                    'invalid-payload'
            };
        }

        if (
            dz <=
            first.maxDeltaZM +
                guard
        ) {
            return {
                status: 'fallback',
                reason:
                    'below-minimum-selectable-command'
            };
        }

        let lastCrossed = null;

        for (
            let i = 0;
            i < boundaries.length;
            i++
        ) {
            const envelope =
                lowMainEnvelope(
                    payload,
                    i,
                    distance
                );

            if (!envelope) {
                return {
                    status: 'fallback',
                    reason:
                        'missing-boundary-envelope'
                };
            }

            const guardedMin =
                envelope.minDeltaZM -
                guard;

            const guardedMax =
                envelope.maxDeltaZM +
                guard;

            if (
                dz >= guardedMin &&
                dz <= guardedMax
            ) {
                return {
                    status: 'fallback',
                    reason:
                        'family-boundary-envelope',
                    boundaryMrad:
                        boundaries[i]
                };
            }

            if (dz > guardedMax) {
                lastCrossed =
                    boundaries[i];
                continue;
            }

            if (dz < guardedMin) {
                break;
            }
        }

        if (
            lastCrossed === null
        ) {
            return {
                status: 'fallback',
                reason:
                    'no-supported-command-bin'
            };
        }

        const commandMrad =
            Number(lastCrossed) +
            5;

        if (
            commandMrad <
                selectable[0] ||
            commandMrad >
                selectable[1]
        ) {
            return {
                status: 'fallback',
                reason:
                    'outside-selectable-command-range'
            };
        }

        return {
            status: 'ok',
            commandMrad
        };
    }

    function sparseInterval(
        nodes,
        value
    ) {
        if (
            !Array.isArray(nodes) ||
            nodes.length < 2 ||
            value <
                Number(nodes[0]) ||
            value >
                Number(
                    nodes[
                        nodes.length - 1
                    ]
                )
        ) {
            return -1;
        }

        if (
            value ===
            Number(
                nodes[
                    nodes.length - 1
                ]
            )
        ) {
            return (
                nodes.length -
                2
            );
        }

        let lo = 0;
        let hi =
            nodes.length - 1;

        while (lo + 1 < hi) {
            const mid =
                (lo + hi) >> 1;

            if (
                Number(nodes[mid]) <=
                value
            ) {
                lo = mid;
            } else {
                hi = mid;
            }
        }

        return lo;
    }

    function interpolateSeries(
        nodes,
        values,
        x
    ) {
        const index =
            sparseInterval(
                nodes,
                x
            );

        if (
            index < 0 ||
            !Array.isArray(values) ||
            values.length !==
                nodes.length
        ) {
            return null;
        }

        const x0 =
            Number(nodes[index]);

        const x1 =
            Number(
                nodes[
                    index + 1
                ]
            );

        const factor =
            x1 === x0
                ? 0
                : (
                    x -
                    x0
                ) /
                (
                    x1 -
                    x0
                );

        return (
            Number(values[index]) +
            (
                Number(
                    values[
                        index + 1
                    ]
                ) -
                Number(
                    values[index]
                )
            ) *
            factor
        );
    }

    function interpolateSparseSegment(
        segment,
        distance
    ) {
        const nodes =
            segment
                ?.distanceNodes;

        const mins =
            segment
                ?.minDeltaZMeters;

        const maxs =
            segment
                ?.maxDeltaZMeters;

        const index =
            sparseInterval(
                nodes,
                distance
            );

        if (index < 0) {
            return null;
        }

        const d0 =
            Number(nodes[index]);

        const d1 =
            Number(
                nodes[
                    index + 1
                ]
            );

        const factor =
            d1 === d0
                ? 0
                : (
                    distance -
                    d0
                ) /
                (
                    d1 -
                    d0
                );

        return {
            minDeltaZM:
                Number(mins[index]) +
                (
                    Number(
                        mins[
                            index + 1
                        ]
                    ) -
                    Number(
                        mins[index]
                    )
                ) *
                factor,
            maxDeltaZM:
                Number(maxs[index]) +
                (
                    Number(
                        maxs[
                            index + 1
                        ]
                    ) -
                    Number(
                        maxs[index]
                    )
                ) *
                factor
        };
    }

    function lowExtensionEnvelope(
        region,
        boundary,
        distance,
        flatMrad
    ) {
        for (
            const segment of
            boundary.segments || []
        ) {
            const value =
                interpolateSparseSegment(
                    segment,
                    distance
                );

            if (value) {
                return value;
            }
        }

        const clip =
            Number(
                region.clipMeters
            );

        if (
            !finite(clip) ||
            !(clip > 0)
        ) {
            return null;
        }

        if (
            boundary.boundaryMrad <
            flatMrad
        ) {
            return {
                minDeltaZM:
                    -clip,
                maxDeltaZM:
                    -clip
            };
        }

        if (
            boundary.boundaryMrad >
            flatMrad
        ) {
            return {
                minDeltaZM:
                    clip,
                maxDeltaZM:
                    clip
            };
        }

        return null;
    }

    function validateLowExtension(
        payload
    ) {
        if (
            !payload ||
            payload.schema !==
                'wardogs-current-155he-low-tail-apex-candidate-v1'
        ) {
            throw new Error(
                'Unsupported LOW tail/apex candidate schema'
            );
        }

        const reachability =
            payload.reachability;

        if (
            !reachability ||
            !finite(
                reachability.guardMeters
            ) ||
            !Array.isArray(
                reachability.distanceNodes
            ) ||
            !Array.isArray(
                reachability
                    .maxPositiveDeltaZMeters
            ) ||
            reachability
                .distanceNodes
                .length !==
                reachability
                    .maxPositiveDeltaZMeters
                    .length
        ) {
            throw new Error(
                'Invalid LOW tail/apex reachability payload'
            );
        }

        for (
            const key of
            ['tail', 'apex']
        ) {
            const region =
                payload.regions?.[key];

            if (
                !region ||
                region.orientation !==
                    'increasing-command-vs-positive-deltaZ' ||
                !finite(
                    region.guardMeters
                ) ||
                !finite(
                    region.clipMeters
                ) ||
                !Array.isArray(
                    region.boundaries
                ) ||
                region
                    .boundaries
                    .length !==
                    58
            ) {
                throw new Error(
                    `Invalid LOW ${key} region`
                );
            }
        }

        return true;
    }

    function chooseLowExtensionRegion(
        payload,
        distance
    ) {
        const tail =
            payload.regions?.tail;

        const apex =
            payload.regions?.apex;

        if (
            tail &&
            distance >=
                Number(
                    tail
                        .distanceMinMeters
                ) &&
            distance <=
                Number(
                    tail
                        .distanceMaxMeters
                )
        ) {
            return tail;
        }

        if (
            apex &&
            distance >=
                Number(
                    apex
                        .distanceMinMeters
                ) &&
            distance <=
                Number(
                    apex
                        .distanceMaxMeters
                )
        ) {
            return apex;
        }

        return null;
    }

    function resolveLowExtension(
        payload,
        distanceM,
        flatMrad,
        deltaZM
    ) {
        const distance =
            Number(distanceM);

        const flat =
            Number(flatMrad);

        const dz =
            Number(deltaZM);

        if (
            ![
                distance,
                flat,
                dz
            ].every(
                Number.isFinite
            )
        ) {
            return {
                status: 'fallback',
                reason:
                    'non-finite-input'
            };
        }

        const domain =
            payload?.domain;

        const selectable =
            payload
                ?.selectableCommandMrad;

        if (
            !domain ||
            !Array.isArray(selectable) ||
            selectable.length !== 2
        ) {
            return {
                status: 'fallback',
                reason:
                    'invalid-payload'
            };
        }

        if (
            distance <
                domain
                    .distanceMinMeters ||
            distance >
                domain
                    .distanceMaxMeters ||
            dz <
                domain
                    .deltaZMinMeters ||
            dz >
                domain
                    .deltaZMaxMeters
        ) {
            return {
                status: 'fallback',
                reason:
                    'outside-supported-domain'
            };
        }

        const reachability =
            interpolateSeries(
                payload
                    .reachability
                    .distanceNodes,
                payload
                    .reachability
                    .maxPositiveDeltaZMeters,
                distance
            );

        const reachabilityGuard =
            Number(
                payload
                    .reachability
                    .guardMeters
            );

        if (
            !finite(reachability) ||
            !finite(
                reachabilityGuard
            )
        ) {
            return {
                status: 'fallback',
                reason:
                    'missing-reachability'
            };
        }

        if (
            dz >
            reachability +
                reachabilityGuard
        ) {
            return {
                status:
                    'unreachable',
                reason:
                    'terrain-adjusted-low-unreachable',
                reachabilityDeltaZM:
                    reachability
            };
        }

        if (
            dz >=
            reachability -
                reachabilityGuard
        ) {
            return {
                status: 'fallback',
                reason:
                    'reachability-boundary',
                reachabilityDeltaZM:
                    reachability
            };
        }

        const region =
            chooseLowExtensionRegion(
                payload,
                distance
            );

        if (!region) {
            return {
                status: 'fallback',
                reason:
                    'outside-supported-domain'
            };
        }

        const guard =
            Number(
                region.guardMeters
            );

        let lastCrossed = null;

        for (
            const boundary of
            region.boundaries
        ) {
            const envelope =
                lowExtensionEnvelope(
                    region,
                    boundary,
                    distance,
                    flat
                );

            if (!envelope) {
                return {
                    status: 'fallback',
                    reason:
                        'missing-boundary-envelope'
                };
            }

            const guardedMin =
                envelope.minDeltaZM -
                guard;

            const guardedMax =
                envelope.maxDeltaZM +
                guard;

            if (
                dz >= guardedMin &&
                dz <= guardedMax
            ) {
                return {
                    status: 'fallback',
                    reason:
                        'family-boundary-envelope',
                    boundaryMrad:
                        boundary
                            .boundaryMrad
                };
            }

            if (dz > guardedMax) {
                lastCrossed =
                    Number(
                        boundary
                            .boundaryMrad
                    );

                continue;
            }

            if (dz < guardedMin) {
                break;
            }
        }

        if (
            lastCrossed === null
        ) {
            return {
                status: 'fallback',
                reason:
                    'below-minimum-selectable-command'
            };
        }

        const commandMrad =
            lastCrossed +
            5;

        if (
            commandMrad <
                selectable[0] ||
            commandMrad >
                selectable[1]
        ) {
            return {
                status: 'fallback',
                reason:
                    'outside-selectable-command-range'
            };
        }

        return {
            status: 'ok',
            commandMrad,
            region:
                distance <=
                Number(
                    payload
                        .regions
                        .tail
                        .distanceMaxMeters
                )
                    ? 'tail'
                    : 'apex'
        };
    }

    function highEnvelope(
        payload,
        boundary,
        distance,
        flatMrad
    ) {
        for (
            const segment of
            boundary.segments || []
        ) {
            const value =
                interpolateSparseSegment(
                    segment,
                    distance
                );

            if (value) {
                return value;
            }
        }

        const clip =
            Number(
                payload
                    .representation
                    .clipMeters
            );

        if (
            !finite(clip) ||
            !(clip > 0)
        ) {
            return null;
        }

        if (
            boundary.boundaryMrad <
            flatMrad
        ) {
            return {
                minDeltaZM:
                    clip,
                maxDeltaZM:
                    clip
            };
        }

        if (
            boundary.boundaryMrad >
            flatMrad
        ) {
            return {
                minDeltaZM:
                    -clip,
                maxDeltaZM:
                    -clip
            };
        }

        return null;
    }

    function validateHigh(
        payload
    ) {
        if (
            !payload ||
            payload.schema !==
                'wardogs-current-155he-high-v2-command-surface-candidate-v1'
        ) {
            throw new Error(
                'Unsupported HIGH candidate schema'
            );
        }

        const representation =
            payload.representation;

        if (
            !representation ||
            representation.orientation !==
                'decreasing-command-vs-positive-deltaZ' ||
            !finite(
                representation.guardMeters
            ) ||
            !finite(
                representation.clipMeters
            ) ||
            !Array.isArray(
                representation.boundaries
            ) ||
            representation
                .boundaries
                .length !==
                80
        ) {
            throw new Error(
                'Invalid HIGH candidate payload'
            );
        }

        return true;
    }

    function resolveHigh(
        payload,
        distanceM,
        flatMrad,
        deltaZM
    ) {
        const distance =
            Number(distanceM);

        const flat =
            Number(flatMrad);

        const dz =
            Number(deltaZM);

        if (
            ![
                distance,
                flat,
                dz
            ].every(
                Number.isFinite
            )
        ) {
            return {
                status: 'fallback',
                reason:
                    'non-finite-input'
            };
        }

        const domain =
            payload?.domain;

        const representation =
            payload?.representation;

        const selectable =
            payload
                ?.selectableCommandMrad;

        if (
            !domain ||
            !representation ||
            !Array.isArray(selectable) ||
            selectable.length !== 2
        ) {
            return {
                status: 'fallback',
                reason:
                    'invalid-payload'
            };
        }

        if (
            distance <
                domain
                    .distanceMinMeters ||
            distance >
                domain
                    .distanceMaxMeters ||
            dz <
                domain
                    .deltaZMinMeters ||
            dz >
                domain
                    .deltaZMaxMeters
        ) {
            return {
                status: 'fallback',
                reason:
                    'outside-supported-domain'
            };
        }

        const guard =
            Number(
                representation
                    .guardMeters
            );

        for (
            const boundary of
            representation.boundaries
        ) {
            const envelope =
                highEnvelope(
                    payload,
                    boundary,
                    distance,
                    flat
                );

            if (!envelope) {
                return {
                    status: 'fallback',
                    reason:
                        'missing-boundary-envelope'
                };
            }

            const guardedMin =
                envelope.minDeltaZM -
                guard;

            const guardedMax =
                envelope.maxDeltaZM +
                guard;

            if (
                dz >= guardedMin &&
                dz <= guardedMax
            ) {
                return {
                    status: 'fallback',
                    reason:
                        'family-boundary-envelope',
                    boundaryMrad:
                        boundary
                            .boundaryMrad
                };
            }

            if (dz > guardedMax) {
                const commandMrad =
                    Number(
                        boundary
                            .boundaryMrad
                    ) -
                    5;

                if (
                    commandMrad <
                        selectable[0] ||
                    commandMrad >
                        selectable[1]
                ) {
                    return {
                        status:
                            'fallback',
                        reason:
                            'outside-selectable-command-range'
                    };
                }

                return {
                    status: 'ok',
                    commandMrad
                };
            }
        }

        return {
            status: 'fallback',
            reason:
                'above-maximum-selectable-command'
        };
    }

    function flatCommand(
        solution
    ) {
        if (!solution) {
            return null;
        }

        const direct =
            Number(solution.mil);

        if (finite(direct)) {
            return direct;
        }

        const min =
            Number(solution.minMil);

        const max =
            Number(solution.maxMil);

        if (
            finite(min) &&
            finite(max) &&
            Math.abs(min - max) <=
                1e-9
        ) {
            return min;
        }

        return null;
    }

    function formatTableCommand(
        solution
    ) {
        if (!solution) {
            return '—';
        }

        const direct =
            flatCommand(solution);

        if (finite(direct)) {
            return `${Math.round(direct)}`;
        }

        const min =
            Number(solution.minMil);

        const max =
            Number(solution.maxMil);

        if (
            finite(min) &&
            finite(max)
        ) {
            return (
                `${Math.round(min)}` +
                '–' +
                `${Math.round(max)}`
            );
        }

        return '—';
    }

    function normalizeCandidate(
        result,
        tableSolution
    ) {
        const tableMrad =
            flatCommand(
                tableSolution
            );

        if (!tableSolution) {
            return null;
        }

        if (!finite(tableMrad)) {
            return {
                status:
                    'OUTSIDE_CERTIFIED_DOMAIN',
                reason:
                    'ambiguous-flat-table-command',
                tableMrad: null,
                tableDisplay:
                    formatTableCommand(
                        tableSolution
                    ),
                commandMrad: null,
                deltaMrad: null,
                applied: false
            };
        }

        if (
            result?.status ===
                'ok' &&
            finite(
                result.commandMrad
            )
        ) {
            const commandMrad =
                Number(
                    result.commandMrad
                );

            return {
                status:
                    'SAFE_CONSENSUS',
                reason:
                    result.reason ??
                    null,
                tableMrad,
                tableDisplay:
                    formatTableCommand(
                        tableSolution
                    ),
                commandMrad,
                deltaMrad:
                    commandMrad -
                    tableMrad,
                boundaryMrad:
                    result.boundaryMrad ??
                    null,
                region:
                    result.region ??
                    null,
                applied: false
            };
        }

        if (
            result?.status ===
            'unreachable'
        ) {
            return {
                status:
                    'TERRAIN_ADJUSTED_UNREACHABLE',
                reason:
                    result.reason ??
                    'terrain-adjusted-unreachable',
                tableMrad,
                tableDisplay:
                    formatTableCommand(
                        tableSolution
                    ),
                commandMrad: null,
                deltaMrad: null,
                reachabilityDeltaZM:
                    result
                        .reachabilityDeltaZM ??
                    null,
                applied: false
            };
        }

        return {
            status:
                result?.reason ===
                    'family-boundary-envelope'
                    ? 'FAMILY_DISAGREEMENT'
                    : 'OUTSIDE_CERTIFIED_DOMAIN',
            reason:
                result?.reason ??
                'no-safe-candidate',
            tableMrad,
            tableDisplay:
                formatTableCommand(
                    tableSolution
                ),
            commandMrad: null,
            deltaMrad: null,
            boundaryMrad:
                result?.boundaryMrad ??
                null,
            reachabilityDeltaZM:
                result
                    ?.reachabilityDeltaZM ??
                null,
            applied: false
        };
    }

    function resolveArcCandidates(
        context,
        resolved
    ) {
        const distance =
            Number(
                context?.distanceMeters
            );

        const deltaZ =
            Number(
                resolved?.meta?.correctionDeltaZ
            );

        if (
            context?.weapon?.id !==
                (
                    state.config
                        ?.weaponId ||
                    'spg'
                ) ||
            !finite(distance) ||
            !finite(deltaZ)
        ) {
            return null;
        }

        const tableSolutions =
            context.solutions;

        let low = null;
        let high = null;

        if (
            tableSolutions?.low
        ) {
            const flat =
                flatCommand(
                    tableSolutions.low
                );

            if (!finite(flat)) {
                low =
                    normalizeCandidate(
                        null,
                        tableSolutions.low
                    );
            } else if (
                distance <= 2439
            ) {
                low =
                    normalizeCandidate(
                        resolveLowMain(
                            state
                                .payloads
                                .lowMain,
                            distance,
                            flat,
                            deltaZ
                        ),
                        tableSolutions.low
                    );
            } else {
                low =
                    normalizeCandidate(
                        resolveLowExtension(
                            state
                                .payloads
                                .lowExtension,
                            distance,
                            flat,
                            deltaZ
                        ),
                        tableSolutions.low
                    );
            }
        }

        if (
            tableSolutions?.high
        ) {
            const flat =
                flatCommand(
                    tableSolutions.high
                );

            high =
                finite(flat)
                    ? normalizeCandidate(
                        resolveHigh(
                            state
                                .payloads
                                .highV2,
                            distance,
                            flat,
                            deltaZ
                        ),
                        tableSolutions.high
                    )
                    : normalizeCandidate(
                        null,
                        tableSolutions.high
                    );
        }

        if (!low && !high) {
            return null;
        }

        return {
            low,
            high
        };
    }

    function cloneSolutions(
        solutions
    ) {
        return {
            inRange:
                Boolean(
                    solutions?.inRange
                ),
            single:
                solutions?.single
                    ? {
                        ...solutions.single
                    }
                    : null,
            low:
                solutions?.low
                    ? {
                        ...solutions.low
                    }
                    : null,
            high:
                solutions?.high
                    ? {
                        ...solutions.high
                    }
                    : null
        };
    }

    function applySafeCandidates(
        solutions,
        arcs
    ) {
        if (
            !solutions ||
            !arcs
        ) {
            return {
                solutions,
                applied: false
            };
        }

        const safeArcs =
            ['low', 'high']
                .filter(
                    arc =>
                        solutions?.[arc] &&
                        arcs?.[arc]
                            ?.status ===
                            'SAFE_CONSENSUS' &&
                        finite(
                            arcs[arc]
                                .commandMrad
                        )
                );

        if (!safeArcs.length) {
            return {
                solutions,
                applied: false
            };
        }

        const next =
            cloneSolutions(
                solutions
            );

        for (
            const arc of
            safeArcs
        ) {
            const command =
                Number(
                    arcs[arc]
                        .commandMrad
                );

            next[arc] = {
                ...next[arc],
                mil: command,
                minMil: command,
                maxMil: command
            };

            arcs[arc].applied =
                true;
        }

        return {
            solutions: next,
            applied: true
        };
    }

    function queueRerender() {
        if (
            state.rerenderQueued
        ) {
            return;
        }

        state.rerenderQueued =
            true;

        requestAnimationFrame(
            () => {
                state.rerenderQueued =
                    false;

                if (
                    typeof result ===
                    'function'
                ) {
                    result();
                }

                if (
                    typeof refreshSavedTargetFiringInfo ===
                    'function'
                ) {
                    refreshSavedTargetFiringInfo();
                }
            }
        );
    }

    async function ensurePayloads() {
        if (state.ready) {
            return true;
        }

        if (state.loadPromise) {
            return state.loadPromise;
        }

        const payloads =
            state.config?.payloads;

        if (!payloads) {
            return false;
        }

        state.loading = true;

        state.loadPromise =
            Promise.all([
                fetchVerifiedPayload(
                    payloads.lowMain,
                    'LOW main'
                ),
                fetchVerifiedPayload(
                    payloads.lowExtension,
                    'LOW tail/apex'
                ),
                fetchVerifiedPayload(
                    payloads.highV2,
                    'HIGH v2'
                )
            ])
                .then(
                    ([
                        lowMain,
                        lowExtension,
                        highV2
                    ]) => {
                        validateLowMain(
                            lowMain
                        );

                        validateLowExtension(
                            lowExtension
                        );

                        validateHigh(
                            highV2
                        );

                        state.payloads = {
                            lowMain,
                            lowExtension,
                            highV2
                        };

                        state.ready = true;
                        state.lastError =
                            null;

                        return true;
                    }
                )
                .catch(
                    error => {
                        state.ready =
                            false;

                        state.lastError =
                            error;

                        console.warn(
                            '[experimental-terrain-correction] Candidate payloads unavailable; flat-table fallback remains active.',
                            error
                        );

                        return false;
                    }
                )
                .finally(
                    () => {
                        state.loading =
                            false;

                        state.loadPromise =
                            null;

                        queueRerender();
                    }
                );

        return state.loadPromise;
    }

    function wrapResolver() {
        if (
            typeof window
                .getTerrainBallisticSolutions !==
            'function'
        ) {
            throw new Error(
                'Terrain ballistics resolver is unavailable'
            );
        }

        if (
            state.baseResolver
        ) {
            return;
        }

        state.baseResolver =
            window
                .getTerrainBallisticSolutions;

        window
            .getTerrainBallisticSolutions =
            function experimentalTerrainResolver(
                context
            ) {
                const resolved =
                    state.baseResolver(
                        context
                    );

                const baseMeta =
                    resolved?.meta;

                const isSupportedWeapon =
                    context?.weapon?.id ===
                    (
                        state.config
                            ?.weaponId ||
                        'spg'
                    );

                const canPreview =
                    state.available &&
                    isSupportedWeapon &&
                    finite(
                        baseMeta?.correctionDeltaZ
                    );

                if (
                    canPreview &&
                    !state.ready &&
                    !state.loading &&
                    !state.lastError
                ) {
                    ensurePayloads();
                }

                if (
                    !canPreview ||
                    !state.ready
                ) {
                    return {
                        ...resolved,
                        solutions:
                            resolved
                                ?.solutions,
                        meta:
                            baseMeta
                                ? {
                                    ...baseMeta,
                                    experimentalTerrainCorrection: {
                                        available:
                                            state.available &&
                                            isSupportedWeapon,
                                        enabled: true,
                                        ready:
                                            state.ready,
                                        loading:
                                            state.loading,
                                        applied:
                                            false,
                                        arcs: null,
                                        error:
                                            state.lastError
                                                ?.message ??
                                            null
                                    }
                                }
                                : baseMeta
                    };
                }

                const arcs =
                    resolveArcCandidates(
                        context,
                        resolved
                    );

                const applied =
                    applySafeCandidates(
                        resolved?.solutions,
                        arcs
                    );

                return {
                    ...resolved,
                    solutions:
                        applied.solutions,
                    meta: {
                        ...baseMeta,
                        experimentalTerrainCorrection: {
                            available: true,
                            enabled: true,
                            ready: true,
                            loading: false,
                            applied:
                                applied.applied,
                            arcs,
                            error: null
                        }
                    }
                };
            };
    }

    async function initExperimentalTerrainCorrection() {
        if (
            state.initialized
        ) {
            return state.available;
        }

        state.initialized =
            true;

        try {
            const config =
                await fetchJson(
                    CONFIG_URL
                );

            const experimental =
                config
                    ?.experimentalCorrection;

            state.available =
                Boolean(
                    experimental
                        ?.available
                );

            state.config =
                experimental ||
                null;

            if (!state.available) {
                return false;
            }

            wrapResolver();

            return true;

        } catch (error) {
            state.available =
                false;

            state.lastError =
                error;

            console.warn(
                '[experimental-terrain-correction] Disabled; flat-table firing solutions remain authoritative.',
                error
            );

            return false;
        }
    }

    function getState() {
        return {
            initialized:
                state.initialized,
            available:
                state.available,
            ready:
                state.ready,
            loading:
                state.loading,
            appliesCorrections:
                Boolean(
                    state.available &&
                    state.ready
                ),
            safeOnly: true,
            platformCorrection:
                false,
            payloads: {
                lowMain:
                    Boolean(
                        state
                            .payloads
                            .lowMain
                    ),
                lowExtension:
                    Boolean(
                        state
                            .payloads
                            .lowExtension
                    ),
                highV2:
                    Boolean(
                        state
                            .payloads
                            .highV2
                    )
            },
            lastError:
                state.lastError
                    ?.message ??
                null
        };
    }

    window
        .initExperimentalTerrainCorrection =
        initExperimentalTerrainCorrection;

    window
        .getExperimentalTerrainCorrectionState =
        getState;
})();
