import type {
  DayType,
  NutritionBaseline,
  Sex,
  WeeklyExercise,
} from "./nutrition";

export type MealSlot =
  | "breakfast"
  | "morning-snack"
  | "lunch"
  | "evening-snack"
  | "dinner"
  | "post-workout";

export interface HealthProfile {
  nickname: string;
  sex: Sex;
  age: number;
  heightCm: number;
  currentWeightKg: number;
  weeklyExercise: WeeklyExercise;
  hasFatLossExperience: boolean;
  targetWeightKg?: number;
  /** @deprecated 仅用于迁移 Issue #4 创建的本地状态。 */
  cycleStartDate?: string;
}

export type CycleStatus = "active" | "archived";

export interface FatLossCycle {
  id: string;
  startDate: string;
  endDate: string;
  status: CycleStatus;
  archivedAt?: string;
  archiveReason?: "completed" | "early";
}

export interface DayTypeRecord {
  cycleId: string;
  date: string;
  dayType: DayType;
  baseline: NutritionBaseline;
}

export interface Nutrients {
  carbohydrateGrams: number;
  proteinGrams: number;
  fatGrams: number;
  energyKcal: number;
}

export interface Food {
  id: string;
  name: string;
  unit: "g" | "item";
  baseAmount: number;
  nutrients: Nutrients;
}

export interface MealRecord {
  id: string;
  cycleId?: string;
  date: string;
  mealSlot: MealSlot;
  foodId: string;
  foodName: string;
  amount: number;
  unit: Food["unit"];
  nutrients: Nutrients;
}

export interface WeightRecord {
  id: string;
  cycleId?: string;
  date: string;
  weightKg: number;
}

export interface DiaryState {
  profile?: HealthProfile;
  cycles?: FatLossCycle[];
  dayTypeRecords?: DayTypeRecord[];
  /** @deprecated 仅用于迁移 Issue #4 创建的本地状态。 */
  dayType?: DayType;
  /** @deprecated 仅用于迁移 Issue #4 创建的本地状态。 */
  baseline?: NutritionBaseline;
  userTarget?: Nutrients;
  meals: MealRecord[];
  weights: WeightRecord[];
}

export interface DiaryRepository {
  read(): Promise<DiaryState | undefined>;
  write(state: DiaryState): Promise<void>;
}

export interface Clock {
  today(): string;
}

export interface WeightTrend {
  startDate: string;
  endDate: string;
  targetWeightKg?: number;
  points: Array<{ date: string; day: number; weightKg: number }>;
}

export type WeightTrendBuilder = (
  records: WeightRecord[],
  startDate: string,
  targetWeightKg?: number,
) => WeightTrend;

export interface PlatformCapabilities {
  kind: "app" | "mp-weixin" | "h5" | "test" | "unknown";
  localPersistence: boolean;
  canvas: boolean;
}

export interface DiarySnapshot {
  profile?: HealthProfile;
  cycles: FatLossCycle[];
  activeCycle?: FatLossCycle;
  selectedCycle?: FatLossCycle;
  today: string;
  selectedDate: string;
  dateStrip: string[];
  cycleDates: string[];
  isBlankDate: boolean;
  dayType?: DayType;
  baseline?: NutritionBaseline;
  userTarget?: Nutrients;
  meals: MealRecord[];
  weights: WeightRecord[];
  selectedDateWeights: WeightRecord[];
  bmi?: number;
  actual: Nutrients;
  remaining?: Nutrients;
}
