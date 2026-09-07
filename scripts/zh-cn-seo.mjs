export const ZH_CN_SEO = {
    title: 'WARDOGS 炮兵计算器 | L81 迫击炮、SPH-2 与战术地图',
    mobileTitle: 'WARDOGS 炮兵计算器 — 移动版',
    description: '免费的 WARDOGS 炮兵计算器，支持 L81 迫击炮、SPH-2、实时小队房间、Bakurani、Ozeti、Zestafona 地图、等高线及 Terrain3D MIL 修正。',
    featureList: [
        'WARDOGS L81 迫击炮射击解算',
        'SPH-2 LOW / HIGH 射击解算',
        '使用共享战术地图的实时小队房间',
        'SPH-2 实验性 Terrain3D MIL 修正',
        'Bakurani 互动战术地图与等高线',
        'Ozeti 互动战术地图与等高线',
        'Zestafona 互动战术地图与等高线',
        '保存目标的完整射击信息',
        '测距尺与绘图工具',
        '战术地图标记'
    ],
    cluster: {
        heading: 'WARDOGS 炮兵计算器',
        navLabel: '计算器与地图指南',
        intro: 'WARDOGS 炮兵计算器是一款免费、开源的社区工具，可根据手动设置的炮位与目标位置计算距离、方位角和 MIL。L81 迫击炮与 SPH-2 共用同一套战术地图工作区，还可创建实时小队房间，在不合并各玩家射击解算的情况下共享战术规划。',
        sections: [
            {
                id: 'wardogs-mortar-calculator',
                heading: 'WARDOGS L81 迫击炮计算器',
                body: '选择 L81 迫击炮，在地图上设置炮位与目标位置，计算器会给出距离、方位角以及射表 MIL。射程状态会提示目标是否位于 L81 迫击炮支持的射程范围内。'
            },
            {
                id: 'wardogs-sph-2-calculator',
                heading: 'WARDOGS SPH-2 计算器',
                body: '选择 SPH-2 后，可计算距离、方位角以及可用的 LOW / HIGH 射击解算。在支持 Terrain3D 的地形上，可以手动启用实验性 MIL 修正，并同时比较标准射表值与 Terrain3D 候选值。该功能默认关闭，仅会应用被判定为 SAFE 的候选；不确定、不支持或不可达的情况会自动回退到标准射表。平台与车体倾斜目前不会被修正。'
            },
            {
                id: 'wardogs-live-team-map-lobbies',
                heading: 'WARDOGS 实时小队地图房间',
                body: '创建房间并分享邀请链接或代码，即可在同一张 WARDOGS 战术地图上协作。绘图、区域、多边形和玩家标记会实时同步。每位玩家的武器、炮位、目标和射程圈保持独立；队友只能看到带名称的位置，不会出现重复的射程圈。'
            },
            {
                id: 'bakurani-interactive-map',
                heading: 'Bakurani 互动地图',
                body: 'Bakurani 互动地图已校准到 WARDOGS 游戏坐标。炮位、目标、保存的目标、测距尺、绘图和战术标记都使用同一坐标空间，并提供地形等高线和 Terrain3D 高程数据，用于战术规划和受支持的 SPH-2 地形修正预览。'
            },
            {
                id: 'ozeti-interactive-map',
                heading: 'Ozeti 互动地图',
                body: 'Ozeti 互动地图使用校准后的 WARDOGS 坐标和修正后的可玩区域对齐，可用于炮兵解算与战术规划。炮位、目标、保存目标、绘图、标记和地形等高线都使用同一坐标空间，并在数据覆盖范围内提供 Terrain3D 高程信息。'
            },
            {
                id: 'zestafona-interactive-map',
                heading: 'Zestafona 互动地图',
                body: 'Zestafona 互动地图使用校准后的 WARDOGS 坐标，可用于设置炮位、目标和进行战术规划。多级地图瓦片、保存目标、测距尺、绘图、标记、地形等高线和 Terrain3D 高程信息均集成在同一工作区中。'
            },
            {
                id: 'how-to-use',
                heading: '使用方法',
                body: '选择 Bakurani、Ozeti、Zestafona 或自定义地图，再选择 L81 迫击炮或 SPH-2，设置炮位和目标，即可读取距离、方位角与 MIL。若要与小队协作，可创建或加入房间并分享邀请，同时让每位玩家保留独立的当前射击解算。对于支持 Terrain3D 的 SPH-2 射击，可手动开启实验性修正。'
            }
        ]
    },
    faqLabel: '常见问题',
    faqHeading: 'WARDOGS 炮兵计算器常见问题',
    faq: [
        {
            question: '它支持 WARDOGS L81 迫击炮吗？',
            answer: '支持。选择 L81 迫击炮并设置炮位与目标位置后，计算器会提供距离、方位角、射程状态和射表 MIL。'
        },
        {
            question: 'WARDOGS 炮兵计算器支持 SPH-2 吗？',
            answer: '支持。SPH-2 解算包括距离、方位角、LOW / HIGH 射击方案，以及在受支持地形上的可选实验性 Terrain3D MIL 修正。'
        },
        {
            question: '支持哪些 WARDOGS 地图？',
            answer: '目前包含 Bakurani、Ozeti 和 Zestafona 互动地图，并提供自定义地图模式。三张预设地图均使用校准后的游戏坐标，支持战术地图工具和地形等高线，并在 Terrain3D 数据覆盖范围内提供高程信息。'
        },
        {
            question: 'WARDOGS 小队可以一起使用战术地图吗？',
            answer: '可以。创建实时小队房间并分享邀请链接或代码后，绘图、区域、多边形和战术标记会在房间内同步。每位玩家仍保留独立的武器、炮位、目标和射程圈，队友只会看到带名称的位置，不会看到重复的射程圈。'
        },
        {
            question: 'Terrain3D 会修正 SPH-2 的高差 MIL 吗？',
            answer: '可以选择启用实验性 Terrain3D MIL 修正。该功能默认关闭，会同时显示标准射表值和 Terrain3D 候选值，并且只应用被判定为 SAFE 的候选。其他情况会自动回退到标准射表。平台或车体倾斜目前不会被修正。'
        },
        {
            question: 'WARDOGS 地图可以显示地形等高线吗？',
            answer: '可以。受支持的 WARDOGS 地图提供可切换的地形等高线图层，可在 Layers 菜单中与其他战术图层一起开启或关闭。'
        }
    ]
};
