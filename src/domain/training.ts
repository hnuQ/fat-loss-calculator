export interface TrainingPlan {
  id: string;
  ownerId: string;
  title: string;
  content: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  deletedAt?: string;
  syncState: "local";
}

export interface TrainingRecord {
  id: string;
  ownerId: string;
  cycleId: string;
  date: string;
  planId?: string;
  title: string;
  content: string;
  completed: boolean;
  feeling: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  syncState: "local";
}

export interface TrainingReminder {
  enabled: boolean;
  /** ISO weekdays: Monday 1 through Sunday 7. */
  weekdays: number[];
  time: string;
}

export interface TrainingState {
  plans: TrainingPlan[];
  records: TrainingRecord[];
  reminder: TrainingReminder;
}

export interface TrainingReminderAdapter {
  capability(): { supported: boolean; message: string };
  /** Requests notification permission only in response to explicit opt-in. */
  requestPermission(): Promise<boolean>;
  /** Replaces this app's entire schedule with stable weekday IDs, including cancellation. */
  replace(reminder: TrainingReminder): Promise<void>;
}

export function trainingState(state?: TrainingState): TrainingState {
  return state ?? { plans: [], records: [], reminder: { enabled: false, weekdays: [], time: "" } };
}

export function validateTraining(title: string, content: string): { title: string; content: string } {
  if (typeof title !== "string" || !title.trim()) throw new Error("请填写训练名称");
  if (typeof content !== "string" || !content.trim()) throw new Error("请填写自己的训练内容");
  if (title.trim().length > 100 || content.trim().length > 2000) throw new Error("训练名称最多 100 字，内容最多 2000 字");
  return { title: title.trim(), content: content.trim() };
}

export function validateReminder(input: TrainingReminder): TrainingReminder {
  if (typeof input.enabled !== "boolean") throw new Error("请选择是否启用训练提醒");
  if (!input.enabled) return { enabled: false, weekdays: [], time: "" };
  if (!Array.isArray(input.weekdays) || !input.weekdays.length || input.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) throw new Error("请选择有效的训练星期");
  if (typeof input.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error("请选择有效的提醒时间（HH:mm）");
  return { enabled: true, weekdays: [...new Set(input.weekdays)].sort((a, b) => a - b), time: input.time };
}
