import type { BodyMeasurements, BodyRecord } from "./diary";
import { addCalendarDays, toCalendarDayNumber } from "./cycle";
import { bodyFields } from "./body";

export interface BodyTrend {
  metric: keyof BodyMeasurements;
  label: string;
  unit: string;
  startDate: string;
  endDate: string;
  target?: number;
  points: Array<{ date: string; day: number; value: number }>;
  axis: { minimum: number; maximum: number; ticks: number[] };
}

export function buildBodyTrend(records: BodyRecord[], startDate: string, metric: keyof BodyMeasurements, targetWeightKg?: number): BodyTrend {
  const field = bodyFields.find((entry) => entry.key === metric);
  if (!field) throw new Error("请选择已有身体指标");
  const endDate = addCalendarDays(startDate, 89);
  const points = records.filter((record) => record.date >= startDate && record.date <= endDate && record[metric] !== undefined)
    .sort((left, right) => left.date.localeCompare(right.date) || left.createdAt.localeCompare(right.createdAt))
    .map((record) => ({ date: record.date, day: toCalendarDayNumber(record.date) - toCalendarDayNumber(startDate) + 1, value: record[metric]! }));
  const target = metric === "weightKg" ? targetWeightKg : undefined;
  const values = points.map((point) => point.value);
  if (target !== undefined) values.push(target);
  const low = values.length ? Math.min(...values) : 0;
  const high = values.length ? Math.max(...values) : 1;
  const padding = Math.max((high - low) * 0.1, Math.abs(high) * 0.01, 0.2);
  const rawStep = (high - low + padding * 2) / 4;
  const magnitude = 10 ** Math.floor(Math.log10(rawStep));
  const step = Math.max(0.1, [1, 2, 5, 10].find((size) => size * magnitude >= rawStep)! * magnitude);
  const minimum = Number(Math.max(0, Math.floor((low - padding) / step) * step).toFixed(1));
  const maximum = Number((Math.ceil((high + padding) / step) * step).toFixed(1));
  const ticks = Array.from({ length: Math.round((maximum - minimum) / step) + 1 }, (_, index) => Number((minimum + index * step).toFixed(1)));
  return { metric, label: field.label, unit: field.unit, startDate, endDate, target, points, axis: { minimum, maximum, ticks } };
}
