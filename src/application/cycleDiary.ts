import type {
  Clock,
  DayTypeRecord,
  DiaryRepository,
  DiarySnapshot,
  DiaryState,
  FatLossCycle,
  Food,
  HealthProfile,
  MealRecord,
  MealGroup,
  Nutrients,
  PlatformCapabilities,
  WeightTrend,
  WeightTrendBuilder,
} from "../domain/diary";
import {
  addCalendarDays,
  assertLocalDate,
  isDateWithin,
  listCalendarDates,
} from "../domain/cycle";
import { searchBuiltInFoods } from "../domain/foods";
import { libraryState, recordFoodUse, scaleFoodNutrients } from "../domain/foodLibrary";
import { availableFoods } from "./foodLibrary";
import {
  calculateEnergyKcal,
  calculateNutritionBaseline,
  type DayType,
  type NutritionBaseline,
  type NutritionBaselineInput,
} from "../domain/nutrition";
import { buildWeightTrend } from "../domain/weightTrend";
import { calorieStatus, defaultMealGroups, mealGroupName, sumNutrients } from "../domain/meals";

type UserTargetInput = Omit<Nutrients, "energyKcal">;
type EstablishProfileInput = Omit<HealthProfile, "cycleStartDate"> & {
  /** 兼容 Issue #4 的建档调用；新界面通过 startCycle 选择日型。 */
  dayType?: DayType;
  userTarget?: UserTargetInput;
};

export interface SaveMealInput {
  mealSlot: string;
  foodId: string;
  amount: number;
  date?: string;
}

export interface DiaryDateSelection {
  date?: string;
  cycleId?: string;
}

export interface FatLossDiary {
  establishProfile(input: EstablishProfileInput): Promise<DiarySnapshot>;
  startCycle(input: { startDate: string; dayType: DayType }): Promise<DiarySnapshot>;
  archiveActiveCycle(): Promise<DiarySnapshot>;
  setDayType(input: {
    cycleId: string;
    date: string;
    dayType: DayType;
  }): Promise<DiarySnapshot>;
  openDiary(selection?: DiaryDateSelection): Promise<DiarySnapshot>;
  searchFoods(query: string): Food[];
  saveMeal(input: SaveMealInput): Promise<DiarySnapshot>;
  updateMeal(input: { id: string; amount: number; mealSlot: string }): Promise<DiarySnapshot>;
  deleteMeal(id: string): Promise<DiarySnapshot>;
  addMealGroup(name: string, selection?: DiaryDateSelection): Promise<DiarySnapshot>;
  configureMealGroup(input: { id: string; name: string; hidden: boolean }, selection?: DiaryDateSelection): Promise<DiarySnapshot>;
  recordWeight(input: { weightKg: number }): Promise<DiarySnapshot>;
  readWeightTrend(cycleId?: string): Promise<WeightTrend>;
  getPlatformCapabilities(): PlatformCapabilities;
}

interface Dependencies {
  repository: DiaryRepository;
  clock: Clock;
  platform: PlatformCapabilities;
  calculateBaseline?: (input: NutritionBaselineInput) => NutritionBaseline;
  buildTrend?: WeightTrendBuilder;
}

type NormalizedDiaryState = Omit<DiaryState, "cycles" | "dayTypeRecords" | "mealGroups"> & {
  mealGroups: MealGroup[];
  cycles: FatLossCycle[];
  dayTypeRecords: DayTypeRecord[];
};

function roundToOneDecimal(value: number): number {
  return Math.round((value + Number.EPSILON * Math.abs(value)) * 10) / 10;
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

function cycleContains(cycle: FatLossCycle, date: string): boolean {
  return isDateWithin(date, cycle.startDate, cycle.endDate);
}

function recordsForCycle<T extends { date: string; cycleId?: string }>(
  records: T[],
  cycle: FatLossCycle,
): T[] {
  return records.filter(
    (record) =>
      record.cycleId === cycle.id ||
      (!record.cycleId && cycleContains(cycle, record.date)),
  );
}

function normalizeState(
  stored: DiaryState | undefined,
  today: string,
): { state: NormalizedDiaryState; changed: boolean } {
  const state = (stored ?? { meals: [], weights: [] }) as NormalizedDiaryState;
  let changed = false;
  if (!Array.isArray(state.mealGroups)) {
    state.mealGroups = defaultMealGroups();
    changed = true;
  }
  for (const group of state.mealGroups) {
    if (!group.ownerId) {
      const timestamp = new Date().toISOString();
      Object.assign(group, { ownerId: "local-user", createdAt: timestamp, updatedAt: timestamp, revision: 1, syncState: "local" });
      changed = true;
    }
  }

  if (!Array.isArray(state.meals)) {
    state.meals = [];
    changed = true;
  }
  if (!Array.isArray(state.weights)) {
    state.weights = [];
    changed = true;
  }
  if (!Array.isArray(state.cycles)) {
    state.cycles = [];
    changed = true;
  }
  if (!Array.isArray(state.dayTypeRecords)) {
    state.dayTypeRecords = [];
    changed = true;
  }

  const legacyStartDate = state.profile?.cycleStartDate;
  if (legacyStartDate && state.cycles.length === 0) {
    assertLocalDate(legacyStartDate, "旧版周期开始日期");
    const endDate = addCalendarDays(legacyStartDate, 89);
    const completed = today > endDate;
    const cycle: FatLossCycle = {
      id: `cycle-${legacyStartDate}-1`,
      startDate: legacyStartDate,
      endDate,
      status: completed ? "archived" : "active",
      ...(completed
        ? { archivedAt: endDate, archiveReason: "completed" as const }
        : {}),
    };
    state.cycles.push(cycle);
    if (state.dayType && state.baseline) {
      state.dayTypeRecords.push({
        cycleId: cycle.id,
        date: legacyStartDate,
        dayType: state.dayType,
        baseline: state.baseline,
      });
    }
    changed = true;
  }

  for (const cycle of state.cycles) {
    if (cycle.status === "active" && today > cycle.endDate) {
      cycle.status = "archived";
      cycle.archivedAt = cycle.endDate;
      cycle.archiveReason = "completed";
      changed = true;
    }
  }

  for (const record of [...state.meals, ...state.weights]) {
    if (!record.cycleId) {
      const cycle = state.cycles.find((candidate) =>
        cycleContains(candidate, record.date),
      );
      if (cycle) {
        record.cycleId = cycle.id;
        changed = true;
      }
    }
  }

  return { state, changed };
}

async function readState(
  repository: DiaryRepository,
  today: string,
): Promise<NormalizedDiaryState> {
  const normalized = normalizeState(await repository.read(), today);
  if (normalized.changed) {
    await repository.write(normalized.state);
  }
  return normalized.state;
}

function activeCycleOf(state: NormalizedDiaryState): FatLossCycle | undefined {
  return state.cycles.find((cycle) => cycle.status === "active");
}

function assertMealGroup(state: NormalizedDiaryState, id: string): void {
  const group = state.mealGroups.find((candidate) => candidate.id === id);
  if (!group || group.hidden) throw new Error("请选择可见餐次");
}

function editableMeal(state: NormalizedDiaryState, id: string, today: string): MealRecord {
  const meal = state.meals.find((record) => record.id === id);
  if (!meal) throw new Error("未找到餐食记录");
  const cycle = activeCycleOf(state);
  if (meal.date !== today || !cycle || meal.cycleId !== cycle.id) {
    throw new Error("历史餐食和已归档周期只能查看，不能覆盖或删除");
  }
  return meal;
}

function findSelectedCycle(
  state: NormalizedDiaryState,
  today: string,
  selection: DiaryDateSelection,
): FatLossCycle | undefined {
  if (selection.cycleId) {
    const selected = state.cycles.find(
      (cycle) => cycle.id === selection.cycleId,
    );
    if (!selected) throw new Error("未找到所选减脂周期");
    return selected;
  }

  const activeCycle = activeCycleOf(state);
  if (selection.date) {
    const selectedDate = selection.date;
    if (activeCycle && cycleContains(activeCycle, selectedDate)) {
      return activeCycle;
    }
    return [...state.cycles]
      .reverse()
      .find((cycle) => cycleContains(cycle, selectedDate));
  }

  return (
    activeCycle ??
    [...state.cycles].reverse().find((cycle) => cycleContains(cycle, today)) ??
    state.cycles[state.cycles.length - 1]
  );
}

function selectedDateFor(
  cycle: FatLossCycle | undefined,
  today: string,
  requestedDate?: string,
): string {
  if (requestedDate) {
    assertLocalDate(requestedDate, "所选日期");
    if (!cycle || !cycleContains(cycle, requestedDate)) {
      throw new Error("所选日期不在该减脂周期内");
    }
    return requestedDate;
  }
  if (!cycle || cycleContains(cycle, today)) return today;
  return today < cycle.startDate ? cycle.startDate : cycle.endDate;
}

function buildDateStrip(cycleDates: string[], selectedDate: string): string[] {
  if (cycleDates.length <= 7) return cycleDates;
  const selectedIndex = cycleDates.indexOf(selectedDate);
  const startIndex = Math.min(
    Math.max(selectedIndex - 3, 0),
    cycleDates.length - 7,
  );
  return cycleDates.slice(startIndex, startIndex + 7);
}

function toSnapshot(
  state: NormalizedDiaryState,
  today: string,
  selection: DiaryDateSelection = {},
): DiarySnapshot {
  const selectedCycle = findSelectedCycle(state, today, selection);
  const selectedDate = selectedDateFor(
    selectedCycle,
    today,
    selection.date,
  );
  const cycleDates = selectedCycle
    ? listCalendarDates(selectedCycle.startDate, 90)
    : [];
  const dayTypeRecord = selectedCycle
    ? state.dayTypeRecords.find(
        (record) =>
          record.cycleId === selectedCycle.id && record.date === selectedDate,
      )
    : undefined;
  const cycleMeals = selectedCycle
    ? recordsForCycle(state.meals, selectedCycle)
    : [];
  const meals = cycleMeals.filter((meal) => meal.date === selectedDate);
  const cycleWeights = selectedCycle
    ? recordsForCycle(state.weights, selectedCycle)
    : [];
  const selectedDateWeights = cycleWeights.filter(
    (record) => record.date === selectedDate,
  );
  const actual = sumNutrients(meals.map((meal) => meal.nutrients));
  const remaining = dayTypeRecord
    ? {
        carbohydrateGrams: roundToOneDecimal(
          dayTypeRecord.baseline.carbohydrateGrams - actual.carbohydrateGrams,
        ),
        proteinGrams: roundToOneDecimal(
          dayTypeRecord.baseline.proteinGrams - actual.proteinGrams,
        ),
        fatGrams: roundToOneDecimal(
          dayTypeRecord.baseline.fatGrams - actual.fatGrams,
        ),
        energyKcal: roundToOneDecimal(
          dayTypeRecord.baseline.energyKcal - actual.energyKcal,
        ),
      }
    : undefined;

  return {
    mealGroups: state.mealGroups.map((group) => {
      const groupMeals = meals.filter((meal) => meal.mealSlot === group.id);
      return { ...group, meals: groupMeals, actual: sumNutrients(groupMeals.map((meal) => meal.nutrients)) };
    }),
    energyStatus: dayTypeRecord ? calorieStatus(actual.energyKcal, dayTypeRecord.baseline.energyKcal) : undefined,
    profile: state.profile,
    cycles: state.cycles,
    activeCycle: activeCycleOf(state),
    selectedCycle,
    today,
    selectedDate,
    dateStrip: buildDateStrip(cycleDates, selectedDate),
    cycleDates,
    isBlankDate:
      !dayTypeRecord && meals.length === 0 && selectedDateWeights.length === 0,
    dayType: dayTypeRecord?.dayType,
    baseline: dayTypeRecord?.baseline,
    userTarget: state.userTarget,
    meals,
    weights: cycleWeights,
    selectedDateWeights,
    bmi: state.profile ? calculateBmi(state.profile) : undefined,
    actual,
    remaining,
  };
}

function validateDayType(dayType: DayType): void {
  if (dayType !== "training" && dayType !== "cardio" && dayType !== "rest") {
    throw new Error("请选择日型");
  }
}

function calculateDayBaseline(
  profile: HealthProfile,
  dayType: DayType,
  calculateBaseline: (input: NutritionBaselineInput) => NutritionBaseline,
): NutritionBaseline {
  validateDayType(dayType);
  return calculateBaseline({
    sex: profile.sex,
    weightKg: profile.currentWeightKg,
    weeklyExercise: profile.weeklyExercise,
    dayType,
  });
}

export function createFatLossDiary(dependencies: Dependencies): FatLossDiary {
  const calculateBaseline =
    dependencies.calculateBaseline ?? calculateNutritionBaseline;
  const buildTrend = dependencies.buildTrend ?? buildWeightTrend;

  return {
    async establishProfile(input) {
      if (!input.nickname.trim()) throw new Error("请填写昵称");
      if (input.sex !== "male" && input.sex !== "female") {
        throw new Error("请选择性别");
      }
      if (!Number.isInteger(input.age)) throw new Error("年龄必须是整数");
      if (input.age < 18) throw new Error("仅支持年满 18 岁的用户");
      if (!Number.isFinite(input.heightCm) || input.heightCm <= 0) {
        throw new Error("身高必须是大于 0 的 cm 数值");
      }
      if (!Number.isFinite(input.currentWeightKg) || input.currentWeightKg <= 0) {
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
      const hasLegacyDayType = Object.prototype.hasOwnProperty.call(
        input,
        "dayType",
      );
      if (hasLegacyDayType) validateDayType(input.dayType as DayType);

      const { userTarget, dayType, ...profile } = input;
      const today = dependencies.clock.today();
      const state = await readState(
        dependencies.repository,
        today,
      );
      state.profile = { ...profile, nickname: profile.nickname.trim() };
      state.userTarget = normalizeUserTarget(userTarget);

      let selectedCycle = activeCycleOf(state);
      if (dayType) {
        if (!selectedCycle) {
          selectedCycle = {
            id: `cycle-${today}-${state.cycles.length + 1}`,
            startDate: today,
            endDate: addCalendarDays(today, 89),
            status: "active",
          };
          state.cycles.push(selectedCycle);
        }
        if (!cycleContains(selectedCycle, today)) {
          throw new Error("今天不在进行中的减脂周期内");
        }
        state.profile.cycleStartDate = selectedCycle.startDate;
        const legacyRecord: DayTypeRecord = {
          cycleId: selectedCycle.id,
          date: today,
          dayType,
          baseline: calculateDayBaseline(
            state.profile,
            dayType,
            calculateBaseline,
          ),
        };
        const existingIndex = state.dayTypeRecords.findIndex(
          (record) =>
            record.cycleId === selectedCycle?.id && record.date === today,
        );
        if (existingIndex >= 0) {
          state.dayTypeRecords[existingIndex] = legacyRecord;
        } else {
          state.dayTypeRecords.push(legacyRecord);
        }
      }
      await dependencies.repository.write(state);
      return toSnapshot(
        state,
        today,
        selectedCycle ? { cycleId: selectedCycle.id, date: today } : {},
      );
    },

    async startCycle(input) {
      assertLocalDate(input.startDate, "周期开始日期");
      validateDayType(input.dayType);
      const today = dependencies.clock.today();
      const state = await readState(dependencies.repository, today);
      if (!state.profile) throw new Error("请先建立健康档案");
      if (activeCycleOf(state)) {
        throw new Error("已有进行中的减脂周期，请先归档后再创建新周期");
      }

      const cycle: FatLossCycle = {
        id: `cycle-${input.startDate}-${state.cycles.length + 1}`,
        startDate: input.startDate,
        endDate: addCalendarDays(input.startDate, 89),
        status: "active",
      };
      state.cycles.push(cycle);
      state.dayTypeRecords.push({
        cycleId: cycle.id,
        date: input.startDate,
        dayType: input.dayType,
        baseline: calculateDayBaseline(
          state.profile,
          input.dayType,
          calculateBaseline,
        ),
      });
      await dependencies.repository.write(state);
      return toSnapshot(state, today, {
        cycleId: cycle.id,
        date: cycle.startDate,
      });
    },

    async archiveActiveCycle() {
      const today = dependencies.clock.today();
      const state = await readState(dependencies.repository, today);
      const cycle = activeCycleOf(state);
      if (!cycle) throw new Error("当前没有进行中的减脂周期");
      cycle.status = "archived";
      cycle.archivedAt = today;
      cycle.archiveReason = "early";
      await dependencies.repository.write(state);
      return toSnapshot(state, today, {
        cycleId: cycle.id,
        date: cycleContains(cycle, today) ? today : cycle.startDate,
      });
    },

    async setDayType(input) {
      assertLocalDate(input.date, "日型日期");
      validateDayType(input.dayType);
      const today = dependencies.clock.today();
      const state = await readState(dependencies.repository, today);
      if (!state.profile) throw new Error("请先建立健康档案");
      const cycle = state.cycles.find(
        (candidate) => candidate.id === input.cycleId,
      );
      if (!cycle) throw new Error("未找到所选减脂周期");
      if (cycle.status !== "active") {
        throw new Error("已归档周期只能查看，不能修改日型");
      }
      if (!cycleContains(cycle, input.date)) {
        throw new Error("所选日期不在该减脂周期内");
      }
      if (input.date < today) throw new Error("历史日期只能查看，不能覆盖日型和营养基准");

      const nextRecord: DayTypeRecord = {
        cycleId: cycle.id,
        date: input.date,
        dayType: input.dayType,
        baseline: calculateDayBaseline(
          state.profile,
          input.dayType,
          calculateBaseline,
        ),
      };
      const existingIndex = state.dayTypeRecords.findIndex(
        (record) =>
          record.cycleId === cycle.id && record.date === input.date,
      );
      if (existingIndex >= 0) state.dayTypeRecords[existingIndex] = nextRecord;
      else state.dayTypeRecords.push(nextRecord);
      await dependencies.repository.write(state);
      return toSnapshot(state, today, {
        cycleId: cycle.id,
        date: input.date,
      });
    },

    async openDiary(selection = {}) {
      const today = dependencies.clock.today();
      return toSnapshot(
        await readState(dependencies.repository, today),
        today,
        selection,
      );
    },

    searchFoods(query) {
      return searchBuiltInFoods(query);
    },

    async saveMeal(input) {
      const today = dependencies.clock.today();
      if (input.date && input.date !== today) throw new Error("只能新增今天的餐食记录");
      const state = await readState(dependencies.repository, today);
      assertMealGroup(state, input.mealSlot);
      const library = libraryState(state.foodLibrary);
      const food = availableFoods(library).find((candidate) => candidate.id === input.foodId);
      if (!food) throw new Error(`未找到食材：${input.foodId}`);
      const nutrients = scaleFoodNutrients(food, input.amount);
      if (!state.profile) throw new Error("请先建立健康档案");
      const cycle = activeCycleOf(state);
      if (!cycle || !cycleContains(cycle, today)) {
        throw new Error("今天不在进行中的减脂周期内");
      }
      if (
        !state.dayTypeRecords.some(
          (record) => record.cycleId === cycle.id && record.date === today,
        )
      ) {
        throw new Error("请先为今天选择日型");
      }

      state.meals.push({
        id: `meal-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        cycleId: cycle.id,
        date: today,
        mealSlot: input.mealSlot,
        foodId: food.id,
        foodName: food.name,
        amount: input.amount,
        unit: food.unit,
        nutrients,
        foodSnapshot: { ...food, nutrients: { ...food.nutrients } },
      });
      recordFoodUse(library, food.id);
      state.foodLibrary = library;
      await dependencies.repository.write(state);
      return toSnapshot(state, today, { cycleId: cycle.id, date: today });
    },

    async updateMeal(input) {
      const today = dependencies.clock.today();
      const state = await readState(dependencies.repository, today);
      const meal = editableMeal(state, input.id, today);
      assertMealGroup(state, input.mealSlot);
      const food = meal.foodSnapshot ?? {
        id: meal.foodId, name: meal.foodName, unit: meal.unit,
        baseAmount: meal.amount, nutrients: { ...meal.nutrients },
      };
      const nutrients = scaleFoodNutrients(food, input.amount);
      meal.foodSnapshot = food;
      meal.amount = input.amount;
      meal.mealSlot = input.mealSlot;
      meal.nutrients = nutrients;
      await dependencies.repository.write(state);
      return toSnapshot(state, today, { cycleId: meal.cycleId, date: today });
    },

    async deleteMeal(id) {
      const today = dependencies.clock.today();
      const state = await readState(dependencies.repository, today);
      const meal = editableMeal(state, id, today);
      state.meals = state.meals.filter((record) => record.id !== id);
      await dependencies.repository.write(state);
      return toSnapshot(state, today, { cycleId: meal.cycleId, date: today });
    },

    async addMealGroup(name, selection = {}) {
      const today = dependencies.clock.today();
      const validatedName = mealGroupName(name);
      const state = await readState(dependencies.repository, today);
      const timestamp = new Date().toISOString();
      state.mealGroups.push({
        id: `group-${Date.now()}-${Math.random().toString(36).slice(2)}`,
        name: validatedName, hidden: false, ownerId: "local-user",
        createdAt: timestamp, updatedAt: timestamp, revision: 1, syncState: "local",
      });
      await dependencies.repository.write(state);
      return toSnapshot(state, today, selection);
    },

    async configureMealGroup(input, selection = {}) {
      const today = dependencies.clock.today();
      const name = mealGroupName(input.name);
      if (typeof input.hidden !== "boolean") throw new Error("请明确选择餐次是否隐藏");
      const state = await readState(dependencies.repository, today);
      const group = state.mealGroups.find((candidate) => candidate.id === input.id);
      if (!group) throw new Error("未找到餐次");
      group.name = name;
      group.hidden = input.hidden;
      group.updatedAt = new Date().toISOString();
      group.revision += 1;
      await dependencies.repository.write(state);
      return toSnapshot(state, today, selection);
    },

    async recordWeight(input) {
      if (!Number.isFinite(input.weightKg) || input.weightKg <= 0) {
        throw new Error("体重必须是大于 0 的 kg 数值");
      }
      const today = dependencies.clock.today();
      const state = await readState(dependencies.repository, today);
      if (!state.profile) throw new Error("请先建立健康档案");
      const cycle = activeCycleOf(state);
      if (!cycle || !cycleContains(cycle, today)) {
        throw new Error("今天不在进行中的减脂周期内");
      }

      state.weights.push({
        id: `${cycle.id}-${today}-weight-${state.weights.length + 1}`,
        cycleId: cycle.id,
        date: today,
        weightKg: roundToOneDecimal(input.weightKg),
      });
      await dependencies.repository.write(state);
      return toSnapshot(state, today, { cycleId: cycle.id, date: today });
    },

    async readWeightTrend(cycleId) {
      const today = dependencies.clock.today();
      const state = await readState(dependencies.repository, today);
      if (!state.profile) throw new Error("请先建立健康档案");
      const cycle = cycleId
        ? state.cycles.find((candidate) => candidate.id === cycleId)
        : activeCycleOf(state) ?? state.cycles[state.cycles.length - 1];
      if (!cycle) throw new Error("请先创建减脂周期");
      return buildTrend(
        recordsForCycle(state.weights, cycle),
        cycle.startDate,
        state.profile.targetWeightKg,
      );
    },

    getPlatformCapabilities() {
      return dependencies.platform;
    },
  };
}
