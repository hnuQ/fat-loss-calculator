import { validateReminder, type TrainingReminder, type TrainingReminderAdapter } from "../domain/training";

/** Only checks the current local minute while the application is visible. */
export function createForegroundTrainingReminders(dependencies: {
  readDelivered(): string[];
  writeDelivered(keys: string[]): void;
  notify(): void;
  onError(message: string): void;
}): TrainingReminderAdapter {
  let reminder: TrainingReminder = { enabled: false, weekdays: [], time: "" };
  let visible = false;
  let timer: ReturnType<typeof setInterval> | undefined;
  let warning = "";
  function tick() {
    if (!visible || !reminder.enabled) return;
    const now = new Date();
    const weekday = now.getDay() || 7;
    const time = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
    if (!reminder.weekdays.includes(weekday) || reminder.time !== time) return;
    const key = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}|${time}`;
    const delivered = dependencies.readDelivered();
    if (delivered.includes(key)) return;
    // Persist before showing: resuming, saving again, or reopening cannot duplicate this occurrence.
    dependencies.writeDelivered([...delivered, key].slice(-128));
    dependencies.notify();
  }
  function reconcile() {
    if (timer !== undefined) clearInterval(timer);
    timer = undefined;
    if (!visible || !reminder.enabled) return;
    warning = "";
    tick();
    timer = setInterval(() => {
      try { tick(); }
      catch { reportFailure(); }
    }, 1000);
  }
  function reportFailure() {
    clearInterval(timer); timer = undefined;
    warning = "训练提醒未能显示，请重新保存提醒设置";
    dependencies.onError(warning);
  }
  return {
    capability: () => ({ supported: true, message: warning || "微信仅在应用前台打开时到点提示；后台不提醒。" }),
    async requestPermission() { return true; },
    async replace(input) { reminder = validateReminder(input); reconcile(); },
    setForeground(value) { visible = value; try { reconcile(); } catch { reportFailure(); } },
  };
}
