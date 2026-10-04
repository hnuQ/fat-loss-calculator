import { afterEach, describe, expect, it, vi } from "vitest";
import { createForegroundTrainingReminders } from "../src/infrastructure/foregroundTrainingReminders";
import { createUniTrainingReminders } from "../src/infrastructure/uniTrainingReminders";

vi.mock("../src/infrastructure/uniPlatformCapabilities", () => ({ uniPlatformCapabilities: { kind: "app" } }));

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe("Android 通知权限与准时提醒公开能力", () => {
  it("未授权或撤销时如实提示，允许后提示系统限制，禁声不会虚报声音", async () => {
    let exact = false, notifications = true, sound = true;
    const status = () => ({ ok: true, exact, notifications, sound });
    vi.stubGlobal("uni", { requireNativePlugin: () => ({
      getStatus: (callback: (s: object) => void) => callback(status()),
      requestExactPermission: (callback: (s: object) => void) => { exact = true; callback(status()); },
      requestPermission: (callback: (s: object) => void) => callback({ ...status(), granted: notifications }),
      replace: (_: unknown, callback: (s: object) => void) => callback(status()),
    }) });
    const reminders = createUniTrainingReminders();
    await reminders.refreshCapability!();
    expect(reminders.capability()).toMatchObject({ supported: true, exactPermissionNeeded: true });
    expect(reminders.capability().message).toContain("无法保证准时");
    await reminders.requestExactPermission!();
    await reminders.replace({ enabled: true, weekdays: [1], time: "18:30" });
    expect(reminders.capability().message).toContain("已允许准时提醒");
    exact = false; sound = false;
    await reminders.refreshCapability!();
    expect(reminders.capability().message).toContain("无法保证准时");
    expect(reminders.capability().message).toContain("通知声音已关闭");
    notifications = false;
    await reminders.refreshCapability!();
    expect(await reminders.requestPermission()).toBe(false);
    expect(reminders.capability().message).toContain("无法收到训练通知");
  });
});

describe("前台训练提醒", () => {
  it("在提醒分钟恢复前台，存储失败也会给出可见提示", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 18, 30, 10));
    const errors: string[] = [];
    const reminders = createForegroundTrainingReminders({ readDelivered: () => [], writeDelivered: () => { throw new Error("storage full"); }, notify: () => { throw new Error("must not notify"); }, onError: (message) => errors.push(message) });
    await reminders.replace({ enabled: true, weekdays: [7], time: "18:30" });
    reminders.setForeground!(true);
    await vi.advanceTimersByTimeAsync(2000);
    expect(errors).toEqual(["训练提醒未能显示，请重新保存提醒设置"]);
    expect(reminders.capability().message).toContain("未能显示");
    reminders.setForeground!(false);
  });
  it("到点保存去重状态失败时不显示通知，报告一次错误并停止重复失败", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 18, 29, 59));
    const errors: string[] = [], notices: string[] = [];
    const reminders = createForegroundTrainingReminders({ readDelivered: () => [], writeDelivered: () => { throw new Error("storage full"); }, notify: () => notices.push("训练提醒"), onError: (message) => errors.push(message) });
    reminders.setForeground!(true);
    await reminders.replace({ enabled: true, weekdays: [7], time: "18:30" });
    await vi.advanceTimersByTimeAsync(4000);
    expect(notices).toEqual([]);
    expect(errors).toEqual(["训练提醒未能显示，请重新保存提醒设置"]);
    expect(reminders.capability().message).toContain("未能显示");
    reminders.setForeground!(false);
  });
  it("后台不提示或补发，修改取消旧时间，关闭停止提示，重开保留去重", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 18, 29, 59));
    let delivered: string[] = [];
    const notices: string[] = [];
    const dependencies = { readDelivered: () => delivered, writeDelivered: (keys: string[]) => { delivered = keys; }, notify: () => notices.push("训练提醒"), onError: (message: string) => { throw new Error(message); } };
    const reminders = createForegroundTrainingReminders(dependencies);
    await reminders.replace({ enabled: true, weekdays: [7], time: "18:30" });
    await vi.advanceTimersByTimeAsync(61000);
    reminders.setForeground!(true);
    expect(notices).toEqual([]);
    await reminders.replace({ enabled: true, weekdays: [7], time: "18:32" });
    await reminders.replace({ enabled: true, weekdays: [7], time: "18:33" });
    await vi.advanceTimersByTimeAsync(60000);
    expect(notices).toEqual([]);
    await vi.advanceTimersByTimeAsync(60000);
    expect(notices).toEqual(["训练提醒"]);
    reminders.setForeground!(false);
    const reopened = createForegroundTrainingReminders(dependencies);
    reopened.setForeground!(true);
    await reopened.replace({ enabled: true, weekdays: [7], time: "18:33" });
    expect(notices).toEqual(["训练提醒"]);
    await reopened.replace({ enabled: true, weekdays: [7], time: "18:34" });
    await reopened.replace({ enabled: false, weekdays: [], time: "" });
    await vi.advanceTimersByTimeAsync(60000);
    expect(notices).toEqual(["训练提醒"]);
    reopened.setForeground!(false);
  });
  it("主动启用后自然到点提示一次，恢复前台和重复保存不重复", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 18, 29, 59));
    let delivered: string[] = [];
    const notices: string[] = [];
    const reminders = createForegroundTrainingReminders({
      readDelivered: () => delivered,
      writeDelivered: (keys) => { delivered = keys; },
      notify: () => notices.push("训练提醒"),
      onError: (message) => { throw new Error(message); },
    });
    reminders.setForeground!(true);
    await reminders.replace({ enabled: true, weekdays: [7], time: "18:30" });
    expect(notices).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(notices).toEqual(["训练提醒"]);
    reminders.setForeground!(false);
    reminders.setForeground!(true);
    await reminders.replace({ enabled: true, weekdays: [7], time: "18:30" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(notices).toEqual(["训练提醒"]);
    reminders.setForeground!(false);
  });
});
