export const trainingBodyParts = ["胸", "肩", "背", "腿", "手臂", "有氧", "其他"] as const;
export type TrainingBodyPart = typeof trainingBodyParts[number];

export function validateBodyParts(parts: TrainingBodyPart[] = []): TrainingBodyPart[] {
  if (!Array.isArray(parts) || parts.some((part) => !trainingBodyParts.includes(part))) throw new Error("请选择有效的训练部位");
  return [...new Set(parts)];
}

export interface TrainingPlan {
  bodyParts?: TrainingBodyPart[];
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
  bodyParts?: TrainingBodyPart[];
  scheduleId?: string;
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

export interface TrainingSchedule extends Omit<TrainingRecord, "completed" | "feeling" | "scheduleId"> {}

export interface TrainingWeek {
  days: Array<{ date: string; inCycle: boolean; projects: Array<TrainingSchedule & { completed: boolean; record?: TrainingRecord }>; records: TrainingRecord[] }>;
}

export interface TrainingReminder {
  enabled: boolean;
  /** ISO weekdays: Monday 1 through Sunday 7. */
  weekdays: number[];
  time: string;
}

export interface TrainingState {
  schedules?: TrainingSchedule[];
  plans: TrainingPlan[];
  records: TrainingRecord[];
  reminder: TrainingReminder;
}

export interface TrainingReminderAdapter {
  capability(): { supported: boolean; message: string; exactPermissionNeeded?: boolean };
  refreshCapability?(): Promise<void>;
  requestExactPermission?(): Promise<void>;
  setForeground?(visible: boolean): void;
  /** Requests notification permission only in response to explicit opt-in. */
  requestPermission(): Promise<boolean>;
  /** Replaces this app's entire schedule with stable weekday IDs, including cancellation. */
  replace(reminder: TrainingReminder): Promise<void>;
}

export function trainingState(state?: TrainingState): TrainingState {
  return state ?? { plans: [], records: [], reminder: { enabled: false, weekdays: [], time: "" } };
}

export function validateTraining(title: string, content: string, bodyParts?: TrainingBodyPart[]): { title: string; content: string; bodyParts: TrainingBodyPart[] } {
  if (typeof title !== "string" || !title.trim()) throw new Error("请填写训练名称");
  if (typeof content !== "string" || !content.trim()) throw new Error("请填写自己的训练内容");
  if (title.trim().length > 100 || content.trim().length > 2000) throw new Error("训练名称最多 100 字，内容最多 2000 字");
  return { title: title.trim(), content: content.trim(), bodyParts: validateBodyParts(bodyParts) };
}

export function validateReminder(input: TrainingReminder): TrainingReminder {
  if (typeof input.enabled !== "boolean") throw new Error("请选择是否启用训练提醒");
  if (!input.enabled) return { enabled: false, weekdays: [], time: "" };
  if (!Array.isArray(input.weekdays) || !input.weekdays.length || input.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) throw new Error("请选择有效的训练星期");
  if (typeof input.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error("提醒时间须为 00:00–23:59（时 00–23，分 00–59）");
  return { enabled: true, weekdays: [...new Set(input.weekdays)].sort((a, b) => a - b), time: input.time };
}
