import type { WeightTrendBuilder } from "./diary";
import { addCalendarDays, toCalendarDayNumber } from "./cycle";

export const buildWeightTrend: WeightTrendBuilder = (
  records,
  startDate,
  targetWeightKg,
) => {
  const start = toCalendarDayNumber(startDate);
  const endDate = addCalendarDays(startDate, 89);
  const end = toCalendarDayNumber(endDate);
  const points = records
    .filter((record) => {
      const recordedAt = toCalendarDayNumber(record.date);
      return recordedAt >= start && recordedAt <= end;
    })
    .sort((left, right) => left.date.localeCompare(right.date))
    .map((record) => ({
      date: record.date,
      day: toCalendarDayNumber(record.date) - start + 1,
      weightKg: record.weightKg,
    }));

  return { startDate, endDate, targetWeightKg, points };
};
