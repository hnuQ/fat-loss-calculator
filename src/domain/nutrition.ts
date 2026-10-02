export type Sex = "male" | "female";
export type WeeklyExercise = "low" | "medium" | "high" | "very-high";
export type DayType = "training" | "cardio" | "rest";

export interface NutritionBaselineInput {
  sex: Sex;
  weightKg: number;
  weeklyExercise: WeeklyExercise;
  dayType: DayType;
}

export interface NutritionBaseline {
  carbohydrateGrams: number;
  proteinGrams: number;
  fatGrams: number;
  energyKcal: number;
}

export type Macronutrients = Omit<NutritionBaseline, "energyKcal">;

const carbohydrateFactors: Record<Sex, Record<WeeklyExercise, number>> = {
  male: { low: 2.2, medium: 2.5, high: 3, "very-high": 3.5 },
  female: { low: 2, medium: 2.2, high: 2.5, "very-high": 3 },
};

const proteinFactors: Record<WeeklyExercise, number> = {
  low: 1.4,
  medium: 1.6,
  high: 1.7,
  "very-high": 1.8,
};

const fatFactors: Record<Sex, Record<WeeklyExercise, number>> = {
  male: { low: 0.8, medium: 0.9, high: 1, "very-high": 1 },
  female: { low: 1, medium: 1.1, high: 1.1, "very-high": 1.2 },
};

const carbohydrateDayFactors: Record<DayType, number> = {
  training: 1,
  cardio: 0.7,
  rest: 0.5,
};

function roundToOneDecimal(value: number): number {
  return (
    Math.round((value + Number.EPSILON * Math.abs(value)) * 10) / 10
  );
}

export function calculateEnergyKcal(input: Macronutrients): number {
  return (
    Math.round(input.carbohydrateGrams * 4) +
    Math.round(input.proteinGrams * 4) +
    Math.round(input.fatGrams * 9)
  );
}

export function calculateNutritionBaseline(
  input: NutritionBaselineInput,
): NutritionBaseline {
  if (input.sex !== "male" && input.sex !== "female") {
    throw new Error("请选择性别");
  }
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    throw new Error("当前体重必须是大于 0 的 kg 数值");
  }
  if (
    input.weeklyExercise !== "low" &&
    input.weeklyExercise !== "medium" &&
    input.weeklyExercise !== "high" &&
    input.weeklyExercise !== "very-high"
  ) {
    throw new Error("请选择每周运动频率");
  }
  if (
    input.dayType !== "training" &&
    input.dayType !== "cardio" &&
    input.dayType !== "rest"
  ) {
    throw new Error("请选择日型");
  }

  const baseCarbohydrateGrams = roundToOneDecimal(
    input.weightKg * carbohydrateFactors[input.sex][input.weeklyExercise],
  );
  const carbohydrateGrams = roundToOneDecimal(
    baseCarbohydrateGrams * carbohydrateDayFactors[input.dayType],
  );
  const proteinGrams = roundToOneDecimal(
    input.weightKg * proteinFactors[input.weeklyExercise],
  );
  const fatGrams = roundToOneDecimal(
    input.weightKg * fatFactors[input.sex][input.weeklyExercise],
  );

  return {
    carbohydrateGrams,
    proteinGrams,
    fatGrams,
    energyKcal: calculateEnergyKcal({
      carbohydrateGrams,
      proteinGrams,
      fatGrams,
    }),
  };
}
