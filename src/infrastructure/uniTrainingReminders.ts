import type { TrainingReminder, TrainingReminderAdapter } from "../domain/training";
import { uniPlatformCapabilities } from "./uniPlatformCapabilities";
import { createForegroundTrainingReminders } from "./foregroundTrainingReminders";

interface NativeResult { ok: boolean; granted?: boolean; error?: string; exact?: boolean; notifications?: boolean; sound?: boolean }
interface NativeReminders {
  getStatus(callback: (result: NativeResult) => void): void;
  requestExactPermission(callback: (result: NativeResult) => void): void;
  requestPermission(callback: (result: NativeResult) => void): void;
  replace(options: TrainingReminder, callback: (result: NativeResult) => void): void;
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
    if (candidate && typeof candidate.replace === "function" && typeof candidate.requestPermission === "function" && typeof candidate.getStatus === "function" && typeof candidate.requestExactPermission === "function") native = candidate;
  }
  // #endif
  const message = uniPlatformCapabilities.kind === "app"
      ? "当前版本暂不支持系统训练通知。"
      : "浏览器不支持本应用的离线每周本地通知，提醒保持关闭。";
  function call(action: (callback: (result: NativeResult) => void) => void): Promise<NativeResult> {
    return new Promise((resolve, reject) => action((result) => result.ok ? resolve(result) : reject(new Error(result.error ?? "系统训练提醒操作失败"))));
  }
  let status: NativeResult | undefined;
  return {
    capability: () => ({ supported: !!native, exactPermissionNeeded: !!native && status?.exact === false,
      message: !native ? message : status?.notifications === false ? "通知未获允许，无法收到训练通知。"
        : `${status?.exact === true ? "已允许准时提醒，系统限制仍可能延迟。" : "未允许准时提醒，普通通知无法保证准时。"}${status?.sound === false ? "通知声音已关闭。" : "静音或关闭通知声音时不会响。"}` }),
    async refreshCapability() { if (native) status = await call((callback) => native!.getStatus(callback)); },
    async requestExactPermission() { if (native) { await call((callback) => native!.requestExactPermission(callback)); } },
    async requestPermission() {
      if (!native) return false;
      return (await call((callback) => native!.requestPermission(callback))).granted === true;
    },
    async replace(reminder) {
      if (!native) {
        if (reminder.enabled) throw new Error(message);
        return;
      }
      status = await call((callback) => native!.replace(reminder, callback));
    },
  };
}
