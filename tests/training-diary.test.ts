import { describe, expect, it } from "vitest";
import { createFatLossDiary } from "../src/application/fatLossDiary";
import { createTrainingDiary } from "../src/application/trainingDiary";
import { createInMemoryDiaryRepository } from "../src/testing/inMemoryDiaryRepository";

async function setup() {
  const repository = createInMemoryDiaryRepository();
  let today = "2026-10-04";
  const clock = { today: () => today, now: () => `${today}T12:00:00+08:00` };
  const diary = createFatLossDiary({ repository, clock, platform: { kind: "test", localPersistence: true, canvas: true } });
  const dependencies = { repository, clock, diary };
  const training = createTrainingDiary(dependencies);
  await diary.establishProfile({ nickname: "训练测试", sex: "male", age: 30, heightCm: 175, currentWeightKg: 70, weeklyExercise: "medium", hasFatLossExperience: false });
  const cycleId = (await diary.startCycle({ startDate: "2026-09-28", dayType: "training" })).activeCycle!.id;
  return { repository, diary, training, dependencies, cycleId, reopen: () => createTrainingDiary(dependencies), day: (date: string) => { today = date; } };
}
const fields = { content: "自己选择的训练内容", feeling: "" };

describe("训练计划与实际记录公开旅程", () => {
  it("旧状态打开不生成计划或记录", async () => {
    const { training, repository } = await setup();
    const before = await repository.read();
    expect(await training.open()).toMatchObject({ plans: [], records: [] });
    expect(await repository.read()).toEqual(before);
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
    await training.saveRecord({ id: record.id, cycleId, planId: plan.id, date: record.date, content: "修改实际内容", bodyParts: record.bodyParts, feeling: record.feeling });
    expect((await training.open()).records[0]).toMatchObject({ title: record.title, content: "修改实际内容", planId: record.planId });
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
});
