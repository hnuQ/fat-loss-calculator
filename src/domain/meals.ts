import type { MealGroup, Nutrients } from "./diary";

export function defaultMealGroups(): MealGroup[] {
  const timestamp = new Date().toISOString();
  return [
    ["breakfast", "早餐"], ["morning-snack", "午加餐"],
    ["lunch", "午餐"], ["evening-snack", "晚加餐"],
    ["dinner", "晚餐"], ["post-workout", "练后餐"],
  ].map(([id, name]) => ({
    id, name, hidden: false, ownerId: "local-user", createdAt: timestamp,
    updatedAt: timestamp, revision: 1, syncState: "local",
  }));
}

export function mealGroupName(name: string): string {
  if (typeof name !== "string" || !name.trim() || name.trim().length > 30) {
    throw new Error("餐次名称须为 1–30 个字符");
  }
  return name.trim();
}

export function calorieStatus(actual: number, baseline: number): "low" | "within" | "high" {
  // 用整数比例比较，避免 1.1 的浮点乘法把精确边界误判。
  if (actual * 10 < baseline * 9) return "low";
  if (actual * 10 > baseline * 11) return "high";
  return "within";
}

export function sumNutrients(items: Nutrients[]): Nutrients {
  const total = { carbohydrateGrams: 0, proteinGrams: 0, fatGrams: 0, energyKcal: 0 };
  for (const item of items) {
    for (const key of Object.keys(total) as Array<keyof Nutrients>) {
      total[key] = Math.round((total[key] * 10) + (item[key] * 10)) / 10;
    }
  }
  return total;
}
