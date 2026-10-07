import { expect, it } from "vitest";
import { createFatLossDiary } from "../src/application/fatLossDiary";
import { createTrainingDiary } from "../src/application/trainingDiary";
import { createInMemoryDiaryRepository } from "../src/testing/inMemoryDiaryRepository";
import { createDiaryBackup } from "../src/application/diaryBackup";
import { trainingImage } from "../src/application/trainingImages";
import { validateBackupState } from "../src/domain/backupSchema";
import type { DiaryState } from "../src/domain/diary";
import type { TrainingRecord, TrainingSchedule, TrainingState } from "../src/domain/training";

const cycleStart = "2026-09-28";

function legacyRecord(overrides: Partial<TrainingRecord> & { id: string; cycleId: string; date: string }): TrainingRecord {
  return { ownerId: "local-user", title: "训练记录", content: "旧内容", completed: true, feeling: "", createdAt: `${overrides.date}T08:00:00.000Z`, updatedAt: `${overrides.date}T08:00:00.000Z`, revision: 1, syncState: "local", ...overrides };
}

function legacySchedule(overrides: Partial<TrainingSchedule> & { id: string; cycleId: string; date: string }): TrainingSchedule {
  return { ownerId: "local-user", title: "旧排期", content: "旧排期内容", createdAt: `${overrides.date}T08:00:00.000Z`, updatedAt: `${overrides.date}T08:00:00.000Z`, revision: 1, syncState: "local", ...overrides };
}

function trainingState(overrides: Partial<TrainingState> = {}): TrainingState {
  return { plans: [], records: [], reminder: { enabled: false, mode: "notification", weekdays: [], time: "" }, ...overrides };
}

async function setup() {
  const repository = createInMemoryDiaryRepository();
  let today = "2026-10-04";
  const clock = { today: () => today, now: () => `${today}T12:00:00+08:00` };
  const diary = createFatLossDiary({ repository, clock, platform: { kind: "test", localPersistence: true, canvas: true } });
  await diary.establishProfile({ nickname: "测试", sex: "male", age: 30, heightCm: 175, currentWeightKg: 70, weeklyExercise: "medium", hasFatLossExperience: false });
  const snapshot = await diary.startCycle({ startDate: cycleStart, dayType: "training" });
  const training = createTrainingDiary({ repository, clock, diary });
  return { repository, clock, diary, training, cycleId: snapshot.activeCycle!.id, day: (date: string) => { today = date; } };
}

it("训练界面不再提供排期安排：公开接口没有排期写入，周历只显示实际记录", async () => {
  const { training, cycleId } = await setup();
  expect((training as unknown as Record<string, unknown>).saveSchedule).toBeUndefined();
  expect((training as unknown as Record<string, unknown>).deleteSchedule).toBeUndefined();
  let week = await training.openWeek({ cycleId, date: "2026-10-04" });
  expect(week.days.map((day) => day.date)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  expect(week.days.every((day) => day.records.length === 0)).toBe(true);
  await training.saveRecord({ cycleId, date: "2026-10-04", content: "胸肌与肩部", bodyParts: ["胸", "肩"], feeling: "" });
  week = await training.openWeek({ cycleId, date: "2026-10-04" });
  expect(week.days[6].records).toMatchObject([{ date: "2026-10-04", bodyParts: ["胸", "肩"], content: "胸肌与肩部" }]);
  expect(week.days[5].records).toEqual([]);
  expect(week.days.map((day) => day.inCycle)).toEqual([true, true, true, true, true, true, true]);
});

it("保存即确认已练：没有完成开关与重复名称输入，一天可多条独立记录", async () => {
  const { training, cycleId } = await setup();
  const plan = (await training.savePlan({ title: "推日", content: "卧推 5 组", bodyParts: ["胸"] })).plans[0];
  await training.saveRecord({ cycleId, date: "2026-10-04", planId: plan.id, content: plan.content, bodyParts: plan.bodyParts, feeling: "" });
  await training.saveRecord({ cycleId, date: "2026-10-04", content: "慢跑 30 分钟", bodyParts: ["有氧"], feeling: "轻松" });
  const records = (await training.open()).records;
  expect(records).toHaveLength(2);
  expect(records[0]).toMatchObject({ title: "推日", content: "卧推 5 组", bodyParts: ["胸"], completed: true });
  expect(records[1]).toMatchObject({ title: "有氧", content: "慢跑 30 分钟", bodyParts: ["有氧"], completed: true, feeling: "轻松" });
  expect(records.every((record) => record.completed === true)).toBe(true);
});

it("没有模板也没有部位时使用兼容名称，模板删除和修改不改写已保存记录", async () => {
  const { training, cycleId } = await setup();
  const plan = (await training.savePlan({ title: "原计划", content: "原内容", bodyParts: ["背"] })).plans[0];
  await training.saveRecord({ cycleId, date: "2026-10-04", planId: plan.id, content: "实际内容", bodyParts: ["背", "手臂"], feeling: "" });
  await training.saveRecord({ cycleId, date: "2026-10-03", content: "自填内容", feeling: "" });
  await training.savePlan({ id: plan.id, title: "新版计划", content: "新内容" });
  await training.deletePlan(plan.id);
  const records = (await training.open()).records;
  expect(records).toMatchObject([
    { title: "原计划", content: "实际内容", bodyParts: ["背", "手臂"] },
    { title: "训练记录", content: "自填内容", bodyParts: [] },
  ]);
});

it("记录可选择今天及过去日期；未来和周期外日期被拒绝且不生成记录", async () => {
  const { training, cycleId, day } = await setup();
  await expect(training.saveRecord({ cycleId, date: "2026-10-05", content: "未来", feeling: "" })).rejects.toThrow("不能记录未来的训练");
  await expect(training.saveRecord({ cycleId, date: "2026-09-27", content: "周期外", feeling: "" })).rejects.toThrow("不在所选周期内");
  await expect(training.saveRecord({ cycleId, date: "2026-02-30", content: "无效日期", feeling: "" })).rejects.toThrow();
  await expect(training.saveRecord({ cycleId, date: "2026-10-04", content: "   ", feeling: "" })).rejects.toThrow("请填写自己的训练内容");
  expect((await training.open()).records).toEqual([]);
  day("2026-10-06");
  const snapshot = await training.saveRecord({ cycleId, date: "2026-10-02", content: "补录", feeling: "" });
  expect(snapshot.trainingRecords).toMatchObject([{ date: "2026-10-02", content: "补录" }]);
});

it("历史与归档周期内可直接修改删除，编辑只改本条记录", async () => {
  const { training, diary, cycleId, day } = await setup();
  expect((await training.open()).records).toEqual([]);
  const first = (await training.saveRecord({ cycleId, date: "2026-10-02", content: "原始内容", bodyParts: ["腿"], feeling: "" })).trainingRecords[0];
  await training.saveRecord({ cycleId, date: "2026-10-01", content: "另一条", bodyParts: ["有氧"], feeling: "" });
  day("2026-10-06");
  const edited = (await training.saveRecord({ id: first.id, cycleId, date: "2026-10-03", content: "改为有氧", bodyParts: ["有氧"], feeling: "轻松" })).trainingRecords[0];
  expect(edited).toMatchObject({ id: first.id, date: "2026-10-03", content: "改为有氧", bodyParts: ["有氧"], feeling: "轻松", revision: 2 });
  await diary.archiveActiveCycle();
  const archived = (await training.saveRecord({ id: first.id, cycleId, date: "2026-10-03", content: "归档后修改", bodyParts: ["有氧"], feeling: "轻松" })).trainingRecords[0];
  expect(archived).toMatchObject({ id: first.id, content: "归档后修改", revision: 3 });
  expect((await training.open()).records.filter((record) => record.id !== first.id)).toMatchObject([{ date: "2026-10-01", content: "另一条", bodyParts: ["有氧"] }]);
  await training.deleteRecord(first.id);
  expect((await training.open()).records).toMatchObject([{ date: "2026-10-01", content: "另一条" }]);
});

it("记录不能移到其他周期，删除不存在的记录被拒绝", async () => {
  const { training, cycleId, diary, day } = await setup();
  const record = (await training.saveRecord({ cycleId, date: "2026-10-04", content: "内容", feeling: "" })).trainingRecords[0];
  day("2026-12-27");
  await diary.startCycle({ startDate: "2026-12-27", dayType: "rest" });
  const otherCycleId = (await diary.openDiary()).activeCycle!.id;
  await expect(training.saveRecord({ id: record.id, cycleId: otherCycleId, date: "2026-12-27", content: "内容", feeling: "" })).rejects.toThrow("不能把训练记录移到其他周期");
  await expect(training.deleteRecord("missing-record")).rejects.toThrow("未找到训练记录");
});

it("旧未完成记录保留查看编辑，但保存确认前不计入周历", async () => {
  const { training, repository, cycleId, clock, diary } = await setup();
  const stored = (await repository.read())! as DiaryState;
  stored.training = trainingState({ records: [legacyRecord({ id: "old-incomplete", cycleId, date: "2026-10-03", title: "旧记录", content: "旧内容", bodyParts: ["胸"], completed: false })] });
  await repository.write(validateBackupState(stored));
  expect((await training.openWeek({ cycleId, date: "2026-10-03" })).days[5].records).toEqual([]);
  expect((await training.open()).records[0]).toMatchObject({ id: "old-incomplete", title: "旧记录", completed: false });
  await training.saveRecord({ id: "old-incomplete", cycleId, date: "2026-10-03", content: "旧内容", bodyParts: ["胸"], feeling: "" });
  expect((await training.openWeek({ cycleId, date: "2026-10-03" })).days[5].records).toMatchObject([{ id: "old-incomplete" }]);
  expect((await training.open()).records[0]).toMatchObject({ id: "old-incomplete", title: "旧记录", completed: true });
});

it("旧排期与旧实际记录在完整备份中保全，CSV 不把旧排期当成已训练", async () => {
  const { training, repository, cycleId, clock, diary } = await setup();
  const stored = (await repository.read())! as DiaryState;
  stored.training = trainingState({
    schedules: [legacySchedule({ id: "old-schedule", cycleId, date: "2026-10-04", title: "旧排期名称" })],
    records: [legacyRecord({ id: "old-linked", cycleId, date: "2026-10-04", scheduleId: "old-schedule", title: "旧实际名称", content: "旧实际内容", completed: true })],
  });
  await repository.write(validateBackupState(stored));
  const backup = createDiaryBackup({ repository, randomBytes: (length) => new Uint8Array(length) });
  const exported = JSON.parse(await backup.exportBackup());
  expect(exported.state.training.schedules).toMatchObject([{ id: "old-schedule", title: "旧排期名称" }]);
  expect(exported.state.training.records).toMatchObject([{ id: "old-linked", scheduleId: "old-schedule", title: "旧实际名称" }]);
  const target = createInMemoryDiaryRepository();
  await createDiaryBackup({ repository: target, randomBytes: (length) => new Uint8Array(length) }).restoreBackup(await backup.exportBackup());
  const reopened = createTrainingDiary({ repository: target, clock, diary });
  expect((await reopened.open()).records).toMatchObject([{ id: "old-linked", scheduleId: "old-schedule" }]);
  const csvText = await backup.exportCsv("training");
  expect(csvText).not.toContain("旧排期名称");
  expect(csvText).toContain("旧实际名称");
  expect(csvText.trim().split("\r\n")).toHaveLength(2);
  expect((await training.openWeek({ cycleId, date: "2026-10-04" })).days[6].records).toMatchObject([{ id: "old-linked" }]);
});

it("恢复拒绝悬挂排期关联和重复记录标识，完整备份不会接受无效部位", async () => {
  const { training, repository, cycleId, clock, diary } = await setup();
  await training.saveRecord({ cycleId, date: "2026-10-04", content: "内容", feeling: "" });
  const state = (await repository.read())! as DiaryState;
  const dangling = JSON.parse(JSON.stringify(state));
  dangling.training.schedules = [legacySchedule({ id: "dangling", cycleId: "missing", date: "2026-10-04" })];
  expect(() => validateBackupState(dangling)).toThrow("周期引用");
  const linked = JSON.parse(JSON.stringify(state));
  linked.training.schedules = [legacySchedule({ id: "linked", cycleId, date: "2026-10-04" })];
  linked.training.records[0].scheduleId = "missing-schedule";
  expect(() => validateBackupState(linked)).toThrow("关联无效");
  const duplicate = JSON.parse(JSON.stringify(state));
  duplicate.training.records.push({ ...duplicate.training.records[0] });
  expect(() => validateBackupState(duplicate)).toThrow("重复记录标识");
  await expect(training.savePlan({ title: "错误", content: "内容", bodyParts: ["invalid"] as never })).rejects.toThrow("部位");
  await expect(training.saveRecord({ cycleId, date: "2026-10-04", content: "内容", bodyParts: ["invalid"] as never, feeling: "" })).rejects.toThrow("部位");
});

it("自动图片按选择顺序取首个专用图，未分类按日期稳定，放纵日独立装饰", () => {
  expect(trainingImage("2026-10-04", ["腿", "肩", "胸"])).toBe("/static/training/shoulders.jpg");
  expect(trainingImage("2026-10-04", ["胸", "肩"])).toBe("/static/training/chest.jpg");
  expect(trainingImage("2026-10-04", ["背"])).toBe("/static/training/back.jpg");
  expect(trainingImage("2026-10-04", ["手臂"])).toBe("/static/training/arms.jpg");
  expect(trainingImage("2026-10-04", ["有氧"])).toBe("/static/training/cardio.jpg");
  expect(trainingImage("2026-10-04", ["腿", "其他"])).toBe(trainingImage("2026-10-04"));
  expect(trainingImage("2026-10-04")).toMatch(/^\/static\/training\/random-\d{2}\.jpg$/);
  expect(trainingImage("2026-10-04", ["胸"], true)).toBe("/static/training/indulgence.jpg");
});
