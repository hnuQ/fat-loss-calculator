import type {
  DayType,
  NutritionBaseline,
  Sex,
  WeeklyExercise,
} from "./nutrition";
import type { TrainingState, TrainingRecord } from "./training";

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

export interface IndulgenceDay {
  cycleId: string;
  date: string;
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

export interface CustomFood extends Food {
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  deletedAt?: string;
  syncState: "local";
}

export interface FoodLibraryState {
  customFoods: CustomFood[];
  favoriteIds: string[];
  recentIds: string[];
}

export interface MealRecord {
  id: string;
  cycleId?: string;
  date: string;
  mealSlot: string;
  foodId: string;
  foodName: string;
  amount: number;
  unit: Food["unit"];
  nutrients: Nutrients;
  /** 保存时的单位营养快照；旧版记录可由已保存数量与营养反推。 */
  foodSnapshot?: Food;
}

export interface MealGroup {
  id: string;
  name: string;
  hidden: boolean;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  deletedAt?: string;
  syncState: "local";
}

export interface MealCorrection {
  id: string;
  ownerId: string;
  sourceMealId: string;
  previousCorrectionId?: string;
  original: MealRecord;
  previous: MealRecord;
  corrected: MealRecord;
  previousDayEnergyKcal: number;
  correctedDayEnergyKcal: number;
  reason: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  deletedAt?: string;
  syncState: "local";
}

export interface MealSummary extends MealGroup {
  meals: MealRecord[];
  actual: Nutrients;
}

export interface WeightRecord {
  id: string;
  cycleId?: string;
  date: string;
  weightKg: number;
}

export interface BodyMeasurements {
  weightKg?: number;
  bodyFatPercent?: number;
  waistCm?: number;
  chestCm?: number;
  hipCm?: number;
  thighCm?: number;
}

export interface BodyRecord extends BodyMeasurements {
  id: string;
  cycleId?: string;
  date: string;
  ownerId: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  syncState: "local";
}

export interface BodyCorrection {
  id: string;
  ownerId: string;
  sourceBodyId: string;
  previousCorrectionId?: string;
  original: BodyRecord;
  previous: BodyRecord;
  corrected: BodyRecord;
  reason: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  syncState: "local";
}

export interface DiaryState {
  training?: TrainingState;
  bodyRecords?: BodyRecord[];
  bodyCorrections?: BodyCorrection[];
  mealCorrections?: MealCorrection[];
  mealGroups?: MealGroup[];
  foodLibrary?: FoodLibraryState;
  profile?: HealthProfile;
  cycles?: FatLossCycle[];
  dayTypeRecords?: DayTypeRecord[];
  indulgenceDays?: IndulgenceDay[];
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
  now?(): string;
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
  isIndulgenceDay: boolean;
  trainingRecords: TrainingRecord[];
  bodyRecords: BodyRecord[];
  originalBodyRecords: BodyRecord[];
  bodyCorrections: BodyCorrection[];
  originalMeals: MealRecord[];
  mealCorrections: MealCorrection[];
  mealGroups: MealSummary[];
  energyStatus?: "low" | "within" | "high";
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
