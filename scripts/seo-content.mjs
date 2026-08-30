export const SEO_PAGE_CONTENT = {
    en: {
        title: 'WARDOGS Artillery Calculator | Mortar, SPH-2 & Maps',
        description: 'Free WARDOGS artillery and mortar calculator for SPH-2 and Mortar with Bakurani/Ozeti maps, Terrain3D MIL correction, contours and tactical tools.',
        heading: 'About this calculator',
        intro: 'WARDOGS Artillery Calculator is a free, open-source community tool for mortar and SPH-2 firing solutions. It includes interactive tactical maps for Bakurani and Ozeti, coordinate-based targeting, distance, azimuth and MIL calculations, and Terrain3D elevation context where available.',
        usage: 'Select a map and weapon, place the artillery and target positions, then read the firing solution. Saved targets, the ruler, drawing tools and map markers can be used for tactical planning. On supported maps the height difference between the artillery and the target is applied to the MIL automatically; vehicle-tilt correction is not enabled, so the SPH-2 still has to be levelled before firing.',
        features: [
            'WARDOGS mortar calculator and firing solutions',
            'SPH-2 LOW and HIGH firing solutions',
            'Experimental Terrain3D MIL correction for SPH-2',
            'Bakurani interactive tactical map with terrain contours',
            'Ozeti tactical map with terrain contours',
            'Saved target firing summaries',
            'Ruler and drawing tools',
            'Tactical map markers'
        ],
        cluster: {
            heading: 'WARDOGS Artillery Calculator',
            navLabel: 'Calculator and map guide',
            intro: 'WARDOGS Artillery Calculator is a free, open-source community tool for calculating distance, azimuth and MIL from manually placed artillery and target positions. Players looking for a quick WARDOGS arty calc can use the same interface for Mortar and SPH-2 while keeping firing solutions, saved targets and tactical planning tools on the map.',
            sections: [
                {
                    id: 'wardogs-mortar-calculator',
                    heading: 'WARDOGS Mortar Calculator',
                    body: 'Choose Mortar, place the mortar and target on the map, and the calculator returns distance, azimuth and the firing-table MIL value. Range status helps show whether the selected target is inside the supported mortar range.'
                },
                {
                    id: 'wardogs-sph-2-calculator',
                    heading: 'WARDOGS SPH-2 Calculator',
                    body: 'Choose SPH-2 to calculate distance, azimuth and the available LOW/HIGH firing-table solutions. On maps with Terrain3D data, the app shows elevation context and the height difference (ΔZ) between the artillery and target, and on supported maps it applies that height difference to the MIL on both arcs. The correction is zero on flat ground, so the firing tables stand unchanged there. Vehicle-tilt correction is not enabled.'
                },
                {
                    id: 'bakurani-interactive-map',
                    heading: 'Bakurani Interactive Map',
                    body: 'The Bakurani interactive map is calibrated to WARDOGS coordinates so artillery positions, targets, saved targets, the ruler, drawings and tactical markers share the same map space. Terrain3D elevation context is available where supported, and Bakurani is a height-corrected map: the height difference between the artillery and the target is applied to the firing-table MIL automatically.'
                },
                {
                    id: 'ozeti-interactive-map',
                    heading: 'Ozeti Interactive Map',
                    body: 'The Ozeti interactive map uses calibrated WARDOGS coordinates and the corrected playable-area alignment for artillery and tactical planning. Artillery positions, targets, saved targets, the ruler, drawings and markers all use the same coordinate space. Terrain3D elevation and height-difference context is available on supported Ozeti terrain, but Ozeti is not a height-corrected map yet: its coordinate alignment has not been validated to the standard a numeric MIL correction needs, so the firing-table MIL is left alone.'
                },
                {
                    id: 'how-to-use',
                    heading: 'How to use',
                    body: 'Select Bakurani, Ozeti or a custom map, choose Mortar or SPH-2, place the artillery position and target, then read distance, azimuth and MIL. For SPH-2 on supported maps, experimental Terrain3D correction can be enabled manually to compare a SAFE terrain-adjusted candidate with the normal firing-table value.'
                }
            ]
        },
        faq: [
            {
                question: 'Is this also a WARDOGS mortar calculator?',
                answer: 'Yes. Select Mortar, place the mortar and target positions, and the calculator provides distance, azimuth, range status and the firing-table MIL value.'
            },
            {
                question: 'Does WARDOGS Artillery Calculator support SPH-2?',
                answer: 'Yes. SPH-2 support includes distance, azimuth, LOW/HIGH firing solutions and optional experimental Terrain3D MIL correction on supported terrain.'
            },
            {
                question: 'Which WARDOGS maps are available?',
                answer: 'The calculator includes interactive maps for Bakurani and Ozeti, plus a custom-map mode. Both maps use calibrated game-coordinate mapping, Terrain3D elevation context is available where the supported terrain data covers the selected positions, and automatic height correction is currently enabled on Bakurani.'
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
        description: 'Бесплатный артиллерийский и миномётный калькулятор WARDOGS для SPH-2 и Mortar с картами Bakurani и Ozeti, контурами рельефа и экспериментальной Terrain3D-коррекцией MIL.',
        heading: 'О калькуляторе',
        intro: 'WARDOGS Artillery Calculator — бесплатный open-source инструмент сообщества для расчёта миномёта и SPH-2. Он включает интерактивные тактические карты Bakurani и Ozeti, работу с координатами, расчёт дистанции, азимута и MIL, а также контекст высот Terrain3D там, где эти данные доступны.',
        usage: 'Выберите карту и оружие, укажите позицию артиллерии и цель, затем используйте полученный расчёт. Сохранённые цели, линейка, рисование и маркеры помогают с тактическим планированием. На поддерживаемых картах разница высот между артиллерией и целью автоматически учитывается в MIL; коррекция по наклону машины не включена, поэтому SPH-2 всё ещё нужно выравнивать перед стрельбой.',
        features: [
            'Миномётный калькулятор WARDOGS',
            'LOW и HIGH расчёты SPH-2',
            'Экспериментальная Terrain3D-коррекция MIL для SPH-2',
            'Интерактивная карта Bakurani с контурами рельефа',
            'Тактическая карта Ozeti с контурами рельефа',
            'Полные данные сохранённых целей',
            'Линейка и инструменты рисования',
            'Тактические маркеры'
        ]
    },

    uk: {
        description: 'Безкоштовний артилерійський і мінометний калькулятор WARDOGS для SPH-2 та Mortar з мапами Bakurani й Ozeti, контурами рельєфу та експериментальною Terrain3D-корекцією MIL.',
        heading: 'Про калькулятор',
        intro: 'WARDOGS Artillery Calculator — безкоштовний open-source інструмент спільноти для розрахунків міномета та SPH-2. Він містить інтерактивні тактичні карти Bakurani й Ozeti, роботу з координатами, розрахунок дистанції, азимута та MIL, а також дані висот Terrain3D там, де вони доступні.',
        usage: 'Виберіть карту й зброю, встановіть позиції артилерії та цілі й використовуйте отримане рішення для стрільби. Збережені цілі, лінійка, малювання та маркери допомагають із тактичним плануванням. На підтримуваних картах різниця висот між артилерією та ціллю автоматично враховується в MIL; корекції за нахилом машини немає, тому SPH-2 усе ще потрібно вирівнювати перед пострілом.',
        features: [
            'Мінометний калькулятор WARDOGS',
            'LOW і HIGH розрахунки SPH-2',
            'Експериментальна Terrain3D-корекція MIL для SPH-2',
            'Інтерактивна мапа Bakurani з контурами рельєфу',
            'Тактична мапа Ozeti з контурами рельєфу',
            'Повні дані збережених цілей',
            'Лінійка та інструменти малювання',
            'Тактичні маркери'
        ]
    },

    de: {
        description: 'Kostenloser WARDOGS Artillerie- und Mörserrechner für SPH-2 und Mortar mit Bakurani-/Ozeti-Karten, Höhenlinien und experimenteller Terrain3D-MIL-Korrektur.',
        heading: 'Über diesen Rechner',
        intro: 'Der WARDOGS Artillery Calculator ist ein kostenloses Open-Source-Community-Tool für Mörser- und SPH-2-Feuerlösungen. Er bietet interaktive taktische Karten für Bakurani und Ozeti, koordinatenbasierte Zielwahl, Distanz-, Azimut- und MIL-Berechnung sowie Terrain3D-Höheninformationen, sofern verfügbar.',
        usage: 'Karte und Waffe auswählen, Artillerie- und Zielposition setzen und anschließend die Feuerlösung ablesen. Gespeicherte Ziele, Lineal, Zeichenwerkzeuge und Kartenmarker unterstützen die taktische Planung. Auf unterstützten Karten wird der Höhenunterschied zwischen Artillerie und Ziel automatisch auf den MIL-Wert angewendet; eine Korrektur der Fahrzeugneigung ist nicht aktiviert, die SPH-2 muss also weiterhin nivelliert werden.',
        features: [
            'WARDOGS Mörserrechner und Feuerlösungen',
            'SPH-2 LOW- und HIGH-Feuerlösungen',
            'Experimentelle Terrain3D-MIL-Korrektur für SPH-2',
            'Interaktive Bakurani-Karte mit Höhenlinien',
            'Taktische Ozeti-Karte mit Höhenlinien',
            'Feuerdaten für gespeicherte Ziele',
            'Lineal und Zeichenwerkzeuge',
            'Taktische Kartenmarker'
        ]
    },

    fr: {
        description: 'Calculateur gratuit d’artillerie et de mortier WARDOGS pour SPH-2 et Mortar, avec cartes Bakurani/Ozeti, courbes de niveau et correction MIL Terrain3D expérimentale.',
        heading: 'À propos du calculateur',
        intro: 'WARDOGS Artillery Calculator est un outil communautaire gratuit et open source pour les solutions de tir au mortier et au SPH-2. Il comprend des cartes tactiques interactives de Bakurani et Ozeti, le ciblage par coordonnées, le calcul de distance, d’azimut et de MIL, ainsi que le contexte d’altitude Terrain3D lorsqu’il est disponible.',
        usage: 'Sélectionnez une carte et une arme, placez l’artillerie et la cible, puis consultez la solution de tir. Les cibles enregistrées, la règle, les outils de dessin et les marqueurs facilitent la planification tactique. Sur les cartes prises en charge, la différence d’altitude entre l’artillerie et la cible est appliquée automatiquement au MIL ; la correction de l’inclinaison du véhicule n’est pas activée, il faut donc toujours mettre le SPH-2 à niveau avant de tirer.',
        features: [
            'Calculateur de mortier WARDOGS',
            'Solutions SPH-2 LOW et HIGH',
            'Correction MIL Terrain3D expérimentale pour SPH-2',
            'Carte interactive Bakurani avec courbes de niveau',
            'Carte tactique Ozeti avec courbes de niveau',
            'Données de tir des cibles enregistrées',
            'Règle et outils de dessin',
            'Marqueurs tactiques'
        ]
    },

    es: {
        description: 'Calculadora gratuita de artillería y mortero WARDOGS para SPH-2 y Mortar, con mapas Bakurani/Ozeti, curvas de nivel y corrección MIL Terrain3D experimental.',
        heading: 'Acerca de la calculadora',
        intro: 'WARDOGS Artillery Calculator es una herramienta comunitaria gratuita y de código abierto para soluciones de tiro de mortero y SPH-2. Incluye mapas tácticos interactivos de Bakurani y Ozeti, selección de objetivos por coordenadas, cálculo de distancia, azimut y MIL, y contexto de elevación Terrain3D cuando está disponible.',
        usage: 'Selecciona un mapa y un arma, coloca las posiciones de artillería y objetivo y consulta la solución de tiro. Los objetivos guardados, la regla, las herramientas de dibujo y los marcadores ayudan con la planificación táctica. En los mapas compatibles, la diferencia de altura entre la artillería y el objetivo se aplica automáticamente al MIL; la corrección por inclinación del vehículo no está activada, así que el SPH-2 debe nivelarse antes de disparar.',
        features: [
            'Calculadora de mortero WARDOGS',
            'Soluciones SPH-2 LOW y HIGH',
            'Corrección MIL Terrain3D experimental para SPH-2',
            'Mapa interactivo de Bakurani con curvas de nivel',
            'Mapa táctico de Ozeti con curvas de nivel',
            'Datos de tiro de objetivos guardados',
            'Regla y herramientas de dibujo',
            'Marcadores tácticos'
        ]
    },

    pl: {
        description: 'Darmowy kalkulator artylerii i moździerza WARDOGS dla SPH-2 i Mortar z mapami Bakurani/Ozeti, poziomicami i eksperymentalną korektą MIL Terrain3D.',
        heading: 'O kalkulatorze',
        intro: 'WARDOGS Artillery Calculator to darmowe narzędzie open source społeczności do rozwiązań ogniowych moździerza i SPH-2. Zawiera interaktywne mapy taktyczne Bakurani i Ozeti, wybór celu według współrzędnych, obliczenia dystansu, azymutu i MIL oraz informacje o wysokości Terrain3D tam, gdzie są dostępne.',
        usage: 'Wybierz mapę i broń, ustaw pozycję artylerii oraz celu, a następnie odczytaj rozwiązanie ogniowe. Zapisane cele, linijka, narzędzia rysowania i markery pomagają w planowaniu taktycznym. Na obsługiwanych mapach różnica wysokości między artylerią a celem jest automatycznie uwzględniana w MIL; korekta przechyłu pojazdu nie jest włączona, więc SPH-2 nadal trzeba wypoziomować przed strzałem.',
        features: [
            'Kalkulator moździerza WARDOGS',
            'Rozwiązania SPH-2 LOW i HIGH',
            'Eksperymentalna korekta MIL Terrain3D dla SPH-2',
            'Interaktywna mapa Bakurani z poziomicami',
            'Mapa taktyczna Ozeti z poziomicami',
            'Dane ogniowe zapisanych celów',
            'Linijka i narzędzia rysowania',
            'Markery taktyczne'
        ]
    },

    ko: {
        description: 'SPH-2와 Mortar용 무료 WARDOGS 포병·박격포 계산기. Bakurani/Ozeti 지도, 등고선, 실험적 Terrain3D MIL 보정 및 전술 도구를 제공합니다.',
        heading: '계산기 소개',
        intro: 'WARDOGS Artillery Calculator는 박격포와 SPH-2 사격 제원을 계산하기 위한 무료 오픈 소스 커뮤니티 도구입니다. Bakurani와 Ozeti 인터랙티브 전술 지도, 좌표 기반 표적 지정, 거리, 방위각 및 MIL 계산과 지원되는 지역의 Terrain3D 고도 정보를 제공합니다.',
        usage: '지도와 무기를 선택하고 포병 위치와 목표 위치를 지정한 다음 사격 제원을 확인하세요. 저장된 목표, 거리 측정 도구, 그리기 도구와 지도 마커를 전술 계획에 활용할 수 있습니다. 지원되는 지도에서는 포병과 목표의 고도차가 MIL에 자동으로 반영됩니다. 차량 기울기 보정은 활성화되어 있지 않으므로 SPH-2는 사격 전에 수평을 맞춰야 합니다.',
        features: [
            'WARDOGS 박격포 계산 및 사격 제원',
            'SPH-2 LOW 및 HIGH 사격 제원',
            'SPH-2용 실험적 Terrain3D MIL 보정',
            '등고선이 포함된 Bakurani 인터랙티브 지도',
            '등고선이 포함된 Ozeti 전술 지도',
            '저장된 목표 사격 정보',
            '거리 측정 및 그리기 도구',
            '전술 지도 마커'
        ]
    },

    pt: {
        description: 'Calculadora gratuita de artilharia e morteiro WARDOGS para SPH-2 e Mortar, com mapas Bakurani/Ozeti, curvas de nível e correção MIL Terrain3D experimental.',
        heading: 'Sobre a calculadora',
        intro: 'WARDOGS Artillery Calculator é uma ferramenta comunitária gratuita e open source para soluções de tiro de morteiro e SPH-2. Inclui mapas táticos interativos de Bakurani e Ozeti, seleção por coordenadas, cálculo de distância, azimute e MIL e contexto de altitude Terrain3D quando disponível.',
        usage: 'Seleciona um mapa e uma arma, coloca as posições da artilharia e do alvo e consulta a solução de tiro. Alvos guardados, régua, ferramentas de desenho e marcadores ajudam no planeamento tático. Nos mapas suportados, a diferença de altitude entre a artilharia e o alvo é aplicada automaticamente ao MIL; a correção de inclinação do veículo não está ativada, por isso o SPH-2 tem de ser nivelado antes de disparar.',
        features: [
            'Calculadora de morteiro WARDOGS',
            'Soluções SPH-2 LOW e HIGH',
            'Correção MIL Terrain3D experimental para SPH-2',
            'Mapa interativo Bakurani com curvas de nível',
            'Mapa tático Ozeti com curvas de nível',
            'Dados de tiro dos alvos guardados',
            'Régua e ferramentas de desenho',
            'Marcadores táticos'
        ]
    },

    cat: {
        description: 'Free WARDOGS arty and mortar meowculator with SPH-2, Bakurani/Ozeti meowps, contour paws and experimental Terrain3D MIL meowgic.',
        heading: 'About the meowculator',
        intro: 'WARDOGS Artillery Calculator is a free open-source community meowculator for mortar and SPH-2 firing solutions. It includes interactive Bakurani and Ozeti tactical maps, coordinate targeting, distance, azimuth and MIL calculations, plus Terrain3D height context where available.',
        usage: 'Pick a map and weapon, place the meowtillery and meowget, then read the firing solution. Saved targets, ruler, drawing tools and markers help with tactical planning. On supported maps the height difference between meowtillery and meowget is applied to the MIL all by itself; vehicle-tilt meowgic is not enabled, so the SPH-2 still needs levelling before firing.',
        features: [
            'WARDOGS mortar meowculator',
            'SPH-2 LOW and HIGH firing solutions',
            'Experimental Terrain3D MIL meowgic',
            'Bakurani tactical meowp with contours',
            'Ozeti tactical meowp with contours',
            'Saved meowget firing summaries',
            'Ruler and drawing paws',
            'Tactical map markers'
        ]
    }
};

export const SEO_ALTERNATE_NAMES = [
    'WARDOGS Artillery Calculator & Tactical Map',
    'WARDOGS Arty Calc'
];
