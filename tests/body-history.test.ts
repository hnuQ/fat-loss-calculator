import { expect, it } from "vitest";
import { createFatLossDiary } from "../src/application/fatLossDiary";
import { createInMemoryDiaryRepository } from "../src/testing/inMemoryDiaryRepository";
import { createDiaryBackup } from "../src/application/diaryBackup";
import { bodySummary } from "../src/domain/body";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { sha256 } from "@noble/hashes/sha256";

async function setup() {
  const repository = createInMemoryDiaryRepository();
  let today = "2026-10-01";
  const dependencies = { repository, clock: { today: () => today, now: () => `${today}T12:00:00+08:00` }, platform: { kind: "test" as const, localPersistence: true, canvas: true } };
  const diary = createFatLossDiary(dependencies);
  await diary.establishProfile({ nickname: "测试", sex: "male", age: 30, heightCm: 175, currentWeightKg: 70, weeklyExercise: "medium", hasFatLossExperience: false, targetWeightKg: 65, dayType: "training" });
  return { repository, diary, reopen: () => createFatLossDiary(dependencies), day: (date: string) => { today = date; } };
}

it("在历史和归档周期补录编辑删除身体测量，无需原因且保持周期隔离", async () => {
  const { diary, day, reopen } = await setup();
  const cycle = (await diary.openDiary()).activeCycle!;
  const record = (await diary.saveBodyRecord({ measurements: { weightKg: 70 } })).bodyRecords[0];
  day("2026-10-04");
  const edited = await diary.saveBodyRecord({ id: record.id, measurements: { weightKg: 69.86, bodyFatPercent: 22 } });
  expect(edited.bodyRecords[0]).toMatchObject({ date: "2026-10-01", weightKg: 69.9, bodyFatPercent: 22 });
  await diary.archiveActiveCycle();
  await diary.startCycle({ startDate: "2026-10-04", dayType: "rest" });
  await diary.saveBodyRecord({ cycleId: cycle.id, date: "2026-10-02", measurements: { waistCm: 80 } });
  expect((await diary.openDiary()).bodyRecords).toEqual([]);
  const archived = await diary.openDiary({ cycleId: cycle.id });
  expect(archived.bodyRecords).toHaveLength(2);
  await diary.deleteBodyRecord(record.id);
  expect((await reopen().openDiary({ cycleId: cycle.id })).bodyRecords).toMatchObject([{ date: "2026-10-02", waistCm: 80 }]);
  expect((await reopen().readWeightTrend(cycle.id)).points).toEqual([]);
});

it("旧纠错的有效值可直接改写和清空字段，删除后经备份恢复不会复活", async () => {
  const { diary, day, repository, reopen } = await setup();
  const source = (await diary.saveBodyRecord({ measurements: { weightKg: 700, waistCm: 800 } })).bodyRecords[0];
  day("2026-10-04");
  await diary.correctBodyRecord({ id: source.id, measurements: { weightKg: 70, waistCm: 80 }, reason: "旧纠错" });
  const backup = createDiaryBackup({ repository, randomBytes: (length) => new Uint8Array(length) });
  const legacyBackup = await backup.exportBackup();
  await backup.restoreBackup(legacyBackup);
  expect((await reopen().readBodyTrend("weightKg")).points[0].value).toBe(70);
  await diary.saveBodyRecord({ id: source.id, measurements: { weightKg: 68, bodyFatPercent: 20 } });
  await diary.saveBodyRecord({ date: "2026-10-03", measurements: { weightKg: 67, bodyFatPercent: 19 } });
  expect((await reopen().readWeightTrend()).points.map((point) => point.weightKg)).toEqual([68, 67]);
  expect((await reopen().readBodyTrend("waistCm")).points).toEqual([]);
  expect(bodySummary((await diary.openDiary()).bodyRecords)[1]).toMatchObject({ latest: 19, difference: -1 });
  expect((await repository.read())?.bodyCorrections?.[0].corrected.weightKg).toBe(70);
  const editedBackup = await backup.exportBackup();
  await backup.restoreBackup(editedBackup);
  expect((await reopen().readBodyTrend("weightKg")).points.map((point) => point.value)).toEqual([68, 67]);
  const csv = await backup.exportCsv("body");
  expect(csv).toContain('"有效","","","","68","20",""');
  expect(csv).toContain("历史审计（非当前值）");
  await diary.deleteBodyRecord(source.id);
  await backup.restoreBackup(await backup.exportBackup());
  expect((await reopen().openDiary()).bodyRecords.map((record) => record.weightKg)).toEqual([67]);
  expect((await backup.exportCsv("body")).split("\r\n").filter((row) => row.includes('"有效"'))).toHaveLength(1);
  await expect(diary.saveBodyRecord({ id: source.id, measurements: { weightKg: 66 } })).rejects.toThrow("未找到");
  await expect(diary.correctBodyRecord({ id: source.id, measurements: { weightKg: 66 }, reason: "旧接口" })).rejects.toThrow("直接编辑或删除");
});

it("补录拒绝周期外、未来和无效日期且不改变存储，编辑不能移到另一周期", async () => {
  const { diary, day, repository } = await setup();
  const source = (await diary.recordWeight({ weightKg: 70 })).bodyRecords[0];
  day("2026-10-04");
  const before = await repository.read();
  for (const date of ["2026-09-30", "2026-12-30", "2026-10-05", "2026-02-30"]) {
    await expect(diary.saveBodyRecord({ cycleId: source.cycleId, date, measurements: { weightKg: 69 } })).rejects.toThrow();
    expect(await repository.read()).toEqual(before);
  }
  await expect(diary.saveBodyRecord({ id: source.id, cycleId: "other-cycle", measurements: { weightKg: 69 } })).rejects.toThrow("其他周期");
  await diary.saveBodyRecord({ id: source.id, date: "2026-10-03", measurements: { weightKg: 69 } });
  expect((await diary.readWeightTrend()).points).toEqual([{ date: "2026-10-03", day: 3, weightKg: 69 }]);
});

it("六项趋势按真实日期和各自单位绘制；空、单点、恒定、稀疏值有明确轴范围", async () => {
  const { diary, day } = await setup();
  const empty = await diary.readBodyTrend("waistCm");
  expect(empty).toMatchObject({ unit: "cm", points: [], target: undefined });
  expect(empty.axis.maximum).toBeGreaterThan(empty.axis.minimum);
  await diary.saveBodyRecord({ measurements: { weightKg: 70, bodyFatPercent: 22, waistCm: 80, chestCm: 95, hipCm: 100, thighCm: 55 } });
  const single = await diary.readBodyTrend("bodyFatPercent");
  expect(single).toMatchObject({ unit: "%", points: [{ date: "2026-10-01", day: 1, value: 22 }], target: undefined });
  expect(single.axis.minimum).toBeGreaterThan(0);
  expect(single.axis.ticks).toContain(single.axis.minimum);
  expect(single.axis.ticks).toContain(single.axis.maximum);
  day("2026-10-04");
  await diary.saveBodyRecord({ measurements: { weightKg: 69, bodyFatPercent: 22, waistCm: 79 } });
  const fat = await diary.readBodyTrend("bodyFatPercent");
  expect(fat.points.map((point) => [point.day, point.value])).toEqual([[1, 22], [4, 22]]);
  expect(fat.axis.minimum).toBeLessThan(22);
  expect(fat.axis.maximum).toBeGreaterThan(22);
  expect((await diary.readBodyTrend("weightKg")).target).toBe(65);
  for (const [metric, value] of [["waistCm", 80], ["chestCm", 95], ["hipCm", 100], ["thighCm", 55]] as const) {
    const trend = await diary.readBodyTrend(metric);
    expect(trend).toMatchObject({ unit: "cm", target: undefined });
    expect(trend.points[0].value).toBe(value);
  }
});

it.each([2, 3])("旧模式 %s 缺周期标识的身体及纠错恢复后可编辑、删除、再备份，不修改旧审计", async (schemaVersion) => {
  const { diary, day, repository, reopen } = await setup();
  const source = (await diary.recordWeight({ weightKg: 700 })).bodyRecords[0];
  day("2026-10-04");
  await diary.correctBodyRecord({ id: source.id, measurements: { weightKg: 70 }, reason: "旧纠错" });
  const backup = createDiaryBackup({ repository, randomBytes: (length) => new Uint8Array(length) });
  const file = JSON.parse(await backup.exportBackup());
  file.schemaVersion = schemaVersion;
  delete file.state.bodyRecords[0].cycleId;
  for (const key of ["original", "previous", "corrected"]) delete file.state.bodyCorrections[0][key].cycleId;
  const { format, version, createdAt, migration, state } = file;
  file.checksum = bytesToHex(sha256(utf8ToBytes(JSON.stringify({ format, version, schemaVersion, createdAt, migration, state }))));
  await backup.restoreBackup(JSON.stringify(file));
  expect((await reopen().readBodyTrend("weightKg")).points[0].value).toBe(70);
  await diary.saveBodyRecord({ id: source.id, measurements: { weightKg: 69 } });
  await backup.restoreBackup(await backup.exportBackup());
  expect((await reopen().readWeightTrend()).points[0].weightKg).toBe(69);
  expect((await repository.read())?.bodyCorrections).toEqual(file.state.bodyCorrections);
  await diary.deleteBodyRecord(source.id);
  await backup.restoreBackup(await backup.exportBackup());
  expect((await reopen().readBodyTrend("weightKg")).points).toEqual([]);
});

it("旧记录归属有歧义时必须选择周期；编辑确定归属后删除重叠的其他周期不影响它", async () => {
  const { diary, day, repository } = await setup();
  const source = (await diary.recordWeight({ weightKg: 70 })).bodyRecords[0];
  day("2026-10-04");
  const stored = (await repository.read())!;
  delete stored.bodyRecords![0].cycleId;
  await repository.write(stored);
  await diary.archiveActiveCycle();
  const current = (await diary.startCycle({ startDate: "2026-10-01", dayType: "rest" })).activeCycle!;
  await expect(diary.saveBodyRecord({ id: source.id, measurements: { weightKg: 69 } })).rejects.toThrow("所属");
  await diary.saveBodyRecord({ id: source.id, cycleId: source.cycleId, measurements: { weightKg: 69 } });
  expect((await diary.openDiary({ cycleId: current.id })).bodyRecords).toEqual([]);
  await diary.archiveActiveCycle();
  await diary.deleteArchivedCycle(current.id);
  expect((await diary.openDiary({ cycleId: source.cycleId })).bodyRecords[0].weightKg).toBe(69);
});

it("备份拒绝孤立、跨周期、重复及回退版本的身体覆盖值，失败不替换原数据", async () => {
  const { diary, repository } = await setup();
  const source = (await diary.recordWeight({ weightKg: 70 })).bodyRecords[0];
  await diary.saveBodyRecord({ id: source.id, measurements: { weightKg: 69 } });
  const backup = createDiaryBackup({ repository, randomBytes: (length) => new Uint8Array(length) });
  const content = await backup.exportBackup();
  const before = await repository.read();
  for (const mutate of [
    (state: any) => { state.bodyOverrides[0].id = "orphan"; },
    (state: any) => { state.bodyOverrides[0].cycleId = "other-cycle"; },
    (state: any) => { state.bodyOverrides[0].revision = 1; },
    (state: any) => { state.bodyOverrides.push({ ...state.bodyOverrides[0] }); },
    (state: any) => { state.bodyOverrides[0].ownerId = "other-user"; },
  ]) {
    const file = JSON.parse(content); mutate(file.state);
    const { format, version, schemaVersion, createdAt, migration, state } = file;
    file.checksum = bytesToHex(sha256(utf8ToBytes(JSON.stringify({ format, version, schemaVersion, createdAt, migration, state }))));
    await expect(backup.restoreBackup(JSON.stringify(file))).rejects.toThrow();
    expect(await repository.read()).toEqual(before);
  }
});
