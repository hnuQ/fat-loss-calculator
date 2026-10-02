import type { Food, FoodLibraryState, Nutrients } from "./diary";
import { calculateEnergyKcal } from "./nutrition";

export interface CustomFoodInput {
  name: string;
  basis: "per100g" | "perItem";
  carbohydrateGrams: number;
  proteinGrams: number;
  fatGrams: number;
}

export function parseFoodNumber(value: string, label: string): number {
  if (!/^(?:\d+(?:\.\d*)?|\.\d+)$/.test(value.trim())) {
    throw new Error(`${label}请输入完整的非负十进制数值`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${label}必须是有限数值`);
  return number;
}

export function validateCustomFood(input: CustomFoodInput): Omit<Food, "id"> {
  if (typeof input.name !== "string" || !input.name.trim() || input.name.trim().length > 60) {
    throw new Error("食材名称须为 1–60 个字符");
  }
  if (input.basis !== "per100g" && input.basis !== "perItem") {
    throw new Error("请选择每 100g 或每个基准");
  }
  const values = [input.carbohydrateGrams, input.proteinGrams, input.fatGrams];
  if (values.some((value) => !Number.isFinite(value) || value < 0)) {
    throw new Error("碳水、蛋白质和脂肪必须是大于或等于 0 的有限数值");
  }
  const maximum = input.basis === "per100g" ? 100 : 10000;
  if (values.reduce((sum, value) => sum + value, 0) > maximum + 1e-9) {
    throw new Error(`三大营养素合计不能超过 ${maximum}g（${input.basis === "per100g" ? "每 100g" : "每个"}基准）`);
  }
  const nutrients = {
    carbohydrateGrams: input.carbohydrateGrams,
    proteinGrams: input.proteinGrams,
    fatGrams: input.fatGrams,
  };
  return {
    name: input.name.trim(),
    unit: input.basis === "per100g" ? "g" : "item",
    baseAmount: input.basis === "per100g" ? 100 : 1,
    nutrients: { ...nutrients, energyKcal: calculateEnergyKcal(nutrients) },
  };
}

export function scaleFoodNutrients(food: Food, amount: number): Nutrients {
  const maximum = food.unit === "g" ? 100000 : 1000;
  if (!Number.isFinite(amount) || amount <= 0 || amount > maximum) {
    throw new Error(`食用量必须大于 0，且不超过 ${maximum}${food.unit === "g" ? "g" : "个"}，支持小数`);
  }
  const factor = amount / food.baseAmount;
  const round = (value: number) => Math.round((value + Number.EPSILON * Math.abs(value)) * 10) / 10;
  return {
    carbohydrateGrams: round(food.nutrients.carbohydrateGrams * factor),
    proteinGrams: round(food.nutrients.proteinGrams * factor),
    fatGrams: round(food.nutrients.fatGrams * factor),
    energyKcal: round(food.nutrients.energyKcal * factor),
  };
}

export function libraryState(value?: FoodLibraryState): FoodLibraryState {
  return value ?? { customFoods: [], favoriteIds: [], recentIds: [] };
}

export function recordFoodUse(library: FoodLibraryState, foodId: string): void {
  library.recentIds = [foodId, ...library.recentIds.filter((id) => id !== foodId)].slice(0, 20);
}
