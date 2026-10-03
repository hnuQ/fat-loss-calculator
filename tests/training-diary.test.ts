import { describe, expect, it } from "vitest";
import { createFatLossDiary } from "../src/application/fatLossDiary";
import { createTrainingDiary } from "../src/application/trainingDiary";
import type { TrainingReminder, TrainingReminderAdapter } from "../src/domain/training";
import { createInMemoryDiaryRepository } from "../src/testing/inMemoryDiaryRepository";

async function setup() {
  const repository = createInMemoryDiaryRepository();
  let today = "2026-10-02";
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
  await diary.establishProfile({ nickname: "训练测试", sex: "male", age: 30, heightCm: 175, currentWeightKg: 70, weeklyExercise: "medium", hasFatLossExperience: false, dayType: "training" });
  return { repository, diary, training, dependencies, calls, scheduled, reopen: () => createTrainingDiary(dependencies), day: (date: string) => { today = date; }, deny: () => { granted = false; }, fail: () => { failNext = true; }, requests: () => permissionRequests };
}

const fields = { title: "自填训练", content: "自己选择的训练内容", completed: false, feeling: "" };

describe("训练计划、当天记录和提醒公开旅程", () => {
  it("旧状态打开不生成计划、记录或通知；默认关闭", async () => {
    const { training, repository, calls, requests } = await setup();
    const before = await repository.read();
    expect(await training.open()).toMatchObject({ plans: [], records: [], reminder: { enabled: false, weekdays: [], time: "" } });
    expect(await repository.read()).toEqual(before);
    expect(calls).toEqual([]); expect(requests()).toBe(0);
  });

  it("用户自建计划可编辑删除，记录快照和其他实体保持独立，重开完整保留", async () => {
    const { training, diary, repository, reopen } = await setup();
    const before = await diary.openDiary();
    const plan = (await training.savePlan({ title: "  我的安排  ", content: "  用户填写内容  " })).plans[0];
    const first = await training.saveRecord({ ...fields, planId: plan.id, title: plan.title, content: plan.content, completed: true, feeling: " 今日感受 " });
    const record = first.trainingRecords[0];
    expect(record).toMatchObject({ title: "我的安排", content: "用户填写内容", completed: true, feeling: "今日感受", date: "2026-10-02", revision: 1 });
    await training.savePlan({ id: plan.id, title: "新版计划", content: "新内容" });
    await training.deletePlan(plan.id);
    expect((await diary.openDiary()).trainingRecords).toEqual([record]);
    expect((await reopen().open()).records).toEqual([record]);
    const after = await diary.openDiary();
    for (const key of ["baseline", "actual", "remaining", "weights", "bodyRecords", "meals", "dayType"] as const) expect(after[key]).toEqual(before[key]);
    expect((await repository.read())?.training?.plans[0]).toMatchObject({ revision: 3, deletedAt: "2026-10-02T12:00:00+08:00" });
    await expect(training.savePlan({ id: plan.id, title: "恢复", content: "内容" })).rejects.toThrow("未找到");
  });

  it("当天内容、完成状态、感受可修改删除；跨日拒绝全部覆盖和删除", async () => {
    const { training, diary, day, repository } = await setup();
    const record = (await training.saveRecord(fields)).trainingRecords[0];
    await training.saveRecord({ ...fields, id: record.id, content: "修改当天内容", completed: true, feeling: "状态记录" });
    const saved = (await repository.read())?.training?.records[0];
    day("2026-10-03");
    await expect(training.saveRecord({ ...fields, id: record.id })).rejects.toThrow("不可修改或删除");
    await expect(training.deleteRecord(record.id)).rejects.toThrow("不可修改或删除");
    await expect(training.saveRecord({ ...fields, date: "2026-10-02" })).rejects.toThrow("今天");
    expect((await repository.read())?.training?.records[0]).toEqual(saved);
    expect((await diary.openDiary({ date: "2026-10-02" })).trainingRecords).toEqual([saved]);
    const next = (await training.saveRecord(fields)).trainingRecords[0];
    expect((await diary.openDiary()).isBlankDate).toBe(false);
    await training.deleteRecord(next.id);
    expect((await diary.openDiary()).isBlankDate).toBe(true);
  });

  it("归档锁定当天训练，新周期与历史周期隔离", async () => {
    const { training, diary, day } = await setup();
    const record = (await training.saveRecord(fields)).trainingRecords[0];
    await diary.archiveActiveCycle();
    await expect(training.saveRecord({ ...fields, id: record.id })).rejects.toThrow();
    await expect(training.deleteRecord(record.id)).rejects.toThrow();
    day("2026-10-03"); await diary.startCycle({ startDate: "2026-10-03", dayType: "rest" });
    expect((await training.saveRecord(fields)).trainingRecords).toHaveLength(1);
    expect((await diary.openDiary({ cycleId: record.cycleId, date: record.date })).trainingRecords).toEqual([record]);
    await expect(training.saveRecord({ ...fields, id: record.id })).rejects.toThrow("不可修改或删除");
  });

  it.each([{ title: "", content: "内容" }, { title: "名称", content: "  " }, { title: "名".repeat(101), content: "内容" }, { title: "名称", content: "字".repeat(2001) }])("拒绝空白及过长训练输入 %j", async (input) => {
    const { training } = await setup();
    await expect(training.savePlan(input)).rejects.toThrow();
    await expect(training.saveRecord({ ...fields, ...input })).rejects.toThrow();
    expect((await training.open()).records).toEqual([]);
  });

  it("启用须选星期和时间；授权后修改、去重、重开、关闭无遗留安排", async () => {
    const { training, scheduled, reopen, calls, requests } = await setup();
    for (const input of [{ enabled: true, weekdays: [], time: "18:30" }, { enabled: true, weekdays: [8], time: "18:30" }, { enabled: true, weekdays: [1.5], time: "18:30" }, { enabled: true, weekdays: [1], time: "24:00" }, { enabled: true, weekdays: [1], time: "" }]) await expect(training.saveReminder(input)).rejects.toThrow();
    expect(requests()).toBe(0); expect(calls).toEqual([]);
    await training.saveReminder({ enabled: true, weekdays: [5, 1, 5], time: "18:30" });
    expect([...scheduled]).toEqual([[1, "18:30"], [5, "18:30"]]);
    await training.saveReminder({ enabled: true, weekdays: [3], time: "19:00" });
    await training.saveReminder({ enabled: true, weekdays: [3], time: "19:00" });
    await reopen().open();
    expect([...scheduled]).toEqual([[3, "19:00"]]);
    const requestsBefore = requests();
    await training.saveReminder({ enabled: false, weekdays: [], time: "" });
    expect(requests()).toBe(requestsBefore); expect(scheduled.size).toBe(0);
    expect((await reopen().open()).reminder.enabled).toBe(false);
    expect(calls.every((call) => !Object.hasOwn(call, "meal"))).toBe(true);
  });

  it("权限拒绝、平台不支持和系统错误不虚报启用；失败恢复旧安排", async () => {
    const { training, deny, requests, dependencies } = await setup();
    deny();
    await expect(training.saveReminder({ enabled: true, weekdays: [1], time: "18:30" })).rejects.toThrow("未授权");
    expect((await training.open()).reminder.enabled).toBe(false);
    const unsupported = createTrainingDiary({ ...dependencies, reminders: { ...dependencies.reminders, capability: () => ({ supported: false, message: "微信不支持" }) } });
    await expect(unsupported.saveReminder({ enabled: true, weekdays: [1], time: "18:30" })).rejects.toThrow("微信不支持");
    expect(requests()).toBe(1);
    const second = await setup();
    await second.training.saveReminder({ enabled: true, weekdays: [2], time: "17:00" });
    second.fail();
    await expect(second.training.saveReminder({ enabled: true, weekdays: [3], time: "18:00" })).rejects.toThrow("系统安排失败");
    expect([...second.scheduled]).toEqual([[2, "17:00"]]);
    expect((await second.reopen().open()).reminder).toEqual({ enabled: true, weekdays: [2], time: "17:00" });
  });

  it("跨平台重开已启用配置显示无法同步，并允许关闭而不申请权限", async () => {
    const { training, dependencies, requests } = await setup();
    await training.saveReminder({ enabled: true, weekdays: [1], time: "18:30" });
    const unsupported = createTrainingDiary({ ...dependencies, reminders: {
      capability: () => ({ supported: false, message: "微信不支持" }),
      async requestPermission() { throw new Error("不可申请权限"); },
      async replace(reminder) { if (reminder.enabled) throw new Error("微信不支持"); },
    } });
    expect((await unsupported.open()).warning).toBe("微信不支持");
    await unsupported.saveReminder({ enabled: false, weekdays: [], time: "" });
    expect((await unsupported.open()).reminder.enabled).toBe(false);
    expect(requests()).toBe(1);
  });

  it("通知授权期间新增餐食不会被保存提醒的旧快照覆盖", async () => {
    const { dependencies, diary, repository } = await setup();
    const training = createTrainingDiary({ ...dependencies, reminders: { ...dependencies.reminders,
      async requestPermission() { await diary.saveMeal({ mealSlot: "breakfast", foodId: diary.searchFoods("燕麦")[0].id, amount: 100 }); return true; },
    } });
    await training.saveReminder({ enabled: true, weekdays: [1], time: "18:30" });
    expect((await repository.read())?.meals).toHaveLength(1);
  });

  it("关闭设置保存后原生取消前进程中断，重开仍清除旧安排", async () => {
    const { training, scheduled, repository, reopen, requests } = await setup();
    await training.saveReminder({ enabled: true, weekdays: [1], time: "18:30" });
    const interrupted = (await repository.read())!;
    interrupted.training!.reminder = { enabled: false, weekdays: [], time: "" };
    await repository.write(interrupted);
    expect(scheduled.size).toBe(1);
    await reopen().open();
    expect(scheduled.size).toBe(0); expect(requests()).toBe(1);
  });
});
