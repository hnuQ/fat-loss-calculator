import type {
  Clock,
  DiaryRepository,
  DiarySnapshot,
  DiaryState,
  Food,
  HealthProfile,
  MealSlot,
  Nutrients,
  PlatformCapabilities,
  WeightTrend,
  WeightTrendBuilder,
} from "../domain/diary";
import { searchBuiltInFoods, builtInFoods } from "../domain/foods";
import {
  calculateEnergyKcal,
  calculateNutritionBaseline,
  type DayType,
  type NutritionBaseline,
  type NutritionBaselineInput,
} from "../domain/nutrition";
import { buildWeightTrend } from "../domain/weightTrend";

type UserTargetInput = Omit<Nutrients, "energyKcal">;

type EstablishProfileInput = Omit<HealthProfile, "cycleStartDate"> & {
  dayType: DayType;
  userTarget?: UserTargetInput;
};

export interface SaveMealInput {
  mealSlot: MealSlot;
  foodId: string;
  amount: number;
}

export interface FatLossDiary {
  establishProfile(input: EstablishProfileInput): Promise<DiarySnapshot>;
  openDiary(): Promise<DiarySnapshot>;
  searchFoods(query: string): Food[];
  saveMeal(input: SaveMealInput): Promise<DiarySnapshot>;
  recordWeight(input: { weightKg: number }): Promise<DiarySnapshot>;
  readWeightTrend(): Promise<WeightTrend>;
  getPlatformCapabilities(): PlatformCapabilities;
}

interface Dependencies {
  repository: DiaryRepository;
  clock: Clock;
  platform: PlatformCapabilities;
  calculateBaseline?: (input: NutritionBaselineInput) => NutritionBaseline;
  buildTrend?: WeightTrendBuilder;
}

const emptyNutrients = (): Nutrients => ({
  carbohydrateGrams: 0,
  proteinGrams: 0,
  fatGrams: 0,
  energyKcal: 0,
});

function roundToOneDecimal(value: number): number {
  return (
    Math.round((value + Number.EPSILON * Math.abs(value)) * 10) / 10
  );
}

function calculateBmi(profile: HealthProfile): number {
  return roundToOneDecimal(
    profile.currentWeightKg / (profile.heightCm / 100) ** 2,
  );
}

function normalizeUserTarget(input?: UserTargetInput): Nutrients | undefined {
  if (!input) return undefined;

  const fields: Array<[keyof UserTargetInput, string]> = [
    ["carbohydrateGrams", "用户目标碳水"],
    ["proteinGrams", "用户目标蛋白质"],
    ["fatGrams", "用户目标脂肪"],
  ];
  for (const [field, label] of fields) {
    if (!Number.isFinite(input[field]) || input[field] < 0) {
      throw new Error(`${label}必须是大于或等于 0 的数值`);
    }
  }

  const target = {
    carbohydrateGrams: roundToOneDecimal(input.carbohydrateGrams),
    proteinGrams: roundToOneDecimal(input.proteinGrams),
    fatGrams: roundToOneDecimal(input.fatGrams),
  };
  return { ...target, energyKcal: calculateEnergyKcal(target) };
}

function sumNutrients(items: Nutrients[]): Nutrients {
  return items.reduce(
    (total, item) => ({
      carbohydrateGrams: roundToOneDecimal(
        total.carbohydrateGrams + item.carbohydrateGrams,
      ),
      proteinGrams: roundToOneDecimal(total.proteinGrams + item.proteinGrams),
      fatGrams: roundToOneDecimal(total.fatGrams + item.fatGrams),
      energyKcal: roundToOneDecimal(total.energyKcal + item.energyKcal),
    }),
    emptyNutrients(),
  );
}

function toSnapshot(state: DiaryState, date: string): DiarySnapshot {
  const meals = state.meals.filter((meal) => meal.date === date);
  const actual = sumNutrients(meals.map((meal) => meal.nutrients));
  const remaining = state.baseline
    ? {
        carbohydrateGrams: roundToOneDecimal(
          state.baseline.carbohydrateGrams - actual.carbohydrateGrams,
        ),
        proteinGrams: roundToOneDecimal(
          state.baseline.proteinGrams - actual.proteinGrams,
        ),
        fatGrams: roundToOneDecimal(state.baseline.fatGrams - actual.fatGrams),
        energyKcal: roundToOneDecimal(state.baseline.energyKcal - actual.energyKcal),
      }
    : undefined;

  return {
    ...state,
    meals,
    bmi: state.profile ? calculateBmi(state.profile) : undefined,
    actual,
    remaining,
  };
}

function scaleNutrients(food: Food, amount: number): Nutrients {
  const factor = amount / food.baseAmount;
  return {
    carbohydrateGrams: roundToOneDecimal(food.nutrients.carbohydrateGrams * factor),
    proteinGrams: roundToOneDecimal(food.nutrients.proteinGrams * factor),
    fatGrams: roundToOneDecimal(food.nutrients.fatGrams * factor),
    energyKcal: roundToOneDecimal(food.nutrients.energyKcal * factor),
  };
}

async function readState(repository: DiaryRepository): Promise<DiaryState> {
  return (await repository.read()) ?? { meals: [], weights: [] };
}

export function createFatLossDiary(dependencies: Dependencies): FatLossDiary {
  const calculateBaseline = dependencies.calculateBaseline ?? calculateNutritionBaseline;
  const buildTrend = dependencies.buildTrend ?? buildWeightTrend;

  return {
    async establishProfile(input) {
      if (!input.nickname.trim()) {
        throw new Error("请填写昵称");
      }
      if (input.sex !== "male" && input.sex !== "female") {
        throw new Error("请选择性别");
      }
      if (!Number.isInteger(input.age)) {
        throw new Error("年龄必须是整数");
      }
      if (input.age < 18) {
        throw new Error("仅支持年满 18 岁的用户");
      }
      if (!Number.isFinite(input.heightCm) || input.heightCm <= 0) {
        throw new Error("身高必须是大于 0 的 cm 数值");
      }
      if (
        !Number.isFinite(input.currentWeightKg) ||
        input.currentWeightKg <= 0
      ) {
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
      if (typeof input.hasFatLossExperience !== "boolean") {
        throw new Error("请选择是否有减脂基础");
      }
      if (
        input.targetWeightKg !== undefined &&
        (!Number.isFinite(input.targetWeightKg) || input.targetWeightKg <= 0)
      ) {
        throw new Error("目标体重必须是大于 0 的 kg 数值");
      }
      if (
        input.dayType !== "training" &&
        input.dayType !== "cardio" &&
        input.dayType !== "rest"
      ) {
        throw new Error("请选择日型");
      }

      const { dayType, userTarget, ...profile } = input;
      const normalizedUserTarget = normalizeUserTarget(userTarget);

      const state = await readState(dependencies.repository);
      state.profile = {
        ...profile,
        nickname: profile.nickname.trim(),
        cycleStartDate:
          state.profile?.cycleStartDate ?? dependencies.clock.today(),
      };
      state.dayType = dayType;
      state.userTarget = normalizedUserTarget;
      state.baseline = calculateBaseline({
        sex: profile.sex,
        weightKg: profile.currentWeightKg,
        weeklyExercise: profile.weeklyExercise,
        dayType,
      });
      await dependencies.repository.write(state);
      return toSnapshot(state, dependencies.clock.today());
    },

    async openDiary() {
      return toSnapshot(
        await readState(dependencies.repository),
        dependencies.clock.today(),
      );
    },

    searchFoods(query) {
      return searchBuiltInFoods(query);
    },

    async saveMeal(input) {
      if (!Number.isFinite(input.amount) || input.amount <= 0) {
        throw new Error("食用量必须大于 0");
      }
      const food = builtInFoods.find((candidate) => candidate.id === input.foodId);
      if (!food) {
        throw new Error(`未找到食材：${input.foodId}`);
      }

      const state = await readState(dependencies.repository);
      if (!state.profile) {
        throw new Error("请先建立健康档案");
      }
      const date = dependencies.clock.today();
      state.meals.push({
        id: `${date}-meal-${state.meals.length + 1}`,
        date,
        mealSlot: input.mealSlot,
        foodId: food.id,
        foodName: food.name,
        amount: input.amount,
        unit: food.unit,
        nutrients: scaleNutrients(food, input.amount),
      });
      await dependencies.repository.write(state);
      return toSnapshot(state, date);
    },

    async recordWeight(input) {
      if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
        throw new Error("体重必须是大于 0 的 kg 数值");
      }
      const state = await readState(dependencies.repository);
      if (!state.profile) {
        throw new Error("请先建立健康档案");
      }
      const date = dependencies.clock.today();
      state.weights.push({
        id: `${date}-weight-${state.weights.length + 1}`,
        date,
        weightKg: roundToOneDecimal(input.weightKg),
      });
      await dependencies.repository.write(state);
      return toSnapshot(state, date);
    },

    async readWeightTrend() {
      const state = await readState(dependencies.repository);
      if (!state.profile) {
        throw new Error("请先建立健康档案");
      }
      return buildTrend(
        state.weights,
        state.profile.cycleStartDate,
        state.profile.targetWeightKg,
      );
    },

    getPlatformCapabilities() {
      return dependencies.platform;
    },
  };
}
