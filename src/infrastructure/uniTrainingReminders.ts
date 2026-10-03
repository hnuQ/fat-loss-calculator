import type { TrainingReminder, TrainingReminderAdapter } from "../domain/training";
import { uniPlatformCapabilities } from "./uniPlatformCapabilities";

interface NativeResult { ok: boolean; granted?: boolean; error?: string }
interface NativeReminders {
  requestPermission(callback: (result: NativeResult) => void): void;
  replace(options: TrainingReminder, callback: (result: NativeResult) => void): void;
}

export function createUniTrainingReminders(): TrainingReminderAdapter {
  let native: NativeReminders | undefined;
  // #ifdef APP-PLUS
  if (typeof uni !== "undefined") {
    const candidate = uni.requireNativePlugin("FatLossReminders") as NativeReminders | undefined;
    if (candidate && typeof candidate.replace === "function" && typeof candidate.requestPermission === "function") native = candidate;
  }
  // #endif
  const message = uniPlatformCapabilities.kind === "mp-weixin"
    ? "微信小程序不支持离线每周本地通知。训练计划和当天记录可正常使用，提醒保持关闭。"
    : uniPlatformCapabilities.kind === "app"
      ? "当前 Android 基座未包含训练提醒原生模块，无法启用系统通知。"
      : "浏览器不支持本应用的离线每周本地通知，提醒保持关闭。";
  function call(action: (callback: (result: NativeResult) => void) => void): Promise<NativeResult> {
    return new Promise((resolve, reject) => action((result) => result.ok ? resolve(result) : reject(new Error(result.error ?? "系统训练提醒操作失败"))));
  }
  return {
    capability: () => ({ supported: !!native, message: native ? "Android 每周本地通知；系统节电策略可能延迟提醒。" : message }),
    async requestPermission() {
      if (!native) return false;
      return (await call((callback) => native!.requestPermission(callback))).granted === true;
    },
    async replace(reminder) {
      if (!native) {
        if (reminder.enabled) throw new Error(message);
        return;
      }
      await call((callback) => native!.replace(reminder, callback));
    },
  };
}
