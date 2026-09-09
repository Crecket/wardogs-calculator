export const SEO_PAGE_CONTENT = {
    'zh-cn': {
        "title": "WARDOGS 炮兵计算器 | L81 迫击炮、SPH-2 与战术地图",
        "description": "免费的 WARDOGS 炮兵计算器，支持 L81 迫击炮、SPH-2、Bakurani、Ozeti、Zestafona 地图、等高线及 Terrain3D MIL 修正。",
        "imageAlt": "WARDOGS 炮兵计算器战术地图与射击解算界面",
        "alternateNames": ["WARDOGS 炮兵计算器", "WARDOGS L81 迫击炮计算器", "WARDOGS Arty Calc"],
        "cluster": {
            "heading": "WARDOGS 炮兵计算器",
            "navLabel": "计算器与地图指南",
            "intro": "WARDOGS 炮兵计算器是一款免费、开源的社区工具，可根据手动设置的炮位与目标位置计算距离、方位角和 MIL。L81 迫击炮与 SPH-2 共用同一套战术地图工作区。",
            "sections": [
                {
                    "id": "wardogs-mortar-calculator",
                    "heading": "WARDOGS L81 迫击炮计算器",
                    "body": "选择 L81 迫击炮，在地图上设置炮位与目标位置，计算器会给出距离、方位角以及射表 MIL。射程状态会提示目标是否位于 L81 迫击炮支持的射程范围内。"
                },
                {
                    "id": "wardogs-sph-2-calculator",
                    "heading": "WARDOGS SPH-2 计算器",
                    "body": "选择 SPH-2 后，可计算距离、方位角以及可用的 LOW / HIGH 射击解算。在支持 Terrain3D 的地形上，可以手动启用实验性 MIL 修正，并同时比较标准射表值与 Terrain3D 候选值。该功能默认关闭，仅会应用被判定为 SAFE 的候选；不确定、不支持或不可达的情况会自动回退到标准射表。平台与车体倾斜目前不会被修正。"
                },
                {
                    "id": "bakurani-interactive-map",
                    "heading": "Bakurani 互动地图",
                    "body": "Bakurani 互动地图已校准到 WARDOGS 游戏坐标。炮位、目标、保存的目标、测距尺、绘图和战术标记都使用同一坐标空间，并提供地形等高线和 Terrain3D 高程数据，用于战术规划和受支持的 SPH-2 地形修正预览。"
                },
                {
                    "id": "ozeti-interactive-map",
                    "heading": "Ozeti 互动地图",
                    "body": "Ozeti 互动地图使用校准后的 WARDOGS 坐标和修正后的可玩区域对齐，可用于炮兵解算与战术规划。炮位、目标、保存目标、绘图、标记和地形等高线都使用同一坐标空间，并在数据覆盖范围内提供 Terrain3D 高程信息。"
                },
                {
                    "id": "zestafona-interactive-map",
                    "heading": "Zestafona 互动地图",
                    "body": "Zestafona 互动地图使用校准后的 WARDOGS 坐标，可用于设置炮位、目标和进行战术规划。多级地图瓦片、保存目标、测距尺、绘图、标记、地形等高线和 Terrain3D 高程信息均集成在同一工作区中。"
                },
                {
                    "id": "how-to-use",
                    "heading": "使用方法",
                    "body": "选择 Bakurani、Ozeti、Zestafona 或自定义地图，再选择 L81 迫击炮或 SPH-2，设置炮位和目标，即可读取距离、方位角与 MIL。对于支持 Terrain3D 的 SPH-2 射击，可手动开启实验性修正。"
                }
            ]
        },
        "faqLabel": "常见问题",
        "faqHeading": "WARDOGS 炮兵计算器常见问题",
        "faq": [
            {
                "question": "它支持 WARDOGS L81 迫击炮吗？",
                "answer": "支持。选择 L81 迫击炮并设置炮位与目标位置后，计算器会提供距离、方位角、射程状态和射表 MIL。"
            },
            {
                "question": "WARDOGS 炮兵计算器支持 SPH-2 吗？",
                "answer": "支持。SPH-2 解算包括距离、方位角、LOW / HIGH 射击方案，以及在受支持地形上的可选实验性 Terrain3D MIL 修正。"
            },
            {
                "question": "支持哪些 WARDOGS 地图？",
                "answer": "目前包含 Bakurani、Ozeti 和 Zestafona 互动地图，并提供自定义地图模式。三张预设地图均使用校准后的游戏坐标，支持战术地图工具和地形等高线，并在 Terrain3D 数据覆盖范围内提供高程信息。"
            },
            {
                "question": "Terrain3D 会修正 SPH-2 的高差 MIL 吗？",
                "answer": "可以选择启用实验性 Terrain3D MIL 修正。该功能默认关闭，会同时显示标准射表值和 Terrain3D 候选值，并且只应用被判定为 SAFE 的候选。其他情况会自动回退到标准射表。平台或车体倾斜目前不会被修正。"
            },
            {
                "question": "WARDOGS 地图可以显示地形等高线吗？",
                "answer": "可以。受支持的 WARDOGS 地图提供可切换的地形等高线图层，可在 Layers 菜单中与其他战术图层一起开启或关闭。"
            }
        ],
        "features": [
            "WARDOGS L81 迫击炮射击解算",
            "SPH-2 LOW / HIGH 射击解算",
            "SPH-2 实验性 Terrain3D MIL 修正",
            "Bakurani 互动战术地图与等高线",
            "Ozeti 互动战术地图与等高线",
            "Zestafona 互动战术地图与等高线",
            "保存目标的完整射击信息",
            "测距尺与绘图工具",
            "战术地图标记"
        ]
    },
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
    },

    ru: {
        title: 'Калькулятор WARDOGS | Миномёт L81, SPH-2 и карта',
        description: 'Бесплатный калькулятор WARDOGS для миномёта L81 и SPH-2 с картами Bakurani, Ozeti и Zestafona и Terrain3D-коррекцией MIL.',
        heading: 'О калькуляторе',
        intro: 'WARDOGS Artillery Calculator — бесплатный open-source инструмент сообщества для расчёта миномёта L81 и SPH-2. Он включает интерактивные карты Bakurani, Ozeti и Zestafona, расчёт дистанции, азимута и MIL, контуры рельефа и экспериментальную Terrain3D-коррекцию MIL.',
        usage: 'Выберите карту и оружие, укажите позицию артиллерии и цель, затем используйте полученный расчёт. Экспериментальная Terrain3D-коррекция включается вручную и применяет только SAFE-кандидаты SPH-2; в остальных случаях используется обычная таблица. Коррекция наклона платформы и корпуса не включена.',
        features: [
            'Калькулятор миномёта L81 для WARDOGS',
            'LOW и HIGH расчёты SPH-2',
            'Экспериментальная Terrain3D-коррекция MIL для SPH-2',
            'Интерактивная карта Bakurani с контурами рельефа',
            'Тактическая карта Ozeti с контурами рельефа',
            'Интерактивная карта Zestafona с контурами рельефа',
            'Полные данные сохранённых целей',
            'Линейка и инструменты рисования',
            'Тактические маркеры'
        ]
    },

    uk: {
        title: 'Калькулятор WARDOGS | Міномет L81, SPH-2 та мапа',
        description: 'Безкоштовний калькулятор WARDOGS для міномета L81 і SPH-2 з мапами Bakurani, Ozeti й Zestafona та Terrain3D-корекцією MIL.',
        heading: 'Про калькулятор',
        intro: 'WARDOGS Artillery Calculator — безкоштовний open-source інструмент спільноти для розрахунків міномета L81 та SPH-2. Він містить інтерактивні мапи Bakurani, Ozeti та Zestafona, розрахунок дистанції, азимута й MIL, контури рельєфу та експериментальну Terrain3D-корекцію MIL.',
        usage: 'Виберіть мапу й зброю, встановіть позиції артилерії та цілі й використовуйте отримане рішення. Експериментальна Terrain3D-корекція вмикається вручну й застосовує лише SAFE-кандидати SPH-2; в інших випадках використовується звичайна таблиця. Нахил платформи й корпусу не коригується.',
        features: [
            'Калькулятор міномета L81 для WARDOGS',
            'LOW і HIGH розрахунки SPH-2',
            'Експериментальна Terrain3D-корекція MIL для SPH-2',
            'Інтерактивна мапа Bakurani з контурами рельєфу',
            'Тактична мапа Ozeti з контурами рельєфу',
            'Інтерактивна мапа Zestafona з контурами рельєфу',
            'Повні дані збережених цілей',
            'Лінійка та інструменти малювання',
            'Тактичні маркери'
        ]
    },

    de: {
        title: 'WARDOGS Artillerierechner | L81-Mörser, SPH-2 & Karte',
        description: 'Kostenloser WARDOGS Artillerierechner für L81-Mörser und SPH-2 mit Bakurani-, Ozeti- und Zestafona-Karten und Terrain3D-MIL-Korrektur.',
        heading: 'Über diesen Rechner',
        intro: 'Der WARDOGS Artillery Calculator ist ein kostenloses Open-Source-Community-Tool für L81-Mörser- und SPH-2-Feuerlösungen. Er bietet interaktive Karten für Bakurani, Ozeti und Zestafona, Distanz-, Azimut- und MIL-Berechnung, Höhenlinien und experimentelle Terrain3D-MIL-Korrektur.',
        usage: 'Karte und Waffe auswählen, Artillerie- und Zielposition setzen und die Feuerlösung ablesen. Die experimentelle Terrain3D-Korrektur wird manuell aktiviert und verwendet nur SAFE-SPH-2-Kandidaten; sonst gilt die normale Feuertabelle. Plattform- und Fahrzeugneigung wird nicht korrigiert.',
        features: [
            'WARDOGS L81-Mörserrechner und Feuerlösungen',
            'SPH-2 LOW- und HIGH-Feuerlösungen',
            'Experimentelle Terrain3D-MIL-Korrektur für SPH-2',
            'Interaktive Bakurani-Karte mit Höhenlinien',
            'Taktische Ozeti-Karte mit Höhenlinien',
            'Interaktive Zestafona-Karte mit Höhenlinien',
            'Feuerdaten für gespeicherte Ziele',
            'Lineal und Zeichenwerkzeuge',
            'Taktische Kartenmarker'
        ]
    },

    fr: {
        title: 'Calculateur WARDOGS | Mortier L81, SPH-2 et carte',
        description: 'Calculateur WARDOGS gratuit pour le mortier L81 et le SPH-2 avec cartes Bakurani, Ozeti et Zestafona et correction MIL Terrain3D.',
        heading: 'À propos du calculateur',
        intro: 'WARDOGS Artillery Calculator est un outil communautaire gratuit et open source pour les solutions de tir du mortier L81 et du SPH-2. Il comprend les cartes Bakurani, Ozeti et Zestafona, les calculs de distance, d’azimut et de MIL, les courbes de niveau et une correction Terrain3D expérimentale.',
        usage: 'Sélectionnez une carte et une arme, placez l’artillerie et la cible, puis consultez la solution de tir. La correction Terrain3D expérimentale s’active manuellement et n’applique que les candidats SPH-2 SAFE ; les autres cas utilisent la table de tir normale. L’inclinaison de la plateforme et du châssis n’est pas corrigée.',
        features: [
            'Calculateur du mortier L81 pour WARDOGS',
            'Solutions SPH-2 LOW et HIGH',
            'Correction MIL Terrain3D expérimentale pour SPH-2',
            'Carte interactive Bakurani avec courbes de niveau',
            'Carte tactique Ozeti avec courbes de niveau',
            'Carte interactive Zestafona avec courbes de niveau',
            'Données de tir des cibles enregistrées',
            'Règle et outils de dessin',
            'Marqueurs tactiques'
        ]
    },

    es: {
        title: 'Calculadora WARDOGS | Mortero L81, SPH-2 y mapa',
        description: 'Calculadora WARDOGS gratuita para el mortero L81 y SPH-2 con mapas Bakurani, Ozeti y Zestafona y corrección MIL Terrain3D.',
        heading: 'Acerca de la calculadora',
        intro: 'WARDOGS Artillery Calculator es una herramienta comunitaria gratuita y de código abierto para soluciones de tiro del mortero L81 y SPH-2. Incluye los mapas Bakurani, Ozeti y Zestafona, cálculos de distancia, azimut y MIL, curvas de nivel y corrección Terrain3D experimental.',
        usage: 'Selecciona un mapa y un arma, coloca la artillería y el objetivo y consulta la solución de tiro. La corrección Terrain3D experimental se activa manualmente y solo aplica candidatos SPH-2 SAFE; los demás casos usan la tabla de tiro normal. No se corrige la inclinación de la plataforma o el chasis.',
        features: [
            'Calculadora del mortero L81 para WARDOGS',
            'Soluciones SPH-2 LOW y HIGH',
            'Corrección MIL Terrain3D experimental para SPH-2',
            'Mapa interactivo de Bakurani con curvas de nivel',
            'Mapa táctico de Ozeti con curvas de nivel',
            'Mapa interactivo de Zestafona con curvas de nivel',
            'Datos de tiro de objetivos guardados',
            'Regla y herramientas de dibujo',
            'Marcadores tácticos'
        ]
    },

    pl: {
        title: 'Kalkulator WARDOGS | Moździerz L81, SPH-2 i mapa',
        description: 'Darmowy kalkulator WARDOGS dla moździerza L81 i SPH-2 z mapami Bakurani, Ozeti i Zestafona oraz korektą MIL Terrain3D.',
        heading: 'O kalkulatorze',
        intro: 'WARDOGS Artillery Calculator to darmowe narzędzie open source społeczności do rozwiązań ogniowych moździerza L81 i SPH-2. Zawiera mapy Bakurani, Ozeti i Zestafona, obliczenia dystansu, azymutu i MIL, poziomice oraz eksperymentalną korektę Terrain3D.',
        usage: 'Wybierz mapę i broń, ustaw pozycję artylerii oraz celu, a następnie odczytaj rozwiązanie ogniowe. Eksperymentalną korektę Terrain3D włącza się ręcznie i stosuje ona tylko kandydatów SPH-2 SAFE; w pozostałych przypadkach używana jest zwykła tabela. Przechył platformy i podwozia nie jest korygowany.',
        features: [
            'Kalkulator moździerza L81 dla WARDOGS',
            'Rozwiązania SPH-2 LOW i HIGH',
            'Eksperymentalna korekta MIL Terrain3D dla SPH-2',
            'Interaktywna mapa Bakurani z poziomicami',
            'Mapa taktyczna Ozeti z poziomicami',
            'Interaktywna mapa Zestafona z poziomicami',
            'Dane ogniowe zapisanych celów',
            'Linijka i narzędzia rysowania',
            'Markery taktyczne'
        ]
    },

    ko: {
        title: 'WARDOGS 포병 계산기 | L81 박격포, SPH-2, 지도',
        description: 'L81 박격포와 SPH-2용 무료 WARDOGS 포병 계산기. Bakurani·Ozeti·Zestafona 지도, 등고선, Terrain3D MIL 보정과 전술 도구를 제공합니다.',
        heading: '계산기 소개',
        intro: 'WARDOGS Artillery Calculator는 L81 박격포와 SPH-2 사격 제원을 계산하기 위한 무료 오픈 소스 커뮤니티 도구입니다. Bakurani, Ozeti, Zestafona 지도, 거리·방위각·MIL 계산, 지형 등고선과 실험적 Terrain3D MIL 보정을 제공합니다.',
        usage: '지도와 무기를 선택하고 포병 위치와 목표 위치를 지정한 다음 사격 제원을 확인하세요. 실험적 Terrain3D 보정은 수동으로 켜며 SAFE SPH-2 후보만 적용하고, 나머지는 표준 사격표를 사용합니다. 플랫폼 및 차체 기울기는 보정하지 않습니다.',
        features: [
            'WARDOGS L81 박격포 계산 및 사격 제원',
            'SPH-2 LOW 및 HIGH 사격 제원',
            'SPH-2용 실험적 Terrain3D MIL 보정',
            '등고선이 포함된 Bakurani 인터랙티브 지도',
            '등고선이 포함된 Ozeti 전술 지도',
            '등고선이 포함된 Zestafona 인터랙티브 지도',
            '저장된 목표 사격 정보',
            '거리 측정 및 그리기 도구',
            '전술 지도 마커'
        ]
    },

    pt: {
        title: 'Calculadora WARDOGS | Morteiro L81, SPH-2 e mapa',
        description: 'Calculadora WARDOGS gratuita para morteiro L81 e SPH-2, com mapas Bakurani, Ozeti e Zestafona e correção MIL Terrain3D.',
        heading: 'Sobre a calculadora',
        intro: 'WARDOGS Artillery Calculator é uma ferramenta comunitária gratuita e open source para soluções de tiro do morteiro L81 e do SPH-2. Inclui mapas Bakurani, Ozeti e Zestafona, cálculos de distância, azimute e MIL, curvas de nível e correção Terrain3D experimental.',
        usage: 'Seleciona um mapa e uma arma, coloca as posições da artilharia e do alvo e consulta a solução de tiro. A correção Terrain3D experimental é ativada manualmente e só aplica candidatos SPH-2 SAFE; os restantes casos usam a tabela de tiro normal. A inclinação da plataforma e do chassis não é corrigida.',
        features: [
            'Calculadora do morteiro L81 para WARDOGS',
            'Soluções SPH-2 LOW e HIGH',
            'Correção MIL Terrain3D experimental para SPH-2',
            'Mapa interativo Bakurani com curvas de nível',
            'Mapa tático Ozeti com curvas de nível',
            'Mapa interativo Zestafona com curvas de nível',
            'Dados de tiro dos alvos guardados',
            'Régua e ferramentas de desenho',
            'Marcadores táticos'
        ]
    },
    ja: {
        title: 'WARDOGS砲兵計算機 | L81迫撃砲、SPH-2、マップ',
        description: 'L81迫撃砲とSPH-2に対応した無料のWARDOGS砲兵計算機。Bakurani・Ozeti・Zestafonaマップ、等高線、Terrain3D MIL補正、戦術ツールを備えています。',
        heading: 'この計算機について',
        intro: 'WARDOGS Artillery Calculatorは、L81迫撃砲とSPH-2の射撃諸元を算出するための無料・オープンソースのコミュニティツールです。Bakurani、Ozeti、Zestafonaマップ、距離・方位角・MIL計算、等高線、実験的なTerrain3D MIL補正を提供します。',
        usage: 'マップと火器を選び、砲と目標の位置を置くと射撃諸元が表示されます。実験的なTerrain3D補正は手動で有効にし、SAFEのSPH-2候補だけを適用します。それ以外は通常の射表を使用し、車体の傾斜は補正しません。',
        features: [
            'WARDOGSのL81迫撃砲計算と射撃諸元',
            'SPH-2のLOW / HIGH射撃諸元',
            'SPH-2向けの実験的Terrain3D MIL補正',
            '等高線付きBakuraniインタラクティブマップ',
            '等高線付きOzeti戦術マップ',
            '等高線付きZestafonaインタラクティブマップ',
            '保存した目標の射撃情報',
            '計測ツールと描画ツール',
            '戦術マップマーカー'
        ]
    },
    
    cat: {
        title: 'WARDOGS Meowculator | L81 Mortar, SPH-2 & Meowp',
        description: 'Free WARDOGS arty meowculator for L81 Mortar and SPH-2 with Bakurani, Ozeti and Zestafona meowps, contours and Terrain3D MIL meowgic.',
        heading: 'About the meowculator',
        intro: 'WARDOGS Artillery Calculator is a free open-source community meowculator for L81 Mortar and SPH-2 firing solutions. It includes Bakurani, Ozeti and Zestafona tactical meowps, distance, azimuth and MIL math, contour paws and experimental Terrain3D MIL meowgic.',
        usage: 'Pick a meowp and weapon, place the meowtillery and meowget, then read the firing solution. Experimental Terrain3D meowgic is enabled manually and applies only SAFE SPH-2 candidates; suspicious cat math falls back to the trusty firing table. Tilted cat tanks are not corrected yet.',
        features: [
            'WARDOGS L81 Mortar meowculator',
            'SPH-2 LOW and HIGH firing solutions',
            'Experimental Terrain3D MIL meowgic',
            'Bakurani tactical meowp with contours',
            'Ozeti tactical meowp with contours',
            'Zestafona tactical meowp with contours',
            'Saved meowget firing summaries',
            'Ruler and drawing paws',
            'Tactical map markers'
        ]
    }
};

export const SEO_ALTERNATE_NAMES = [
    'WARDOGS Artillery Calculator & Tactical Map',
    'WARDOGS Arty Calc',
    'WARDOGS L81 Mortar Calculator'
];
