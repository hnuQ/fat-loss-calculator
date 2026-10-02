import { describe, expect, it } from "vitest";

import { createFatLossDiary } from "../src/application/fatLossDiary";
import { createInMemoryDiaryRepository } from "../src/testing/inMemoryDiaryRepository";

describe("减脂记录公开用户旅程", () => {
  it("建档、搜索并保存餐食、重开读取、记录体重并返回 90 天趋势", async () => {
    const repository = createInMemoryDiaryRepository();
    const clock = { today: () => "2026-09-29" };
    const platform = {
      kind: "test" as const,
      localPersistence: true,
      canvas: true,
    };
    const firstSession = createFatLossDiary({ repository, clock, platform });

    const opened = await firstSession.establishProfile({
      nickname: "测试用户",
      sex: "male",
      age: 30,
      heightCm: 175,
      currentWeightKg: 70,
      weeklyExercise: "medium",
      hasFatLossExperience: false,
      targetWeightKg: 65,
      dayType: "training",
    });

    expect(opened.baseline).toEqual({
      carbohydrateGrams: 175,
      proteinGrams: 112,
      fatGrams: 63,
      energyKcal: 1715,
    });

    const [oats] = firstSession.searchFoods("燕麦");
    expect(oats.name).toBe("燕麦（干）");

    await firstSession.saveMeal({
      mealSlot: "breakfast",
      foodId: oats.id,
      amount: 50,
    });

    const reopened = createFatLossDiary({ repository, clock, platform });
    const restored = await reopened.openDiary();
    expect(restored.meals).toMatchObject([
      {
        mealSlot: "breakfast",
        foodName: "燕麦（干）",
        amount: 50,
        nutrients: {
          carbohydrateGrams: 30,
          proteinGrams: 6.5,
          fatGrams: 3.5,
          energyKcal: 188.5,
        },
      },
    ]);

    await reopened.recordWeight({ weightKg: 69.8 });

    expect(await reopened.readWeightTrend()).toEqual({
      startDate: "2026-09-29",
      endDate: "2026-12-27",
      targetWeightKg: 65,
      points: [{ date: "2026-09-29", day: 1, weightKg: 69.8 }],
    });
    expect(reopened.getPlatformCapabilities()).toEqual(platform);
  });

  it("跨日重新打开时只汇总当天餐食", async () => {
    const repository = createInMemoryDiaryRepository();
    let today = "2026-09-29";
    const clock = { today: () => today };
    const platform = {
      kind: "test" as const,
      localPersistence: true,
      canvas: true,
    };
    const diary = createFatLossDiary({ repository, clock, platform });

    await diary.establishProfile({
      nickname: "测试用户",
      sex: "male",
      age: 30,
      heightCm: 175,
      currentWeightKg: 70,
      weeklyExercise: "medium",
      hasFatLossExperience: false,
      targetWeightKg: 65,
      dayType: "training",
    });
    const [oats] = diary.searchFoods("燕麦");
    await diary.saveMeal({ mealSlot: "breakfast", foodId: oats.id, amount: 50 });

    today = "2026-09-30";
    const reopened = await diary.openDiary();

    expect(reopened.meals).toEqual([]);
    expect(reopened.actual).toEqual({
      carbohydrateGrams: 0,
      proteinGrams: 0,
      fatGrams: 0,
      energyKcal: 0,
    });
    expect(reopened.remaining).toEqual(reopened.baseline);
  });

  it("更新档案时保留进行中周期的起始日期", async () => {
    const repository = createInMemoryDiaryRepository();
    let today = "2026-09-29";
    const clock = { today: () => today };
    const platform = {
      kind: "test" as const,
      localPersistence: true,
      canvas: true,
    };
    const diary = createFatLossDiary({ repository, clock, platform });
    const profile = {
      nickname: "测试用户",
      sex: "male" as const,
      age: 30,
      heightCm: 175,
      currentWeightKg: 70,
      weeklyExercise: "medium" as const,
      hasFatLossExperience: false,
      targetWeightKg: 65,
      dayType: "training" as const,
    };

    await diary.establishProfile(profile);
    today = "2026-09-30";
    const updated = await diary.establishProfile({
      ...profile,
      currentWeightKg: 69,
    });

    expect(updated.profile?.cycleStartDate).toBe("2026-09-29");
  });

  it("拒绝未成年人，且不会保存未完成的健康档案", async () => {
    const repository = createInMemoryDiaryRepository();
    const diary = createFatLossDiary({
      repository,
      clock: { today: () => "2026-09-29" },
      platform: {
        kind: "test",
        localPersistence: true,
        canvas: true,
      },
    });

    await expect(
      diary.establishProfile({
        nickname: "未成年用户",
        sex: "female",
        age: 17,
        heightCm: 165,
        currentWeightKg: 55,
        weeklyExercise: "low",
        hasFatLossExperience: false,
        targetWeightKg: 52,
        dayType: "rest",
      }),
    ).rejects.toThrow("仅支持年满 18 岁的用户");
    expect(await repository.read()).toBeUndefined();
  });

  it.each([
    { field: "昵称", change: { nickname: "" }, message: "请填写昵称" },
    { field: "性别", change: { sex: undefined as never }, message: "请选择性别" },
    { field: "年龄", change: { age: Number.NaN }, message: "年龄必须是整数" },
    { field: "身高", change: { heightCm: 0 }, message: "身高必须是大于 0 的 cm 数值" },
    { field: "当前体重", change: { currentWeightKg: 0 }, message: "当前体重必须是大于 0 的 kg 数值" },
    { field: "每周运动频率", change: { weeklyExercise: undefined as never }, message: "请选择每周运动频率" },
    { field: "减脂基础", change: { hasFatLossExperience: undefined as never }, message: "请选择是否有减脂基础" },
    { field: "日型", change: { dayType: undefined as never }, message: "请选择日型" },
  ])("缺失或无效$field会停止建档并指出字段", async ({ change, message }) => {
    const repository = createInMemoryDiaryRepository();
    const diary = createFatLossDiary({
      repository,
      clock: { today: () => "2026-09-29" },
      platform: {
        kind: "test",
        localPersistence: true,
        canvas: true,
      },
    });

    await expect(
      diary.establishProfile({
        nickname: "测试用户",
        sex: "male",
        age: 30,
        heightCm: 175,
        currentWeightKg: 70,
        weeklyExercise: "medium",
        hasFatLossExperience: false,
        targetWeightKg: 65,
        dayType: "training",
        ...change,
      }),
    ).rejects.toThrow(message);
    expect(await repository.read()).toBeUndefined();
  });

  it("年龄和减脂基础只记录，不改变营养基准", async () => {
    async function establish(age: number, hasFatLossExperience: boolean) {
      const diary = createFatLossDiary({
        repository: createInMemoryDiaryRepository(),
        clock: { today: () => "2026-09-29" },
        platform: {
          kind: "test" as const,
          localPersistence: true,
          canvas: true,
        },
      });
      return diary.establishProfile({
        nickname: "测试用户",
        sex: "female",
        age,
        heightCm: 165,
        currentWeightKg: 60,
        weeklyExercise: "high",
        hasFatLossExperience,
        targetWeightKg: 55,
        dayType: "cardio",
      });
    }

    const first = await establish(18, false);
    const second = await establish(60, true);

    expect(first.baseline).toEqual(second.baseline);
    expect(first.profile?.age).toBe(18);
    expect(first.profile?.hasFatLossExperience).toBe(false);
    expect(second.profile?.age).toBe(60);
    expect(second.profile?.hasFatLossExperience).toBe(true);
  });

  it("只返回数值 BMI，不生成体型或健康等级", async () => {
    const diary = createFatLossDiary({
      repository: createInMemoryDiaryRepository(),
      clock: { today: () => "2026-09-29" },
      platform: {
        kind: "test",
        localPersistence: true,
        canvas: true,
      },
    });

    const snapshot = await diary.establishProfile({
      nickname: "测试用户",
      sex: "male",
      age: 30,
      heightCm: 175,
      currentWeightKg: 70,
      weeklyExercise: "medium",
      hasFatLossExperience: false,
      targetWeightKg: 65,
      dayType: "training",
    });

    expect(snapshot.bmi).toBe(22.9);
    expect(snapshot).not.toHaveProperty("bmiCategory");
    expect(snapshot).not.toHaveProperty("idealWeight");
  });

  it("独立保存营养基准、可选用户目标、实际摄入和剩余额", async () => {
    const repository = createInMemoryDiaryRepository();
    const diary = createFatLossDiary({
      repository,
      clock: { today: () => "2026-09-29" },
      platform: {
        kind: "test",
        localPersistence: true,
        canvas: true,
      },
    });

    const established = await diary.establishProfile({
      nickname: "测试用户",
      sex: "male",
      age: 30,
      heightCm: 175,
      currentWeightKg: 70,
      weeklyExercise: "medium",
      hasFatLossExperience: false,
      targetWeightKg: 65,
      dayType: "training",
      userTarget: {
        carbohydrateGrams: 150,
        proteinGrams: 110,
        fatGrams: 50,
      },
    });

    expect(established.baseline).toEqual({
      carbohydrateGrams: 175,
      proteinGrams: 112,
      fatGrams: 63,
      energyKcal: 1715,
    });
    expect(established.userTarget).toEqual({
      carbohydrateGrams: 150,
      proteinGrams: 110,
      fatGrams: 50,
      energyKcal: 1490,
    });
    expect(established.actual).toEqual({
      carbohydrateGrams: 0,
      proteinGrams: 0,
      fatGrams: 0,
      energyKcal: 0,
    });
    expect(established.remaining).toEqual(established.baseline);

    const [oats] = diary.searchFoods("燕麦");
    const afterMeal = await diary.saveMeal({
      mealSlot: "breakfast",
      foodId: oats.id,
      amount: 50,
    });

    expect(afterMeal.userTarget).toEqual(established.userTarget);
    expect(afterMeal.remaining).toEqual({
      carbohydrateGrams: 145,
      proteinGrams: 105.5,
      fatGrams: 59.5,
      energyKcal: 1526.5,
    });
  });
});
