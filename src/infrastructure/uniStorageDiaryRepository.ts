import type { DiaryRepository, DiaryState } from "../domain/diary";

const storageKey = "fat-loss-diary-state-v1";

export function createUniStorageDiaryRepository(): DiaryRepository {
  return {
    async read() {
      try {
        const stored = uni.getStorageSync(storageKey);
        return stored ? (stored as DiaryState) : undefined;
      } catch (error) {
        throw new Error("读取本地减脂记录失败", { cause: error });
      }
    },
    async write(state) {
      try {
        uni.setStorageSync(storageKey, state);
      } catch (error) {
        throw new Error("保存本地减脂记录失败", { cause: error });
      }
    },
  };
}
