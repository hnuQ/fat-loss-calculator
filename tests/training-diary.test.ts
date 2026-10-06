import { describe, expect, it } from "vitest";
import { createFatLossDiary } from "../src/application/fatLossDiary";
import { createTrainingDiary } from "../src/application/trainingDiary";
import type { TrainingReminder, TrainingReminderAdapter } from "../src/domain/training";
import { createInMemoryDiaryRepository } from "../src/testing/inMemoryDiaryRepository";
import { createDiaryBackup } from "../src/application/diaryBackup";
import { validateBackupState } from "../src/domain/backupSchema";

async function setup() {
  const repository = createInMemoryDiaryRepository();
  let today = "2026-10-04";
  let granted = true;
  let permissionRequests = 0;
  let failNext = false;
  const scheduled = new Map<number, string>();
  const calls: TrainingReminder[] = [];
  const clock = { today: () => today, now: () => `${today}T12:00:00+08:00` };
  const diary = createFatLossDiary({ repository, clock, platform: { kind: "test", localPersistence: true, canvas: true } });
  const reminders: TrainingReminderAdapter = {
    capability: () => ({ supported: true, message: "测试系统提醒" }),
    async requestPermission() { permissionRequests++; return granted; },
    async replace(reminder) {
      if (failNext) { failNext = false; throw new Error("系统安排失败"); }
      calls.push(reminder); scheduled.clear();
      if (reminder.enabled) for (const day of reminder.weekdays) scheduled.set(day, reminder.time);
    },
  };
  const dependencies = { repository, clock, diary, reminders };
  const training = createTrainingDiary(dependencies);
  await diary.establishProfile({ nickname: "训练测试", sex: "male", age: 30, heightCm: 175, currentWeightKg: 70, weeklyExercise: "medium", hasFatLossExperience: false });
  const cycleId = (await diary.startCycle({ startDate: "2026-09-28", dayType: "training" })).activeCycle!.id;
  return { repository, diary, training, dependencies, calls, scheduled, cycleId, reopen: () => createTrainingDiary(dependencies), day: (date: string) => { today = date; }, deny: () => { granted = false; }, fail: () => { failNext = true; }, requests: () => permissionRequests };
}

const fields = { content: "自己选择的训练内容", feeling: "" };

describe("训练计划、实际记录和提醒公开旅程", () => {
  it("数字时间接受午夜和末分钟，拒绝超范围、空白和非数字", async () => {
    const { training } = await setup();
    for (const time of ["00:00", "23:59"]) {
      await training.saveReminder({ enabled: true, mode: "notification", weekdays: [7], time });
      expect((await training.open()).reminder.time).toBe(time);
    }
    for (const time of ["24:00", "23:60", "-1:00", "aa:00", " :00", "1.5:00", "1:00"]) {
      await expect(training.saveReminder({ enabled: true, mode: "notification", weekdays: [7], time })).rejects.toThrow("00:00–23:59");
    }
  });
  it("旧状态打开不生成计划、记录或通知；默认关闭", async () => {
    const { training, repository, calls, requests } = await setup();
    const before = await repository.read();
    expect(await training.open()).toMatchObject({ plans: [], records: [], reminder: { enabled: false, mode: "notification", weekdays: [], time: "" } });
    expect(await repository.read()).toEqual(before);
    expect(calls).toEqual([]); expect(requests()).toBe(0);
  });

  it("用户自建计划可编辑删除，记录保持独立并保留旧名称，重开完整保留", async () => {
    const { training, diary, repository, reopen, cycleId } = await setup();
    const before = await diary.openDiary();
    const plan = (await training.savePlan({ title: "  我的安排  ", content: "  用户填写内容  ", bodyParts: ["胸", "肩"] })).plans[0];
    await training.saveRecord({ cycleId, date: "2026-10-04", planId: plan.id, content: plan.content, bodyParts: plan.bodyParts, feeling: " 今日感受 " });
    const record = (await training.open()).records[0];
    expect(record).toMatchObject({ title: "我的安排", content: "用户填写内容", bodyParts: ["胸", "肩"], completed: true, feeling: "今日感受", date: "2026-10-04", revision: 1 });
    await training.savePlan({ id: plan.id, title: "新版计划", content: "新内容" });
    await training.deletePlan(plan.id);
    expect((await training.open()).records).toEqual([record]);
    expect((await reopen().open()).records).toEqual([record]);
    const after = await diary.openDiary();
    for (const key of ["baseline", "actual", "remaining", "weights", "bodyRecords", "meals", "dayType"] as const) expect(after[key]).toEqual(before[key]);
    expect((await repository.read())?.training?.plans[0]).toMatchObject({ revision: 3, deletedAt: "2026-10-04T12:00:00+08:00" });
    await expect(training.savePlan({ id: plan.id, title: "恢复", content: "内容" })).rejects.toThrow("未找到");
  });

  it("记录内容、部位和感受可修改，同日多条独立，删除后列表和周历同步", async () => {
    const { training, diary, repository, cycleId, day } = await setup();
    const first = (await training.saveRecord({ cycleId, date: "2026-10-04", ...fields, bodyParts: ["胸"] })).trainingRecords[0];
    const second = (await training.saveRecord({ cycleId, date: "2026-10-04", content: "慢跑", bodyParts: ["有氧"], feeling: "" })).trainingRecords[1];
    await training.saveRecord({ id: first.id, cycleId, date: "2026-10-02", content: "改为背部", bodyParts: ["背"], feeling: "状态不错" });
    const saved = (await repository.read())!.training!.records;
    expect(saved[0]).toMatchObject({ id: first.id, date: "2026-10-02", bodyParts: ["背"], content: "改为背部", feeling: "状态不错", revision: 2 });
    expect(saved[1]).toEqual(second);
    day("2026-10-05");
    await training.deleteRecord(second.id);
    expect((await training.open()).records).toMatchObject([{ id: first.id }]);
    expect((await diary.openDiary({ date: "2026-10-04" })).trainingRecords).toEqual([]);
    expect((await diary.openDiary({ date: "2026-10-04" })).isBlankDate).toBe(true);
    expect((await diary.openDiary({ date: "2026-10-02" })).trainingRecords).toMatchObject([{ id: first.id, content: "改为背部" }]);
    expect((await training.openWeek({ cycleId, date: "2026-10-02" })).days[4].records).toMatchObject([{ id: first.id }]);
  });

  it("归档周期内记录仍可修改删除，新周期与历史周期隔离", async () => {
    const { training, diary, cycleId, day } = await setup();
    const record = (await training.saveRecord({ cycleId, date: "2026-10-04", ...fields })).trainingRecords[0];
    await diary.archiveActiveCycle();
    await training.saveRecord({ id: record.id, cycleId, date: "2026-10-04", content: "归档后修改", feeling: "" });
    expect((await training.open()).records).toMatchObject([{ id: record.id, content: "归档后修改", revision: 2 }]);
    day("2026-10-05");
    const newCycleId = (await diary.startCycle({ startDate: "2026-10-05", dayType: "rest" })).activeCycle!.id;
    expect((await training.saveRecord({ cycleId: newCycleId, date: "2026-10-05", content: "新周期内容", feeling: "" })).trainingRecords).toHaveLength(1);
    expect((await diary.openDiary({ cycleId, date: "2026-10-04" })).trainingRecords).toMatchObject([{ id: record.id, content: "归档后修改" }]);
    await expect(training.saveRecord({ id: record.id, cycleId: newCycleId, date: "2026-10-05", content: "越界", feeling: "" })).rejects.toThrow("不能把训练记录移到其他周期");
    await training.deleteRecord(record.id);
    expect((await training.open()).records).toMatchObject([{ content: "新周期内容" }]);
  });

  it("拒绝空白及过长的计划名称与训练内容", async () => {
    const { training, cycleId } = await setup();
    for (const input of [{ title: "", content: "内容" }, { title: "名称", content: "  " }, { title: "名".repeat(101), content: "内容" }, { title: "名称", content: "字".repeat(2001) }]) {
      await expect(training.savePlan(input)).rejects.toThrow();
    }
    await expect(training.saveRecord({ cycleId, date: "2026-10-04", content: "   ", feeling: "" })).rejects.toThrow();
    await expect(training.saveRecord({ cycleId, date: "2026-10-04", content: "字".repeat(2001), feeling: "" })).rejects.toThrow();
    await expect(training.saveRecord({ cycleId, date: "2026-10-04", content: "内容", feeling: "字".repeat(2001) })).rejects.toThrow("训练感受最多 2000 字");
    expect((await training.open()).plans).toEqual([]);
    expect((await training.open()).records).toEqual([]);
  });

  it("启用须选星期和时间；授权后修改、去重、重开、关闭无遗留安排", async () => {
    const { training, scheduled, reopen, calls, requests } = await setup();
    for (const input of [{ enabled: true, mode: "notification", weekdays: [], time: "18:30" }, { enabled: true, mode: "notification", weekdays: [8], time: "18:30" }, { enabled: true, mode: "notification", weekdays: [1.5], time: "18:30" }, { enabled: true, mode: "notification", weekdays: [1], time: "24:00" }, { enabled: true, mode: "notification", weekdays: [1], time: "" }] as TrainingReminder[]) await expect(training.saveReminder(input)).rejects.toThrow();
    expect(requests()).toBe(0); expect(calls).toEqual([]);
    await training.saveReminder({ enabled: true, mode: "notification", weekdays: [5, 1, 5], time: "18:30" });
    expect([...scheduled]).toEqual([[1, "18:30"], [5, "18:30"]]);
    await training.saveReminder({ enabled: true, mode: "notification", weekdays: [3], time: "19:00" });
    await training.saveReminder({ enabled: true, mode: "notification", weekdays: [3], time: "19:00" });
    await reopen().open();
    expect([...scheduled]).toEqual([[3, "19:00"]]);
    const requestsBefore = requests();
    await training.saveReminder({ enabled: false, mode: "notification", weekdays: [], time: "" });
    expect(requests()).toBe(requestsBefore); expect(scheduled.size).toBe(0);
    expect((await reopen().open()).reminder.enabled).toBe(false);
    expect(calls.every((call) => !Object.hasOwn(call, "meal"))).toBe(true);
  });

  it("权限拒绝、平台不支持和系统错误不虚报启用；失败恢复旧安排", async () => {
    const { training, deny, requests, dependencies } = await setup();
    deny();
    await expect(training.saveReminder({ enabled: true, mode: "notification", weekdays: [1], time: "18:30" })).rejects.toThrow("未授权");
    expect((await training.open()).reminder.enabled).toBe(false);
    const unsupported = createTrainingDiary({ ...dependencies, reminders: { ...dependencies.reminders, capability: () => ({ supported: false, message: "微信不支持" }) } });
    await expect(unsupported.saveReminder({ enabled: true, mode: "notification", weekdays: [1], time: "18:30" })).rejects.toThrow("微信不支持");
    expect(requests()).toBe(1);
    const second = await setup();
    await second.training.saveReminder({ enabled: true, mode: "notification", weekdays: [2], time: "17:00" });
    second.fail();
    await expect(second.training.saveReminder({ enabled: true, mode: "notification", weekdays: [3], time: "18:00" })).rejects.toThrow("系统安排失败");
    expect([...second.scheduled]).toEqual([[2, "17:00"]]);
    expect((await second.reopen().open()).reminder).toEqual({ enabled: true, mode: "notification", weekdays: [2], time: "17:00" });
  });

  it("跨平台重开已启用配置显示无法同步，并允许关闭而不申请权限", async () => {
    const { training, dependencies, requests } = await setup();
    await training.saveReminder({ enabled: true, mode: "notification", weekdays: [1], time: "18:30" });
    const unsupported = createTrainingDiary({ ...dependencies, reminders: {
      capability: () => ({ supported: false, message: "微信不支持" }),
      async requestPermission() { throw new Error("不可申请权限"); },
      async replace(reminder) { if (reminder.enabled) throw new Error("微信不支持"); },
    } });
    expect((await unsupported.open()).warning).toBe("微信不支持");
    await unsupported.saveReminder({ enabled: false, mode: "notification", weekdays: [], time: "" });
    expect((await unsupported.open()).reminder.enabled).toBe(false);
    expect(requests()).toBe(1);
  });

  it("通知授权期间新增餐食不会被保存提醒的旧快照覆盖", async () => {
    const { dependencies, diary, repository, cycleId } = await setup();
    await diary.setDayType({ cycleId, date: "2026-10-04", dayType: "rest" });
    const training = createTrainingDiary({ ...dependencies, reminders: { ...dependencies.reminders,
      async requestPermission() { await diary.saveMeal({ mealSlot: "breakfast", foodId: diary.searchFoods("燕麦")[0].id, amount: 100 }); return true; },
    } });
    await training.saveReminder({ enabled: true, mode: "notification", weekdays: [1], time: "18:30" });
    expect((await repository.read())?.meals).toHaveLength(1);
  });

  it("关闭设置保存后原生取消前进程中断，重开仍清除旧安排", async () => {
    const { training, scheduled, repository, reopen, requests } = await setup();
    await training.saveReminder({ enabled: true, mode: "notification", weekdays: [1], time: "18:30" });
    const interrupted = (await repository.read())!;
    interrupted.training!.reminder = { enabled: false, mode: "notification", weekdays: [], time: "" };
    await repository.write(interrupted);
    expect(scheduled.size).toBe(1);
    await reopen().open();
    expect(scheduled.size).toBe(0); expect(requests()).toBe(1);
  });
});

describe("训练响铃设置、旧数据兼容与完整备份", () => {
  it("旧状态缺模式与铃声时保持原有启用、星期和时间，并默认普通通知", async () => {
    const { repository, dependencies } = await setup();
    const state = (await repository.read())!;
    // 升级前已启用的提醒没有 mode 与 sound 字段。
    state.training = { plans: [], records: [], reminder: { enabled: true, weekdays: [2, 6], time: "07:05" } as never };
    // 旧备份的形状必须先能通过校验，缺失的新字段不得让恢复失败。
    await repository.write(validateBackupState(state));
    const synced: TrainingReminder[] = [];
    const reopened = createTrainingDiary({ ...dependencies, reminders: { ...dependencies.reminders, async replace(reminder) { synced.push(reminder); } } });
    expect((await reopened.open()).reminder).toEqual({ enabled: true, weekdays: [2, 6], time: "07:05", mode: "notification" });
    // 重开把补全后的设置交回原生，且不自动升级为响铃。
    expect(synced).toEqual([{ enabled: true, weekdays: [2, 6], time: "07:05", mode: "notification" }]);
  });

  it("旧备份缺新字段时保留原启用/星期/时间，默认普通通知与系统默认铃声", async () => {
    const { training, repository, dependencies } = await setup();
    await training.saveReminder({ enabled: true, weekdays: [4], time: "06:40", mode: "ring", sound: "content://ringtone/4" });
    const stored = JSON.parse(JSON.stringify((await repository.read())!));
    delete stored.training.reminder.mode;
    delete stored.training.reminder.sound;
    expect(() => validateBackupState(stored)).not.toThrow();
    await repository.write(validateBackupState(stored));
    const reopened = createTrainingDiary({ ...dependencies, reminders: { ...dependencies.reminders, async replace() {} } });
    expect((await reopened.open()).reminder).toEqual({ enabled: true, weekdays: [4], time: "06:40", mode: "notification" });
  });

  it("响铃模式与铃声写入完整备份并往返保留，不序列化运行中的播放", async () => {
    const { training, repository, dependencies } = await setup();
    await training.saveReminder({ enabled: true, weekdays: [3], time: "07:05", mode: "ring", sound: "content://ringtone/3" });
    const backup = createDiaryBackup({ repository, randomBytes: (length) => new Uint8Array(length) });
    const exported = JSON.parse(await backup.exportBackup());
    expect(exported.state.training.reminder).toEqual({ enabled: true, weekdays: [3], time: "07:05", mode: "ring", sound: "content://ringtone/3" });
    const target = createInMemoryDiaryRepository();
    await createDiaryBackup({ repository: target, randomBytes: (length) => new Uint8Array(length) }).restoreBackup(JSON.stringify(exported));
    const reopened = createTrainingDiary({ ...dependencies, repository: target, reminders: { ...dependencies.reminders, async replace() {} } });
    expect((await reopened.open()).reminder).toEqual({ enabled: true, weekdays: [3], time: "07:05", mode: "ring", sound: "content://ringtone/3" });
    expect(JSON.stringify(exported)).not.toContain("ringing");
  });

  it("改模式、换铃声和关闭都把新代次交给原生，试听与停止不安排任务", async () => {
    const { dependencies } = await setup();
    const synced: TrainingReminder[] = [];
    const previewed: Array<string | undefined> = [];
    const training = createTrainingDiary({ ...dependencies, reminders: { ...dependencies.reminders,
      async replace(reminder) { synced.push(reminder); },
      async listRingtones() { return [{ id: "1", title: "铃声一", uri: "content://ringtone/1" }]; },
      async previewSound(uri) { previewed.push(uri); },
      async stopPreview() { previewed.push(undefined); },
      async stopRinging() { previewed.push(undefined); },
    } });
    await training.saveReminder({ enabled: true, weekdays: [1], time: "18:30", mode: "notification" });
    await training.saveReminder({ enabled: true, weekdays: [1], time: "18:30", mode: "ring", sound: "content://ringtone/1" });
    await training.saveReminder({ enabled: true, weekdays: [1], time: "18:30", mode: "ring", sound: "content://ringtone/2" });
    await training.saveReminder({ enabled: false, weekdays: [], time: "", mode: "ring", sound: "content://ringtone/2" });
    expect(synced).toEqual([
      { enabled: true, weekdays: [1], time: "18:30", mode: "notification" },
      { enabled: true, weekdays: [1], time: "18:30", mode: "ring", sound: "content://ringtone/1" },
      { enabled: true, weekdays: [1], time: "18:30", mode: "ring", sound: "content://ringtone/2" },
      { enabled: false, weekdays: [], time: "", mode: "ring", sound: "content://ringtone/2" },
    ]);
    const beforePreview = synced.length;
    expect(await training.listRingtones()).toEqual([{ id: "1", title: "铃声一", uri: "content://ringtone/1" }]);
    await training.previewSound("content://ringtone/1");
    await training.stopPreview();
    await training.stopRinging();
    expect(previewed).toEqual(["content://ringtone/1", undefined, undefined]);
    // 试听与停止只作用于播放器，重新安排只发生在保存设置时。
    expect(synced).toHaveLength(beforePreview);
  });
});
