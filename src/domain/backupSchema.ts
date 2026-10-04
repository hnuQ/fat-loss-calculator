import { z } from "zod";
import type { DiaryState } from "./diary";
import { addCalendarDays, assertLocalDate } from "./cycle";

const text = z.string();
const id = text.min(1);
const number = z.number().finite();
const positive = number.positive();
const date = text.refine((value) => { try { assertLocalDate(value, "日期"); return true; } catch { return false; } });
const timestamp = text.min(1).refine((value) => Number.isFinite(Date.parse(value)));
const dayType = z.enum(["training", "cardio", "rest"]);
const nutrients = z.object({ carbohydrateGrams: number.nonnegative(), proteinGrams: number.nonnegative(), fatGrams: number.nonnegative(), energyKcal: number.nonnegative() }).strict();
const metadata = { ownerId: id, createdAt: timestamp, updatedAt: timestamp, revision: number.int().positive(), syncState: z.literal("local") };
const foodFields = { id, name: id, unit: z.enum(["g", "item"]), baseAmount: positive, nutrients };
const food = z.object(foodFields).strict();
const customFood = z.object({ ...foodFields, ...metadata, deletedAt: timestamp.optional() }).strict();
const meal = z.object({ id, cycleId: id.optional(), date, mealSlot: id, foodId: id, foodName: id, amount: positive, unit: z.enum(["g", "item"]), nutrients, foodSnapshot: z.union([food, customFood]).optional() }).strict();
const measurements = { weightKg: positive.optional(), bodyFatPercent: positive.lt(100).optional(), waistCm: positive.optional(), chestCm: positive.optional(), hipCm: positive.optional(), thighCm: positive.optional() };
const body = z.object({ id, cycleId: id.optional(), date, ...metadata, ...measurements }).strict().refine((value) => Object.keys(measurements).some((key) => value[key as keyof typeof value] !== undefined));
const correction = { id, ...metadata, previousCorrectionId: id.optional(), reason: text.trim().min(1) };
const mealCorrection = z.object({ ...correction, sourceMealId: id, original: meal, previous: meal, corrected: meal, previousDayEnergyKcal: number.nonnegative(), correctedDayEnergyKcal: number.nonnegative(), deletedAt: timestamp.optional() }).strict();
const bodyCorrection = z.object({ ...correction, sourceBodyId: id, original: body, previous: body, corrected: body }).strict();
const profile = z.object({ nickname: id, sex: z.enum(["male", "female"]), age: number.int().min(18), heightCm: positive, currentWeightKg: positive, weeklyExercise: z.enum(["low", "medium", "high", "very-high"]), hasFatLossExperience: z.boolean(), targetWeightKg: positive.optional(), cycleStartDate: date.optional() }).strict();
const cycle = z.object({ id, startDate: date, endDate: date, status: z.enum(["active", "archived"]), archivedAt: text.optional(), archiveReason: z.enum(["completed", "early"]).optional() }).strict();
const group = z.object({ id, name: id, hidden: z.boolean(), ...metadata, deletedAt: timestamp.optional() }).strict();
const trainingPlan = z.object({ id, ...metadata, title: id.max(100), content: id.max(2000), deletedAt: timestamp.optional() }).strict();
const trainingRecord = z.object({ id, ...metadata, cycleId: id, date, planId: id.optional(), title: id.max(100), content: id.max(2000), completed: z.boolean(), feeling: text }).strict();
const reminder = z.object({ enabled: z.boolean(), weekdays: z.array(number.int().min(1).max(7)), time: text }).strict().refine((value) => !value.enabled || (value.weekdays.length > 0 && /^([01]\d|2[0-3]):[0-5]\d$/.test(value.time)));

export const diaryStateSchema = z.object({
  profile: profile.optional(), cycles: z.array(cycle).optional(),
  dayTypeRecords: z.array(z.object({ cycleId: id, date, dayType, baseline: nutrients }).strict()).optional(),
  indulgenceDays: z.array(z.object({ cycleId: id, date }).strict()).optional(),
  dayType: dayType.optional(), baseline: nutrients.optional(), userTarget: nutrients.optional(),
  meals: z.array(meal), weights: z.array(z.object({ id, cycleId: id.optional(), date, weightKg: positive }).strict()),
  foodLibrary: z.object({ customFoods: z.array(customFood), favoriteIds: z.array(id), recentIds: z.array(id) }).strict().optional(),
  mealGroups: z.array(group).optional(), mealCorrections: z.array(mealCorrection).optional(),
  bodyRecords: z.array(body).optional(), bodyCorrections: z.array(bodyCorrection).optional(),
  training: z.object({ plans: z.array(trainingPlan), records: z.array(trainingRecord), reminder }).strict().optional(),
}).strict();

export function validateBackupState(input: unknown): DiaryState {
  const parsed = diaryStateSchema.safeParse(input);
  if (!parsed.success) throw new Error(`备份数据不完整或字段无效：${parsed.error.issues[0].path.join(".") || "根对象"}`);
  const state = parsed.data as DiaryState;
  for (const records of [state.cycles, state.meals, state.weights, state.bodyRecords, state.mealGroups, state.foodLibrary?.customFoods, state.training?.plans, state.training?.records, state.mealCorrections, state.bodyCorrections]) {
    if (records && new Set(records.map((record) => record.id)).size !== records.length) throw new Error("备份包含重复记录标识");
  }
  if ((state.cycles?.filter((value) => value.status === "active").length ?? 0) > 1) throw new Error("备份包含多个进行中的周期");
  const indulgenceKeys = (state.indulgenceDays ?? []).map((record) => `${record.cycleId}/${record.date}`);
  if (new Set(indulgenceKeys).size !== indulgenceKeys.length) throw new Error("备份包含重复放纵日标记");
  for (const cycle of state.cycles ?? []) {
    if (cycle.endDate !== addCalendarDays(cycle.startDate, 89)) throw new Error("备份周期不是连续 90 个自然日");
  }
  if (state.cycles) {
    for (const record of [...state.meals, ...state.weights, ...(state.bodyRecords ?? []), ...(state.training?.records ?? []), ...(state.dayTypeRecords ?? []), ...(state.indulgenceDays ?? [])]) {
      if (record.cycleId && !state.cycles.some((cycle) => cycle.id === record.cycleId && record.date >= cycle.startDate && record.date <= cycle.endDate)) throw new Error("备份记录的周期引用无效");
    }
  }
  if (state.indulgenceDays?.length && !state.cycles) throw new Error("备份放纵日缺少关联周期");
  for (const [sources, corrections, sourceKey] of [[state.meals, state.mealCorrections ?? [], "sourceMealId"], [state.bodyRecords ?? [], state.bodyCorrections ?? [], "sourceBodyId"]] as const) {
    const seen = new Map<string, string>();
    const previousValues = new Map<string, unknown>();
    for (const item of corrections) {
      const sourceId = (item as unknown as Record<string, string>)[sourceKey];
      const source = (sources as Array<{ id: string }>).find((record) => record.id === sourceId);
      if (!source || item.original.id !== sourceId || item.previous.id !== sourceId || item.corrected.id !== sourceId || item.previousCorrectionId !== seen.get(sourceId) || JSON.stringify(source) !== JSON.stringify(item.original)) throw new Error("备份历史纠错链不完整");
      if (JSON.stringify(item.previous) !== JSON.stringify(previousValues.get(sourceId) ?? source) || item.corrected.date !== item.original.date || item.corrected.cycleId !== item.original.cycleId) throw new Error("备份历史纠错快照不一致");
      seen.set(sourceId, item.id);
      previousValues.set(sourceId, item.corrected);
    }
  }
  return state;
}
