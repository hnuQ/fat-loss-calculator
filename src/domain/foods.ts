import type { Food } from "./diary";

// 来源：减脂计算器3.0.xlsx 五张食材库表，第 4 行起的全部 78 条。
// 保留工作簿热量，不重算内置数据；不导入处方性备注。
const workbookFoods: Food[] = [
  {
    "id": "staple-oats-dry",
    "name": "燕麦（干）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 60,
      "proteinGrams": 13,
      "fatGrams": 7,
      "energyKcal": 377
    }
  },
  {
    "id": "staple-cooked-rice",
    "name": "熟米饭",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 28.5,
      "proteinGrams": 2.5,
      "fatGrams": 0.3,
      "energyKcal": 130
    }
  },
  {
    "id": "builtin-3",
    "name": "大米（生）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 78.5,
      "proteinGrams": 7.4,
      "fatGrams": 0.8,
      "energyKcal": 346
    }
  },
  {
    "id": "builtin-4",
    "name": "红薯（生）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 22,
      "proteinGrams": 1.6,
      "fatGrams": 0.1,
      "energyKcal": 99
    }
  },
  {
    "id": "builtin-5",
    "name": "紫薯（生）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 22,
      "proteinGrams": 1.5,
      "fatGrams": 0.2,
      "energyKcal": 90
    }
  },
  {
    "id": "builtin-6",
    "name": "土豆（生）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 22,
      "proteinGrams": 2,
      "fatGrams": 0.2,
      "energyKcal": 81
    }
  },
  {
    "id": "builtin-7",
    "name": "贝贝南瓜（生）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 22,
      "proteinGrams": 1.5,
      "fatGrams": 0.1,
      "energyKcal": 85
    }
  },
  {
    "id": "builtin-8",
    "name": "荞麦面（干）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 70,
      "proteinGrams": 12,
      "fatGrams": 2,
      "energyKcal": 343
    }
  },
  {
    "id": "builtin-9",
    "name": "全麦面包",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 45,
      "proteinGrams": 9,
      "fatGrams": 3,
      "energyKcal": 250
    }
  },
  {
    "id": "builtin-10",
    "name": "玉米（鲜）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 19,
      "proteinGrams": 3.5,
      "fatGrams": 1.5,
      "energyKcal": 106
    }
  },
  {
    "id": "builtin-11",
    "name": "糙米（生）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 77,
      "proteinGrams": 7.7,
      "fatGrams": 2.7,
      "energyKcal": 348
    }
  },
  {
    "id": "builtin-12",
    "name": "藜麦（生）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 64,
      "proteinGrams": 14,
      "fatGrams": 6,
      "energyKcal": 368
    }
  },
  {
    "id": "builtin-13",
    "name": "山药（生）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 12,
      "proteinGrams": 1.9,
      "fatGrams": 0.2,
      "energyKcal": 57
    }
  },
  {
    "id": "builtin-14",
    "name": "芋头（生）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 18,
      "proteinGrams": 2.2,
      "fatGrams": 0.2,
      "energyKcal": 81
    }
  },
  {
    "id": "builtin-15",
    "name": "意面（干）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 75,
      "proteinGrams": 11,
      "fatGrams": 1.5,
      "energyKcal": 351
    }
  },
  {
    "id": "builtin-16",
    "name": "米糊",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 90,
      "proteinGrams": 5.4,
      "fatGrams": 0.8,
      "energyKcal": 395
    }
  },
  {
    "id": "protein-whole-egg",
    "name": "全蛋（按个）",
    "unit": "item",
    "baseAmount": 1,
    "nutrients": {
      "carbohydrateGrams": 0.4,
      "proteinGrams": 7,
      "fatGrams": 4,
      "energyKcal": 72
    }
  },
  {
    "id": "builtin-18",
    "name": "蛋白（按个）",
    "unit": "item",
    "baseAmount": 1,
    "nutrients": {
      "carbohydrateGrams": 0.2,
      "proteinGrams": 3.6,
      "fatGrams": 0.1,
      "energyKcal": 17
    }
  },
  {
    "id": "protein-chicken-breast",
    "name": "鸡胸肉（生）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 0,
      "proteinGrams": 24,
      "fatGrams": 1,
      "energyKcal": 110
    }
  },
  {
    "id": "builtin-20",
    "name": "去皮去骨鸡腿（生）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 0,
      "proteinGrams": 24,
      "fatGrams": 4,
      "energyKcal": 130
    }
  },
  {
    "id": "builtin-21",
    "name": "牛肉（生）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 0,
      "proteinGrams": 24,
      "fatGrams": 5,
      "energyKcal": 145
    }
  },
  {
    "id": "builtin-22",
    "name": "瘦猪肉（生）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 0,
      "proteinGrams": 22,
      "fatGrams": 6,
      "energyKcal": 143
    }
  },
  {
    "id": "builtin-23",
    "name": "虾仁（生）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 0,
      "proteinGrams": 20,
      "fatGrams": 0.5,
      "energyKcal": 85
    }
  },
  {
    "id": "builtin-24",
    "name": "龙利鱼（生）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 0,
      "proteinGrams": 18,
      "fatGrams": 2,
      "energyKcal": 88
    }
  },
  {
    "id": "builtin-25",
    "name": "巴沙鱼（生）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 0,
      "proteinGrams": 14,
      "fatGrams": 5,
      "energyKcal": 100
    }
  },
  {
    "id": "builtin-26",
    "name": "三文鱼（生）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 0,
      "proteinGrams": 20,
      "fatGrams": 13,
      "energyKcal": 200
    }
  },
  {
    "id": "builtin-27",
    "name": "蛋白粉",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 5,
      "proteinGrams": 75,
      "fatGrams": 2,
      "energyKcal": 340
    }
  },
  {
    "id": "builtin-28",
    "name": "牛奶",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 5,
      "proteinGrams": 3,
      "fatGrams": 3.2,
      "energyKcal": 65
    }
  },
  {
    "id": "builtin-29",
    "name": "无糖酸奶",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 4,
      "proteinGrams": 3,
      "fatGrams": 3,
      "energyKcal": 59
    }
  },
  {
    "id": "builtin-30",
    "name": "豆腐",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 2,
      "proteinGrams": 8,
      "fatGrams": 4,
      "energyKcal": 76
    }
  },
  {
    "id": "builtin-31",
    "name": "金枪鱼（水浸）",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 0,
      "proteinGrams": 25,
      "fatGrams": 1,
      "energyKcal": 110
    }
  },
  {
    "id": "builtin-32",
    "name": "蟹柳",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 8,
      "proteinGrams": 10,
      "fatGrams": 0.5,
      "energyKcal": 75
    }
  },
  {
    "id": "builtin-33",
    "name": "南瓜籽",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 15,
      "proteinGrams": 30,
      "fatGrams": 50,
      "energyKcal": 580
    }
  },
  {
    "id": "builtin-34",
    "name": "坚果",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 18,
      "proteinGrams": 18,
      "fatGrams": 60,
      "energyKcal": 650
    }
  },
  {
    "id": "builtin-35",
    "name": "杏仁",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 20,
      "proteinGrams": 21,
      "fatGrams": 50,
      "energyKcal": 579
    }
  },
  {
    "id": "builtin-36",
    "name": "核桃",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 14,
      "proteinGrams": 15,
      "fatGrams": 65,
      "energyKcal": 654
    }
  },
  {
    "id": "builtin-37",
    "name": "橄榄油",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 0,
      "proteinGrams": 0,
      "fatGrams": 100,
      "energyKcal": 900
    }
  },
  {
    "id": "builtin-38",
    "name": "牛油果油",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 0,
      "proteinGrams": 0,
      "fatGrams": 100,
      "energyKcal": 900
    }
  },
  {
    "id": "builtin-39",
    "name": "山茶油",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 0,
      "proteinGrams": 0,
      "fatGrams": 100,
      "energyKcal": 900
    }
  },
  {
    "id": "builtin-40",
    "name": "低芥酸菜籽油",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 0,
      "proteinGrams": 0,
      "fatGrams": 100,
      "energyKcal": 900
    }
  },
  {
    "id": "builtin-41",
    "name": "猪油",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 0,
      "proteinGrams": 0,
      "fatGrams": 100,
      "energyKcal": 900
    }
  },
  {
    "id": "builtin-42",
    "name": "牛油",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 0,
      "proteinGrams": 0,
      "fatGrams": 100,
      "energyKcal": 900
    }
  },
  {
    "id": "builtin-43",
    "name": "花生酱",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 20,
      "proteinGrams": 25,
      "fatGrams": 50,
      "energyKcal": 600
    }
  },
  {
    "id": "builtin-44",
    "name": "牛油果",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 9,
      "proteinGrams": 2,
      "fatGrams": 15,
      "energyKcal": 160
    }
  },
  {
    "id": "builtin-45",
    "name": "奇亚籽",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 42,
      "proteinGrams": 17,
      "fatGrams": 31,
      "energyKcal": 486
    }
  },
  {
    "id": "builtin-46",
    "name": "亚麻籽",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 29,
      "proteinGrams": 18,
      "fatGrams": 42,
      "energyKcal": 534
    }
  },
  {
    "id": "builtin-47",
    "name": "芝麻酱",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 17,
      "proteinGrams": 20,
      "fatGrams": 53,
      "energyKcal": 595
    }
  },
  {
    "id": "builtin-48",
    "name": "蔬菜",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 4,
      "proteinGrams": 2.5,
      "fatGrams": 0.3,
      "energyKcal": 30
    }
  },
  {
    "id": "builtin-49",
    "name": "西兰花",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 4,
      "proteinGrams": 2.8,
      "fatGrams": 0.4,
      "energyKcal": 34
    }
  },
  {
    "id": "builtin-50",
    "name": "菠菜",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 3.6,
      "proteinGrams": 2.6,
      "fatGrams": 0.3,
      "energyKcal": 28
    }
  },
  {
    "id": "builtin-51",
    "name": "生菜",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 2,
      "proteinGrams": 1.4,
      "fatGrams": 0.2,
      "energyKcal": 15
    }
  },
  {
    "id": "builtin-52",
    "name": "羽衣甘蓝",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 5,
      "proteinGrams": 3,
      "fatGrams": 0.5,
      "energyKcal": 35
    }
  },
  {
    "id": "builtin-53",
    "name": "苋菜",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 4,
      "proteinGrams": 2.5,
      "fatGrams": 0.3,
      "energyKcal": 30
    }
  },
  {
    "id": "builtin-54",
    "name": "菇类",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 4,
      "proteinGrams": 2.5,
      "fatGrams": 0.3,
      "energyKcal": 30
    }
  },
  {
    "id": "builtin-55",
    "name": "萝卜",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 4,
      "proteinGrams": 1,
      "fatGrams": 0.2,
      "energyKcal": 22
    }
  },
  {
    "id": "builtin-56",
    "name": "西红柿",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 4,
      "proteinGrams": 0.9,
      "fatGrams": 0.2,
      "energyKcal": 19
    }
  },
  {
    "id": "builtin-57",
    "name": "彩椒",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 6,
      "proteinGrams": 1,
      "fatGrams": 0.2,
      "energyKcal": 26
    }
  },
  {
    "id": "builtin-58",
    "name": "黄瓜",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 2.9,
      "proteinGrams": 0.8,
      "fatGrams": 0.2,
      "energyKcal": 16
    }
  },
  {
    "id": "builtin-59",
    "name": "芹菜",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 3,
      "proteinGrams": 1.2,
      "fatGrams": 0.2,
      "energyKcal": 18
    }
  },
  {
    "id": "builtin-60",
    "name": "豆芽",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 3,
      "proteinGrams": 2,
      "fatGrams": 0.2,
      "energyKcal": 22
    }
  },
  {
    "id": "builtin-61",
    "name": "芦笋",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 4,
      "proteinGrams": 2.6,
      "fatGrams": 0.2,
      "energyKcal": 27
    }
  },
  {
    "id": "builtin-62",
    "name": "茄子",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 6,
      "proteinGrams": 1,
      "fatGrams": 0.2,
      "energyKcal": 28
    }
  },
  {
    "id": "builtin-63",
    "name": "冬瓜",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 2.6,
      "proteinGrams": 0.4,
      "fatGrams": 0.2,
      "energyKcal": 12
    }
  },
  {
    "id": "builtin-64",
    "name": "蓝莓",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 14,
      "proteinGrams": 0.7,
      "fatGrams": 0.3,
      "energyKcal": 57
    }
  },
  {
    "id": "builtin-65",
    "name": "草莓",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 7.7,
      "proteinGrams": 0.7,
      "fatGrams": 0.3,
      "energyKcal": 32
    }
  },
  {
    "id": "builtin-66",
    "name": "苹果",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 14,
      "proteinGrams": 0.3,
      "fatGrams": 0.2,
      "energyKcal": 53
    }
  },
  {
    "id": "builtin-67",
    "name": "香蕉",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 23,
      "proteinGrams": 1.1,
      "fatGrams": 0.3,
      "energyKcal": 91
    }
  },
  {
    "id": "builtin-68",
    "name": "水蜜桃",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 10,
      "proteinGrams": 0.6,
      "fatGrams": 0.1,
      "energyKcal": 42
    }
  },
  {
    "id": "builtin-69",
    "name": "橙子",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 12,
      "proteinGrams": 0.9,
      "fatGrams": 0.1,
      "energyKcal": 47
    }
  },
  {
    "id": "builtin-70",
    "name": "柚子",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 9,
      "proteinGrams": 0.8,
      "fatGrams": 0.2,
      "energyKcal": 38
    }
  },
  {
    "id": "builtin-71",
    "name": "猕猴桃",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 14,
      "proteinGrams": 1.1,
      "fatGrams": 0.5,
      "energyKcal": 56
    }
  },
  {
    "id": "builtin-72",
    "name": "火龙果",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 13,
      "proteinGrams": 1.2,
      "fatGrams": 0.2,
      "energyKcal": 55
    }
  },
  {
    "id": "builtin-73",
    "name": "樱桃",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 16,
      "proteinGrams": 1.1,
      "fatGrams": 0.3,
      "energyKcal": 63
    }
  },
  {
    "id": "builtin-74",
    "name": "葡萄",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 18,
      "proteinGrams": 0.5,
      "fatGrams": 0.2,
      "energyKcal": 69
    }
  },
  {
    "id": "builtin-75",
    "name": "西瓜",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 7.6,
      "proteinGrams": 0.6,
      "fatGrams": 0.1,
      "energyKcal": 30
    }
  },
  {
    "id": "builtin-76",
    "name": "梨",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 15,
      "proteinGrams": 0.4,
      "fatGrams": 0.2,
      "energyKcal": 57
    }
  },
  {
    "id": "builtin-77",
    "name": "木瓜",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 10,
      "proteinGrams": 0.5,
      "fatGrams": 0.1,
      "energyKcal": 42
    }
  },
  {
    "id": "builtin-78",
    "name": "菠萝",
    "unit": "g",
    "baseAmount": 100,
    "nutrients": {
      "carbohydrateGrams": 13,
      "proteinGrams": 0.5,
      "fatGrams": 0.1,
      "energyKcal": 50
    }
  }
];

export const builtInFoods: readonly Food[] = Object.freeze(
  workbookFoods.map((food) => Object.freeze({ ...food, nutrients: Object.freeze(food.nutrients) })),
);

export function searchBuiltInFoods(query: string): Food[] {
  const normalized = query.trim().toLocaleLowerCase();
  return normalized ? builtInFoods.filter((food) => food.name.toLocaleLowerCase().includes(normalized)) : [];
}
