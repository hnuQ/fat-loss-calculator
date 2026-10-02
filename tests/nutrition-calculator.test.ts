import { describe, expect, it } from "vitest";

import {
  calculateEnergyKcal,
  calculateNutritionBaseline,
  type DayType,
  type Sex,
  type WeeklyExercise,
} from "../src/domain/nutrition";

interface ContractVector {
  sex: Sex;
  weeklyExercise: WeeklyExercise;
  dayType: DayType;
  expected: [number, number, number, number];
}

const workbookContractVectors: ContractVector[] = [
  { sex: "male", weeklyExercise: "low", dayType: "training", expected: [144.1, 91.7, 52.4, 1415] },
  { sex: "male", weeklyExercise: "low", dayType: "cardio", expected: [100.9, 91.7, 52.4, 1243] },
  { sex: "male", weeklyExercise: "low", dayType: "rest", expected: [72.1, 91.7, 52.4, 1127] },
  { sex: "male", weeklyExercise: "medium", dayType: "training", expected: [163.8, 104.8, 59, 1605] },
  { sex: "male", weeklyExercise: "medium", dayType: "cardio", expected: [114.7, 104.8, 59, 1409] },
  { sex: "male", weeklyExercise: "medium", dayType: "rest", expected: [81.9, 104.8, 59, 1278] },
  { sex: "male", weeklyExercise: "high", dayType: "training", expected: [196.5, 111.4, 65.5, 1822] },
  { sex: "male", weeklyExercise: "high", dayType: "cardio", expected: [137.6, 111.4, 65.5, 1586] },
  { sex: "male", weeklyExercise: "high", dayType: "rest", expected: [98.3, 111.4, 65.5, 1429] },
  { sex: "male", weeklyExercise: "very-high", dayType: "training", expected: [229.3, 117.9, 65.5, 1979] },
  { sex: "male", weeklyExercise: "very-high", dayType: "cardio", expected: [160.5, 117.9, 65.5, 1704] },
  { sex: "male", weeklyExercise: "very-high", dayType: "rest", expected: [114.7, 117.9, 65.5, 1521] },
  { sex: "female", weeklyExercise: "low", dayType: "training", expected: [131, 91.7, 65.5, 1481] },
  { sex: "female", weeklyExercise: "low", dayType: "cardio", expected: [91.7, 91.7, 65.5, 1324] },
  { sex: "female", weeklyExercise: "low", dayType: "rest", expected: [65.5, 91.7, 65.5, 1219] },
  { sex: "female", weeklyExercise: "medium", dayType: "training", expected: [144.1, 104.8, 72.1, 1644] },
  { sex: "female", weeklyExercise: "medium", dayType: "cardio", expected: [100.9, 104.8, 72.1, 1472] },
  { sex: "female", weeklyExercise: "medium", dayType: "rest", expected: [72.1, 104.8, 72.1, 1356] },
  { sex: "female", weeklyExercise: "high", dayType: "training", expected: [163.8, 111.4, 72.1, 1750] },
  { sex: "female", weeklyExercise: "high", dayType: "cardio", expected: [114.7, 111.4, 72.1, 1554] },
  { sex: "female", weeklyExercise: "high", dayType: "rest", expected: [81.9, 111.4, 72.1, 1423] },
  { sex: "female", weeklyExercise: "very-high", dayType: "training", expected: [196.5, 117.9, 78.6, 1965] },
  { sex: "female", weeklyExercise: "very-high", dayType: "cardio", expected: [137.6, 117.9, 78.6, 1729] },
  { sex: "female", weeklyExercise: "very-high", dayType: "rest", expected: [98.3, 117.9, 78.6, 1572] },
];

describe("营养基准", () => {
  it.each(workbookContractVectors)(
    "匹配工作簿契约：$sex / $weeklyExercise / $dayType",
    ({ sex, weeklyExercise, dayType, expected }) => {
      const baseline = calculateNutritionBaseline({
        sex,
        weightKg: 65.5,
        weeklyExercise,
        dayType,
      });

      expect(baseline).toEqual({
        carbohydrateGrams: expected[0],
        proteinGrams: expected[1],
        fatGrams: expected[2],
        energyKcal: expected[3],
      });
    },
  );

  it("按碳水和蛋白质 4 kcal/g、脂肪 9 kcal/g 分项取整后求和", () => {
    expect(
      calculateEnergyKcal({
        carbohydrateGrams: 10.1,
        proteinGrams: 20.2,
        fatGrams: 3.3,
      }),
    ).toBe(151);
  });

  it.each([
    { field: "性别", input: { sex: undefined as never }, message: "请选择性别" },
    { field: "当前体重", input: { weightKg: Number.NaN }, message: "当前体重必须是大于 0 的 kg 数值" },
    { field: "每周运动频率", input: { weeklyExercise: undefined as never }, message: "请选择每周运动频率" },
    { field: "日型", input: { dayType: undefined as never }, message: "请选择日型" },
  ])("无效$field会停止计算并指出字段", ({ input, message }) => {
    expect(() =>
      calculateNutritionBaseline({
        sex: "male",
        weightKg: 70,
        weeklyExercise: "medium",
        dayType: "training",
        ...input,
      }),
    ).toThrow(message);
  });
});
