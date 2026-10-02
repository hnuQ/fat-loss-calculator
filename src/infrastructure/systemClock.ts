import type { Clock } from "../domain/diary";

function twoDigits(value: number): string {
  return String(value).padStart(2, "0");
}

export const systemClock: Clock = {
  now() { return new Date().toISOString(); },
  today() {
    const now = new Date();
    return `${now.getFullYear()}-${twoDigits(now.getMonth() + 1)}-${twoDigits(
      now.getDate(),
    )}`;
  },
};
