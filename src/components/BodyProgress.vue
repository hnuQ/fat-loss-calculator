<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { fatLossDiary } from "../application/runtime";
import { bodyFields, bodySummary } from "../domain/body";
import type { BodyMeasurements, BodyRecord, DiarySnapshot } from "../domain/diary";
import { parseFoodNumber } from "../domain/foodLibrary";
import { buildBodyTrend } from "../domain/bodyTrend";
import WeightTrendCanvas from "./WeightTrendCanvas.vue";

const props = defineProps<{ snapshot: DiarySnapshot; disabled: boolean }>();
const emit = defineEmits<{ (event: "change", snapshot: DiarySnapshot): void; (event: "working", value: boolean): void }>();
const summary = computed(() => bodySummary(props.snapshot.bodyRecords));
const metric = ref<keyof BodyMeasurements>("weightKg");
const trend = computed(() => props.snapshot.selectedCycle ? buildBodyTrend(props.snapshot.bodyRecords, props.snapshot.selectedCycle.startDate, metric.value, props.snapshot.profile?.targetWeightKg) : undefined);
const recordDate = ref(props.snapshot.selectedDate);
const latestDate = computed(() => props.snapshot.selectedCycle ? [props.snapshot.selectedCycle.endDate, props.snapshot.today].sort()[0] : props.snapshot.today);
const canSave = computed(() => !!props.snapshot.selectedCycle && recordDate.value <= props.snapshot.today);
const records = computed(() => [...props.snapshot.bodyRecords].sort((left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt)));
const form = reactive<Record<keyof BodyMeasurements, string>>({ weightKg: "", bodyFatPercent: "", waistCm: "", chestCm: "", hipCm: "", thighCm: "" });
const editing = ref<string>();
const audit = ref<string>();
const pendingDelete = ref<string>();
const busy = ref(false);
const message = ref("");
function reset() {
  editing.value = undefined; pendingDelete.value = undefined; recordDate.value = props.snapshot.selectedDate;
  for (const field of bodyFields) form[field.key] = "";
}
watch([() => props.snapshot.selectedCycle?.id, () => props.snapshot.selectedDate], () => { reset(); audit.value = undefined; message.value = ""; });
function begin(record: BodyRecord) {
  reset();
  editing.value = record.id; recordDate.value = record.date;
  for (const field of bodyFields) form[field.key] = record[field.key] === undefined ? "" : String(record[field.key]);
}
function measurements(): BodyMeasurements {
  const result: BodyMeasurements = {};
  for (const field of bodyFields) {
    if (form[field.key].trim()) result[field.key] = parseFoodNumber(form[field.key], field.label);
  }
  return result;
}
function describe(record: BodyRecord) {
  return bodyFields.filter((field) => record[field.key] !== undefined).map((field) => `${field.label} ${record[field.key]} ${field.unit}`).join(" · ");
}
function difference(value: number) { return `${value > 0 ? "+" : ""}${value}`; }
function corrections(id: string) { return props.snapshot.bodyCorrections.filter((entry) => entry.sourceBodyId === id); }
async function run(action: () => Promise<DiarySnapshot>) {
  if (busy.value || props.disabled) return;
  busy.value = true; emit("working", true); message.value = "";
  try { emit("change", await action()); }
  catch (error) { message.value = error instanceof Error ? error.message : "身体记录操作失败"; }
  finally { busy.value = false; emit("working", false); }
}
async function save() {
  await run(async () => {
    const result = await fatLossDiary.saveBodyRecord({ id: editing.value, cycleId: props.snapshot.selectedCycle?.id, date: recordDate.value, measurements: measurements() });
    message.value = "身体记录已保存";
    reset(); return result;
  });
}
async function remove(id: string) {
  await run(async () => { const result = await fatLossDiary.deleteBodyRecord(id, props.snapshot.selectedCycle?.id); reset(); message.value = "身体记录已删除"; return result; });
}
</script>

<template>
  <view class="body-progress">
    <view class="card">
      <text class="title">90 天身体趋势</text>
      <view class="actions metric-switch">
        <button v-for="field in bodyFields" :key="field.key" role="button" :class="{ primary: metric === field.key }" :aria-label="`查看${field.label}趋势`" @click="metric = field.key">{{ field.label }}（{{ field.unit }}）</button>
      </view>
      <WeightTrendCanvas v-if="trend" :trend="trend" />
      <text class="meta">只显示实际测量日期及所选指标，不补齐空白日期，不生成预测。</text>
    </view>
    <view class="card">
      <text class="title">阶段摘要</text>
      <text class="meta">当前所选周期 · 各项独立比较首次与最新有效测量；体脂率差值用百分点，围度用 cm。</text>
      <view v-for="item in summary" :key="item.key" class="summary-row">
        <text>{{ item.label }} · {{ item.latest === undefined ? '暂无测量' : `最新 ${item.latest} ${item.unit}` }}</text>
        <text v-if="item.latestDate" class="meta">最新日期 {{ item.latestDate }}</text>
        <text v-if="item.difference !== undefined" class="meta">{{ item.firstDate }} 至 {{ item.latestDate }} · 阶段差值 {{ difference(item.difference) }} {{ item.key === 'bodyFatPercent' ? '个百分点' : item.unit }}</text>
        <text v-else-if="item.count === 1" class="meta">仅一次测量，暂无阶段差值</text>
      </view>
    </view>
    <view v-if="snapshot.selectedCycle" class="card editor">
      <text class="title">{{ editing ? '编辑身体记录' : '补录身体数据' }}</text>
      <label>测量日期
        <picker mode="date" :value="recordDate" :start="snapshot.selectedCycle.startDate" :end="latestDate" :disabled="busy || disabled" @change="recordDate = $event.detail.value">
          <view class="date-picker">{{ recordDate }}</view>
        </picker>
      </label>
      <text class="meta">日期须在所选周期内且不晚于今天；历史及归档周期也可补录、编辑和删除。</text>
      <text class="meta">可只填写实际测量项；留空表示该条未测量。统一保留一位小数。</text>
      <view class="field-grid">
        <label v-for="field in bodyFields" :key="field.key">
          <text>{{ field.label }}（{{ field.unit }}）</text>
          <input v-model="form[field.key]" type="digit" :aria-label="`身体${field.label}（${field.unit}）`" :placeholder="`${field.label}，未测量可留空`" />
        </label>
      </view>
      <view class="actions">
        <button role="button" :disabled="busy || disabled || !canSave" class="primary" @click="save">{{ editing ? '保存身体修改' : '保存身体记录' }}</button>
        <button role="button" v-if="editing" :disabled="busy || disabled" @click="reset">取消身体编辑</button>
      </view>
    </view>
    <text v-if="message" role="status" class="notice">{{ message }}</text>
    <view class="card">
      <text class="title">身体历史记录</text>
      <text class="meta">本周期记录可直接编辑和删除，无需填写原因；图表及摘要随记录更新。</text>
      <text v-if="!records.length" class="meta">本周期暂无身体记录</text>
      <view v-for="record in records" :key="record.id" class="history-entry">
        <text class="entry-title">{{ record.date }}</text>
        <text class="meta">{{ describe(record) }}</text>
        <text v-if="corrections(record.id).length" class="meta">保留 {{ corrections(record.id).length }} 次旧纠错审计</text>
        <view class="actions">
          <template v-if="record.date <= snapshot.today">
            <button role="button" :disabled="busy || disabled" :aria-label="`编辑身体记录 ${record.id}`" @click="begin(record)">编辑身体记录</button>
            <button role="button" :disabled="busy || disabled" :aria-label="`删除身体记录 ${record.id}`" @click="pendingDelete = record.id">删除身体记录</button>
          </template>
          <button role="button" :aria-label="`审计身体记录 ${record.id}`" @click="audit = audit === record.id ? undefined : record.id">{{ audit === record.id ? '收起' : '查看' }}身体审计</button>
        </view>
        <view v-if="pendingDelete === record.id" class="actions">
          <text>确认删除 {{ record.date }} 这条身体记录？</text>
          <button role="button" :disabled="busy || disabled" @click="remove(record.id)">确认删除身体记录</button>
          <button role="button" :disabled="busy || disabled" @click="pendingDelete = undefined">取消身体删除</button>
        </view>
        <view v-if="audit === record.id" class="audit">
          <text class="meta">原始值：{{ describe(snapshot.originalBodyRecords.find((source) => source.id === record.id)!) }} · 来源 {{ record.id }}</text>
          <view v-for="item in corrections(record.id)" :key="item.id">
            <text class="meta">{{ item.createdAt }} · 原因：{{ item.reason }}</text>
            <text class="meta">修正前：{{ describe(item.previous) }}</text>
            <text class="meta">修正值：{{ describe(item.corrected) }}</text>
            <text class="meta">纠错 {{ item.id }}{{ item.previousCorrectionId ? ` · 上次纠错 ${item.previousCorrectionId}` : '' }}</text>
          </view>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.card { margin-bottom: 24rpx; padding: 28rpx; border: 1rpx solid #e0e7e2; border-radius: 28rpx; background: #fff; }
.title { display: block; font-size: 32rpx; font-weight: 700; margin-bottom: 20rpx; }
.meta { display: block; color: #626e66; font-size: 24rpx; line-height: 1.6; margin: 12rpx 0; overflow-wrap: anywhere; }
.summary-row, .history-entry { padding: 18rpx 0; border-top: 1rpx solid #edf1ee; }
.field-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 18rpx; }
label { display: flex; flex-direction: column; gap: 12rpx; font-size: 24rpx; margin-bottom: 18rpx; }
input { min-height: 76rpx; min-width: 0; padding: 0 16rpx; border: 1rpx solid #dce4de; border-radius: 18rpx; background: #f9fbfa; }
.date-picker { padding: 20rpx 16rpx; border: 1rpx solid #dce4de; border-radius: 18rpx; background: #f9fbfa; }
.metric-switch { margin-bottom: 20rpx; }
.actions { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 18rpx; align-items: center; }
button { margin: 0; font-size: 24rpx; color: #315e47; background: #f7faf8; }
.primary { color: white; background: #1f7a4c; }
.notice { display: block; padding: 20rpx; margin-bottom: 24rpx; background: #e5f2ea; border-radius: 18rpx; }
.audit { padding: 18rpx; margin-top: 18rpx; background: #f9fbfa; }
.entry-title { font-size: 28rpx; font-weight: 600; }
</style>
