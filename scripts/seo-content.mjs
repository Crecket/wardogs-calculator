export const SEO_PAGE_CONTENT = {
    en: {
        title: 'WARDOGS Artillery Calculator | L81 Mortar, SPH-2 & Live Map',
        description: 'Free WARDOGS L81 Mortar and SPH-2 artillery calculator with live team lobbies, Bakurani, Ozeti and Zestafona maps, Terrain3D MIL correction and tactical tools.',
        heading: 'About this calculator',
        intro: 'WARDOGS Artillery Calculator is a free, open-source community tool for L81 Mortar and SPH-2 firing solutions. It includes interactive tactical maps for Bakurani, Ozeti and Zestafona, live team map lobbies, coordinate-based targeting, distance, azimuth and MIL calculations, terrain contours, and experimental Terrain3D MIL correction for SPH-2 where supported.',
        usage: 'Select a map and weapon, place the artillery and target positions, then read the firing solution. Create or join a lobby to synchronise drawings, zones, polygons and tactical markers with a squad while every player keeps a separate weapon, artillery point, target and range circle. Teammates see each other as labelled artillery-to-target overlays without extra range circles. Experimental Terrain3D correction is opt-in and off by default; only SAFE SPH-2 candidates are applied, while uncertain or unsupported cases automatically use the normal firing table. Platform and chassis tilt correction is not enabled.',
        features: [
            'WARDOGS L81 Mortar calculator and firing solutions',
            'SPH-2 LOW and HIGH firing solutions',
            'Live team map lobbies with shared tactical planning',
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
            intro: 'WARDOGS Artillery Calculator is a free, open-source community tool for calculating distance, azimuth and MIL from manually placed artillery and target positions. Players looking for a quick WARDOGS arty calc can use the same interface for L81 Mortar and SPH-2, then open a live team lobby to share tactical map planning without merging each player’s firing solution.',
            sections: [
                {
                    id: 'wardogs-mortar-calculator',
                    heading: 'WARDOGS L81 Mortar Calculator',
                    body: 'Choose L81 Mortar, place the L81 Mortar and target on the map, and the calculator returns distance, azimuth and the firing-table MIL value. Range status shows whether the selected target is inside the supported L81 Mortar range.'
                },
                {
                    id: 'wardogs-sph-2-calculator',
                    heading: 'WARDOGS SPH-2 Calculator',
                    body: 'Choose SPH-2 to calculate distance, azimuth and the available LOW/HIGH firing solutions. On supported Terrain3D maps, an experimental opt-in correction can compare the normal table value with a terrain-adjusted MIL candidate. It is off by default and only SAFE candidates are applied; uncertain, unsupported or unreachable cases automatically fall back to the normal firing table. Platform and chassis tilt correction is not included.'
                },
                {
                    id: 'wardogs-live-team-map-lobbies',
                    heading: 'WARDOGS Live Team Map Lobbies',
                    body: 'Create a lobby and share its invite link or code to plan on the same WARDOGS tactical map. Drawings, zones, polygons and user markers synchronise live. Each participant keeps a separate weapon, artillery point, target and range circle, while teammates see labelled player positions without duplicate range circles.'
                },
                {
                    id: 'bakurani-interactive-map',
                    heading: 'Bakurani Interactive Map',
                    body: 'The Bakurani interactive map is calibrated to WARDOGS coordinates so artillery positions, targets, saved targets, the ruler, drawings and tactical markers share the same map space. Terrain contour layers and Terrain3D elevation data are available for tactical planning and supported SPH-2 terrain-correction previews.'
                },
                {
                    id: 'ozeti-interactive-map',
                    heading: 'Ozeti Interactive Map',
                    body: 'The Ozeti interactive map uses calibrated WARDOGS coordinates and corrected playable-area alignment for artillery and tactical planning. Artillery positions, targets, saved targets, drawings, markers and terrain contours share the same coordinate space, with Terrain3D elevation data available where supported.'
                },
                {
                    id: 'zestafona-interactive-map',
                    heading: 'Zestafona Interactive Map',
                    body: 'The Zestafona interactive map uses calibrated WARDOGS coordinates for artillery placement, targets and tactical planning. Multi-resolution map tiles, saved targets, the ruler, drawings, markers, terrain contours and Terrain3D elevation context are available in the same workspace.'
                },
                {
                    id: 'how-to-use',
                    heading: 'How to use',
                    body: 'Select Bakurani, Ozeti, Zestafona or a custom map, choose L81 Mortar or SPH-2, place the artillery position and target, then read distance, azimuth and MIL. To plan with a squad, create or join a lobby and share its invite while keeping each player’s active firing solution separate. For SPH-2 on supported maps, experimental Terrain3D correction can be enabled manually to compare a SAFE terrain-adjusted candidate with the normal firing-table value.'
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
                question: 'Can a WARDOGS squad use the tactical map together?',
                answer: 'Yes. Create a live team lobby and share its invite link or code. Drawings, zones, polygons and tactical markers synchronise for the room, while every player keeps a separate weapon, artillery point, target and range circle. Teammates see labelled player positions without duplicate range circles.'
            },
            {
                question: 'Does Terrain3D correct SPH-2 MIL for elevation?',
                answer: 'Experimental Terrain3D MIL correction is available as an opt-in feature for SPH-2 on supported terrain. It is off by default, shows the normal table value alongside the Terrain3D candidate, and only applies candidates classified as SAFE. Other cases automatically fall back to the normal firing table. Vehicle or chassis tilt is not corrected.'
            },
            {
                question: 'Does the WARDOGS map show terrain contours?',
                answer: 'Yes. Terrain contour layers are available on supported WARDOGS maps and can be toggled from the Layers menu together with other tactical overlays.'
            }
        ]
    },

    ru: {
        title: 'Калькулятор WARDOGS | Миномёт L81, SPH-2 и командная карта',
        description: 'Бесплатный калькулятор WARDOGS для миномёта L81 и SPH-2 с командными онлайн-лобби, картами Bakurani, Ozeti и Zestafona и Terrain3D-коррекцией MIL.',
        heading: 'О калькуляторе',
        intro: 'WARDOGS Artillery Calculator — бесплатный open-source инструмент сообщества для расчёта миномёта L81 и SPH-2. Он включает интерактивные карты Bakurani, Ozeti и Zestafona, командные онлайн-лобби с общей тактической картой, расчёт дистанции, азимута и MIL, контуры рельефа и экспериментальную Terrain3D-коррекцию MIL.',
        usage: 'Выберите карту и оружие, укажите позицию артиллерии и цель, затем используйте полученный расчёт. В лобби рисунки, зоны, полигоны и тактические метки синхронизируются, а оружие, орудие, цель и круг дальности остаются отдельными для каждого игрока. Союзники видят подписанные позиции друг друга без лишних кругов дальности. Экспериментальная Terrain3D-коррекция включается вручную и применяет только SAFE-кандидаты SPH-2; в остальных случаях используется обычная таблица. Коррекция наклона платформы и корпуса не включена.',
        features: [
            'Калькулятор миномёта L81 для WARDOGS',
            'LOW и HIGH расчёты SPH-2',
            'Командные онлайн-лобби с общей тактической картой',
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
        title: 'Калькулятор WARDOGS | Міномет L81, SPH-2 та командна мапа',
        description: 'Безкоштовний калькулятор WARDOGS для міномета L81 і SPH-2 з командними онлайн-лобі, мапами Bakurani, Ozeti й Zestafona та Terrain3D-корекцією MIL.',
        heading: 'Про калькулятор',
        intro: 'WARDOGS Artillery Calculator — безкоштовний open-source інструмент спільноти для розрахунків міномета L81 та SPH-2. Він містить інтерактивні мапи Bakurani, Ozeti та Zestafona, командні онлайн-лобі зі спільною тактичною мапою, розрахунок дистанції, азимута й MIL, контури рельєфу та експериментальну Terrain3D-корекцію MIL.',
        usage: 'Виберіть мапу й зброю, встановіть позиції артилерії та цілі й використовуйте отримане рішення. У лобі малюнки, зони, полігони й тактичні позначки синхронізуються, а зброя, гармата, ціль і коло дальності залишаються окремими для кожного гравця. Союзники бачать підписані позиції одне одного без зайвих кіл дальності. Експериментальна Terrain3D-корекція вмикається вручну й застосовує лише SAFE-кандидати SPH-2; в інших випадках використовується звичайна таблиця. Нахил платформи й корпусу не коригується.',
        features: [
            'Калькулятор міномета L81 для WARDOGS',
            'LOW і HIGH розрахунки SPH-2',
            'Командні онлайн-лобі зі спільною тактичною мапою',
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
        title: 'WARDOGS Artillerierechner | L81-Mörser, SPH-2 & Teamkarte',
        description: 'Kostenloser WARDOGS Artillerierechner für L81-Mörser und SPH-2 mit Live-Team-Lobbys, Bakurani-, Ozeti- und Zestafona-Karten und Terrain3D-MIL-Korrektur.',
        heading: 'Über diesen Rechner',
        intro: 'Der WARDOGS Artillery Calculator ist ein kostenloses Open-Source-Community-Tool für L81-Mörser- und SPH-2-Feuerlösungen. Er bietet interaktive Karten für Bakurani, Ozeti und Zestafona, Live-Team-Lobbys mit gemeinsamer taktischer Karte, Distanz-, Azimut- und MIL-Berechnung, Höhenlinien und experimentelle Terrain3D-MIL-Korrektur.',
        usage: 'Karte und Waffe auswählen, Artillerie- und Zielposition setzen und die Feuerlösung ablesen. In einer Lobby werden Zeichnungen, Zonen, Polygone und taktische Marker synchronisiert; Waffe, Geschütz, Ziel und Reichweitenkreis bleiben für jeden Spieler getrennt. Teammitglieder sehen beschriftete Spielerpositionen ohne zusätzliche Reichweitenkreise. Die experimentelle Terrain3D-Korrektur wird manuell aktiviert und verwendet nur SAFE-SPH-2-Kandidaten; sonst gilt die normale Feuertabelle. Plattform- und Fahrzeugneigung wird nicht korrigiert.',
        features: [
            'WARDOGS L81-Mörserrechner und Feuerlösungen',
            'SPH-2 LOW- und HIGH-Feuerlösungen',
            'Live-Team-Lobbys mit gemeinsamer taktischer Karte',
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
        title: 'Calculateur WARDOGS | Mortier L81, SPH-2 et carte d’équipe',
        description: 'Calculateur WARDOGS gratuit pour le mortier L81 et le SPH-2 avec salons d’équipe en direct, cartes Bakurani, Ozeti et Zestafona et correction MIL Terrain3D.',
        heading: 'À propos du calculateur',
        intro: 'WARDOGS Artillery Calculator est un outil communautaire gratuit et open source pour les solutions de tir du mortier L81 et du SPH-2. Il comprend les cartes Bakurani, Ozeti et Zestafona, des salons d’équipe en direct avec carte tactique partagée, les calculs de distance, d’azimut et de MIL, les courbes de niveau et une correction Terrain3D expérimentale.',
        usage: 'Sélectionnez une carte et une arme, placez l’artillerie et la cible, puis consultez la solution de tir. Dans un salon, les dessins, zones, polygones et marqueurs tactiques sont synchronisés, tandis que l’arme, l’artillerie, la cible et le cercle de portée restent propres à chaque joueur. Les coéquipiers voient les positions identifiées sans cercles de portée supplémentaires. La correction Terrain3D expérimentale s’active manuellement et n’applique que les candidats SPH-2 SAFE ; les autres cas utilisent la table de tir normale. L’inclinaison de la plateforme et du châssis n’est pas corrigée.',
        features: [
            'Calculateur du mortier L81 pour WARDOGS',
            'Solutions SPH-2 LOW et HIGH',
            'Salons d’équipe en direct avec carte tactique partagée',
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
        title: 'Calculadora WARDOGS | Mortero L81, SPH-2 y mapa de equipo',
        description: 'Calculadora WARDOGS gratuita para el mortero L81 y SPH-2 con salas de equipo en vivo, mapas Bakurani, Ozeti y Zestafona y corrección MIL Terrain3D.',
        heading: 'Acerca de la calculadora',
        intro: 'WARDOGS Artillery Calculator es una herramienta comunitaria gratuita y de código abierto para soluciones de tiro del mortero L81 y SPH-2. Incluye los mapas Bakurani, Ozeti y Zestafona, salas de equipo en vivo con mapa táctico compartido, cálculos de distancia, azimut y MIL, curvas de nivel y corrección Terrain3D experimental.',
        usage: 'Selecciona un mapa y un arma, coloca la artillería y el objetivo y consulta la solución de tiro. En una sala se sincronizan dibujos, zonas, polígonos y marcadores tácticos, mientras que el arma, la artillería, el objetivo y el círculo de alcance permanecen separados para cada jugador. Los compañeros ven posiciones identificadas sin círculos de alcance adicionales. La corrección Terrain3D experimental se activa manualmente y solo aplica candidatos SPH-2 SAFE; los demás casos usan la tabla de tiro normal. No se corrige la inclinación de la plataforma o el chasis.',
        features: [
            'Calculadora del mortero L81 para WARDOGS',
            'Soluciones SPH-2 LOW y HIGH',
            'Salas de equipo en vivo con mapa táctico compartido',
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
        title: 'Kalkulator WARDOGS | Moździerz L81, SPH-2 i mapa zespołu',
        description: 'Darmowy kalkulator WARDOGS dla moździerza L81 i SPH-2 z pokojami zespołowymi, mapami Bakurani, Ozeti i Zestafona oraz korektą MIL Terrain3D.',
        heading: 'O kalkulatorze',
        intro: 'WARDOGS Artillery Calculator to darmowe narzędzie open source społeczności do rozwiązań ogniowych moździerza L81 i SPH-2. Zawiera mapy Bakurani, Ozeti i Zestafona, zespołowe pokoje online ze wspólną mapą taktyczną, obliczenia dystansu, azymutu i MIL, poziomice oraz eksperymentalną korektę Terrain3D.',
        usage: 'Wybierz mapę i broń, ustaw pozycję artylerii oraz celu, a następnie odczytaj rozwiązanie ogniowe. W pokoju synchronizowane są rysunki, strefy, wielokąty i znaczniki taktyczne, natomiast broń, działo, cel i okrąg zasięgu pozostają oddzielne dla każdego gracza. Członkowie zespołu widzą podpisane pozycje bez dodatkowych okręgów zasięgu. Eksperymentalną korektę Terrain3D włącza się ręcznie i stosuje ona tylko kandydatów SPH-2 SAFE; w pozostałych przypadkach używana jest zwykła tabela. Przechył platformy i podwozia nie jest korygowany.',
        features: [
            'Kalkulator moździerza L81 dla WARDOGS',
            'Rozwiązania SPH-2 LOW i HIGH',
            'Zespołowe pokoje online ze wspólną mapą taktyczną',
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
        title: 'WARDOGS 포병 계산기 | L81 박격포, SPH-2, 팀 지도',
        description: 'L81 박격포와 SPH-2용 무료 WARDOGS 포병 계산기. 실시간 팀 로비, Bakurani·Ozeti·Zestafona 지도, 등고선, Terrain3D MIL 보정과 전술 도구를 제공합니다.',
        heading: '계산기 소개',
        intro: 'WARDOGS Artillery Calculator는 L81 박격포와 SPH-2 사격 제원을 계산하기 위한 무료 오픈 소스 커뮤니티 도구입니다. Bakurani, Ozeti, Zestafona 지도, 공유 전술 지도를 사용하는 실시간 팀 로비, 거리·방위각·MIL 계산, 지형 등고선과 실험적 Terrain3D MIL 보정을 제공합니다.',
        usage: '지도와 무기를 선택하고 포병 위치와 목표 위치를 지정한 다음 사격 제원을 확인하세요. 로비에서는 그림, 구역, 다각형과 전술 마커가 동기화되지만 무기, 포병 위치, 목표와 사거리 원은 플레이어별로 유지됩니다. 팀원은 추가 사거리 원 없이 이름이 표시된 서로의 위치를 볼 수 있습니다. 실험적 Terrain3D 보정은 수동으로 켜며 SAFE SPH-2 후보만 적용하고, 나머지는 표준 사격표를 사용합니다. 플랫폼 및 차체 기울기는 보정하지 않습니다.',
        features: [
            'WARDOGS L81 박격포 계산 및 사격 제원',
            'SPH-2 LOW 및 HIGH 사격 제원',
            '공유 전술 지도를 사용하는 실시간 팀 로비',
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
        title: 'Calculadora WARDOGS | Morteiro L81, SPH-2 e mapa de equipa',
        description: 'Calculadora WARDOGS gratuita para morteiro L81 e SPH-2, com salas de equipa em direto, mapas Bakurani, Ozeti e Zestafona e correção MIL Terrain3D.',
        heading: 'Sobre a calculadora',
        intro: 'WARDOGS Artillery Calculator é uma ferramenta comunitária gratuita e open source para soluções de tiro do morteiro L81 e do SPH-2. Inclui mapas Bakurani, Ozeti e Zestafona, salas de equipa em direto com mapa tático partilhado, cálculos de distância, azimute e MIL, curvas de nível e correção Terrain3D experimental.',
        usage: 'Seleciona um mapa e uma arma, coloca as posições da artilharia e do alvo e consulta a solução de tiro. Numa sala, desenhos, zonas, polígonos e marcadores táticos são sincronizados, enquanto a arma, a artilharia, o alvo e o círculo de alcance ficam separados por jogador. A equipa vê posições identificadas sem círculos de alcance adicionais. A correção Terrain3D experimental é ativada manualmente e só aplica candidatos SPH-2 SAFE; os restantes casos usam a tabela de tiro normal. A inclinação da plataforma e do chassis não é corrigida.',
        features: [
            'Calculadora do morteiro L81 para WARDOGS',
            'Soluções SPH-2 LOW e HIGH',
            'Salas de equipa em direto com mapa tático partilhado',
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
        title: 'WARDOGS砲兵計算機 | L81迫撃砲、SPH-2、チームマップ',
        description: 'L81迫撃砲とSPH-2に対応した無料のWARDOGS砲兵計算機。リアルタイムのチームロビー、Bakurani・Ozeti・Zestafonaマップ、等高線、Terrain3D MIL補正、戦術ツールを備えています。',
        heading: 'この計算機について',
        intro: 'WARDOGS Artillery Calculatorは、L81迫撃砲とSPH-2の射撃諸元を算出するための無料・オープンソースのコミュニティツールです。Bakurani、Ozeti、Zestafonaマップ、共有戦術マップを使うリアルタイムのチームロビー、距離・方位角・MIL計算、等高線、実験的なTerrain3D MIL補正を提供します。',
        usage: 'マップと火器を選び、砲と目標の位置を置くと射撃諸元が表示されます。ロビーでは描画、ゾーン、ポリゴン、戦術マーカーが同期されますが、火器、砲位置、目標、射程円はプレイヤーごとに分かれています。チームメンバーの位置は名前付きで表示され、他人の射程円は表示されません。実験的なTerrain3D補正は手動で有効にし、SAFEのSPH-2候補だけを適用します。それ以外は通常の射表を使用し、車体の傾斜は補正しません。',
        features: [
            'WARDOGSのL81迫撃砲計算と射撃諸元',
            'SPH-2のLOW / HIGH射撃諸元',
            '共有戦術マップを使うリアルタイムのチームロビー',
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
        title: 'WARDOGS Meowculator | L81 Mortar, SPH-2 & Team Meowp',
        description: 'Free WARDOGS arty meowculator for L81 Mortar and SPH-2 with live squad meowbbies, Bakurani, Ozeti and Zestafona meowps, contours and Terrain3D MIL meowgic.',
        heading: 'About the meowculator',
        intro: 'WARDOGS Artillery Calculator is a free open-source community meowculator for L81 Mortar and SPH-2 firing solutions. It includes Bakurani, Ozeti and Zestafona tactical meowps, live squad meowbbies, distance, azimuth and MIL math, contour paws and experimental Terrain3D MIL meowgic.',
        usage: 'Pick a meowp and weapon, place the meowtillery and meowget, then read the firing solution. In a meowbby, drawings, zones, polygons and tactical markers sync while every cat keeps separate weapon, artillery, target and range paws. Teammates see named cat positions without extra range circles. Experimental Terrain3D meowgic is enabled manually and applies only SAFE SPH-2 candidates; suspicious cat math falls back to the trusty firing table. Tilted cat tanks are not corrected yet.',
        features: [
            'WARDOGS L81 Mortar meowculator',
            'SPH-2 LOW and HIGH firing solutions',
            'Live squad meowbbies with a shared tactical meowp',
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
