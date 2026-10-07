import { expect, test, vi } from "vitest";
import { createTrainingDiary } from "../src/application/trainingDiary";
import { createFatLossDiary } from "../src/application/fatLossDiary";
import { createDiaryBackup } from "../src/application/diaryBackup";
import { createInMemoryDiaryRepository } from "../src/testing/inMemoryDiaryRepository";
import { mountPanel, readFileSync, existsSync } from "./panelHarness.js";

test("旧启用提醒只作为备份兼容数据，打开及恢复均不访问系统提醒", async () => {
  const legacy = { enabled: true, weekdays: [3], time: "18:30", mode: "ring" as const, sound: "content://ringtone/3" };
  const repository = createInMemoryDiaryRepository({ meals: [], weights: [], training: { plans: [], records: [], reminder: legacy } });
  const clock = { today: () => "2026-10-07" };
  const diary = createFatLossDiary({ repository, clock, platform: { kind: "test", localPersistence: true, canvas: true } });
  const training = createTrainingDiary({ repository, clock, diary });
  const touchNative = vi.fn(() => { throw new Error("No reminder access is allowed"); });
  vi.stubGlobal("uni", { requireNativePlugin: touchNative, showModal: touchNative });
  try {
    expect((await training.open()).reminder).toEqual(legacy);
    expect(training).not.toHaveProperty("saveReminder");
    expect(training).not.toHaveProperty("previewSound");
    expect(training).not.toHaveProperty("capability");
    const backup = createDiaryBackup({ repository, randomBytes: () => new Uint8Array(16) });
    const before = await repository.read();
    const text = await backup.exportBackup();
    await backup.restoreBackup(text);
    expect(await repository.read()).toEqual(before);
    expect(touchNative).not.toHaveBeenCalled();
  } finally { vi.unstubAllGlobals(); }
});

test("训练公开页面不提供任何提醒或试听入口，即使旧备份曾启用响铃", async () => {
  const state = { plans: [], records: [], reminder: { enabled: true, weekdays: [3], time: "18:30", mode: "ring" } };
  const cycle = { id: "c", startDate: "2026-10-07", endDate: "2027-01-04", status: "active" };
  const panel = await mountPanel("src/components/TrainingDiary.vue", {
    props: { snapshot: { today: "2026-10-07", selectedDate: "2026-10-07", selectedCycle: cycle }, disabled: false },
    runtime: { trainingDiary: { open: async () => state, openWeek: async () => undefined } },
  });
  try {
    expect(panel.text()).toContain("选择训练计划");
    expect(panel.text()).not.toMatch(/提醒|响铃|试听|允许准时|通知设置/);
    expect(panel.controlLabels()).not.toContain("提醒小时");
  } finally { panel.dispose(); }
});

test("Android 清单不注册提醒插件，应用启动不调度提醒", () => {
  const manifest = JSON.parse(readFileSync("src/manifest.json", "utf8"));
  expect(manifest["app-plus"].nativePlugins).toBeUndefined();
  expect(readFileSync("src/App.vue", "utf8")).not.toMatch(/trainingDiary|trainingReminders|onShow|onHide/);
  expect(existsSync("src/infrastructure/uniTrainingReminders.ts")).toBe(false);
  expect(existsSync("nativeplugins/FatLossReminders/android/src/main/AndroidManifest.xml")).toBe(false);
});
