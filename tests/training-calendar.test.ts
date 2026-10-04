import { expect, it } from "vitest";
import { createFatLossDiary } from "../src/application/fatLossDiary";
import { createTrainingDiary } from "../src/application/trainingDiary";
import { createInMemoryDiaryRepository } from "../src/testing/inMemoryDiaryRepository";
import { createDiaryBackup } from "../src/application/diaryBackup";
import { trainingImage } from "../src/application/trainingImages";
import { validateBackupState } from "../src/domain/backupSchema";

async function setup() {
  const repository = createInMemoryDiaryRepository();
  let today = "2026-10-04";
  const clock = { today: () => today };
  const diary = createFatLossDiary({ repository, clock, platform: { kind: "test", localPersistence: true, canvas: true } });
  await diary.establishProfile({ nickname: "测试", sex: "male", age: 30, heightCm: 175, currentWeightKg: 70, weeklyExercise: "medium", hasFatLossExperience: false, dayType: "training" });
  const training = createTrainingDiary({ repository, clock, diary, reminders: { capability: () => ({ supported: false, message: "" }), requestPermission: async () => false, replace: async () => {} } });
  return { repository, clock, diary, training, day: (date: string) => { today = date; } };
}

it("临时训练默认仅存记录，可选择同时保存独立模板及有序部位", async () => {
  const { training } = await setup();
  const input = { title: "胸肩", content: "自填内容", completed: false, feeling: "", bodyParts: ["肩", "胸"] as const };
  await training.saveRecord({ ...input, bodyParts: [...input.bodyParts] });
  expect((await training.open()).plans).toHaveLength(0);
  const saved = await training.saveRecord({ ...input, bodyParts: [...input.bodyParts], saveAsPlan: true });
  const plan = (await training.open()).plans[0];
  expect(plan.bodyParts).toEqual(["肩", "胸"]);
  await training.savePlan({ id: plan.id, title: "新版", content: "其他", bodyParts: ["背"] });
  expect(saved.trainingRecords[1]).toMatchObject({ title: "胸肩", content: "自填内容", bodyParts: ["肩", "胸"] });
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

it("周期边界、过去排期及历史实际锁定，完整备份恢复并随归档周期删除", async () => {
  const { training, diary, repository, day } = await setup();
  const cycle = (await diary.openDiary()).activeCycle!;
  const input = { cycleId: cycle.id, title: "安排", content: "内容", bodyParts: ["腿"] as ["腿"] };
  for (const date of ["2026-10-03", "2027-01-02", "2026-02-30"]) await expect(training.saveSchedule({ ...input, date })).rejects.toThrow();
  const schedule = await training.saveSchedule({ ...input, date: "2026-10-04" });
  await training.saveRecord({ scheduleId: schedule.id, title: "实录", content: "调整", completed: true, feeling: "", bodyParts: ["有氧"] });
  await training.saveSchedule({ ...input, date: cycle.endDate });
  const end = await training.openWeek({ cycleId: cycle.id, date: cycle.endDate });
  expect(end.days.filter((item) => item.inCycle).map((item) => item.date)).toEqual(["2026-12-28", "2026-12-29", "2026-12-30", "2026-12-31", "2027-01-01"]);
  day("2026-10-05");
  await expect(training.saveSchedule({ ...input, id: schedule.id, date: "2026-10-06" })).rejects.toThrow();
  await expect(training.deleteSchedule(schedule.id)).rejects.toThrow();
  expect((await training.openWeek({ cycleId: cycle.id, date: "2026-10-04" })).days[6].projects[0].completed).toBe(true);
  const backup = createDiaryBackup({ repository, randomBytes: (length) => new Uint8Array(length) });
  const content = await backup.exportBackup();
  await repository.write({ meals: [], weights: [] });
  await backup.restoreBackup(content);
  expect((await training.open()).schedules).toHaveLength(2);
  expect((await training.open()).records[0].bodyParts).toEqual(["有氧"]);
  await diary.archiveActiveCycle();
  await diary.deleteArchivedCycle(cycle.id);
  expect((await training.open()).schedules).toEqual([]);
  expect((await training.open()).records).toEqual([]);
});

it("一天多排期独立于模板，只有关联实际确认才在周历完成，实际改写不改排期", async () => {
  const { training, diary } = await setup();
  const cycle = (await diary.openDiary()).activeCycle!;
  const plan = (await training.savePlan({ title: "原计划", content: "原内容", bodyParts: ["胸"] })).plans[0];
  const first = await training.saveSchedule({ cycleId: cycle.id, date: "2026-10-04", planId: plan.id, title: plan.title, content: plan.content, bodyParts: plan.bodyParts });
  await training.saveSchedule({ cycleId: cycle.id, date: "2026-10-04", title: "有氧", content: "散步" });
  await training.savePlan({ id: plan.id, title: "新版", content: "新内容" });
  await training.deletePlan(plan.id);
  let week = await training.openWeek({ cycleId: cycle.id, date: "2026-10-04" });
  expect(week.days.map((day) => day.date)).toEqual(["2026-09-28", "2026-09-29", "2026-09-30", "2026-10-01", "2026-10-02", "2026-10-03", "2026-10-04"]);
  expect(week.days[6].projects).toMatchObject([{ title: "原计划", content: "原内容", completed: false }, { title: "有氧", completed: false }]);
  await training.saveRecord({ scheduleId: first.id, title: "实际改写", content: "减少一组", bodyParts: ["肩"], completed: true, feeling: "" });
  week = await training.openWeek({ cycleId: cycle.id, date: "2026-10-04" });
  expect(week.days[6].projects[0]).toMatchObject({ title: "原计划", content: "原内容", completed: true, record: { title: "实际改写", bodyParts: ["肩"] } });
});

it("旧无分类模板与记录可重开使用，排期、记录不回填营养，删除排期保留实际", async () => {
  const { training, diary, repository } = await setup();
  const before = await diary.openDiary();
  const plan = (await training.savePlan({ title: "旧计划", content: "旧内容" })).plans[0];
  const record = (await training.saveRecord({ title: "旧记录", content: "旧内容", completed: false, feeling: "" })).trainingRecords[0];
  const legacy = (await repository.read())!;
  delete legacy.training!.plans[0].bodyParts;
  delete legacy.training!.records[0].bodyParts;
  await repository.write(validateBackupState(legacy));
  expect((await training.open()).plans[0].title).toBe(plan.title);
  expect((await training.open()).records[0].title).toBe(record.title);
  const schedule = await training.saveSchedule({ cycleId: before.activeCycle!.id, date: before.today, title: "训练", content: "内容" });
  const actual = await training.saveRecord({ scheduleId: schedule.id, title: "实际", content: "变更", completed: true, feeling: "" });
  await expect(training.saveSchedule({ ...schedule, date: "2026-10-05" })).rejects.toThrow("实际记录");
  await expect(training.saveRecord({ scheduleId: schedule.id, title: "重复", content: "内容", completed: true, feeling: "" })).rejects.toThrow("已有实际记录");
  await training.deleteSchedule(schedule.id);
  const after = await diary.openDiary();
  expect(after.trainingRecords[1]).toMatchObject({ id: actual.trainingRecords[1].id, title: "实际", completed: true });
  expect(after.trainingRecords[1].scheduleId).toBeUndefined();
  for (const key of ["baseline", "actual", "remaining", "dayType"] as const) expect(after[key]).toEqual(before[key]);
});

it("恢复拒绝悬挂排期和重复关联，完整备份不会接受无效分类", async () => {
  const { training, diary, repository } = await setup();
  const snapshot = await diary.openDiary();
  const schedule = await training.saveSchedule({ cycleId: snapshot.activeCycle!.id, date: snapshot.today, title: "训练", content: "内容" });
  await training.saveRecord({ scheduleId: schedule.id, title: "实际", content: "内容", completed: false, feeling: "" });
  const state = (await repository.read())!;
  const dangling = JSON.parse(JSON.stringify(state));
  dangling.training.schedules[0].cycleId = "missing";
  expect(() => validateBackupState(dangling)).toThrow("周期引用");
  const duplicate = JSON.parse(JSON.stringify(state));
  duplicate.training.records.push({ ...duplicate.training.records[0], id: "another" });
  expect(() => validateBackupState(duplicate)).toThrow("关联无效");
  await expect(training.savePlan({ title: "错误", content: "内容", bodyParts: ["invalid"] as never })).rejects.toThrow("部位");
});
