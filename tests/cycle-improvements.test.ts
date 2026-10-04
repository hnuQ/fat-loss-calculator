import { describe, expect, it } from "vitest";
import { createFatLossDiary } from "../src/application/fatLossDiary";
import { createDiaryBackup } from "../src/application/diaryBackup";
import { createTrainingDiary } from "../src/application/trainingDiary";
import { createFoodLibrary } from "../src/application/foodLibrary";
import type { DiaryState } from "../src/domain/diary";
import { createInMemoryDiaryRepository } from "../src/testing/inMemoryDiaryRepository";

const platform = { kind: "test" as const, localPersistence: true, canvas: true };
const profile = { nickname: "周期测试", sex: "male" as const, age: 30, heightCm: 175, currentWeightKg: 70, weeklyExercise: "medium" as const, hasFatLossExperience: false };
const randomBytes = (length: number) => globalThis.crypto.getRandomValues(new Uint8Array(length));

async function journey() {
  let today = "2026-10-04";
  const repository = createInMemoryDiaryRepository();
  const clock = { today: () => today };
  const diary = createFatLossDiary({ repository, clock, platform });
  await diary.establishProfile(profile);
  const snapshot = await diary.startCycle({ startDate: today, dayType: "training" });
  return { diary, repository, clock, cycleId: snapshot.activeCycle!.id, setToday: (date: string) => { today = date; } };
}

describe("归档周期删除与放纵日", () => {
  it("历史和归档放纵日只读，餐食锁和严格超过 10% 的纠错仍有效", async () => {
    const { diary, cycleId, setToday } = await journey();
    await diary.setIndulgenceDay({ cycleId, date: "2026-10-04", enabled: true });
    const recorded = await diary.saveMeal({ foodId: diary.searchFoods("燕麦")[0].id, amount: 100, mealSlot: "breakfast" });
    const mealId = recorded.meals[0].id;
    setToday("2026-10-05");
    await expect(diary.setIndulgenceDay({ cycleId, date: "2026-10-04", enabled: false })).rejects.toThrow("只能查看");
    await expect(diary.updateMeal({ id: mealId, amount: 110, mealSlot: "lunch" })).rejects.toThrow("历史餐食");
    await expect(diary.deleteMeal(mealId)).rejects.toThrow("历史餐食");
    await expect(diary.saveMeal({ foodId: recorded.meals[0].foodId, amount: 10, mealSlot: "breakfast", date: "2026-10-04" })).rejects.toThrow("今天");
    await expect(diary.correctMeal({ id: mealId, amount: 110, reason: "数量录错" })).rejects.toThrow("超过 10%");
    const corrected = await diary.correctMeal({ id: mealId, amount: 120, reason: "数量录错" });
    expect(corrected.originalMeals[0].amount).toBe(100);
    expect(corrected.meals[0].amount).toBe(120);
    expect(corrected.isIndulgenceDay).toBe(true);
    expect(corrected.energyStatus).toBeUndefined();
    await diary.archiveActiveCycle();
    await expect(diary.setIndulgenceDay({ cycleId, date: "2026-10-06", enabled: true })).rejects.toThrow("只能查看");
  });

  it("删除完整关联记录和纠错，保留其他周期、食材、餐次、模板和独立提醒", async () => {
    const { diary, repository, clock, cycleId, setToday } = await journey();
    const backup = createDiaryBackup({ repository, randomBytes });
    const training = createTrainingDiary({ repository, diary, clock, reminders: { capability: () => ({ supported: true, message: "测试" }), requestPermission: async () => true, replace: async () => {} } });
    const foods = createFoodLibrary({ repository });
    const custom = await foods.saveCustomFood({ name: "测试食材", basis: "per100g", carbohydrateGrams: 20, proteinGrams: 10, fatGrams: 5 });
    await foods.toggleFavorite(custom.id);
    await diary.addMealGroup("测试餐次");
    const plan = (await training.savePlan({ title: "训练模板", content: "自填内容" })).plans[0];
    await training.saveReminder({ enabled: true, weekdays: [1, 3], time: "18:30" });
    await training.saveRecord({ title: plan.title, content: plan.content, planId: plan.id, completed: true, feeling: "完成" });
    await diary.setIndulgenceDay({ cycleId, date: "2026-10-04", enabled: true });
    const meal = (await diary.saveMeal({ foodId: custom.id, amount: 100, mealSlot: "breakfast" })).meals[0];
    const body = (await diary.recordWeight({ weightKg: 69 })).bodyRecords[0];
    setToday("2026-10-05");
    await diary.correctMeal({ id: meal.id, amount: 120, reason: "数量录错" });
    await diary.correctBodyRecord({ id: body.id, measurements: { weightKg: 68 }, reason: "录入错误" });
    await diary.archiveActiveCycle();
    const next = await diary.startCycle({ startDate: "2026-10-05", dayType: "rest" });
    await diary.recordWeight({ weightKg: 67 });
    await diary.saveMeal({ foodId: custom.id, amount: 50, mealSlot: "lunch" });
    await training.saveRecord({ title: "第二周期训练", content: "第二周期内容", completed: false, feeling: "" });
    const before = JSON.parse(await backup.exportBackup()).state;
    await diary.openDiary({ cycleId, date: "2026-10-04" });
    const deleted = await diary.deleteArchivedCycle(cycleId, { cycleId, date: "2026-10-04" });
    expect(deleted.selectedCycle?.id).toBe(next.activeCycle?.id);
    const after = JSON.parse(await backup.exportBackup()).state;
    for (const key of ["profile", "foodLibrary", "mealGroups", "userTarget"] as const) expect(after[key]).toEqual(before[key]);
    expect(after.training.plans).toEqual(before.training.plans);
    expect(after.training.reminder).toEqual(before.training.reminder);
    for (const key of ["cycles", "dayTypeRecords", "meals", "weights", "bodyRecords"] as const) {
      expect(after[key]).toEqual(before[key].filter((record: { id: string; cycleId?: string }) => (key === "cycles" ? record.id : record.cycleId) !== cycleId));
    }
    expect(after.training.records).toEqual(before.training.records.filter((record: { cycleId: string }) => record.cycleId !== cycleId));
    expect(after.mealCorrections).toEqual([]);
    expect(after.bodyCorrections).toEqual([]);
    expect(after.indulgenceDays).toEqual([]);
    expect(await backup.exportCsv("body")).not.toContain(body.id);
    expect(await backup.exportCsv("training")).not.toContain(cycleId);
    expect((await diary.openDiary()).selectedDate).toBe("2026-10-05");
  });

  it("最后旧周期删除后重开和备份恢复不复活，新周期不复用旧 ID", async () => {
    const legacy: DiaryState = { profile: { ...profile, cycleStartDate: "2026-06-01" }, dayType: "training", baseline: { carbohydrateGrams: 175, proteinGrams: 112, fatGrams: 63, energyKcal: 1715 }, meals: [], weights: [{ id: "old-weight", date: "2026-06-01", weightKg: 70 }] };
    const repository = createInMemoryDiaryRepository(legacy);
    const clock = { today: () => "2026-10-04" };
    const diary = createFatLossDiary({ repository, clock, platform });
    const old = (await diary.openDiary()).selectedCycle!;
    expect((await diary.openDiary()).isIndulgenceDay).toBe(false);
    await diary.deleteArchivedCycle(old.id);
    const reopened = createFatLossDiary({ repository, clock, platform });
    expect((await reopened.openDiary()).cycles).toEqual([]);
    const backup = createDiaryBackup({ repository, randomBytes });
    await backup.restoreBackup(await backup.exportBackup());
    expect((await reopened.openDiary()).cycles).toEqual([]);
    const replacement = await reopened.startCycle({ startDate: old.startDate, dayType: "rest" });
    expect(replacement.selectedCycle!.id).not.toBe(old.id);
    await reopened.openDiary();
    await reopened.deleteArchivedCycle(replacement.selectedCycle!.id);
    const second = await reopened.startCycle({ startDate: old.startDate, dayType: "rest" });
    expect(second.selectedCycle!.id).not.toBe(replacement.selectedCycle!.id);
  });
  it("未记餐食的放纵日可备份恢复并单独导出 CSV；删除后备份不会恢复该周期", async () => {
    const { diary, repository, clock, cycleId } = await journey();
    await diary.setIndulgenceDay({ cycleId, date: "2026-10-04", enabled: true });
    const backup = createDiaryBackup({ repository, randomBytes });
    const content = await backup.exportBackup();
    const target = createInMemoryDiaryRepository();
    await createDiaryBackup({ repository: target, randomBytes }).restoreBackup(content);
    const reopened = createFatLossDiary({ repository: target, clock, platform });
    expect((await reopened.openDiary()).isIndulgenceDay).toBe(true);
    const csv = await backup.exportCsv("meals");
    expect(csv).toContain('"放纵日"');
    expect(csv).toContain('"2026-10-04","日期标记"');
    expect(csv).toContain('"是"');
    expect(csv).not.toContain('"0"');
    await diary.archiveActiveCycle();
    await diary.deleteArchivedCycle(cycleId);
    await createDiaryBackup({ repository: target, randomBytes }).restoreBackup(await backup.exportBackup());
    expect((await reopened.openDiary()).cycles).toEqual([]);
    expect(await backup.exportCsv("meals")).not.toContain(cycleId);
  });
  it("放纵日独立于三种日型，允许空餐食，保留基准与已记录摄入但不评价剩余或状态", async () => {
    const { diary, cycleId } = await journey();
    for (const dayType of ["training", "cardio", "rest"] as const) {
      const ordinary = await diary.setDayType({ cycleId, date: "2026-10-04", dayType });
      const marked = await diary.setIndulgenceDay({ cycleId, date: "2026-10-04", enabled: true });
      expect(marked.isIndulgenceDay).toBe(true);
      expect(marked.isBlankDate).toBe(false);
      expect(marked.baseline).toEqual(ordinary.baseline);
      expect(marked.dayType).toBe(dayType);
      expect(marked.meals).toEqual([]);
      expect(marked.remaining).toBeUndefined();
      expect(marked.energyStatus).toBeUndefined();
    }
    const recorded = await diary.saveMeal({ foodId: diary.searchFoods("燕麦")[0].id, amount: 50, mealSlot: "breakfast" });
    expect(recorded.actual.energyKcal).toBe(188.5);
    expect(recorded.remaining).toBeUndefined();
    expect(recorded.energyStatus).toBeUndefined();
    const unmarked = await diary.setIndulgenceDay({ cycleId, date: "2026-10-04", enabled: false });
    expect(unmarked.isIndulgenceDay).toBe(false);
    expect(unmarked.remaining).toBeDefined();
    expect(unmarked.energyStatus).toBe("low");
  });
  it("删除归档周期后打开空状态，保留健康档案，拒绝删除活动周期", async () => {
    const { diary, repository, clock, cycleId } = await journey();
    await expect(diary.deleteArchivedCycle(cycleId)).rejects.toThrow("只能删除已归档周期");
    await diary.saveMeal({ foodId: diary.searchFoods("燕麦")[0].id, amount: 50, mealSlot: "breakfast" });
    await diary.recordWeight({ weightKg: 69 });
    await diary.archiveActiveCycle();
    const deleted = await diary.deleteArchivedCycle(cycleId);
    expect(deleted.cycles).toEqual([]);
    expect(deleted.selectedCycle).toBeUndefined();
    expect(deleted.cycleDates).toEqual([]);
    expect(deleted.meals).toEqual([]);
    expect(deleted.bodyRecords).toEqual([]);
    expect(deleted.profile).toMatchObject(profile);
    const reopened = createFatLossDiary({ repository, clock, platform });
    expect((await reopened.openDiary()).cycles).toEqual([]);
  });
});
