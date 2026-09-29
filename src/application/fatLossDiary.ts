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
  calculateNutritionBaseline,
  type NutritionBaseline,
  type NutritionBaselineInput,
} from "../domain/nutrition";
import { buildWeightTrend } from "../domain/weightTrend";

type EstablishProfileInput = Omit<HealthProfile, "cycleStartDate">;

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
  return Math.round((value + Number.EPSILON) * 10) / 10;
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

  return { ...state, meals, actual, remaining };
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
      if (!Number.isInteger(input.age) || input.age < 18) {
        throw new Error("仅支持年满 18 岁的用户");
      }
      if (!Number.isFinite(input.heightCm) || input.heightCm <= 0) {
        throw new Error("身高必须是大于 0 的 cm 数值");
      }

      const state = await readState(dependencies.repository);
      state.profile = {
        ...input,
        cycleStartDate:
          state.profile?.cycleStartDate ?? dependencies.clock.today(),
      };
      state.baseline = calculateBaseline({
        sex: input.sex,
        weightKg: input.currentWeightKg,
        weeklyExercise: input.weeklyExercise,
        dayType: input.dayType,
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
