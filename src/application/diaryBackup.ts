import { gcm } from "@noble/ciphers/aes";
import { pbkdf2Async } from "@noble/hashes/pbkdf2";
import { sha256 } from "@noble/hashes/sha256";
import { bytesToHex, hexToBytes } from "@noble/hashes/utils";
import { z } from "zod";
import type { DiaryRepository, DiaryState } from "../domain/diary";
import { validateBackupState } from "../domain/backupSchema";
import { migrateLegacyDiaryState } from "./cycleDiary";
import { systemClock } from "../infrastructure/systemClock";

const iterations = 600000;
const format = "fat-loss-diary-backup";
const header = z.object({ format: z.literal(format), version: z.literal(1), schemaVersion: z.union([z.literal(1), z.literal(2)]), createdAt: z.string().refine((value) => Number.isFinite(Date.parse(value))), migration: z.literal("cycle-diary-v1") }).strict();
const plain = header.extend({ protection: z.literal("none"), state: z.unknown(), checksum: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const encrypted = header.extend({ protection: z.literal("aes-256-gcm"), kdf: z.literal("pbkdf2-sha256"), iterations: z.literal(iterations), salt: z.string().regex(/^[a-f0-9]{32}$/), nonce: z.string().regex(/^[a-f0-9]{24}$/), ciphertext: z.string().regex(/^(?:[a-f0-9]{2}){16,}$/) }).strict();
const maxFileLength = 20 * 1024 * 1024;

export function encodeUtf8(text: string): Uint8Array {
  const encoded = encodeURIComponent(text);
  const bytes: number[] = [];
  for (let index = 0; index < encoded.length; index++) {
    if (encoded[index] === "%") { bytes.push(Number.parseInt(encoded.slice(index + 1, index + 3), 16)); index += 2; }
    else bytes.push(encoded.charCodeAt(index));
  }
  return Uint8Array.from(bytes);
}

// URI decoding is available on all three clients, including engines without TextDecoder.
export function decodeUtf8(bytes: Uint8Array): string {
  return decodeURIComponent(Array.from(bytes, (byte) => `%${byte.toString(16).padStart(2, "0")}`).join(""));
}

export function createDiaryBackup(dependencies: { repository: DiaryRepository; randomBytes: (length: number) => Uint8Array | Promise<Uint8Array>; now?: () => string }) {
  function checksum(metadata: z.infer<typeof header>, state: unknown): string {
    return bytesToHex(sha256(encodeUtf8(JSON.stringify({ ...metadata, state }))));
  }
  return {
    async exportBackup(password = ""): Promise<string> {
      const state = validateBackupState(await dependencies.repository.read() ?? { meals: [], weights: [] });
      const metadata = { format, version: 1, schemaVersion: 2, createdAt: dependencies.now?.() ?? new Date().toISOString(), migration: "cycle-diary-v1" } as const;
      if (!password) return JSON.stringify({ ...metadata, protection: "none", state, checksum: checksum(metadata, state) });
      if (password.length < 8) throw new Error("备份密码至少 8 个字符；请妥善保存，无法找回");
      const salt = await dependencies.randomBytes(16);
      const nonce = await dependencies.randomBytes(12);
      if (salt.length !== 16 || nonce.length !== 12) throw new Error("安全随机源返回长度错误");
      const key = await pbkdf2Async(sha256, encodeUtf8(password), salt, { c: iterations, dkLen: 32 });
      try {
        const ciphertext = gcm(key, nonce, encodeUtf8(JSON.stringify(metadata))).encrypt(encodeUtf8(JSON.stringify(state)));
        return JSON.stringify({ ...metadata, protection: "aes-256-gcm", kdf: "pbkdf2-sha256", iterations, salt: bytesToHex(salt), nonce: bytesToHex(nonce), ciphertext: bytesToHex(ciphertext) });
      } finally { key.fill(0); }
    },
    async restoreBackup(content: string, password = ""): Promise<void> {
      if (typeof content !== "string" || content.length > maxFileLength) throw new Error("备份文件过大或无效");
      let input: unknown;
      try { input = JSON.parse(content); } catch { throw new Error("备份文件损坏；CSV 不能用于恢复"); }
      const metadataResult = header.safeParse(input && typeof input === "object" ? Object.fromEntries(Object.entries(input).filter(([key]) => ["format", "version", "schemaVersion", "createdAt", "migration"].includes(key))) : input);
      if (!metadataResult.success) throw new Error("不是受支持版本的完整备份");
      const metadata = metadataResult.data;
      let data: unknown;
      const plainResult = plain.safeParse(input);
      if (plainResult.success) {
        data = plainResult.data.state;
        if (checksum(metadata, data) !== plainResult.data.checksum) throw new Error("备份完整性校验失败，文件可能已损坏");
      } else {
        const result = encrypted.safeParse(input);
        if (!result.success) throw new Error("备份文件损坏或不完整");
        if (!password) throw new Error("此备份需要密码");
        const key = await pbkdf2Async(sha256, encodeUtf8(password), hexToBytes(result.data.salt), { c: iterations, dkLen: 32 });
        try {
          data = JSON.parse(decodeUtf8(gcm(key, hexToBytes(result.data.nonce), encodeUtf8(JSON.stringify(metadata))).decrypt(hexToBytes(result.data.ciphertext))));
        } catch { throw new Error("密码错误或备份文件已损坏；原数据未改变"); }
        finally { key.fill(0); }
      }
      let state = validateBackupState(data);
      if (metadata.schemaVersion === 1) state = validateBackupState(migrateLegacyDiaryState(state, systemClock.today()));
      // All validation precedes the repository's single-key atomic replacement.
      await dependencies.repository.write(state);
    },
    async exportCsv(kind: "body" | "meals" | "training"): Promise<string> {
      const state = validateBackupState(await dependencies.repository.read() ?? { meals: [], weights: [] });
      return exportDiaryCsv(state, kind);
    },
  };
}

function csv(rows: unknown[][]): string {
  return rows.map((row) => row.map((value) => {
    let text = value === undefined ? "" : String(value);
    if (/^[\s]*[=+\-@]/.test(text)) text = `'${text}`;
    return `"${text.replace(/"/g, '""')}"`;
  }).join(",")).join("\r\n") + "\r\n";
}

export function exportDiaryCsv(state: DiaryState, kind: "body" | "meals" | "training"): string {
  if (kind === "training") return csv([["记录ID", "周期ID", "日期", "计划ID", "训练名称", "训练内容", "完成", "感受"], ...(state.training?.records ?? []).map((record) => [record.id, record.cycleId, record.date, record.planId, record.title, record.content, record.completed ? "是" : "否", record.feeling])]);
  if (kind === "body") {
    const records = state.bodyRecords ?? state.weights;
    return csv([["记录ID", "周期ID", "日期", "版本", "纠错ID", "原因", "纠错时间", "体重kg", "体脂率%", "腰围cm", "胸围cm", "臀围cm", "大腿围cm"], ...records.map((record) => [record.id, record.cycleId, record.date, "原始", "", "", "", ...["weightKg", "bodyFatPercent", "waistCm", "chestCm", "hipCm", "thighCm"].map((key) => (record as unknown as Record<string, unknown>)[key])]), ...(state.bodyCorrections ?? []).map((item) => [item.sourceBodyId, item.corrected.cycleId, item.corrected.date, "纠错", item.id, item.reason, item.createdAt, item.corrected.weightKg, item.corrected.bodyFatPercent, item.corrected.waistCm, item.corrected.chestCm, item.corrected.hipCm, item.corrected.thighCm])]);
  }
  const marked = (cycleId: string | undefined, date: string) => (state.indulgenceDays ?? []).some((record) => record.cycleId === cycleId && record.date === date);
  const mealRow = (record: DiaryState["meals"][number], version: string, correctionId = "", reason = "", time = "") => [record.id, record.cycleId, record.date, version, correctionId, reason, time, state.mealGroups?.find((group) => group.id === record.mealSlot)?.name ?? record.mealSlot, record.foodName, record.amount, record.unit === "g" ? "克" : "个", record.nutrients.carbohydrateGrams, record.nutrients.proteinGrams, record.nutrients.fatGrams, record.nutrients.energyKcal, marked(record.cycleId, record.date) ? "是" : "否"];
  const emptyMarkedDays = (state.indulgenceDays ?? []).filter((day) => !state.meals.some((meal) => meal.cycleId === day.cycleId && meal.date === day.date));
  return csv([["记录ID", "周期ID", "日期", "版本", "纠错ID", "原因", "纠错时间", "餐次", "食材", "数量", "单位", "碳水g", "蛋白质g", "脂肪g", "热量kcal", "放纵日"], ...state.meals.map((record) => mealRow(record, "原始")), ...(state.mealCorrections ?? []).map((item) => mealRow(item.corrected, "纠错", item.id, item.reason, item.createdAt)), ...emptyMarkedDays.map((day) => ["", day.cycleId, day.date, "日期标记", "", "", "", "", "", "", "", "", "", "", "", "是"])]);
}
