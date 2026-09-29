import { createUniStorageDiaryRepository } from "../infrastructure/uniStorageDiaryRepository";
import { systemClock } from "../infrastructure/systemClock";
import { uniPlatformCapabilities } from "../infrastructure/uniPlatformCapabilities";
import { createFatLossDiary } from "./fatLossDiary";

export const fatLossDiary = createFatLossDiary({
  repository: createUniStorageDiaryRepository(),
  clock: systemClock,
  platform: uniPlatformCapabilities,
});
