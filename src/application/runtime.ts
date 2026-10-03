import { createUniStorageDiaryRepository } from "../infrastructure/uniStorageDiaryRepository";
import { systemClock } from "../infrastructure/systemClock";
import { uniPlatformCapabilities } from "../infrastructure/uniPlatformCapabilities";
import { createFatLossDiary } from "./fatLossDiary";
import { createFoodLibrary } from "./foodLibrary";
import { createTrainingDiary } from "./trainingDiary";
import { createUniTrainingReminders } from "../infrastructure/uniTrainingReminders";

const repository = createUniStorageDiaryRepository();
export const foodLibrary = createFoodLibrary({ repository });

export const fatLossDiary = createFatLossDiary({
  repository,
  clock: systemClock,
  platform: uniPlatformCapabilities,
});

export const trainingDiary = createTrainingDiary({ repository, clock: systemClock, diary: fatLossDiary, reminders: createUniTrainingReminders() });
