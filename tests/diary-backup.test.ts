import { describe, expect, it } from "vitest";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, utf8ToBytes } from "@noble/hashes/utils";
import { createDiaryBackup, decodeUtf8, encodeUtf8 } from "../src/application/diaryBackup";
import { createFatLossDiary } from "../src/application/fatLossDiary";
import { createTrainingDiary } from "../src/application/trainingDiary";
import { createFoodLibrary } from "../src/application/foodLibrary";
import { createInMemoryDiaryRepository } from "../src/testing/inMemoryDiaryRepository";
const randomBytes = (length: number) => globalThis.crypto.getRandomValues(new Uint8Array(length));

const profile = { nickname: "备份测试", sex: "female" as const, age: 30, heightCm: 165, currentWeightKg: 65, weeklyExercise: "medium" as const, hasFatLossExperience: true, targetWeightKg: 60, dayType: "training" as const };
async function fixture() {
  const repository = createInMemoryDiaryRepository();
  let today = "2026-10-02";
  const clock = { today: () => today, now: () => `${today}T12:00:00+08:00` };
  const diary = createFatLossDiary({ repository, clock, platform: { kind: "test", localPersistence: true, canvas: true } });
  const training = createTrainingDiary({ repository, clock, diary, reminders: { capability: () => ({ supported: true, message: "测试" }), requestPermission: async () => true, replace: async () => {} } });
  await diary.establishProfile({ ...profile, userTarget: { carbohydrateGrams: 100, proteinGrams: 100, fatGrams: 50 } });
  await diary.saveMeal({ mealSlot: "breakfast", foodId: diary.searchFoods("燕麦")[0].id, amount: 100 });
  await diary.saveBodyRecord({ measurements: { weightKg: 65, waistCm: 80 } });
  const foods = createFoodLibrary({ repository, now: clock.now });
  const custom = await foods.saveCustomFood({ name: "测试自定义食材", basis: "per100g", carbohydrateGrams: 20, proteinGrams: 10, fatGrams: 5 });
  await foods.toggleFavorite(custom.id);
  await diary.saveMeal({ mealSlot: "lunch", foodId: custom.id, amount: 100 });
  await foods.deleteCustomFood(custom.id);
  const plan = (await training.savePlan({ title: "自填训练", content: '内容,含"引号"\n第二行' })).plans[0];
  await training.saveRecord({ planId: plan.id, title: plan.title, content: plan.content, completed: true, feeling: "=SUM(1,2)" });
  await training.deletePlan(plan.id);
  await training.saveReminder({ enabled: true, weekdays: [1, 3], time: "18:30" });
  today = "2026-10-03";
  const state = (await repository.read())!;
  await diary.correctMeal({ id: state.meals[0].id, amount: 140, reason: "数量录入错误" });
  await diary.correctMeal({ id: state.meals[0].id, amount: 180, reason: "再次核实数量" });
  await diary.correctBodyRecord({ id: state.bodyRecords![0].id, measurements: { weightKg: 64.5, waistCm: 79 }, reason: "测量录入错误" });
  await diary.archiveActiveCycle();
  await diary.startCycle({ startDate: today, dayType: "rest" });
  await diary.addMealGroup("自定义餐次");
  return { repository, diary, clock, backup: createDiaryBackup({ repository, randomBytes, now: clock.now }) };
}
function rechecksum(file: Record<string, unknown>) {
  const { format, version, schemaVersion, createdAt, migration, state } = file;
  file.checksum = bytesToHex(sha256(utf8ToBytes(JSON.stringify({ format, version, schemaVersion, createdAt, migration, state }))));
  return JSON.stringify(file);
}

describe("完整备份恢复公开旅程", () => {
  it("不依赖 TextEncoder 的跨端 UTF-8 编解码保留中文、emoji、换行和零字节", () => {
    const text = "中文😀\n\u0000";
    expect(encodeUtf8(text)).toEqual(utf8ToBytes(text));
    expect(decodeUtf8(encodeUtf8(text))).toBe(text);
  });
  it("所有实体、归档周期、纠错链、训练快照及设置明文往返完整保留", async () => {
    const { repository, backup } = await fixture();
    const before = await repository.read();
    const content = await backup.exportBackup();
    expect(content).toContain("备份测试");
    const target = createInMemoryDiaryRepository();
    await createDiaryBackup({ repository: target, randomBytes }).restoreBackup(content);
    expect(await target.read()).toEqual(before);
    expect(JSON.parse(content)).toMatchObject({ version: 1, schemaVersion: 4, migration: "cycle-diary-v1", protection: "none" });
  });
  it("密码正确恢复；错误密码和篡改密文拒绝且保持原数据", async () => {
    const { repository, backup } = await fixture();
    const content = await backup.exportBackup("测试密码abcd");
    expect(content).not.toContain("备份测试"); expect(content).not.toContain("测试密码abcd");
    const target = createInMemoryDiaryRepository({ meals: [], weights: [] });
    const service = createDiaryBackup({ repository: target, randomBytes });
    await expect(service.restoreBackup(content, "错误密码abcd")).rejects.toThrow("密码错误");
    expect(await target.read()).toEqual({ meals: [], weights: [] });
    const damaged = JSON.parse(content); damaged.ciphertext = (damaged.ciphertext.startsWith("00") ? "01" : "00") + damaged.ciphertext.slice(2);
    await expect(service.restoreBackup(JSON.stringify(damaged), "测试密码abcd")).rejects.toThrow("损坏");
    expect(await target.read()).toEqual({ meals: [], weights: [] });
    await service.restoreBackup(content, "测试密码abcd"); expect(await target.read()).toEqual(await repository.read());
    expect(JSON.parse(await backup.exportBackup("测试密码abcd")).nonce).not.toBe(JSON.parse(content).nonce);
  }, 20000);
  it("旧模式恢复后经既有迁移可打开，再导出当前模式稳定往返", async () => {
    const { backup } = await fixture();
    const file = JSON.parse(await backup.exportBackup()); file.schemaVersion = 1;
    file.state = { profile: { ...profile, cycleStartDate: "2026-10-02" }, dayType: "training", baseline: { carbohydrateGrams: 100, proteinGrams: 100, fatGrams: 50, energyKcal: 1250 }, meals: [], weights: [{ id: "old-weight", date: "2026-10-02", weightKg: 65 }] };
    delete file.state.profile.dayType;
    const target = createInMemoryDiaryRepository(); const service = createDiaryBackup({ repository: target, randomBytes });
    await service.restoreBackup(rechecksum(file));
    const diary = createFatLossDiary({ repository: target, clock: { today: () => "2026-10-03" }, platform: { kind: "test", localPersistence: true, canvas: true } });
    expect((await diary.openDiary()).cycles).toHaveLength(1);
    const current = await service.exportBackup(); expect(JSON.parse(current).schemaVersion).toBe(4);
    const before = await target.read(); await service.restoreBackup(current); expect(await target.read()).toEqual(before);
  });
  it("损坏、不完整、版本未知、字段类型错误及断裂纠错链都不写入", async () => {
    const { repository, backup } = await fixture(); const before = await repository.read();
    const text = await backup.exportBackup();
    const missing = JSON.parse(text); delete missing.state.meals;
    const wrong = JSON.parse(text); wrong.state.profile.age = "30";
    const chain = JSON.parse(text); chain.state.mealCorrections[1].previousCorrectionId = "missing";
    const secret = JSON.parse(text); secret.state.token = "placeholder";
    for (const content of ["not json", "日期,体重\r\n", text.slice(0, -5), text.replace('"version":1', '"version":99'), rechecksum(missing), rechecksum(wrong), rechecksum(chain), rechecksum(secret)]) {
      await expect(backup.restoreBackup(content)).rejects.toThrow(); expect(await repository.read()).toEqual(before);
    }
  });
  it("存储失败不产生分段写入；缺安全随机源拒绝密码导出", async () => {
    const { backup } = await fixture(); const text = await backup.exportBackup();
    let writes = 0; const stored = { meals: [], weights: [] };
    const target = { read: async () => stored, write: async () => { writes++; throw new Error("存储失败"); } };
    await expect(createDiaryBackup({ repository: target, randomBytes }).restoreBackup(text)).rejects.toThrow("存储失败");
    expect(writes).toBe(1); expect(await target.read()).toEqual(stored);
    await expect(createDiaryBackup({ repository: target, randomBytes: () => { throw new Error("无安全随机源"); } }).exportBackup("password123")).rejects.toThrow("无安全随机源");
  });
  it("三类 CSV 的 UTF-8 中文、纠错、快照、引号和换行回读正确，公式文本不执行", async () => {
    const { backup } = await fixture();
    for (const kind of ["body", "meals", "training"] as const) {
      const text = await backup.exportCsv(kind); expect(decodeUtf8(utf8ToBytes(text))).toBe(text);
      await expect(backup.restoreBackup(text)).rejects.toThrow("CSV");
    }
    expect(await backup.exportCsv("body")).toContain("测量录入错误");
    expect(await backup.exportCsv("meals")).toContain("再次核实数量");
    expect(await backup.exportCsv("training")).toContain('内容,含""引号""\n第二行');
    expect(await backup.exportCsv("training")).toContain("'=SUM(1,2)");
  });
});
