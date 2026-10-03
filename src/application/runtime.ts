import { createUniStorageDiaryRepository } from "../infrastructure/uniStorageDiaryRepository";
import { systemClock } from "../infrastructure/systemClock";
import { uniPlatformCapabilities } from "../infrastructure/uniPlatformCapabilities";
import { createFatLossDiary } from "./fatLossDiary";
import { createFoodLibrary } from "./foodLibrary";
import { createTrainingDiary } from "./trainingDiary";
import { createUniTrainingReminders } from "../infrastructure/uniTrainingReminders";
import { createDiaryBackup } from "./diaryBackup";
import { secureRandomBytes } from "../infrastructure/uniBackupFiles";

const repository = createUniStorageDiaryRepository();
export const diaryBackup = createDiaryBackup({ repository, randomBytes: secureRandomBytes });
export const foodLibrary = createFoodLibrary({ repository });

export const fatLossDiary = createFatLossDiary({
  repository,
  clock: systemClock,
  platform: uniPlatformCapabilities,
});

export const trainingDiary = createTrainingDiary({ repository, clock: systemClock, diary: fatLossDiary, reminders: createUniTrainingReminders() });
