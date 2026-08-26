/* =========================
   LOCALE-SPECIFIC RUNTIME OVERRIDES
   ========================= */

(() => {
    'use strict';

    const SIMPLIFIED_CHINESE = 'zh-cn';

    function isSimplifiedChinese() {
        return (
            typeof LANG === 'string' &&
            LANG.toLowerCase() === SIMPLIFIED_CHINESE
        );
    }

    function zhText(key, fallback = '') {
        const value =
            typeof I18N === 'object' &&
            I18N?.[SIMPLIFIED_CHINESE]?.[key];

        return typeof value === 'string'
            ? value
            : fallback;
    }

    /* Mobile global menu copy lives outside normal data-i18n nodes. */
    if (typeof MOBILE_MENU_TEXT === 'object' && MOBILE_MENU_TEXT) {
        MOBILE_MENU_TEXT[SIMPLIFIED_CHINESE] = {
            menu: '菜单',
            appearance: '外观',
            light: '浅色',
            dark: '深色',
            language: '语言',
            links: '链接',
            credits: '致谢',
            legal: '法律信息'
        };
    }

    if (typeof getWeaponName === 'function') {
        const originalGetWeaponName = getWeaponName;

        getWeaponName = function getLocalizedWeaponName(weapon) {
            if (isSimplifiedChinese() && weapon) {
                const localized =
                    I18N?.[SIMPLIFIED_CHINESE]
                        ?.weaponNames
                        ?.[weapon.id];

                if (typeof localized === 'string' && localized) {
                    return localized;
                }
            }

            return originalGetWeaponName(weapon);
        };
    }

    function patchFooterChinese() {
        if (!isSimplifiedChinese()) return;

        const footer =
            document.getElementById('siteFooter') ||
            document.querySelector('footer');

        const disclaimer =
            footer?.querySelector('.footer-disclaimer');

        if (disclaimer) {
            disclaimer.textContent = zhText(
                'footerDisclaimer',
                disclaimer.textContent
            );
        }

        const partnerLabel =
            footer?.querySelector('.footer-partner-label');

        if (partnerLabel) {
            partnerLabel.textContent =
                `${zhText('communityPartner', '社区合作伙伴')}:`;
        }

        const author =
            footer?.querySelector('.footer-author');

        if (author?.firstChild?.nodeType === Node.TEXT_NODE) {
            author.firstChild.textContent =
                `WARDOGS Artillery Calculator ${zhText('authorLabel', '作者')} `;
        }
    }

    if (typeof renderFooter === 'function') {
        const originalRenderFooter = renderFooter;

        renderFooter = function renderLocalizedFooter() {
            const result = originalRenderFooter();
            patchFooterChinese();
            return result;
        };
    }

    function patchMobileCreditsChinese(root) {
        if (!isSimplifiedChinese() || !root) return root;

        const creditLine =
            root.querySelector('.mobile-side-menu-credit-line');

        if (creditLine?.firstChild?.nodeType === Node.TEXT_NODE) {
            creditLine.firstChild.textContent =
                `WARDOGS Artillery Calculator ${zhText('authorLabel', '作者')} `;
        }

        const disclaimer =
            root.querySelector('.mobile-side-menu-disclaimer');

        if (disclaimer) {
            disclaimer.textContent = zhText(
                'footerDisclaimer',
                disclaimer.textContent
            );
        }

        return root;
    }

    if (typeof createMobileCreditsBlock === 'function') {
        const originalCreateMobileCreditsBlock =
            createMobileCreditsBlock;

        createMobileCreditsBlock = function createLocalizedMobileCreditsBlock() {
            return patchMobileCreditsChinese(
                originalCreateMobileCreditsBlock()
            );
        };
    }

    function patchChineseStaticUi() {
        if (!isSimplifiedChinese()) return;

        const partner =
            document.querySelector('.mobile-partner-link');

        if (partner) {
            partner.innerHTML =
                `${zhText('communityPartner', '社区合作伙伴')}: <strong>WARDOGSHUB</strong>`;
        }

        const sheetHandle =
            document.getElementById('mobileSheetHandle');
        sheetHandle?.setAttribute('aria-label', '打开计算器');

        document
            .querySelector('.mobile-tabs')
            ?.setAttribute('aria-label', '计算器分区');

        document
            .getElementById('zoomOut')
            ?.setAttribute('aria-label', '缩小');

        document
            .getElementById('zoomIn')
            ?.setAttribute('aria-label', '放大');

        document
            .getElementById('mobileSideMenu')
            ?.setAttribute('aria-label', '菜单');

        document
            .getElementById('mobileSideMenuToggle')
            ?.setAttribute('aria-label', '菜单');

        document
            .getElementById('mobileSideMenuBackdrop')
            ?.setAttribute('aria-label', '关闭菜单');
    }

    if (typeof updateLayoutLocalization === 'function') {
        const originalUpdateLayoutLocalization =
            updateLayoutLocalization;

        updateLayoutLocalization = function updateLocalizedLayout() {
            const result = originalUpdateLayoutLocalization();
            patchChineseStaticUi();
            patchFooterChinese();
            return result;
        };
    }

    if (typeof updateThemeButton === 'function') {
        const originalUpdateThemeButton = updateThemeButton;

        updateThemeButton = function updateLocalizedThemeButton() {
            const result = originalUpdateThemeButton();

            if (!isSimplifiedChinese()) {
                return result;
            }

            const button =
                document.getElementById('themeToggle');

            if (!button) return result;

            const isLight =
                document.documentElement
                    .dataset.theme === 'light';

            const label = isLight
                ? zhText('switchToDarkTheme', '切换到深色主题')
                : zhText('switchToLightTheme', '切换到浅色主题');

            button.setAttribute('aria-label', label);
            button.title = label;

            return result;
        };
    }

    function patchSphWarningChinese() {
        if (!isSimplifiedChinese()) return;

        const warning =
            document.getElementById('sphLevelWarning');

        if (!warning) return;

        const title =
            warning.querySelector(
                '.sph-level-warning-title-text'
            );

        const body =
            warning.querySelector(
                '.sph-level-warning-body'
            );

        if (title) {
            title.textContent = zhText(
                'sphLevelWarningTitle',
                '射击前请将 SPH-2 调平'
            );
        }

        if (body) {
            body.textContent = zhText(
                'sphLevelWarningBody'
            );
        }
    }

    function installTerrainChineseOverrides() {
        if (
            typeof window.formatTerrainBallisticsStatus !== 'function' ||
            window.formatTerrainBallisticsStatus.__zhCnWrapped
        ) {
            return;
        }

        const originalFormat =
            window.formatTerrainBallisticsStatus;

        const localizedFormat = function formatLocalizedTerrainStatus(meta) {
            if (!isSimplifiedChinese()) {
                return originalFormat(meta);
            }

            if (!meta?.available) return '';

            if (meta.pendingTerrain) {
                return zhText(
                    'terrainLoading',
                    '正在加载地形高程'
                );
            }

            if (!Number.isFinite(meta.deltaZ)) {
                return '';
            }

            const dz =
                `${meta.deltaZ >= 0 ? '+' : ''}${meta.deltaZ.toFixed(1)}`;

            /*
             * Mirrors the state selection in formatTerrainBallisticsStatus.
             * Without it this wrapper would pin Chinese to the uncorrected
             * caption even when the correction had been applied.
             */
            if (meta.applied && meta.arcsUncorrected?.length) {
                const names = {
                    low: zhText('arcNameLow', '低伸弹道'),
                    high: zhText('arcNameHigh', '高抛弹道')
                };

                const listed = meta.arcsUncorrected
                    .map(arc => names[arc])
                    .filter(Boolean)
                    .join(' + ');

                if (listed) {
                    return zhText(
                        'terrainStatusUncorrectedArc',
                        'ΔZ {dz} m · {arcs}未按高差修正'
                    ).replace('{dz}', dz).replace('{arcs}', listed);
                }
            }

            if (meta.applied) {
                return zhText(
                    'terrainStatusCorrected',
                    'ΔZ {dz} m · 已按高差修正'
                ).replace('{dz}', dz);
            }

            return zhText(
                'terrainStatus',
                'ΔZ {dz} m · 未按高差修正'
            ).replace('{dz}', dz);
        };

        localizedFormat.__zhCnWrapped = true;
        window.formatTerrainBallisticsStatus = localizedFormat;

        if (typeof window.syncSphLevelWarning === 'function') {
            const originalSync =
                window.syncSphLevelWarning;

            window.syncSphLevelWarning = function syncLocalizedSphWarning() {
                const result = originalSync();
                patchSphWarningChinese();
                return result;
            };
        }

        patchSphWarningChinese();
    }

    installTerrainChineseOverrides();

    if (typeof MutationObserver !== 'undefined') {
        const terrainScriptObserver =
            new MutationObserver(records => {
                for (const record of records) {
                    for (const node of record.addedNodes) {
                        if (
                            node instanceof HTMLScriptElement &&
                            node.dataset.terrainBallistics === '1'
                        ) {
                            node.addEventListener(
                                'load',
                                () => {
                                    installTerrainChineseOverrides();
                                    queueMicrotask(patchSphWarningChinese);
                                },
                                { once: true }
                            );
                        }
                    }
                }
            });

        terrainScriptObserver.observe(
            document.head,
            { childList: true }
        );
    }
})();
