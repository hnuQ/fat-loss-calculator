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
});
