import type { BodyMeasurements, BodyRecord, DiaryState } from "./diary";

export function effectiveBodyRecord(state: DiaryState, source: BodyRecord): BodyRecord {
  return state.bodyOverrides?.find((record) => record.id === source.id)
    ?? [...(state.bodyCorrections ?? [])].reverse().find((correction) => correction.sourceBodyId === source.id)?.corrected
    ?? source;
}

export function effectiveBodyRecords(state: DiaryState): BodyRecord[] {
  return (state.bodyRecords ?? []).filter((source) => !state.bodyOverrides?.some((record) => record.id === source.id && record.deletedAt))
    .map((source) => effectiveBodyRecord(state, source));
}

export const bodyFields: Array<{ key: keyof BodyMeasurements; label: string; unit: string }> = [
  { key: "weightKg", label: "体重", unit: "kg" },
  { key: "bodyFatPercent", label: "体脂率", unit: "%" },
  { key: "waistCm", label: "腰围", unit: "cm" },
  { key: "chestCm", label: "胸围", unit: "cm" },
  { key: "hipCm", label: "臀围", unit: "cm" },
  { key: "thighCm", label: "大腿围", unit: "cm" },
];

export function validateBodyMeasurements(input: BodyMeasurements): BodyMeasurements {
  const result: BodyMeasurements = {};
  for (const field of bodyFields) {
    const value = input[field.key];
    if (value === undefined) continue;
    if (!Number.isFinite(value) || value <= 0 || (field.key === "bodyFatPercent" && value >= 100)) {
      throw new Error(`${field.label}必须是大于 0${field.key === "bodyFatPercent" ? " 且小于 100" : ""} 的 ${field.unit} 数值`);
    }
    const rounded = Math.round((value + Number.EPSILON * Math.abs(value)) * 10) / 10;
    if (!Number.isFinite(rounded) || rounded <= 0 || (field.key === "bodyFatPercent" && rounded >= 100)) {
      throw new Error(`${field.label}保留一位小数后必须在有效范围内`);
    }
    result[field.key] = rounded;
  }
  if (Object.keys(result).length === 0) throw new Error("请至少填写一项身体测量值");
  return result;
}

export function bodySummary(records: BodyRecord[]) {
  const ordered = [...records].sort((left, right) => left.date.localeCompare(right.date) || left.createdAt.localeCompare(right.createdAt));
  return bodyFields.map((field) => {
    const measured = ordered.filter((record) => record[field.key] !== undefined);
    const first = measured[0];
    const latest = measured[measured.length - 1];
    return {
      ...field,
      count: measured.length,
      firstDate: first?.date,
      latestDate: latest?.date,
      latest: latest?.[field.key],
      difference: measured.length > 1
        ? Math.round((latest[field.key]! - first[field.key]!) * 10) / 10
        : undefined,
    };
  });
}
