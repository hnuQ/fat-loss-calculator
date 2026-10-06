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
  /** @deprecated 旧排期关联只为兼容旧记录与完整备份保留；新记录不再产生排期。 */
  scheduleId?: string;
  id: string;
  ownerId: string;
  cycleId: string;
  date: string;
  planId?: string;
  title: string;
  content: string;
  /** @deprecated 保存即确认已练，新记录恒为 true；旧 false 记录保留查看编辑但不算已练。 */
  completed: boolean;
  feeling: string;
  createdAt: string;
  updatedAt: string;
  revision: number;
  syncState: "local";
}

/** @deprecated 旧排期数据只用于兼容读取与完整备份保全，不再作为活动安排。 */
export interface TrainingSchedule extends Omit<TrainingRecord, "completed" | "feeling" | "scheduleId"> {}

export interface TrainingWeek {
  days: Array<{ date: string; inCycle: boolean; records: TrainingRecord[] }>;
}

/** 普通通知沿用系统渠道声音；响铃为独立原生播放，两者互不代替。 */
export type TrainingReminderMode = "notification" | "ring";

export interface TrainingReminder {
  enabled: boolean;
  /** ISO weekdays: Monday 1 through Sunday 7. */
  weekdays: number[];
  time: string;
  /** 旧数据与旧备份缺省为普通通知，不因新增响铃能力自动升级。 */
  mode: TrainingReminderMode;
  /** 空值表示系统默认闹钟铃声。 */
  sound?: string;
}

export const trainingReminderModeLabels: Record<TrainingReminderMode, string> = { notification: "普通通知", ring: "响铃提醒" };

export function defaultReminder(): TrainingReminder {
  return { enabled: false, weekdays: [], time: "", mode: "notification" };
}

/** 只为缺省字段补默认值：旧启用/星期/时间保持，模式默认普通通知、铃声默认系统默认。 */
export function normalizeReminder(reminder?: Partial<TrainingReminder> | null): TrainingReminder {
  if (!reminder || typeof reminder !== "object") return defaultReminder();
  const sound = typeof reminder.sound === "string" ? reminder.sound.trim() : "";
  return {
    enabled: reminder.enabled === true,
    weekdays: Array.isArray(reminder.weekdays) ? reminder.weekdays.filter((day): day is number => Number.isInteger(day)) : [],
    time: typeof reminder.time === "string" ? reminder.time : "",
    mode: reminder.mode === "ring" ? "ring" : "notification",
    ...(sound ? { sound } : {}),
  };
}

/** 无法读取系统状态时保持 undefined，界面不得据此宣称没有阻碍。 */
export interface TrainingRingingStatus {
  ringing: boolean;
  ringerMode: "normal" | "silent" | "vibrate" | "unknown";
  alarmVolume?: number;
  alarmVolumeMax?: number;
  /** 读不到勿扰状态时为 undefined。 */
  dnd?: boolean;
  /** 当前系统状态下无法主动响铃的原因；空数组且 unverified 为空时才表示可响。 */
  blockers: string[];
  /** 读不到的状态项；不得据此宣称没有阻碍。 */
  unverified: string[];
  /** 所选铃声不可用并回退到系统默认闹钟铃声。 */
  ringtoneFallback: boolean;
  /** 上次到时无法按所选模式响铃的原因代码。 */
  lastError?: string;
}

export interface TrainingReminderCapability {
  supported: boolean;
  message: string;
  exactPermissionNeeded?: boolean;
  /** 仅 Android 原生提醒提供；微信等端不暴露后台响铃承诺。 */
  ring?: TrainingRingingStatus;
}

export interface TrainingRingtone {
  id: string;
  title: string;
  uri: string;
}

export interface TrainingState {
  schedules?: TrainingSchedule[];
  plans: TrainingPlan[];
  records: TrainingRecord[];
  reminder: TrainingReminder;
}

export interface TrainingReminderAdapter {
  capability(): TrainingReminderCapability;
  refreshCapability?(): Promise<void>;
  requestExactPermission?(): Promise<void>;
  setForeground?(visible: boolean): void;
  /** Requests notification permission only in response to explicit opt-in. */
  requestPermission(): Promise<boolean>;
  /** Replaces this app's entire schedule with stable weekday IDs, including cancellation. */
  replace(reminder: TrainingReminder): Promise<void>;
  /** 系统可访问的本地闹钟铃声；不支持时返回空列表。 */
  listRingtones?(): Promise<TrainingRingtone[]>;
  /** 试听最多 3 秒；不保存设置、不安排任务、不消费到时事件。 */
  previewSound?(uri?: string): Promise<void>;
  stopPreview?(): Promise<void>;
  /** 只结束本次响铃声，保留下周安排。 */
  stopRinging?(): Promise<void>;
}

export function trainingState(state?: TrainingState): TrainingState {
  if (!state) return { plans: [], records: [], reminder: defaultReminder() };
  return { ...state, reminder: normalizeReminder(state.reminder) };
}

/** 旧未完成记录不计入已练；保存实际记录即确认已练，新记录恒为 true。 */
export function trainedRecord(record: TrainingRecord): boolean {
  return record.completed === true;
}

/** 名称只作内部兼容：模板名称优先，其次部位组合，最后默认值；不再要求用户填写。 */
export function trainingRecordTitle(preferred: string | undefined, bodyParts: TrainingBodyPart[] = []): string {
  const title = preferred?.trim();
  if (title) return title.slice(0, 100);
  return (bodyParts.join(" / ") || "训练记录").slice(0, 100);
}

export function validateTrainingTitle(title: string): string {
  if (typeof title !== "string" || !title.trim()) throw new Error("请填写训练名称");
  if (title.trim().length > 100) throw new Error("训练名称最多 100 字，内容最多 2000 字");
  return title.trim();
}

export function validateTrainingContent(content: string, bodyParts?: TrainingBodyPart[]): { content: string; bodyParts: TrainingBodyPart[] } {
  if (typeof content !== "string" || !content.trim()) throw new Error("请填写自己的训练内容");
  if (content.trim().length > 2000) throw new Error("训练名称最多 100 字，内容最多 2000 字");
  return { content: content.trim(), bodyParts: validateBodyParts(bodyParts) };
}

export function validateTraining(title: string, content: string, bodyParts?: TrainingBodyPart[]): { title: string; content: string; bodyParts: TrainingBodyPart[] } {
  return { title: validateTrainingTitle(title), ...validateTrainingContent(content, bodyParts) };
}

export function validateReminder(input: TrainingReminder): TrainingReminder {
  if (typeof input.enabled !== "boolean") throw new Error("请选择是否启用训练提醒");
  const reminder = normalizeReminder(input);
  if (!input.enabled) return { ...reminder, enabled: false, weekdays: [], time: "" };
  if (!Array.isArray(input.weekdays) || !input.weekdays.length || input.weekdays.some((day) => !Number.isInteger(day) || day < 1 || day > 7)) throw new Error("请选择有效的训练星期");
  if (typeof input.time !== "string" || !/^([01]\d|2[0-3]):[0-5]\d$/.test(input.time)) throw new Error("提醒时间须为 00:00–23:59（时 00–23，分 00–59）");
  return { ...reminder, enabled: true, weekdays: [...new Set(input.weekdays)].sort((a, b) => a - b), time: input.time };
}

/** 原生报告的响铃阻碍代码到界面文案的映射；未知代码原样显示，不隐藏问题。 */
export const trainingRingBlockerLabels: Record<string, string> = {
  "notification-permission": "通知权限或训练通知渠道未启用",
  "ring-channel": "响铃提醒渠道被禁用",
  silent: "手机处于静音或振动模式",
  "volume-zero": "闹钟音量为零",
  dnd: "勿扰模式已开启",
  "alarm-volume": "无法读取闹钟音量",
  "state-unknown": "无法读取系统响铃状态",
};

/** 上次到时无法按所选模式响铃的原因代码。 */
export const trainingRingErrorLabels: Record<string, string> = {
  "background-service": "后台无法启动响铃服务，本次已降级为普通通知。",
  "playback-failed": "无法播放所选响铃铃声，本次只保留通知。",
};

/** 只在状态可读且无阻碍时说明可用；读不到状态时如实说明，不宣称没有阻碍。 */
export function trainingRingStatusText(ring?: TrainingRingingStatus): string {
  if (!ring) return "";
  if (ring.blockers.length) return `当前不会主动响铃：${ring.blockers.map((code) => trainingRingBlockerLabels[code] ?? code).join("；")}。`;
  const parts: string[] = [];
  if (ring.lastError) parts.push(trainingRingErrorLabels[ring.lastError] ?? ring.lastError);
  if (ring.ringtoneFallback) parts.push("所选铃声不可用，已回退到系统默认闹钟铃声。");
  if (ring.ringing) parts.push("正在响铃。");
  if (ring.unverified.length) parts.push(`无法确认：${ring.unverified.map((code) => trainingRingBlockerLabels[code] ?? code).join("；")}。`);
  if (ring.alarmVolume !== undefined && ring.alarmVolumeMax) parts.push(`当前闹钟音量 ${ring.alarmVolume}/${ring.alarmVolumeMax}。`);
  return parts.join("") || "响铃提醒可用。";
}
