import { describe, expect, it, vi } from "vitest";

vi.mock("../src/infrastructure/uniPlatformCapabilities", () => ({ uniPlatformCapabilities: { kind: "mp-weixin" } }));

import { createUniTrainingReminders } from "../src/infrastructure/uniTrainingReminders";

describe("微信端只承诺前台提示", () => {
  it("能力里没有响铃状态，也不暴露试听与铃声列表，文案明确不支持独立响铃", () => {
    const reminders = createUniTrainingReminders();
    const capability = reminders.capability();
    expect(capability.supported).toBe(true);
    expect(capability.ring).toBeUndefined();
    expect(capability.message).toContain("前台");
    expect(capability.message).toContain("不支持独立响铃");
    expect(reminders.listRingtones).toBeUndefined();
    expect(reminders.previewSound).toBeUndefined();
    expect(reminders.stopRinging).toBeUndefined();
  });

  it("保存响铃模式不会得到后台响铃承诺，也不改变用户所选模式", async () => {
    vi.stubGlobal("uni", { getStorageSync: () => [], setStorageSync: () => {}, showModal: () => {}, showToast: () => {} });
    try {
      const reminders = createUniTrainingReminders();
      await expect(reminders.replace({ enabled: true, mode: "ring", weekdays: [1], time: "18:30" })).resolves.toBeUndefined();
      await expect(reminders.replace({ enabled: true, mode: "notification", weekdays: [1], time: "18:30" })).resolves.toBeUndefined();
      expect(reminders.capability().ring).toBeUndefined();
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
