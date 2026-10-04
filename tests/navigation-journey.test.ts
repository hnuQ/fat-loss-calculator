import { expect, test } from "vitest";
import { mountNavigationHarness } from "./navigationHarness.js";

test("餐食保存失败保留输入，重试成功后留在饮食页并清空本次数量", async () => {
  const ui = await mountNavigationHarness();
  try {
    await ui.click("饮食");
    await ui.click("午餐");
    await ui.click("选择 全蛋（按个）");
    await ui.input("食用量（个）", "3");
    ui.failWrites(true);
    await ui.click("添加到所选餐次");
    expect(ui.savedMeals()).toHaveLength(0);
    expect(ui.text()).toContain("测试保存失败");
    expect(ui.hasSelection()).toBe(true);
    expect(ui.amount()).toBe("3");

    ui.failWrites(false);
    await ui.click("添加到所选餐次");
    expect(ui.savedMeals()).toEqual([{ mealSlot: "lunch", foodId: "egg", amount: 3, date: "2026-10-05" }]);
    expect(ui.text()).toContain("录入餐次：午餐");
    expect(ui.text()).toContain("食材库");
    expect(ui.hasSelection()).toBe(false);
    expect(ui.amount()).toBeUndefined();
  } finally { ui.dispose(); }
});
