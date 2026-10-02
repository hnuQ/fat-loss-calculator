import { describe, expect, it } from "vitest";
import { createFoodLibrary } from "../src/application/foodLibrary";
import { createFatLossDiary } from "../src/application/fatLossDiary";
import { builtInFoods } from "../src/domain/foods";
import { parseFoodNumber, type CustomFoodInput } from "../src/domain/foodLibrary";
import { createInMemoryDiaryRepository } from "../src/testing/inMemoryDiaryRepository";
import fixture from "./fixtures/workbook-foods.json";

const input: CustomFoodInput = { name: "我的豆饮", basis: "per100g", carbohydrateGrams: 3, proteinGrams: 4, fatGrams: 2 };
function setup() {
  const repository = createInMemoryDiaryRepository();
  let sequence = 0;
  const library = createFoodLibrary({ repository, now: () => "2026-10-02T00:00:00.000Z", createId: () => `custom-test-${++sequence}` });
  const diary = createFatLossDiary({ repository, clock: { today: () => "2026-10-02" }, platform: { kind: "test", localPersistence: true, canvas: true } });
  return { repository, library, diary };
}

describe("食材库公开行为", () => {
  it("全部78种数据逐字段符合原工作簿，只读冻结，液体按克、蛋按个", async () => {
    const { foods } = await setup().library.browse();
    expect(foods).toHaveLength(78);
    expect(new Set(foods.map((food) => food.id)).size).toBe(78);
    expect(new Set(foods.map((food) => food.name)).size).toBe(78);
    for (const { values } of fixture.rows) {
      const [name, baseAmount, carbohydrateGrams, proteinGrams, fatGrams, energyKcal] = values;
      expect(foods.find((food) => food.name === name)).toMatchObject({ name, baseAmount, unit: baseAmount === 1 ? "item" : "g", nutrients: { carbohydrateGrams, proteinGrams, fatGrams, energyKcal } });
    }
    expect(foods.filter((food) => food.unit === "item").map((food) => food.name)).toEqual(["全蛋（按个）", "蛋白（按个）"]);
    for (const name of ["牛奶", "橄榄油", "牛油果油", "山茶油"]) expect(foods.find((food) => food.name === name)?.unit).toBe("g");
    expect(Object.isFrozen(builtInFoods)).toBe(true);
    expect(Object.isFrozen(foods[0])).toBe(true);
    expect(Object.isFrozen(foods[0].nutrients)).toBe(true);
  });
  it("搜索内置和自定义名称，修剪空白、不区分英文大小写", async () => {
    const { library } = setup();
    await library.saveCustomFood({ ...input, name: "燕麦 DIY" });
    expect((await library.browse(" 燕麦 ")).foods.map((food) => food.name)).toEqual(["燕麦（干）", "燕麦 DIY"]);
    expect((await library.browse("diy")).foods).toHaveLength(1);
    expect((await library.browse("不存在")).foods).toEqual([]);
    expect((await library.browse("", "custom")).foods).toHaveLength(1);
  });
  it("每100g和每个基准分别换算小数，自定义热量按4/4/9逐项取整", async () => {
    const { library } = setup();
    const grams = await library.saveCustomFood(input);
    const item = await library.saveCustomFood({ ...input, name: "我的小点", basis: "perItem" });
    expect(grams).toMatchObject({ unit: "g", baseAmount: 100, nutrients: { energyKcal: 46 } });
    expect(item).toMatchObject({ unit: "item", baseAmount: 1, nutrients: { energyKcal: 46 } });
    expect(await library.preview(grams.id, 50.5)).toEqual({ carbohydrateGrams: 1.5, proteinGrams: 2, fatGrams: 1, energyKcal: 23.2 });
    expect(await library.preview(item.id, 0.5)).toEqual({ carbohydrateGrams: 1.5, proteinGrams: 2, fatGrams: 1, energyKcal: 23 });
    expect((await library.saveCustomFood({ ...input, carbohydrateGrams: 0.1, proteinGrams: 0.1, fatGrams: 0.1 })).nutrients.energyKcal).toBe(1);
    expect((await library.saveCustomFood({ ...input, carbohydrateGrams: 0, proteinGrams: 0, fatGrams: 0 })).nutrients.energyKcal).toBe(0);
    expect((await library.preview("protein-whole-egg", 1.5)).energyKcal).toBe(108);
    expect((await library.preview("builtin-18", 0.5)).energyKcal).toBe(8.5);
  });
  it("收藏和最近使用重建服务后恢复，去重排序、取消收藏与20项上限有效", async () => {
    const { repository, library } = setup();
    const custom = await library.saveCustomFood(input);
    await library.toggleFavorite(custom.id);
    await library.toggleFavorite(builtInFoods[0].id);
    await library.preview(custom.id, 10);
    await library.preview(builtInFoods[0].id, 10);
    await library.preview(custom.id, 20);
    const reopened = createFoodLibrary({ repository });
    expect((await reopened.browse("", "recent")).foods.map((food) => food.id)).toEqual([custom.id, builtInFoods[0].id]);
    expect((await reopened.browse("", "favorites")).foods.map((food) => food.id)).toEqual([custom.id, builtInFoods[0].id]);
    await reopened.toggleFavorite(custom.id);
    expect((await createFoodLibrary({ repository }).browse("", "favorites")).foods.map((food) => food.id)).toEqual([builtInFoods[0].id]);
    for (const food of builtInFoods.slice(0, 25)) await reopened.preview(food.id, 1);
    expect((await reopened.browse("", "recent")).foods.map((food) => food.id)).toEqual(builtInFoods.slice(5, 25).reverse().map((food) => food.id));
  });
  it("编辑保留标识与创建时间、增加修订，删除清理列表并保留餐食原值", async () => {
    const { repository, library, diary } = setup();
    await diary.establishProfile({ nickname: "用户", sex: "male", age: 30, heightCm: 175, currentWeightKg: 70, weeklyExercise: "medium", hasFatLossExperience: false, dayType: "training" });
    const custom = await library.saveCustomFood(input);
    await library.toggleFavorite(custom.id);
    const saved = await diary.saveMeal({ mealSlot: "breakfast", foodId: custom.id, amount: 50 });
    expect((await library.browse("", "recent")).foods[0].id).toBe(custom.id);
    const updated = await library.saveCustomFood({ ...input, name: "改名点心", basis: "perItem", fatGrams: 3 }, custom.id);
    expect(updated).toMatchObject({ id: custom.id, ownerId: "local-user", createdAt: custom.createdAt, revision: 2, unit: "item", baseAmount: 1, syncState: "local" });
    await library.deleteCustomFood(custom.id);
    const reopened = createFoodLibrary({ repository });
    for (const filter of ["custom", "recent", "favorites"] as const) expect((await reopened.browse("", filter)).foods).toEqual([]);
    expect((await diary.openDiary()).meals).toEqual(saved.meals);
    expect((await repository.read())?.foodLibrary?.customFoods[0]).toMatchObject({ deletedAt: "2026-10-02T00:00:00.000Z", revision: 3 });
    await expect(diary.saveMeal({ mealSlot: "breakfast", foodId: custom.id, amount: 1 })).rejects.toThrow("未找到食材");
    await expect(reopened.saveCustomFood(input, custom.id)).rejects.toThrow("未找到自己的");
  });
  it("内置和其他所有者食材不能编辑或删除", async () => {
    const { repository, library } = setup();
    for (const food of builtInFoods) {
      await expect(library.saveCustomFood(input, food.id)).rejects.toThrow("内置食材只读");
      await expect(library.deleteCustomFood(food.id)).rejects.toThrow("内置食材只读");
    }
    const other = await library.saveCustomFood(input);
    const state = (await repository.read())!;
    state.foodLibrary!.customFoods[0].ownerId = "other-user";
    await repository.write(state);
    await expect(library.saveCustomFood(input, other.id)).rejects.toThrow("未找到自己的");
    await expect(library.deleteCustomFood(other.id)).rejects.toThrow("未找到自己的");
    expect((await library.browse()).foods).toHaveLength(78);
  });
  it.each([0, -1, NaN, Infinity, Number.MAX_VALUE, "2" as never, "文本" as never])("拒绝无效数量 %s 且不记最近使用", async (amount) => {
    const { library } = setup();
    await expect(library.preview(builtInFoods[0].id, amount)).rejects.toThrow("食用量");
    expect((await library.browse("", "recent")).foods).toEqual([]);
  });
  it("克与个的数量上限各自有效，正小数接受", async () => {
    const { library } = setup();
    await expect(library.preview(builtInFoods[0].id, 100000.1)).rejects.toThrow("100000g");
    await expect(library.preview("protein-whole-egg", 1000.1)).rejects.toThrow("1000个");
    expect((await library.preview(builtInFoods[0].id, 100000)).energyKcal).toBe(377000);
    expect((await library.preview("protein-whole-egg", 1000)).energyKcal).toBe(72000);
    expect((await library.preview("protein-whole-egg", 0.01)).energyKcal).toBe(0.7);
  });
  it.each([-1, NaN, Infinity, Number.MAX_VALUE, "3" as never])("拒绝无效营养素 %s 不写入", async (value) => {
    const { repository, library } = setup();
    await expect(library.saveCustomFood({ ...input, carbohydrateGrams: value })).rejects.toThrow(/有限数值|不能超过/);
    expect(await repository.read()).toBeUndefined();
  });
  it("拒绝空名称、无效基准与营养素合计超限", async () => {
    const { library } = setup();
    await expect(library.saveCustomFood({ ...input, name: " " })).rejects.toThrow("名称");
    await expect(library.saveCustomFood({ ...input, name: "字".repeat(61) })).rejects.toThrow("名称");
    await expect(library.saveCustomFood({ ...input, basis: "invalid" as never })).rejects.toThrow("基准");
    await expect(library.saveCustomFood({ ...input, carbohydrateGrams: 95 })).rejects.toThrow("100g");
    await expect(library.saveCustomFood({ ...input, basis: "perItem", carbohydrateGrams: 9999 })).rejects.toThrow("10000g");
  });
  it.each(["", " ", "1abc", "1e6", "-1", "Infinity", "NaN", "0x10", "文本"])("完整校验输入 %s 不截断", (value) => {
    expect(() => parseFoodNumber(value, "食用量")).toThrow("数值");
  });
  it("数字输入接受普通小数和零，零食用量由应用拒绝", () => {
    expect(parseFoodNumber(" 50.5 ", "食用量")).toBe(50.5);
    expect(parseFoodNumber(".5", "食用量")).toBe(0.5);
    expect(parseFoodNumber("0", "营养素")).toBe(0);
  });
  it("新字段可保存到旧版仓储而不损坏周期", async () => {
    const repository = createInMemoryDiaryRepository({ meals: [], weights: [], cycles: [{ id: "old-cycle", startDate: "2026-10-02", endDate: "2026-12-30", status: "active" }] });
    const library = createFoodLibrary({ repository });
    expect((await library.browse()).foods).toHaveLength(78);
    await library.toggleFavorite(builtInFoods[0].id);
    expect((await repository.read())?.cycles?.[0].id).toBe("old-cycle");
  });
  it("存储失败明确返回错误", async () => {
    const library = createFoodLibrary({ repository: { read: async () => undefined, write: async () => { throw new Error("磁盘保存失败"); } } });
    await expect(library.saveCustomFood(input)).rejects.toThrow("磁盘保存失败");
    await expect(library.toggleFavorite(builtInFoods[0].id)).rejects.toThrow("磁盘保存失败");
  });
});
