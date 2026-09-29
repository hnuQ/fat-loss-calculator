import type { WeightTrendBuilder } from "./diary";

const dayMilliseconds = 24 * 60 * 60 * 1000;

function toUtcMilliseconds(date: string): number {
  return Date.parse(`${date}T00:00:00.000Z`);
}

function addDays(date: string, days: number): string {
  return new Date(toUtcMilliseconds(date) + days * dayMilliseconds)
    .toISOString()
    .slice(0, 10);
}

export const buildWeightTrend: WeightTrendBuilder = (
  records,
  startDate,
  targetWeightKg,
) => {
  const start = toUtcMilliseconds(startDate);
  const endDate = addDays(startDate, 89);
  const end = toUtcMilliseconds(endDate);
  const points = records
    .filter((record) => {
      const recordedAt = toUtcMilliseconds(record.date);
      return recordedAt >= start && recordedAt <= end;
    })
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((record) => ({
      date: record.date,
      day: Math.floor((toUtcMilliseconds(record.date) - start) / dayMilliseconds) + 1,
      weightKg: record.weightKg,
    }));

  return { startDate, endDate, targetWeightKg, points };
};
