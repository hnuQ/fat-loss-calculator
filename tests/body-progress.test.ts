import { describe, expect, it } from "vitest";
import { createFatLossDiary } from "../src/application/fatLossDiary";
import { bodySummary } from "../src/domain/body";
import type { BodyMeasurements, DiaryState } from "../src/domain/diary";
import { createInMemoryDiaryRepository } from "../src/testing/inMemoryDiaryRepository";

async function setup(initial?: DiaryState) {
  const repository = createInMemoryDiaryRepository(initial);
  let today = "2026-10-01";
  const clock = { today: () => today, now: () => `${today}T12:00:00+08:00` };
  const dependencies = { repository, clock, platform: { kind: "test" as const, localPersistence: true, canvas: true } };
  const diary = createFatLossDiary(dependencies);
  if (!initial) await diary.establishProfile({ nickname: "测量测试", sex: "male", age: 30, heightCm: 175, currentWeightKg: 70, weeklyExercise: "medium", hasFatLossExperience: false, targetWeightKg: 65, dayType: "training" });
  return { diary, repository, reopen: () => createFatLossDiary(dependencies), day: (date: string) => { today = date; } };
}

describe("身体记录与真实进度公开用户旅程", () => {
  it("零点、单点、稀疏点、多点只返回真实称重与独立目标", async () => {
    const { diary, day } = await setup();
    expect(await diary.readWeightTrend()).toMatchObject({ points: [], targetWeightKg: 65 });
    await diary.saveBodyRecord({ measurements: { waistCm: 80 } });
    expect((await diary.readWeightTrend()).points).toEqual([]);
    await diary.recordWeight({ weightKg: 70 });
    expect((await diary.readWeightTrend()).points).toEqual([{ date: "2026-10-01", day: 1, weightKg: 70 }]);
    day("2026-10-10"); await diary.recordWeight({ weightKg: 69.5 });
    day("2026-12-29"); await diary.recordWeight({ weightKg: 68 });
    expect(await diary.readWeightTrend()).toEqual({ startDate: "2026-10-01", endDate: "2026-12-29", targetWeightKg: 65, points: [
      { date: "2026-10-01", day: 1, weightKg: 70 }, { date: "2026-10-10", day: 10, weightKg: 69.5 }, { date: "2026-12-29", day: 90, weightKg: 68 },
    ] });
    day("2026-10-05"); expect((await diary.openDiary()).isBlankDate).toBe(true);
  });

  it("当天创建、编辑、清空可选字段、删除并重开；测量不改变营养基准", async () => {
    const { diary, reopen, repository } = await setup();
    const baseline = (await diary.openDiary()).baseline;
    const saved = await diary.saveBodyRecord({ measurements: { weightKg: 69.86, bodyFatPercent: 22, waistCm: 80, chestCm: 95, hipCm: 100, thighCm: 55 } });
    const id = saved.bodyRecords[0].id;
    expect(saved.weights[0].weightKg).toBe(69.9);
    expect(saved.baseline).toEqual(baseline);
    expect((await reopen().openDiary()).bodyRecords).toEqual(saved.bodyRecords);
    const edited = await diary.saveBodyRecord({ id, measurements: { bodyFatPercent: 21.2 } });
    expect(edited.weights).toEqual([]);
    expect(edited.bodyRecords[0]).not.toHaveProperty("waistCm");
    expect(edited.bodyRecords[0].revision).toBe(2);
    await diary.deleteBodyRecord(id);
    expect((await reopen().openDiary()).bodyRecords).toEqual([]);
    expect((await repository.read())?.bodyOverrides?.[0]).toMatchObject({ id, deletedAt: "2026-10-01T12:00:00+08:00" });
  });

  it.each<BodyMeasurements>([{}, { weightKg: 0 }, { waistCm: -1 }, { chestCm: NaN }, { hipCm: Infinity }, { thighCm: "文本" as never }, { bodyFatPercent: 100 }, { bodyFatPercent: 0 }, { bodyFatPercent: 99.99 }, { weightKg: 0.001 }, { weightKg: 1e308 }])("拒绝无效测量且不创建记录 %j", async (measurements) => {
    const { diary } = await setup();
    await expect(diary.saveBodyRecord({ measurements })).rejects.toThrow();
    expect((await diary.openDiary()).bodyRecords).toEqual([]);
  });

  it("各项只取真实测量的最新值，无目标时无目标参考值，删空后趋势无残留", async () => {
    const { diary, day } = await setup();
    await diary.establishProfile({ nickname: "无目标测试", sex: "male", age: 30, heightCm: 175, currentWeightKg: 70, weeklyExercise: "medium", hasFatLossExperience: false });
    await diary.saveBodyRecord({ measurements: { bodyFatPercent: 22, waistCm: 80 } });
    day("2026-10-02");
    const record = (await diary.saveBodyRecord({ measurements: { weightKg: 69 } })).bodyRecords.find((entry) => entry.date === "2026-10-02")!;
    const summary = bodySummary((await diary.openDiary()).bodyRecords);
    expect(summary[1]).toMatchObject({ latest: 22, latestDate: "2026-10-01", count: 1, difference: undefined });
    expect((await diary.readWeightTrend()).targetWeightKg).toBeUndefined();
    await diary.deleteBodyRecord(record.id);
    expect((await diary.readWeightTrend()).points).toEqual([]);
    expect((await diary.openDiary()).isBlankDate).toBe(true);
  });

  it("旧追加链保留原值、前次有效值、时间原因并更新趋势与摘要", async () => {
    const { diary, day, repository, reopen } = await setup();
    const saved = await diary.saveBodyRecord({ measurements: { weightKg: 700, bodyFatPercent: 22, waistCm: 800 } });
    const source = saved.bodyRecords[0];
    day("2026-10-02");
    await expect(diary.correctBodyRecord({ id: source.id, measurements: { weightKg: 70 }, reason: "  " })).rejects.toThrow("原因");
    await expect(diary.correctBodyRecord({ id: source.id, measurements: { weightKg: 700, bodyFatPercent: 22, waistCm: 800 }, reason: "无变化" })).rejects.toThrow("相同");
    await diary.correctBodyRecord({ id: source.id, measurements: { weightKg: 70, bodyFatPercent: 22, waistCm: 80 }, reason: " 多录了一个零 " });
    await diary.correctBodyRecord({ id: source.id, measurements: { weightKg: 70.1, bodyFatPercent: 22, waistCm: 80 }, reason: "核对秤读数" });
    const state = await repository.read();
    expect(state?.bodyRecords).toEqual([source]);
    expect(state?.bodyCorrections?.[0]).toMatchObject({ original: source, previous: source, reason: "多录了一个零", createdAt: "2026-10-02T12:00:00+08:00" });
    expect(state?.bodyCorrections?.[1]).toMatchObject({ previousCorrectionId: state?.bodyCorrections?.[0].id, original: source, previous: { weightKg: 70 }, corrected: { weightKg: 70.1 } });
    await diary.saveBodyRecord({ measurements: { weightKg: 69, bodyFatPercent: 21, waistCm: 79 } });
    const restored = await reopen().openDiary();
    expect(restored.originalBodyRecords[0]).toEqual(source);
    expect((await reopen().readWeightTrend()).points.map((point) => point.weightKg)).toEqual([70.1, 69]);
    expect(bodySummary(restored.bodyRecords).slice(0, 3)).toMatchObject([
      { latest: 69, difference: -1.1 }, { latest: 21, difference: -1 }, { latest: 79, difference: -1 },
    ]);
  });

  it("旧接口当天不允许历史纠错；历史归档纠错保持周期隔离，随后可普通删除", async () => {
    const { diary, day } = await setup();
    const record = (await diary.recordWeight({ weightKg: 70 })).bodyRecords[0];
    await expect(diary.correctBodyRecord({ id: record.id, measurements: { weightKg: 69 }, reason: "错误" })).rejects.toThrow("结束日期");
    await diary.archiveActiveCycle();
    day("2026-10-02");
    await diary.startCycle({ startDate: "2026-10-02", dayType: "rest" });
    await diary.recordWeight({ weightKg: 68 });
    await diary.correctBodyRecord({ id: record.id, measurements: { weightKg: 69 }, reason: "秤读数录错" });
    expect((await diary.readWeightTrend(record.cycleId)).points.map((point) => point.weightKg)).toEqual([69]);
    expect((await diary.readWeightTrend()).points.map((point) => point.weightKg)).toEqual([68]);
    await diary.deleteBodyRecord(record.id);
    expect((await diary.readWeightTrend(record.cycleId)).points).toEqual([]);
    expect((await diary.readWeightTrend()).points.map((point) => point.weightKg)).toEqual([68]);
  });

  it("旧版体重只迁移一次，删除后不复活，原旧数据保留", async () => {
    const first = await setup();
    const legacy = (await first.repository.read())!;
    delete legacy.bodyRecords; delete legacy.bodyCorrections;
    legacy.weights = [{ id: "legacy-weight", date: "2026-10-01", weightKg: 70 }];
    const { diary, reopen, repository } = await setup(legacy);
    expect((await diary.openDiary()).bodyRecords[0]).toMatchObject(legacy.weights[0]);
    await diary.deleteBodyRecord("legacy-weight");
    expect((await reopen().openDiary()).bodyRecords).toEqual([]);
    expect((await repository.read())?.weights[0].weightKg).toBe(70);
  });
});
