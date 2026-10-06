import { expect, test } from "vitest";
import { mountPanel } from "./panelHarness.js";

const nutrients = { carbohydrateGrams: 0, proteinGrams: 0, fatGrams: 0, energyKcal: 0 };
const profile = { nickname: "测试", sex: "male", age: 30, heightCm: 175, currentWeightKg: 70, weeklyExercise: "medium", hasFatLossExperience: false };
const cycle = { id: "c1", startDate: "2026-09-28", endDate: "2026-12-26", status: "active" };
const weekDates = ["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"];
const plan = { id: "plan-1", ownerId: "local-user", title: "推日", content: "卧推 5 组", bodyParts: ["胸"], createdAt: "2026-10-01T00:00:00.000Z", updatedAt: "2026-10-01T00:00:00.000Z", revision: 1, syncState: "local" };
const record = { id: "record-1", ownerId: "local-user", cycleId: cycle.id, date: "2026-10-02", planId: plan.id, title: "推日", content: "卧推 5 组", bodyParts: ["胸"], completed: true, feeling: "", createdAt: "2026-10-02T08:00:00.000Z", updatedAt: "2026-10-02T08:00:00.000Z", revision: 1, syncState: "local" };

function snapshot(extra = {}) {
  return {
    profile, today: "2026-10-04", selectedDate: "2026-10-04", selectedCycle: cycle, activeCycle: cycle, cycles: [cycle],
    trainingRecords: [record], bodyRecords: [], originalBodyRecords: [], bodyCorrections: [],
    originalMeals: [], mealCorrections: [], mealGroups: [], meals: [], weights: [], selectedDateWeights: [],
    dateStrip: [], cycleDates: [], isBlankDate: false, actual: nutrients,
    ...extra,
  };
}

async function trainingPanel() {
  const state = { plans: [plan], records: [record], reminder: { enabled: false, weekdays: [], time: "" } };
  return mountPanel("src/components/TrainingDiary.vue", {
    props: { snapshot: snapshot(), disabled: false },
    runtime: { trainingDiary: {
      capability: () => ({ supported: false, message: "测试环境不支持系统提醒" }),
      open: async () => ({ ...state, warning: "" }),
      openWeek: async () => ({ days: weekDates.map((date) => ({ date, inCycle: true, records: date === record.date ? [record] : [] })) }),
      savePlan: async () => state, deletePlan: async () => state,
      saveRecord: async () => snapshot(), deleteRecord: async () => snapshot(),
      saveReminder: async () => state, requestExactPermission: async () => {},
      listRingtones: async () => [], previewSound: async () => {}, stopPreview: async () => {}, stopRinging: async () => {},
    } },
  });
}

test("训练面板只保留实际记录：没有排期、完成开关与重复名称输入，可直接选择训练计划", async () => {
  const panel = await trainingPanel();
  try {
    const text = panel.text();
    expect(text).not.toContain("排期");
    expect(text).not.toContain("已完成");
    expect(text).not.toContain("未完成");
    expect(text).not.toContain("待办");
    expect(text).toContain("选择训练计划");
    expect(text).toContain("训练日期");
    expect(text).toContain("保存即确认当天练过");
    expect(text).toContain("无训练记录");
    expect(text).toContain("记录此计划");
    expect(text).toContain("2026-10-02");
    const labels = panel.controlLabels();
    expect(labels).toContain("训练内容");
    expect(labels).toContain("训练感受");
    expect(labels).toContain("计划训练名称");
    expect(labels).not.toContain("当天训练名称");
    expect(labels).not.toContain("排期训练名称");
    expect(labels).not.toContain("当天训练内容");
    expect(labels).not.toContain("当天训练感受");
    expect(labels).not.toContain("当天训练已完成");
    // 记录表单不再要求填写训练名称，但计划表单仍保留名称用于识别模板。
    expect(text.split("训练名称").length - 1).toBe(1);
  } finally {
    panel.dispose();
  }
});

test("身体围度录入区域提示建议十天更新一次，不新增测量提醒", async () => {
  const panel = await mountPanel("src/components/BodyProgress.vue", {
    props: { snapshot: snapshot({ bodyRecords: [{ id: "body-1", cycleId: cycle.id, date: "2026-10-02", weightKg: 69, ownerId: "local-user", createdAt: "2026-10-02T08:00:00.000Z", updatedAt: "2026-10-02T08:00:00.000Z", revision: 1, syncState: "local" }] }), disabled: false },
    runtime: { fatLossDiary: { saveBodyRecord: async () => snapshot(), deleteBodyRecord: async () => snapshot() } },
    stubs: { "src/components/WeightTrendCanvas.vue": { default: { name: "WeightTrendCanvas", render: () => null } } },
  });
  try {
    const text = panel.text();
    expect(text).toContain("建议十天更新一次");
    expect(text).toContain("补录身体数据");
    expect(text).toContain("日期须在所选周期内且不晚于今天；历史及归档周期也可补录、编辑和删除。");
    expect(text).not.toContain("提醒");
  } finally {
    panel.dispose();
  }
});
test("同名训练计划在记录表单中按部位与内容区分，选择后填入内容", async () => {
  const twin = { ...plan, id: "plan-2", title: "推日", content: "实力推 3 组", bodyParts: ["肩"] };
  const state = { plans: [plan, twin], records: [], reminder: { enabled: false, weekdays: [], time: "" } };
  const panel = await mountPanel("src/components/TrainingDiary.vue", {
    props: { snapshot: snapshot({ trainingRecords: [] }), disabled: false },
    runtime: { trainingDiary: {
      capability: () => ({ supported: false, message: "" }),
      open: async () => ({ ...state, warning: "" }),
      openWeek: async () => ({ days: weekDates.map((date) => ({ date, inCycle: true, records: [] })) }),
      savePlan: async () => state, deletePlan: async () => state,
      saveRecord: async () => snapshot(), deleteRecord: async () => snapshot(),
      saveReminder: async () => state, requestExactPermission: async () => {},
      listRingtones: async () => [], previewSound: async () => {}, stopPreview: async () => {}, stopRinging: async () => {},
    } },
  });
  try {
    const picker = panel.all().find((el) => Array.isArray(el.props.range) && el.props.range.some((item) => String(item).includes("推日")));
    expect(picker).toBeDefined();
    const range = picker!.props.range as string[];
    expect(range).toHaveLength(3);
    expect(new Set(range).size).toBe(3);
    expect(range[1]).toContain("胸");
    expect(range[2]).toContain("肩");
    // 选择本身只填入内容与部位，不保存记录。
    picker!.props.onChange({ detail: { value: "2" } });
    await panel.flush();
    expect(panel.text()).toContain("实力推 3 组");
    expect(panel.text()).toContain("本周期暂无训练记录");
  } finally {
    panel.dispose();
  }
});

function ringingStatus(overrides: Record<string, unknown> = {}) {
  return { ringing: false, ringerMode: "normal", alarmVolume: 7, alarmVolumeMax: 7, dnd: false, blockers: [], unverified: [], ringtoneFallback: false, ...overrides };
}

async function ringingPanel(options: { ring?: Record<string, unknown>; mode?: string; sound?: string; enabled?: boolean } = {}) {
  const enabled = options.enabled ?? true;
  const state = { plans: [plan], records: [record], reminder: { enabled, mode: options.mode ?? "ring", weekdays: [1], time: "18:30", ...(options.sound ? { sound: options.sound } : {}) } };
  return mountPanel("src/components/TrainingDiary.vue", {
    props: { snapshot: snapshot(), disabled: false },
    runtime: { trainingDiary: {
      capability: () => ({ supported: true, message: "已允许准时提醒，系统限制仍可能延迟。", ...(options.ring ? { ring: options.ring } : {}) }),
      open: async () => ({ ...state, warning: "" }),
      openWeek: async () => ({ days: weekDates.map((date) => ({ date, inCycle: true, records: [] })) }),
      savePlan: async () => state, deletePlan: async () => state,
      saveRecord: async () => snapshot(), deleteRecord: async () => snapshot(),
      saveReminder: async () => state, requestExactPermission: async () => {},
      listRingtones: async () => [{ id: "1", title: "晨曦", uri: "content://ringtone/1" }],
      previewSound: async () => {}, stopPreview: async () => {}, stopRinging: async () => {},
    } },
  });
}

test("响铃模式提供铃声选择、试听与停止，并如实说明会打断其他音频", async () => {
  const panel = await ringingPanel({ ring: ringingStatus() });
  try {
    const text = panel.text();
    expect(text).toContain("提醒方式");
    expect(text).toContain("短暂打断其他音频");
    expect(text).toContain("响铃铃声：系统默认闹钟铃声");
    expect(text).toContain("试听最多 3 秒");
    expect(text).toContain("停止试听");
    expect(text).toContain("当前闹钟音量 7/7。");
    const modeButtons = panel.all().filter((el) => String(el.props["aria-label"] ?? "").startsWith("提醒方式"));
    expect(modeButtons.map((el) => el.props["aria-label"])).toEqual(["提醒方式普通通知", "提醒方式响铃提醒"]);
    const picker = panel.all().find((el) => Array.isArray(el.props.range) && el.props.range.includes("系统默认闹钟铃声"));
    expect(picker?.props.range).toEqual(["系统默认闹钟铃声", "晨曦"]);
  } finally {
    panel.dispose();
  }
});

test("静音或音量为零等阻碍如实显示，不宣称可以响铃", async () => {
  const panel = await ringingPanel({ ring: ringingStatus({ ringerMode: "silent", blockers: ["silent"] }) });
  try {
    expect(panel.text()).toContain("当前不会主动响铃：手机处于静音或振动模式。");
    expect(panel.text()).not.toContain("当前闹钟音量");
  } finally {
    panel.dispose();
  }
});

test("读不到系统状态时如实说明未知，不显示可用", async () => {
  const panel = await ringingPanel({ ring: ringingStatus({ ringerMode: "unknown", blockers: ["state-unknown"] }) });
  try {
    expect(panel.text()).toContain("当前不会主动响铃：无法读取系统响铃状态。");
  } finally {
    panel.dispose();
  }
});

test("普通通知模式与不支持响铃的一端都不显示铃声与试听", async () => {
  const notification = await ringingPanel({ mode: "notification", ring: ringingStatus() });
  try {
    expect(notification.text()).toContain("提醒方式");
    expect(notification.text()).not.toContain("响铃铃声：");
    expect(notification.text()).not.toContain("试听最多 3 秒");
    expect(notification.text()).not.toContain("短暂打断其他音频");
  } finally {
    notification.dispose();
  }
  const unsupported = await ringingPanel({ mode: "notification" });
  try {
    expect(unsupported.text()).not.toContain("提醒方式");
    expect(unsupported.text()).not.toContain("响铃提醒");
  } finally {
    unsupported.dispose();
  }
});

test("正在响铃时训练页显示停止入口，点击只结束本次", async () => {
  const panel = await ringingPanel({ ring: ringingStatus({ ringing: true }) });
  try {
    expect(panel.text()).toContain("正在响铃");
    expect(panel.text()).toContain("最多 10 秒后自动停止");
    await panel.click("停止响铃");
    expect(panel.text()).toContain("已停止本次响铃，下周安排保留");
  } finally {
    panel.dispose();
  }
});
test("读不到勿扰状态时如实说明无法确认，不宣称没有阻碍", async () => {
  const panel = await ringingPanel({ ring: ringingStatus({ unverified: ["dnd"] }) });
  try {
    expect(panel.text()).toContain("无法确认：勿扰模式已开启。");
    expect(panel.text()).not.toContain("响铃提醒可用。");
  } finally {
    panel.dispose();
  }
});
