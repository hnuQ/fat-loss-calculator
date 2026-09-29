import { describe, expect, it } from "vitest";

import { calculateNutritionBaseline } from "../src/domain/nutrition";

describe("营养基准", () => {
  it("保持工作簿中的固定系数、训练日倍率和 4-4-9 取整规则", () => {
    const baseline = calculateNutritionBaseline({
      sex: "male",
      weightKg: 70,
      weeklyExercise: "medium",
      dayType: "training",
    });

    expect(baseline).toEqual({
      carbohydrateGrams: 175,
      proteinGrams: 112,
      fatGrams: 63,
      energyKcal: 1715,
    });
  });
});
