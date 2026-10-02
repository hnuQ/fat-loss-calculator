import { describe, expect, it } from "vitest";
import { createFatLossDiary } from "../src/application/fatLossDiary";
import { createFoodLibrary } from "../src/application/foodLibrary";
import { createInMemoryDiaryRepository } from "../src/testing/inMemoryDiaryRepository";

async function journey(amount = 100) {
  let today = "2026-10-02";
  const repository = createInMemoryDiaryRepository();
  const dependencies = { repository, clock: { today: () => today, now: () => `${today}T12:30:00+08:00` }, platform: { kind: "test" as const, localPersistence: true, canvas: true } };
  const diary = createFatLossDiary(dependencies);
  await diary.establishProfile({ nickname: "历史测试", sex: "male", age: 30, heightCm: 175, currentWeightKg: 70, weeklyExercise: "medium", hasFatLossExperience: false, dayType: "training" });
  const food = await createFoodLibrary({ repository }).saveCustomFood({ name: "每克一千卡", basis: "per100g", carbohydrateGrams: 25, proteinGrams: 0, fatGrams: 0 });
  const added = await diary.saveMeal({ foodId: food.id, mealSlot: "breakfast", amount });
  return { diary, repository, food, source: added.meals[0], setDate: (value: string) => { today = value; }, reopen: () => createFatLossDiary(dependencies) };
}

describe("历史餐食追加纠错公开行为", () => {
  it("无需重新打开即可跨日锁定新增、修改、删除，历史原值不变", async () => {
    const { diary, repository, source, food, setDate } = await journey();
    await diary.updateMeal({ id: source.id, amount: 110, mealSlot: "lunch" });
    const second = await diary.saveMeal({ foodId: food.id, mealSlot: "breakfast", amount: 20 });
    await diary.deleteMeal(second.meals[1].id);
    setDate("2026-10-03");
    const before = await repository.read();
    await expect(diary.updateMeal({ id: source.id, amount: 200, mealSlot: "breakfast" })).rejects.toThrow("历史餐食");
    await expect(diary.deleteMeal(source.id)).rejects.toThrow("历史餐食");
    await expect(diary.saveMeal({ foodId: food.id, mealSlot: "breakfast", amount: 20, date: source.date })).rejects.toThrow("今天");
    expect(await repository.read()).toEqual(before);
    expect((await diary.openDiary({ date: source.date })).originalMeals[0].amount).toBe(110);
  });

  it.each([90.1, 90, 109.9, 110, 100])("变化低于或等于10%%（修正%s）被拒绝且不写入", async (amount) => {
    const { diary, repository, source, setDate } = await journey();
    setDate("2026-10-03");
    const before = await repository.read();
    await expect(diary.correctMeal({ id: source.id, amount, reason: "录入错误" })).rejects.toThrow("超过 10%");
    expect(await repository.read()).toEqual(before);
  });

  it.each([89.9, 110.1])("正负方向超过10%%（修正%s）保留来源、原值和审计元数据", async (amount) => {
    const { diary, repository, source, setDate, reopen } = await journey();
    setDate("2026-10-03");
    const snapshot = await diary.correctMeal({ id: source.id, amount, reason: "  数量输错  " });
    expect(snapshot.actual.energyKcal).toBe(amount);
    expect(snapshot.mealGroups[0].actual).toEqual(snapshot.actual);
    expect(snapshot.remaining!.energyKcal).toBeCloseTo(snapshot.baseline!.energyKcal - amount);
    expect(snapshot.originalMeals).toEqual([source]);
    expect(snapshot.mealCorrections[0]).toMatchObject({ ownerId: "local-user", sourceMealId: source.id, original: source, previous: source, corrected: { amount }, previousDayEnergyKcal: 100, correctedDayEnergyKcal: amount, reason: "数量输错", createdAt: "2026-10-03T12:30:00+08:00", updatedAt: "2026-10-03T12:30:00+08:00", revision: 1, syncState: "local" });
    expect(snapshot.mealCorrections[0].id).toBeTruthy();
    expect((await repository.read())!.meals).toEqual([source]);
    expect(await reopen().openDiary({ date: source.date })).toEqual(snapshot);
  });

  it.each(["", "  \n ", undefined])("非空原因必填（%s）", async (reason) => {
    const { diary, repository, source, setDate } = await journey();
    setDate("2026-10-03");
    const before = await repository.read();
    await expect(diary.correctMeal({ id: source.id, amount: 150, reason: reason as string })).rejects.toThrow("原因");
    expect(await repository.read()).toEqual(before);
  });

  it("多次纠错按当前有效全天总量为分母，最新追加生效且审计链不丢失", async () => {
    const { diary, repository, source, food, setDate } = await journey();
    await diary.saveMeal({ foodId: food.id, mealSlot: "lunch", amount: 100 });
    setDate("2026-10-03");
    await expect(diary.correctMeal({ id: source.id, amount: 120, reason: "精确10%" })).rejects.toThrow("超过 10%");
    const first = await diary.correctMeal({ id: source.id, amount: 150, reason: "首次纠错" });
    expect(first.actual.energyKcal).toBe(250);
    await expect(diary.correctMeal({ id: source.id, amount: 175, reason: "当前分母250" })).rejects.toThrow("超过 10%");
    const second = await diary.correctMeal({ id: source.id, amount: 100, reason: "再次核对" });
    expect(second.actual.energyKcal).toBe(200);
    expect(second.mealCorrections).toHaveLength(2);
    expect(second.mealCorrections[1]).toMatchObject({ previousCorrectionId: first.mealCorrections[0].id, original: source, previous: { amount: 150 }, corrected: { amount: 100 }, previousDayEnergyKcal: 250, correctedDayEnergyKcal: 200 });
    expect((await repository.read())!.meals[0]).toEqual(source);
    setDate(source.date);
    await expect(diary.deleteMeal(source.id)).rejects.toThrow("历史餐食");
    await expect(diary.updateMeal({ id: source.id, amount: 123, mealSlot: "lunch" })).rejects.toThrow("历史餐食");
  });

  it("按保存的0.1kcal精度判边界，不用未舍入数量变化", async () => {
    const { diary, source, setDate } = await journey(1);
    setDate("2026-10-03");
    await expect(diary.correctMeal({ id: source.id, amount: 1.149, reason: "舍入到1.1" })).rejects.toThrow("超过 10%");
    expect((await diary.correctMeal({ id: source.id, amount: 1.151, reason: "舍入到1.2" })).actual.energyKcal).toBe(1.2);
  });

  it("零热量日：没有热量变化拒绝，非零变化允许，无除零", async () => {
    const { diary, repository, source, setDate } = await journey(0.01);
    expect(source.nutrients.energyKcal).toBe(0);
    setDate("2026-10-03");
    await expect(diary.correctMeal({ id: source.id, amount: 0.02, reason: "仍为零" })).rejects.toThrow("超过 10%");
    const result = await diary.correctMeal({ id: source.id, amount: 0.1, reason: "数量错误" });
    expect(result.actual.energyKcal).toBe(0.1);
    expect((await repository.read())!.meals[0]).toEqual(source);
  });

  it("迁移旧状态与缺少快照记录：反推已存营养，不用现行食材覆盖原值", async () => {
    const { repository, source, setDate, reopen } = await journey();
    const state = (await repository.read())!;
    delete state.mealCorrections;
    delete state.mealGroups;
    delete state.meals[0].foodSnapshot;
    state.meals[0].foodId = "已删除食材";
    state.meals[0].mealSlot = "morning-snack";
    await repository.write(state);
    const original = structuredClone(state.meals[0]);
    setDate("2026-10-03");
    const diary = reopen();
    expect((await diary.openDiary({ date: source.date })).mealCorrections).toEqual([]);
    const corrected = await diary.correctMeal({ id: source.id, amount: 200, reason: "旧版录入错误" });
    expect(corrected.actual.energyKcal).toBe(200);
    expect(corrected.mealGroups[1].actual.energyKcal).toBe(200);
    expect(corrected.originalMeals).toEqual([original]);
    expect((await repository.read())!.meals).toEqual([original]);
  });

  it.each([0, -1, NaN, Infinity, 100001])("数量%s沿用食材校验且拒绝不改原值", async (amount) => {
    const { diary, repository, source, setDate } = await journey();
    setDate("2026-10-03");
    const before = await repository.read();
    await expect(diary.correctMeal({ id: source.id, amount, reason: "错误" })).rejects.toThrow("食用量");
    expect(await repository.read()).toEqual(before);
  });

  it("当天、未来、缺失来源不能纠错；归档历史可追加", async () => {
    const { diary, source, setDate } = await journey();
    await expect(diary.correctMeal({ id: source.id, amount: 150, reason: "错误" })).rejects.toThrow("结束日期");
    setDate("2026-10-01");
    await expect(diary.correctMeal({ id: source.id, amount: 150, reason: "错误" })).rejects.toThrow("结束日期");
    await expect(diary.correctMeal({ id: "missing", amount: 150, reason: "错误" })).rejects.toThrow("未找到");
    setDate("2026-10-03");
    await diary.archiveActiveCycle();
    expect((await diary.correctMeal({ id: source.id, amount: 150, reason: "归档后核对" })).actual.energyKcal).toBe(150);
  });
});
