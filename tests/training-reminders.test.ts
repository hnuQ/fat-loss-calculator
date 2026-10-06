import { afterEach, describe, expect, it, vi } from "vitest";
import { createForegroundTrainingReminders } from "../src/infrastructure/foregroundTrainingReminders";
import { createUniTrainingReminders } from "../src/infrastructure/uniTrainingReminders";
import { trainingRingStatusText } from "../src/domain/training";

vi.mock("../src/infrastructure/uniPlatformCapabilities", () => ({ uniPlatformCapabilities: { kind: "app" } }));

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

interface NativeOptions { status?: Record<string, unknown>; ringtones?: Array<Record<string, unknown>> }
function stubNative(options: NativeOptions = {}) {
  let status: Record<string, unknown> = { ok: true, exact: false, notifications: true, sound: true, ...options.status };
  const calls: Array<{ method: string; args: unknown[] }> = [];
  const plugin = {
    getStatus: (callback: (result: object) => void) => { calls.push({ method: "getStatus", args: [] }); callback({ ...status }); },
    requestExactPermission: (callback: (result: object) => void) => { calls.push({ method: "requestExactPermission", args: [] }); status = { ...status, exact: true }; callback({ ...status }); },
    requestPermission: (callback: (result: object) => void) => { calls.push({ method: "requestPermission", args: [] }); callback({ ...status, granted: status.notifications !== false }); },
    replace: (input: unknown, callback: (result: object) => void) => { calls.push({ method: "replace", args: [input] }); callback({ ...status }); },
    listRingtones: (callback: (result: object) => void) => { calls.push({ method: "listRingtones", args: [] }); callback({ ...status, ringtones: options.ringtones ?? [] }); },
    preview: (input: unknown, callback: (result: object) => void) => { calls.push({ method: "preview", args: [input] }); callback({ ...status }); },
    stopPreview: (callback: (result: object) => void) => { calls.push({ method: "stopPreview", args: [] }); callback({ ...status }); },
    stopRinging: (callback: (result: object) => void) => { calls.push({ method: "stopRinging", args: [] }); callback({ ...status }); },
  };
  vi.stubGlobal("uni", { requireNativePlugin: () => plugin });
  return { calls, setStatus: (next: Record<string, unknown>) => { status = { ...status, ...next }; } };
}

describe("Android 通知权限与准时提醒公开能力", () => {
  it("未授权或撤销时如实提示，允许后提示系统限制，禁声不会虚报声音", async () => {
    const exact = false, notifications = true, sound = true;
    const stub = stubNative({ status: { exact, notifications, sound, ringerMode: "normal", alarmVolume: 7, alarmVolumeMax: 7, blockers: [], unverified: [] } });
    expect(exact).toBe(false);
    const reminders = createUniTrainingReminders();
    await reminders.refreshCapability!();
    expect(reminders.capability()).toMatchObject({ supported: true, exactPermissionNeeded: true });
    expect(reminders.capability().message).toContain("无法保证准时");
    await reminders.requestExactPermission!();
    await reminders.replace({ enabled: true, mode: "notification", weekdays: [1], time: "18:30" });
    expect(reminders.capability().message).toContain("已允许准时提醒");
    stub.setStatus({ exact: false, sound: false });
    await reminders.refreshCapability!();
    expect(reminders.capability().message).toContain("无法保证准时");
    expect(reminders.capability().message).toContain("通知声音已关闭");
    stub.setStatus({ notifications: false });
    await reminders.refreshCapability!();
    expect(await reminders.requestPermission()).toBe(false);
    expect(reminders.capability().message).toContain("无法收到训练通知");
  });

  it("响铃阻碍按系统状态如实上报，读不到状态不宣称无阻碍", async () => {
    const stub = stubNative({ status: { ringerMode: "normal", alarmVolume: 5, alarmVolumeMax: 7, dnd: false, ringChannel: true, blockers: [], unverified: [] } });
    const reminders = createUniTrainingReminders();
    await reminders.refreshCapability!();
    expect(reminders.capability().ring).toMatchObject({ ringerMode: "normal", alarmVolume: 5, alarmVolumeMax: 7, dnd: false, blockers: [], ringtoneFallback: false, ringing: false });
    for (const blocker of ["silent", "volume-zero", "dnd", "ring-channel", "notification-permission"]) {
      stub.setStatus({ blockers: [blocker] });
      await reminders.refreshCapability!();
      expect(reminders.capability().ring!.blockers).toEqual([blocker]);
    }
    // 原生没有报告阻碍字段时按读不到状态处理，不能当作可以响铃。
    stub.setStatus({ blockers: undefined });
    await reminders.refreshCapability!();
    expect(reminders.capability().ring!.blockers).toEqual(["state-unknown"]);
    stub.setStatus({ blockers: [], unverified: ["dnd"], ringError: "playback-failed" });
    await reminders.refreshCapability!();
    expect(reminders.capability().ring).toMatchObject({ blockers: [], unverified: ["dnd"], lastError: "playback-failed" });
    expect(reminders.capability().ring!.dnd).toBe(false);
    // 从未取到状态时同样是未知，而不是可用。
    const cold = createUniTrainingReminders();
    expect(cold.capability().ring!.blockers).toEqual(["state-unknown"]);
  });

  it("试听、停止试听和停止响铃只调用原生播放器并回传状态", async () => {
    const stub = stubNative({ status: { ringing: false, blockers: [], unverified: [] } });
    const reminders = createUniTrainingReminders();
    await reminders.refreshCapability!();
    await reminders.previewSound!("content://media/internal/audio/media/7");
    expect(stub.calls.at(-1)).toEqual({ method: "preview", args: [{ sound: "content://media/internal/audio/media/7" }] });
    stub.setStatus({ ringing: true });
    await reminders.stopRinging!();
    expect(stub.calls.at(-1)!.method).toBe("stopRinging");
    await reminders.stopPreview!();
    expect(stub.calls.at(-1)!.method).toBe("stopPreview");
    // 系统默认铃声用空选项表示，不写入具体标识。
    await reminders.previewSound!();
    expect(stub.calls.at(-1)).toEqual({ method: "preview", args: [{}] });
  });

  it("系统铃声列表过滤缺 uri 的项，保留稳定标识与标题", async () => {
    const stub = stubNative({ ringtones: [{ id: "7", title: "晨曦", uri: "content://ringtone/7" }, { title: "缺标识" }, { uri: "content://ringtone/9" }] });
    expect(stub.calls).toEqual([]);
    const reminders = createUniTrainingReminders();
    expect(await reminders.listRingtones!()).toEqual([
      { id: "7", title: "晨曦", uri: "content://ringtone/7" },
      { id: "content://ringtone/9", title: "content://ringtone/9", uri: "content://ringtone/9" },
    ]);
  });

  it("保存提醒把模式与铃声原样交给原生，旧字段缺省为普通通知", async () => {
    const stub = stubNative();
    const reminders = createUniTrainingReminders();
    await reminders.replace({ enabled: true, mode: "ring", weekdays: [3], time: "07:05", sound: "content://ringtone/3" });
    expect(stub.calls.at(-1)).toEqual({ method: "replace", args: [{ enabled: true, mode: "ring", weekdays: [3], time: "07:05", sound: "content://ringtone/3" }] });
    await reminders.replace({ enabled: true, weekdays: [3], time: "07:05" } as never);
    expect(stub.calls.at(-1)!.args[0]).toMatchObject({ mode: "notification" });
    expect(stub.calls.at(-1)!.args[0]).not.toHaveProperty("sound");
  });
});

describe("前台训练提醒", () => {
  it("在提醒分钟恢复前台，存储失败也会给出可见提示", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 4, 18, 30, 10));
    const errors: string[] = [];
    const reminders = createForegroundTrainingReminders({ readDelivered: () => [], writeDelivered: () => { throw new Error("storage full"); }, notify: () => { throw new Error("must not notify"); }, onError: (message) => errors.push(message) });
    await reminders.replace({ enabled: true, mode: "notification", weekdays: [7], time: "18:30" });
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
    await reminders.replace({ enabled: true, mode: "notification", weekdays: [7], time: "18:30" });
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
    await reminders.replace({ enabled: true, mode: "notification", weekdays: [7], time: "18:30" });
    await vi.advanceTimersByTimeAsync(61000);
    reminders.setForeground!(true);
    expect(notices).toEqual([]);
    await reminders.replace({ enabled: true, mode: "notification", weekdays: [7], time: "18:32" });
    await reminders.replace({ enabled: true, mode: "notification", weekdays: [7], time: "18:33" });
    await vi.advanceTimersByTimeAsync(60000);
    expect(notices).toEqual([]);
    await vi.advanceTimersByTimeAsync(60000);
    expect(notices).toEqual(["训练提醒"]);
    reminders.setForeground!(false);
    const reopened = createForegroundTrainingReminders(dependencies);
    reopened.setForeground!(true);
    await reopened.replace({ enabled: true, mode: "notification", weekdays: [7], time: "18:33" });
    expect(notices).toEqual(["训练提醒"]);
    await reopened.replace({ enabled: true, mode: "notification", weekdays: [7], time: "18:34" });
    await reopened.replace({ enabled: false, mode: "notification", weekdays: [], time: "" });
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
    await reminders.replace({ enabled: true, mode: "notification", weekdays: [7], time: "18:30" });
    expect(notices).toEqual([]);
    await vi.advanceTimersByTimeAsync(1000);
    expect(notices).toEqual(["训练提醒"]);
    reminders.setForeground!(false);
    reminders.setForeground!(true);
    await reminders.replace({ enabled: true, mode: "notification", weekdays: [7], time: "18:30" });
    await vi.advanceTimersByTimeAsync(2000);
    expect(notices).toEqual(["训练提醒"]);
    reminders.setForeground!(false);
  });
});


describe("响铃状态文案", () => {
  const base = { ringing: false, ringerMode: "normal" as const, blockers: [] as string[], unverified: [] as string[], ringtoneFallback: false };
  it("区分硬性阻碍、无法确认与可用，读不到状态不宣称没有阻碍", () => {
    expect(trainingRingStatusText({ ...base, blockers: ["silent"] })).toBe("当前不会主动响铃：手机处于静音或振动模式。");
    expect(trainingRingStatusText({ ...base, ringerMode: "unknown", unverified: ["dnd"] })).toBe("无法确认：勿扰模式已开启。");
    expect(trainingRingStatusText({ ...base, alarmVolume: 3, alarmVolumeMax: 7 })).toBe("当前闹钟音量 3/7。");
    expect(trainingRingStatusText({ ...base, ringtoneFallback: true, lastError: "playback-failed" })).toBe("无法播放所选响铃铃声，本次只保留通知。所选铃声不可用，已回退到系统默认闹钟铃声。");
    expect(trainingRingStatusText({ ...base, ringing: true })).toContain("正在响铃。");
    expect(trainingRingStatusText({ ...base, blockers: ["ring-channel"] })).toBe("当前不会主动响铃：响铃提醒渠道被禁用。");
    expect(trainingRingStatusText(base)).toBe("响铃提醒可用。");
    expect(trainingRingStatusText(undefined)).toBe("");
  });
});
