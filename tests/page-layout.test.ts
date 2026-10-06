import { describe, expect, test } from "vitest";
import { mountNavigationHarness } from "./navigationHarness.js";

describe("“我的”页面顺序与首次建档前入口", () => {
  test("先健康档案、再减脂周期，完整备份区域整体排在最后", async () => {
    const ui = await mountNavigationHarness();
    try {
      await ui.click("我的");
      const text = ui.text();
      const profile = text.indexOf("的健康档案");
      const activeCycle = text.indexOf("进行中的减脂周期");
      const archivedCycle = text.indexOf("已归档周期");
      const backup = text.indexOf("完整备份与恢复");
      expect(profile).toBeGreaterThanOrEqual(0);
      expect(activeCycle).toBeGreaterThan(profile);
      expect(archivedCycle).toBeGreaterThan(activeCycle);
      expect(backup).toBeGreaterThan(archivedCycle);
      // 导出、恢复与 CSV 入口属于同一块，不能被拆到别处。
      expect(text.split("完整备份与恢复")).toHaveLength(2);
      expect(text.slice(backup + "完整备份与恢复".length)).not.toContain("日历");
    } finally {
      ui.dispose();
    }
  });

  test("尚未建档时恢复入口仍然出现在建档表单之前", async () => {
    const ui = await mountNavigationHarness({ profile: undefined });
    try {
      const text = ui.text();
      const restore = text.indexOf("完整备份与恢复");
      const onboarding = text.indexOf("建立健康档案");
      expect(onboarding).toBeGreaterThanOrEqual(0);
      expect(restore).toBeGreaterThanOrEqual(0);
      expect(restore).toBeLessThan(onboarding);
    } finally {
      ui.dispose();
    }
  });
});
