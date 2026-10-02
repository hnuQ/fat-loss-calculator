import { describe, expect, it } from "vitest";

import { createFatLossDiary } from "../src/application/fatLossDiary";
import type { DiaryState } from "../src/domain/diary";
import { createInMemoryDiaryRepository } from "../src/testing/inMemoryDiaryRepository";

function createJourney(today = "2026-10-02") {
  let currentDate = today;
  const repository = createInMemoryDiaryRepository();
  const diary = createFatLossDiary({
    repository,
    clock: { today: () => currentDate },
    platform: {
      kind: "test",
      localPersistence: true,
      canvas: true,
    },
  });

  return {
    diary,
    repository,
    setToday(date: string) {
      currentDate = date;
    },
  };
}

async function establishAdultProfile(
  diary: ReturnType<typeof createFatLossDiary>,
): Promise<void> {
  await diary.establishProfile({
    nickname: "测试用户",
    sex: "male",
    age: 30,
    heightCm: 175,
    currentWeightKg: 70,
    weeklyExercise: "medium",
    hasFatLossExperience: false,
    targetWeightKg: 65,
  });
}

describe("90 日减脂周期与日期导航", () => {
  it("从选定开始日期覆盖连续 90 个本地自然日并保留首末边界", async () => {
    const { diary } = createJourney();
    await establishAdultProfile(diary);

    const opened = await diary.startCycle({
      startDate: "2026-12-01",
      dayType: "training",
    });

    expect(opened.activeCycle).toMatchObject({
      startDate: "2026-12-01",
      endDate: "2027-02-28",
      status: "active",
    });
    expect(opened.cycleDates).toHaveLength(90);
    expect(opened.cycleDates[0]).toBe("2026-12-01");
    expect(opened.cycleDates[89]).toBe("2027-02-28");
  });

  it("同一时间只允许一个进行中的周期并给出明确提示", async () => {
    const { diary } = createJourney();
    await establishAdultProfile(diary);
    await diary.startCycle({ startDate: "2026-10-01", dayType: "training" });

    await expect(
      diary.startCycle({ startDate: "2026-11-01", dayType: "rest" }),
    ).rejects.toThrow("已有进行中的减脂周期，请先归档后再创建新周期");
  });

  it("默认定位今天，并可通过七日日期条和完整周期日期导航", async () => {
    const { diary } = createJourney("2026-10-10");
    await establishAdultProfile(diary);
    await diary.startCycle({ startDate: "2026-10-01", dayType: "training" });

    const today = await diary.openDiary();
    expect(today.selectedDate).toBe("2026-10-10");
    expect(today.dateStrip).toEqual([
      "2026-10-07",
      "2026-10-08",
      "2026-10-09",
      "2026-10-10",
      "2026-10-11",
      "2026-10-12",
      "2026-10-13",
    ]);

    const selected = await diary.openDiary({ date: "2026-12-29" });
    expect(selected.selectedDate).toBe("2026-12-29");
    expect(selected.dateStrip).toEqual([
      "2026-12-23",
      "2026-12-24",
      "2026-12-25",
      "2026-12-26",
      "2026-12-27",
      "2026-12-28",
      "2026-12-29",
    ]);

    await expect(
      diary.openDiary({ date: "2026-12-30" }),
    ).rejects.toThrow("所选日期不在该减脂周期内");
  });

  it("三种日型可明确选择并分别驱动营养基准", async () => {
    const { diary } = createJourney();
    await establishAdultProfile(diary);
    const started = await diary.startCycle({
      startDate: "2026-10-01",
      dayType: "training",
    });
    const cycleId = started.activeCycle?.id as string;

    const training = await diary.setDayType({
      cycleId,
      date: "2026-10-02",
      dayType: "training",
    });
    const cardio = await diary.setDayType({
      cycleId,
      date: "2026-10-03",
      dayType: "cardio",
    });
    const rest = await diary.setDayType({
      cycleId,
      date: "2026-10-04",
      dayType: "rest",
    });

    expect(training.baseline?.carbohydrateGrams).toBe(175);
    expect(cardio.baseline?.carbohydrateGrams).toBe(122.5);
    expect(rest.baseline?.carbohydrateGrams).toBe(87.5);
    expect(training.dayType).toBe("training");
    expect(cardio.dayType).toBe("cardio");
    expect(rest.dayType).toBe("rest");
  });

  it("没有记录的日期保持空白，不生成日型、营养基准或身体记录", async () => {
    const { diary } = createJourney();
    await establishAdultProfile(diary);
    await diary.startCycle({ startDate: "2026-10-01", dayType: "training" });

    const blank = await diary.openDiary({ date: "2026-10-05" });

    expect(blank.isBlankDate).toBe(true);
    expect(blank.dayType).toBeUndefined();
    expect(blank.baseline).toBeUndefined();
    expect(blank.meals).toEqual([]);
    expect(blank.selectedDateWeights).toEqual([]);
  });

  it("提前归档后可开始新周期，重叠日期的旧记录仍按周期访问", async () => {
    const { diary } = createJourney();
    await establishAdultProfile(diary);
    const first = await diary.startCycle({
      startDate: "2026-10-01",
      dayType: "training",
    });
    const firstCycleId = first.activeCycle?.id as string;
    await diary.setDayType({
      cycleId: firstCycleId,
      date: "2026-10-02",
      dayType: "training",
    });
    const [oats] = diary.searchFoods("燕麦");
    await diary.saveMeal({
      mealSlot: "breakfast",
      foodId: oats.id,
      amount: 50,
    });

    const archived = await diary.archiveActiveCycle();
    expect(archived.activeCycle).toBeUndefined();
    expect(archived.cycles[0]).toMatchObject({
      id: firstCycleId,
      status: "archived",
      archiveReason: "early",
      archivedAt: "2026-10-02",
    });

    const second = await diary.startCycle({
      startDate: "2026-10-02",
      dayType: "rest",
    });
    const secondCycleId = second.activeCycle?.id as string;
    expect(secondCycleId).not.toBe(firstCycleId);

    const oldDate = await diary.openDiary({
      cycleId: firstCycleId,
      date: "2026-10-02",
    });
    const newDate = await diary.openDiary({
      cycleId: secondCycleId,
      date: "2026-10-02",
    });

    expect(oldDate.dayType).toBe("training");
    expect(oldDate.meals).toHaveLength(1);
    expect(newDate.dayType).toBe("rest");
    expect(newDate.meals).toEqual([]);
  });

  it("使用可控时钟验证末日仍进行中，次日自动归档并允许新周期", async () => {
    const journey = createJourney("2026-10-01");
    await establishAdultProfile(journey.diary);
    await journey.diary.startCycle({
      startDate: "2026-10-01",
      dayType: "training",
    });

    journey.setToday("2026-12-29");
    expect((await journey.diary.openDiary()).activeCycle?.status).toBe("active");

    journey.setToday("2026-12-30");
    const completed = await journey.diary.openDiary();
    expect(completed.activeCycle).toBeUndefined();
    expect(completed.cycles[0]).toMatchObject({
      status: "archived",
      archiveReason: "completed",
      archivedAt: "2026-12-29",
    });

    const restarted = await journey.diary.startCycle({
      startDate: "2026-12-30",
      dayType: "cardio",
    });
    expect(restarted.activeCycle?.startDate).toBe("2026-12-30");
  });

  it("迁移 Issue #4 的本地状态并保留周期、餐食和体重记录", async () => {
    const legacyState: DiaryState = {
      profile: {
        nickname: "旧版用户",
        sex: "male",
        age: 30,
        heightCm: 175,
        currentWeightKg: 70,
        weeklyExercise: "medium",
        hasFatLossExperience: false,
        targetWeightKg: 65,
        cycleStartDate: "2026-10-01",
      },
      dayType: "training",
      baseline: {
        carbohydrateGrams: 175,
        proteinGrams: 112,
        fatGrams: 63,
        energyKcal: 1715,
      },
      meals: [
        {
          id: "legacy-meal",
          date: "2026-10-01",
          mealSlot: "breakfast",
          foodId: "oats",
          foodName: "燕麦（干）",
          amount: 50,
          unit: "g",
          nutrients: {
            carbohydrateGrams: 30,
            proteinGrams: 6.5,
            fatGrams: 3.5,
            energyKcal: 188.5,
          },
        },
      ],
      weights: [{ id: "legacy-weight", date: "2026-10-01", weightKg: 70 }],
    };
    const repository = createInMemoryDiaryRepository(legacyState);
    const diary = createFatLossDiary({
      repository,
      clock: { today: () => "2026-10-02" },
      platform: {
        kind: "test",
        localPersistence: true,
        canvas: true,
      },
    });

    const migrated = await diary.openDiary({ date: "2026-10-01" });
    const persisted = await repository.read();

    expect(migrated.activeCycle).toMatchObject({
      startDate: "2026-10-01",
      endDate: "2026-12-29",
      status: "active",
    });
    expect(migrated.dayType).toBe("training");
    expect(migrated.meals).toHaveLength(1);
    expect(migrated.selectedDateWeights).toHaveLength(1);
    expect(persisted?.meals[0].cycleId).toBe(migrated.activeCycle?.id);
    expect(persisted?.weights[0].cycleId).toBe(migrated.activeCycle?.id);
  });
});
