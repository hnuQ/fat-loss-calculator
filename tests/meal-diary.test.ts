import { describe, expect, it } from "vitest";
import { createFatLossDiary } from "../src/application/fatLossDiary";
import { createFoodLibrary } from "../src/application/foodLibrary";
import { createInMemoryDiaryRepository } from "../src/testing/inMemoryDiaryRepository";
import type { DiarySnapshot, Nutrients } from "../src/domain/diary";

const profile = { nickname: "餐食测试", sex: "male" as const, age: 30, heightCm: 175, currentWeightKg: 70, weeklyExercise: "medium" as const, hasFatLossExperience: false, dayType: "training" as const };
async function journey() {
  const repository = createInMemoryDiaryRepository();
  let today = "2026-10-02";
  const dependencies = { repository, clock: { today: () => today }, platform: { kind: "test" as const, localPersistence: true, canvas: true } };
  const diary = createFatLossDiary(dependencies);
  await diary.establishProfile(profile);
  return { diary, repository, library: createFoodLibrary({ repository }), reopen: () => createFatLossDiary(dependencies), nextDay: () => { today = "2026-10-03"; } };
}
function verifyTotals(snapshot: DiarySnapshot) {
  const keys: Array<keyof Nutrients> = ["carbohydrateGrams", "proteinGrams", "fatGrams", "energyKcal"];
  for (const key of keys) {
    expect(snapshot.actual[key]).toBeCloseTo(snapshot.meals.reduce((sum, meal) => sum + meal.nutrients[key], 0), 8);
    expect(snapshot.actual[key]).toBeCloseTo(snapshot.mealGroups.reduce((sum, group) => sum + group.actual[key], 0), 8);
    expect(snapshot.remaining?.[key]).toBeCloseTo(snapshot.baseline![key] - snapshot.actual[key], 8);
    for (const group of snapshot.mealGroups) expect(group.actual[key]).toBeCloseTo(group.meals.reduce((sum, meal) => sum + meal.nutrients[key], 0), 8);
  }
}

describe("六餐日记公开行为", () => {
  it("默认顺序、改名、隐藏、重新显示、新增和重开保留记录与全天汇总", async () => {
    const { diary, reopen } = await journey();
    expect((await diary.openDiary()).mealGroups.map((group) => group.name)).toEqual(["早餐", "午加餐", "午餐", "晚加餐", "晚餐", "练后餐"]);
    const [oats] = diary.searchFoods("燕麦");
    const groups = (await diary.openDiary()).mealGroups;
    for (const group of groups) await diary.saveMeal({ mealSlot: group.id, foodId: oats.id, amount: 25.5 });
    const before = await diary.openDiary();
    verifyTotals(before);
    const hidden = await diary.configureMealGroup({ id: "breakfast", name: "早饭", hidden: true });
    expect(hidden.actual).toEqual(before.actual);
    expect(hidden.mealGroups[0].meals).toHaveLength(1);
    await expect(diary.saveMeal({ mealSlot: "breakfast", foodId: oats.id, amount: 50 })).rejects.toThrow("可见餐次");
    const restored = await reopen().configureMealGroup({ id: "breakfast", name: "早饭", hidden: false });
    expect(restored.mealGroups[0].meals).toEqual(before.mealGroups[0].meals);
    const extra = await diary.addMealGroup("夜间记录");
    const customGroup = extra.mealGroups[6];
    expect(customGroup).toMatchObject({ ownerId: "local-user", revision: 1, syncState: "local" });
    const configured = await diary.configureMealGroup({ id: customGroup.id, name: "夜间记录", hidden: false });
    expect(configured.mealGroups[6].revision).toBe(2);
    const final = await diary.saveMeal({ mealSlot: customGroup.id, foodId: oats.id, amount: 30 });
    verifyTotals(final);
    expect((await reopen().openDiary()).mealGroups).toEqual(final.mealGroups);
    await expect(diary.addMealGroup(" ")).rejects.toThrow("餐次名称");
    await expect(diary.configureMealGroup({ id: "missing", name: "餐次", hidden: false })).rejects.toThrow("未找到餐次");
  });

  it("内置克/个、自定义每100g/每个支持小数并能编辑、移动、删除", async () => {
    const { diary, library, reopen } = await journey();
    const gram = await library.saveCustomFood({ name: "克食材", basis: "per100g", carbohydrateGrams: 20, proteinGrams: 10, fatGrams: 2 });
    const item = await library.saveCustomFood({ name: "个食材", basis: "perItem", carbohydrateGrams: 3, proteinGrams: 4, fatGrams: 1 });
    const [oats] = diary.searchFoods("燕麦");
    const [egg] = diary.searchFoods("全蛋");
    await diary.saveMeal({ mealSlot: "breakfast", foodId: oats.id, amount: 50 });
    await diary.saveMeal({ mealSlot: "lunch", foodId: egg.id, amount: 1.5 });
    await diary.saveMeal({ mealSlot: "dinner", foodId: gram.id, amount: 25.5 });
    const added = await diary.saveMeal({ mealSlot: "post-workout", foodId: item.id, amount: 0.5 });
    expect(added.meals[0].nutrients).toEqual({ carbohydrateGrams: 30, proteinGrams: 6.5, fatGrams: 3.5, energyKcal: 188.5 });
    expect(added.meals[1].unit).toBe("item");
    expect(added.meals[2].nutrients).toEqual({ carbohydrateGrams: 5.1, proteinGrams: 2.6, fatGrams: 0.5, energyKcal: 35.2 });
    expect(added.meals[3].nutrients).toEqual({ carbohydrateGrams: 1.5, proteinGrams: 2, fatGrams: 0.5, energyKcal: 18.5 });
    verifyTotals(added);
    await library.saveCustomFood({ name: "改过的食材", basis: "per100g", carbohydrateGrams: 90, proteinGrams: 0, fatGrams: 0 }, item.id);
    await library.deleteCustomFood(item.id);
    const edited = await reopen().updateMeal({ id: added.meals[3].id, mealSlot: "breakfast", amount: 2 });
    expect(edited.meals[3]).toMatchObject({ foodName: "个食材", unit: "item", amount: 2, nutrients: { carbohydrateGrams: 6, proteinGrams: 8, fatGrams: 2, energyKcal: 74 } });
    verifyTotals(edited);
    const deleted = await diary.deleteMeal(added.meals[0].id);
    expect(deleted.meals).toHaveLength(3);
    verifyTotals(deleted);
    const replacement = await diary.saveMeal({ mealSlot: "breakfast", foodId: oats.id, amount: 50 });
    expect(new Set(replacement.meals.map((meal) => meal.id)).size).toBe(4);
    expect((await reopen().openDiary()).meals).toEqual(replacement.meals);
  });

  it("旧版 MealSlot 与数量营养快照迁移后可调整且不依赖已删除食材", async () => {
    const { diary, repository, reopen } = await journey();
    const [oats] = diary.searchFoods("燕麦");
    const added = await diary.saveMeal({ mealSlot: "morning-snack", foodId: oats.id, amount: 50 });
    const state = (await repository.read())!;
    delete state.mealGroups;
    delete state.meals[0].foodSnapshot;
    state.meals[0].foodId = "deleted-food";
    await repository.write(state);
    const migrated = await reopen().openDiary();
    expect(migrated.mealGroups[1].name).toBe("午加餐");
    expect(migrated.mealGroups[1].meals).toHaveLength(1);
    const edited = await diary.updateMeal({ id: added.meals[0].id, amount: 100, mealSlot: "morning-snack" });
    expect(edited.actual.energyKcal).toBe(377);
    verifyTotals(edited);
  });

  it.each([0, -1, NaN, Infinity, 100001])("无效数量 %s 不改变已保存记录", async (amount) => {
    const { diary, repository } = await journey();
    const [oats] = diary.searchFoods("燕麦");
    const added = await diary.saveMeal({ mealSlot: "breakfast", foodId: oats.id, amount: 50 });
    const before = await repository.read();
    await expect(diary.updateMeal({ id: added.meals[0].id, amount, mealSlot: "breakfast" })).rejects.toThrow("食用量");
    expect(await repository.read()).toEqual(before);
  });

  it("切换日期只读取选中日；跨日、归档后不能覆盖或删除餐食及历史基准", async () => {
    const journeyState = await journey();
    const { diary, repository, nextDay } = journeyState;
    const [oats] = diary.searchFoods("燕麦");
    const added = await diary.saveMeal({ mealSlot: "breakfast", foodId: oats.id, amount: 50 });
    const cycleId = added.activeCycle!.id;
    nextDay();
    const before = await repository.read();
    await expect(diary.updateMeal({ id: added.meals[0].id, amount: 100, mealSlot: "lunch" })).rejects.toThrow("历史餐食");
    await expect(diary.deleteMeal(added.meals[0].id)).rejects.toThrow("历史餐食");
    await expect(diary.saveMeal({ mealSlot: "breakfast", foodId: oats.id, amount: 50, date: "2026-10-02" })).rejects.toThrow("今天");
    await expect(diary.setDayType({ cycleId, date: "2026-10-02", dayType: "rest" })).rejects.toThrow("历史日期");
    expect(await repository.read()).toEqual(before);
    expect((await diary.openDiary()).meals).toEqual([]);
    expect((await diary.openDiary({ date: "2026-10-02" })).meals).toEqual(added.meals);
    await diary.setDayType({ cycleId, date: "2026-10-03", dayType: "rest" });
    const todayMeal = await diary.saveMeal({ mealSlot: "breakfast", foodId: oats.id, amount: 50 });
    await diary.archiveActiveCycle();
    await expect(diary.deleteMeal(todayMeal.meals[0].id)).rejects.toThrow("已归档");
  });

  it.each([
    [1543.4, "low"], [1543.5, "within"], [1543.6, "within"],
    [1886.4, "within"], [1886.5, "within"], [1886.6, "high"],
    [0, "low"], [1715, "within"], [2000, "high"],
  ] as const)("摄入 %s kcal 的状态为 %s，剩余额为基准减摄入", async (energy, status) => {
    const { diary, library, reopen } = await journey();
    const food = await library.saveCustomFood({ name: "边界食材", basis: "per100g", carbohydrateGrams: 25, proteinGrams: 0, fatGrams: 0 });
    if (energy > 0) await diary.saveMeal({ mealSlot: "breakfast", foodId: food.id, amount: energy });
    const snapshot = await reopen().openDiary();
    expect(snapshot.actual.energyKcal).toBe(energy);
    expect(snapshot.energyStatus).toBe(status);
    expect(snapshot.remaining!.energyKcal).toBeCloseTo(1715 - energy, 8);
    verifyTotals(snapshot);
    expect(snapshot).not.toHaveProperty("macroStatus");
  });
});
