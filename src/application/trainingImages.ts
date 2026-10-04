import type { TrainingBodyPart } from "../domain/training";

const dedicated: Partial<Record<TrainingBodyPart, string>> = {
  胸: "chest", 肩: "shoulders", 背: "back", 手臂: "arms", 有氧: "cardio",
};

/** Decorative only; local calendar date makes the fallback stable across restarts. */
export function trainingImage(date: string, bodyParts: readonly TrainingBodyPart[] = [], indulgence = false): string {
  if (indulgence) return "/static/training/indulgence.jpg";
  for (const part of bodyParts) if (dedicated[part]) return `/static/training/${dedicated[part]}.jpg`;
  let hash = 0;
  for (const character of date) hash = (hash * 31 + character.charCodeAt(0)) >>> 0;
  return `/static/training/random-${String(hash % 16 + 1).padStart(2, "0")}.jpg`;
}
