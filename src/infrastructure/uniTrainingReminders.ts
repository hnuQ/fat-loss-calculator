import { normalizeReminder, type TrainingReminder, type TrainingReminderAdapter, type TrainingReminderCapability, type TrainingRingingStatus, type TrainingRingtone } from "../domain/training";
import { uniPlatformCapabilities } from "./uniPlatformCapabilities";
import { createForegroundTrainingReminders } from "./foregroundTrainingReminders";

interface NativeRingtone { id?: string; title?: string; uri?: string }
interface NativeResult {
  ok: boolean; granted?: boolean; error?: string; exact?: boolean; notifications?: boolean; sound?: boolean;
  mode?: string; ringtone?: string; ringerMode?: string; dnd?: boolean;
  alarmVolume?: number; alarmVolumeMax?: number; ringChannel?: boolean;
  ringing?: boolean; ringtoneFallback?: boolean; blockers?: string[]; unverified?: string[]; ringError?: string; ringtones?: NativeRingtone[];
}
interface NativeReminders {
  getStatus(callback: (result: NativeResult) => void): void;
  requestExactPermission(callback: (result: NativeResult) => void): void;
  requestPermission(callback: (result: NativeResult) => void): void;
  replace(options: TrainingReminder, callback: (result: NativeResult) => void): void;
  listRingtones(callback: (result: NativeResult) => void): void;
  preview(options: { sound?: string }, callback: (result: NativeResult) => void): void;
  stopPreview(callback: (result: NativeResult) => void): void;
  stopRinging(callback: (result: NativeResult) => void): void;
}

export function createUniTrainingReminders(): TrainingReminderAdapter {
  if (uniPlatformCapabilities.kind === "mp-weixin") return createForegroundTrainingReminders({
    readDelivered: () => uni.getStorageSync("fat-loss-training-delivered-v1") || [],
    writeDelivered: (keys) => uni.setStorageSync("fat-loss-training-delivered-v1", keys),
    notify: () => uni.showModal({ title: "训练提醒", content: "到了你设置的训练时间，可查看自己的训练计划。", showCancel: false }),
    onError: (title) => uni.showToast({ title, icon: "none", duration: 5000 }),
  });
  let native: NativeReminders | undefined;
  // #ifdef APP-PLUS
  if (typeof uni !== "undefined") {
    const candidate = uni.requireNativePlugin("FatLossReminders") as NativeReminders | undefined;
    if (candidate && typeof candidate.replace === "function" && typeof candidate.requestPermission === "function" && typeof candidate.getStatus === "function" && typeof candidate.requestExactPermission === "function"
      && typeof candidate.listRingtones === "function" && typeof candidate.preview === "function" && typeof candidate.stopPreview === "function" && typeof candidate.stopRinging === "function") native = candidate;
  }
  // #endif
  const message = uniPlatformCapabilities.kind === "app"
      ? "当前版本暂不支持系统训练通知。"
      : "浏览器不支持本应用的离线每周本地通知，提醒保持关闭。";
  function call(action: (callback: (result: NativeResult) => void) => void): Promise<NativeResult> {
    return new Promise((resolve, reject) => action((result) => result.ok ? resolve(result) : reject(new Error(result.error ?? "系统训练提醒操作失败"))));
  }
  let status: NativeResult | undefined;
  /** 读不到状态时给出 state-unknown，不把“读不到”当作“没有阻碍”。 */
  function ringStatus(): TrainingRingingStatus | undefined {
    if (!native) return undefined;
    const blockers = !status || !Array.isArray(status.blockers) ? ["state-unknown"] : [...status.blockers];
    return {
      ringing: status?.ringing === true,
      ringerMode: status?.ringerMode === "normal" || status?.ringerMode === "silent" || status?.ringerMode === "vibrate" ? status.ringerMode : "unknown",
      alarmVolume: typeof status?.alarmVolume === "number" ? status.alarmVolume : undefined,
      alarmVolumeMax: typeof status?.alarmVolumeMax === "number" ? status.alarmVolumeMax : undefined,
      dnd: typeof status?.dnd === "boolean" ? status.dnd : undefined,
      blockers,
      ringtoneFallback: status?.ringtoneFallback === true,
      unverified: !status || !Array.isArray(status.unverified) ? ["state-unknown"] : [...status.unverified],
      ...(typeof status?.ringError === "string" && status.ringError ? { lastError: status.ringError } : {}),
    };
  }
  function capability(): TrainingReminderCapability {
    const notificationMessage = !native ? message : status?.notifications === false ? "通知未获允许，无法收到训练通知。"
      : `${status?.exact === true ? "已允许准时提醒，系统限制仍可能延迟。" : "未允许准时提醒，普通通知无法保证准时。"}${status?.sound === false ? "通知声音已关闭。" : "静音或关闭通知声音时不会响。"}`;
    return { supported: !!native, exactPermissionNeeded: !!native && status?.exact === false, message: notificationMessage, ring: ringStatus() };
  }
  return {
    capability,
    async refreshCapability() { if (native) status = await call((callback) => native!.getStatus(callback)); },
    async requestExactPermission() { if (native) { await call((callback) => native!.requestExactPermission(callback)); status = await call((callback) => native!.getStatus(callback)); } },
    async requestPermission() { if (!native) return false; status = await call((callback) => native!.requestPermission(callback)); return status.granted === true; },
    async replace(reminder) {
      if (!native) {
        if (reminder.enabled) throw new Error(message);
        return;
      }
      status = await call((callback) => native!.replace(normalizeReminder(reminder), callback));
    },
    async listRingtones(): Promise<TrainingRingtone[]> {
      if (!native) return [];
      const result = await call((callback) => native!.listRingtones(callback));
      return (result.ringtones ?? []).flatMap((ringtone) => ringtone && typeof ringtone.uri === "string"
        ? [{ id: typeof ringtone.id === "string" ? ringtone.id : ringtone.uri, title: typeof ringtone.title === "string" ? ringtone.title : ringtone.uri, uri: ringtone.uri }] : []);
    },
    async previewSound(uri) {
      if (!native) throw new Error("当前端不支持独立响铃试听");
      status = await call((callback) => native!.preview(uri ? { sound: uri } : {}, callback));
    },
    async stopPreview() { if (native) status = await call((callback) => native!.stopPreview(callback)); },
    async stopRinging() { if (native) status = await call((callback) => native!.stopRinging(callback)); },
  };
}
