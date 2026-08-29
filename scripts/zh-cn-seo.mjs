export const ZH_CN_SEO = {
    title: 'WARDOGS 炮兵计算器 | 迫击炮、SPH-2 与战术地图',
    mobileTitle: 'WARDOGS 炮兵计算器 — 移动版',
    description: '免费的 WARDOGS 炮兵与迫击炮计算器，支持 Mortar 和 SPH-2，提供 Bakurani、Ozeti 互动地图、Terrain3D 高程信息及战术地图工具。',
    featureList: [
        'WARDOGS 迫击炮射击解算',
        'SPH-2 LOW / HIGH 射表解算',
        'Bakurani 互动战术地图',
        'Ozeti 互动战术地图',
        'Terrain3D 高程与高度差信息',
        '保存目标',
        '测距尺与绘图工具',
        '战术地图标记'
    ],
    cluster: {
        heading: 'WARDOGS 炮兵计算器',
        navLabel: '计算器与地图指南',
        intro: 'WARDOGS 炮兵计算器是一款免费、开源的社区工具，可根据手动设置的炮位与目标位置计算距离、方位角和 MIL。迫击炮与 SPH-2 共用同一套战术地图工作区，便于在游戏过程中快速切换目标并查看射击解算。',
        sections: [
            {
                id: 'wardogs-mortar-calculator',
                heading: 'WARDOGS 迫击炮计算器',
                body: '选择 Mortar，在地图上设置迫击炮与目标位置，计算器会给出距离、方位角以及射表 MIL。射程状态会提示目标是否位于当前迫击炮支持的射程范围内。'
            },
            {
                id: 'wardogs-sph-2-calculator',
                heading: 'WARDOGS SPH-2 计算器',
                body: '选择 SPH-2 后，可计算距离、方位角以及可用的 LOW / HIGH 射表解算。在支持 Terrain3D 的地图上，还可查看炮位与目标的高程和高度差（ΔZ）；在已支持高度修正的地图上，该高度差会自动应用到两条弹道的 MIL。地面水平时修正量为零，因此现有射表在平地上依旧适用。车体倾斜修正尚未启用。'
            },
            {
                id: 'bakurani-interactive-map',
                heading: 'Bakurani 互动地图',
                body: 'Bakurani 互动地图已校准到 WARDOGS 游戏坐标。炮位、目标、保存的目标、测距尺、绘图和战术标记都使用同一坐标空间；在数据覆盖范围内还可显示 Terrain3D 高程信息。Bakurani 已启用高度修正，炮位与目标之间的高度差会自动应用到射表 MIL。'
            },
            {
                id: 'ozeti-interactive-map',
                heading: 'Ozeti 互动地图',
                body: 'Ozeti 互动地图使用校准后的 WARDOGS 坐标和修正后的可玩区域对齐，可用于炮兵解算与战术规划。支持范围内可显示 Terrain3D 高程与高度差信息，但 Ozeti 尚未启用高度修正：其坐标对齐尚未达到数值修正所需的验证标准，因此射表 MIL 保持不变。'
            },
            {
                id: 'how-to-use',
                heading: '使用方法',
                body: '选择 Bakurani、Ozeti 或自定义地图，再选择 Mortar 或 SPH-2，设置炮位和目标，即可读取距离、方位角与 MIL。还可以保存常用目标，或使用测距尺、绘图和标记工具进行小队战术规划。'
            }
        ]
    },
    faqLabel: '常见问题',
    faqHeading: 'WARDOGS 炮兵计算器常见问题',
    faq: [
        {
            question: '它也能作为 WARDOGS 迫击炮计算器吗？',
            answer: '可以。选择 Mortar，设置迫击炮与目标位置后，计算器会提供距离、方位角、射程状态和射表 MIL。'
        },
        {
            question: 'WARDOGS 炮兵计算器支持 SPH-2 吗？',
            answer: '支持。SPH-2 解算包括距离、方位角以及可用的 LOW / HIGH 射表方案。'
        },
        {
            question: '支持哪些 WARDOGS 地图？',
            answer: '目前包含 Bakurani 和 Ozeti 互动地图，并提供自定义地图模式。两张官方地图均使用校准后的游戏坐标；在 Terrain3D 数据覆盖范围内还可显示高程信息，目前 Bakurani 已启用自动高度修正。'
        },
        {
            question: 'Terrain3D 会自动修正地形或车体倾斜造成的 SPH-2 MIL 吗？',
            answer: '地形高度会自动修正，车体倾斜不会。在已支持的地图（目前为 Bakurani）上，炮位与目标之间的高度差（ΔZ）会自动应用到 MIL，迫击炮和 SPH-2 的两条弹道都包含在内。该修正是一个差值，平地上为零，因此现有射表在平地上保持不变；当某条弹道无法修正或地图不受支持时，面板会给出提示。车体倾斜不做修正，SPH-2 射击前仍需调平。'
        }
    ]
};
