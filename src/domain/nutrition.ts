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
  return Math.round((value + Number.EPSILON) * 10) / 10;
}

export function calculateNutritionBaseline(
  input: NutritionBaselineInput,
): NutritionBaseline {
  if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
    throw new Error("体重必须是大于 0 的 kg 数值");
  }

  const carbohydrateGrams = roundToOneDecimal(
    input.weightKg *
      carbohydrateFactors[input.sex][input.weeklyExercise] *
      carbohydrateDayFactors[input.dayType],
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
    energyKcal:
      Math.round(carbohydrateGrams * 4) +
      Math.round(proteinGrams * 4) +
      Math.round(fatGrams * 9),
  };
}
