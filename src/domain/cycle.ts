const dayMilliseconds = 24 * 60 * 60 * 1000;
const localDatePattern = /^\d{4}-\d{2}-\d{2}$/;

export function assertLocalDate(date: string, label = "日期"): void {
  if (!localDatePattern.test(date)) {
    throw new Error(`${label}必须使用 YYYY-MM-DD 格式`);
  }

  const parsed = new Date(`${date}T00:00:00.000Z`);
  if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== date) {
    throw new Error(`${label}不是有效的自然日`);
  }
}

export function toCalendarDayNumber(date: string): number {
  assertLocalDate(date);
  return Date.parse(`${date}T00:00:00.000Z`) / dayMilliseconds;
}

export function addCalendarDays(date: string, days: number): string {
  assertLocalDate(date);
  return new Date((toCalendarDayNumber(date) + days) * dayMilliseconds)
    .toISOString()
    .slice(0, 10);
}

export function isDateWithin(
  date: string,
  startDate: string,
  endDate: string,
): boolean {
  return date >= startDate && date <= endDate;
}

export function listCalendarDates(startDate: string, days: number): string[] {
  return Array.from({ length: days }, (_, index) =>
    addCalendarDays(startDate, index),
  );
}
