import type { Food } from "./diary";

export const builtInFoods: Food[] = [
  {
    id: "staple-oats-dry",
    name: "燕麦（干）",
    unit: "g",
    baseAmount: 100,
    nutrients: {
      carbohydrateGrams: 60,
      proteinGrams: 13,
      fatGrams: 7,
      energyKcal: 377,
    },
  },
  {
    id: "staple-cooked-rice",
    name: "熟米饭",
    unit: "g",
    baseAmount: 100,
    nutrients: {
      carbohydrateGrams: 28.5,
      proteinGrams: 2.5,
      fatGrams: 0.3,
      energyKcal: 130,
    },
  },
  {
    id: "protein-whole-egg",
    name: "全蛋（按个）",
    unit: "item",
    baseAmount: 1,
    nutrients: {
      carbohydrateGrams: 0.4,
      proteinGrams: 7,
      fatGrams: 4,
      energyKcal: 72,
    },
  },
  {
    id: "protein-chicken-breast",
    name: "鸡胸肉（生）",
    unit: "g",
    baseAmount: 100,
    nutrients: {
      carbohydrateGrams: 0,
      proteinGrams: 24,
      fatGrams: 1,
      energyKcal: 110,
    },
  },
];

export function searchBuiltInFoods(query: string): Food[] {
  const normalizedQuery = query.trim().toLocaleLowerCase();
  if (!normalizedQuery) {
    return [];
  }

  return builtInFoods.filter((food) =>
    food.name.toLocaleLowerCase().includes(normalizedQuery),
  );
}
