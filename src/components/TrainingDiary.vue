<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { trainingDiary } from "../application/runtime";
import type { DiarySnapshot } from "../domain/diary";
import { trainedRecord, trainingState, type TrainingBodyPart, type TrainingPlan, type TrainingRecord, type TrainingState, type TrainingWeek } from "../domain/training";
import { trainingImage } from "../application/trainingImages";
import { addCalendarDays } from "../domain/cycle";
import TrainingParts from "./TrainingParts.vue";

const props = defineProps<{ snapshot: DiarySnapshot; disabled: boolean }>();
const emit = defineEmits<{ (event: "change", snapshot: DiarySnapshot): void; (event: "working", value: boolean): void }>();
const state = ref<TrainingState>(trainingState());
const plans = computed(() => state.value.plans.filter((plan) => !plan.deletedAt));
/** 记录列表覆盖所选周期的全部实际记录，含归档周期，便于直接补录、修改和删除。 */
const cycleRecords = computed(() => props.snapshot.selectedCycle
  ? state.value.records.filter((record) => record.cycleId === props.snapshot.selectedCycle!.id).slice().sort((left, right) => right.date.localeCompare(left.date) || right.createdAt.localeCompare(left.createdAt))
  : []);
const message = ref("");
const busy = ref(false);
const editingPlan = ref<string>();
const deletingPlan = ref<string>();
const deletingRecord = ref<string>();
const editingRecord = ref<string>();
const recordDate = ref(props.snapshot.selectedDate);
const planForm = reactive({ title: "", content: "", bodyParts: [] as TrainingBodyPart[] });
const recordForm = reactive({ planId: undefined as string | undefined, content: "", bodyParts: [] as TrainingBodyPart[], feeling: "", saveAsPlan: false });
const week = ref<TrainingWeek>();
const weekDate = ref(props.snapshot.selectedDate);
function planSnippet(content: string) { const single = content.replace(/\s+/g, " ").trim(); return single.length > 12 ? `${single.slice(0, 12)}…` : single; }
const planLabels = computed(() => plans.value.map((plan) => `${plan.title}（${plan.bodyParts?.join("/") || "未分类"} · ${planSnippet(plan.content)}）`));
/** 同名模板按稳定标识选择，并用部位与内容区分。 */
const planOptions = computed(() => ["独立填写", ...planLabels.value]);
const selectedPlan = computed(() => recordForm.planId ? plans.value.findIndex((plan) => plan.id === recordForm.planId) + 1 : 0);
/** 训练日期不晚于今天，且不超出所选周期。 */
const latestRecordDate = computed(() => props.snapshot.selectedCycle ? [props.snapshot.selectedCycle.endDate, props.snapshot.today].sort()[0] : props.snapshot.today);
const canRecord = computed(() => !!props.snapshot.selectedCycle && recordDate.value >= props.snapshot.selectedCycle.startDate && recordDate.value <= latestRecordDate.value);
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
/** 把日期收进所选周期与今天之间；周期整体在未来时返回尚未开始的周期首日。 */
function clampDate(date?: string) {
  const cycle = props.snapshot.selectedCycle;
  const value = date || props.snapshot.today;
  if (!cycle) return value;
  if (value < cycle.startDate) return cycle.startDate;
  return value > latestRecordDate.value ? latestRecordDate.value : value;
}
function resetRecord() {
  editingRecord.value = undefined; deletingRecord.value = undefined;
  Object.assign(recordForm, { planId: undefined, content: "", bodyParts: [], feeling: "", saveAsPlan: false });
}
function resetPlan() { editingPlan.value = undefined; deletingPlan.value = undefined; planForm.title = ""; planForm.content = ""; planForm.bodyParts = []; }
async function loadWeek() { if (props.snapshot.selectedCycle) week.value = await trainingDiary.openWeek({ cycleId: props.snapshot.selectedCycle.id, date: weekDate.value }); else week.value = undefined; }
watch([() => props.snapshot.selectedCycle?.id], () => { resetRecord(); resetPlan(); recordDate.value = clampDate(props.snapshot.selectedDate); weekDate.value = clampDate(props.snapshot.selectedDate); message.value = ""; void run(loadWeek); });
watch([() => props.snapshot.selectedDate], () => { resetRecord(); recordDate.value = clampDate(props.snapshot.selectedDate); weekDate.value = clampDate(props.snapshot.selectedDate); message.value = ""; void run(loadWeek); });
function startRecordFor(date: string) { resetRecord(); recordDate.value = date; message.value = ""; }
function editPlan(plan: TrainingPlan) { resetPlan(); editingPlan.value = plan.id; Object.assign(planForm, { title: plan.title, content: plan.content, bodyParts: [...(plan.bodyParts ?? [])] }); }
function usePlan(plan: TrainingPlan) {
  if (!editingRecord.value) { const date = recordDate.value; resetRecord(); recordDate.value = date; }
  Object.assign(recordForm, { planId: plan.id, content: plan.content, bodyParts: [...(plan.bodyParts ?? [])] });
}
function choosePlan(event: Event) {
  const plan = plans.value[Number(textValue(event)) - 1];
  Object.assign(recordForm, { planId: plan?.id, content: plan?.content ?? "", bodyParts: [...(plan?.bodyParts ?? [])] });
}
function editRecord(record: TrainingRecord) {
  resetRecord(); editingRecord.value = record.id; recordDate.value = clampDate(record.date);
  Object.assign(recordForm, { planId: record.planId, content: record.content, bodyParts: [...(record.bodyParts ?? [])], feeling: record.feeling, saveAsPlan: false });
}
async function moveWeek(offset: number) { await run(async () => { weekDate.value = addCalendarDays(weekDate.value, offset); await loadWeek(); }); }
function setSaveAsPlan(event: Event) { recordForm.saveAsPlan = (event as unknown as { detail: { value: boolean } }).detail.value; }
function textValue(event: Event) { return (event as unknown as { detail: { value: string } }).detail.value; }
async function run(action: () => Promise<void>) {
  if (busy.value || props.disabled) return;
  busy.value = true; emit("working", true); message.value = "";
  try { await action(); }
  catch (error) { message.value = error instanceof Error ? error.message : "训练操作失败"; }
  finally { busy.value = false; emit("working", false); }
}
async function savePlan() { await run(async () => { state.value = await trainingDiary.savePlan({ ...planForm, id: editingPlan.value }); resetPlan(); message.value = "训练计划已保存，可在训练记录中直接选择"; }); }
async function deletePlan(id: string) { await run(async () => { state.value = await trainingDiary.deletePlan(id); resetPlan(); message.value = "训练计划已删除，已保存的训练记录保留"; }); }
async function saveRecord() {
  const editing = editingRecord.value;
  await run(async () => {
    if (!props.snapshot.selectedCycle) throw new Error("请先选择减脂周期");
    emit("change", await trainingDiary.saveRecord({ id: editing, cycleId: props.snapshot.selectedCycle.id, planId: recordForm.planId, date: recordDate.value, content: recordForm.content, bodyParts: [...recordForm.bodyParts], feeling: recordForm.feeling, saveAsPlan: recordForm.saveAsPlan }));
    state.value = await trainingDiary.open();
    await loadWeek(); resetRecord();
    message.value = editing ? "训练记录已更新" : "训练记录已保存，已确认当天练过";
  });
}
async function deleteRecord(id: string) { await run(async () => { emit("change", await trainingDiary.deleteRecord(id)); state.value = await trainingDiary.open(); await loadWeek(); resetRecord(); message.value = "训练记录已删除"; }); }
onMounted(async () => {
  await run(async () => { const opened = await trainingDiary.open(); state.value = opened; recordDate.value = clampDate(props.snapshot.selectedDate); weekDate.value = clampDate(props.snapshot.selectedDate); await loadWeek(); });
});
</script>

<template>
  <view class="training-diary">
    <view v-if="week && snapshot.selectedCycle" class="card">
      <text class="title">训练周历</text>
      <text class="meta">只展示已经发生的实际训练。选择星期可直接补录当天记录；浅绿色表示当天已记录，空白表示没有训练记录。</text>
      <view class="actions">
        <button role="button" :disabled="busy || disabled || week.days[0].date <= snapshot.selectedCycle.startDate" @click="moveWeek(-7)">上一周</button>
        <text class="meta">{{ week.days[0].date }} — {{ week.days[6].date }}</text>
        <button role="button" :disabled="busy || disabled || week.days[6].date >= snapshot.selectedCycle.endDate" @click="moveWeek(7)">下一周</button>
      </view>
      <view class="calendar">
        <view v-for="(day, index) in week.days" :key="day.date" class="calendar-day" :class="{ outside: !day.inCycle }">
          <button role="button" class="day-heading" :disabled="!day.inCycle || busy || disabled" :aria-label="`选择训练日期 ${day.date}`" @click="startRecordFor(day.date)">周{{ weekdays[index] }} · {{ day.date.slice(5) }}</button>
          <text v-if="!day.inCycle" class="meta">周期外</text>
          <text v-else-if="!day.records.length" class="meta">无训练记录</text>
          <view v-for="record in day.records" :key="record.id" class="project completed">
            <text class="entry-title">{{ record.bodyParts?.join(' / ') || '未分类' }}</text>
            <text class="content">{{ record.content }}</text>
          </view>
        </view>
      </view>
    </view>
    <view class="card">
      <text class="title">自己的训练计划</text>
      <text class="meta">训练计划是可复用的模板，不绑定日期。记录训练时可直接选择，也可独立填写。记录训练不会改变营养基准、实际摄入或剩余额。</text>
      <label>训练名称 *<input v-model="planForm.title" aria-label="计划训练名称" maxlength="100" placeholder="填写自己的训练名称" /></label>
      <label>训练内容 *<textarea v-model="planForm.content" aria-label="计划训练内容" maxlength="2000" placeholder="填写自己的训练安排" auto-height @blur="planForm.content = textValue($event)" /></label>
      <TrainingParts v-model="planForm.bodyParts" :disabled="busy || disabled" />
      <view class="actions">
        <button role="button" class="primary" :disabled="busy || disabled" @click="savePlan">{{ editingPlan ? '保存计划修改' : '创建训练计划' }}</button>
        <button role="button" v-if="editingPlan" :disabled="busy || disabled" @click="resetPlan">取消计划编辑</button>
      </view>
      <text v-if="!plans.length" class="meta">暂无训练计划；可在上方创建，或直接填写训练内容。</text>
      <view v-for="plan in plans" :key="plan.id" class="entry">
        <text class="entry-title">{{ plan.title }}</text>
        <text class="meta">{{ plan.bodyParts?.join(' / ') || '未分类' }}</text>
        <text class="content">{{ plan.content }}</text>
        <view class="actions">
          <button role="button" v-if="snapshot.selectedCycle" :disabled="busy || disabled" :aria-label="`使用训练计划 ${plan.id}`" @click="usePlan(plan)">记录此计划</button>
          <button role="button" :disabled="busy || disabled" :aria-label="`编辑训练计划 ${plan.id}`" @click="editPlan(plan)">编辑计划</button>
          <button role="button" :disabled="busy || disabled" :aria-label="`删除训练计划 ${plan.id}`" @click="deletingPlan = plan.id">删除计划</button>
        </view>
        <view v-if="deletingPlan === plan.id" class="actions">
          <text class="meta">删除计划后已保存的训练记录仍保留。</text>
          <button role="button" :disabled="busy || disabled" @click="deletePlan(plan.id)">确认删除训练计划</button>
          <button role="button" :disabled="busy || disabled" @click="deletingPlan = undefined">取消计划删除</button>
        </view>
      </view>
    </view>
    <view v-if="snapshot.selectedCycle" class="card">
      <text class="title">{{ editingRecord ? '编辑训练记录' : '记录训练' }}</text>
      <template v-if="canRecord">
        <text class="meta">保存即确认当天练过，不再需要完成开关。一天可以有多条训练记录。</text>
        <label>训练日期
          <picker mode="date" :value="recordDate" :start="snapshot.selectedCycle.startDate" :end="latestRecordDate" :disabled="busy || disabled" @change="recordDate = String($event.detail.value)">
            <view class="date-picker">{{ recordDate }}</view>
          </picker>
        </label>
        <text class="meta">可选择今天及过去日期；记录必须属于所选周期，不能记录未来。</text>
        <picker :range="planOptions" :value="selectedPlan" :disabled="busy || disabled" @change="choosePlan"><view class="time-value">选择训练计划：{{ planOptions[selectedPlan] || '独立填写' }}</view></picker>
        <label>训练内容 *<textarea v-model="recordForm.content" aria-label="训练内容" maxlength="2000" placeholder="填写实际训练内容，可先选择训练计划填入" auto-height @blur="recordForm.content = textValue($event)" /></label>
        <TrainingParts v-model="recordForm.bodyParts" :disabled="busy || disabled" />
        <image v-if="recordForm.content" class="decoration" :src="trainingImage(recordDate, recordForm.bodyParts)" mode="widthFix" aria-label="自动训练趣味图片" />
        <label class="switch-row"><text>同时保存为训练计划</text><switch :checked="recordForm.saveAsPlan" aria-label="同时保存为训练计划" :disabled="busy || disabled" @change="setSaveAsPlan" /></label>
        <label>训练感受<textarea v-model="recordForm.feeling" aria-label="训练感受" maxlength="2000" placeholder="可选，记录自己的感受" auto-height @blur="recordForm.feeling = textValue($event)" /></label>
        <view class="actions">
          <button role="button" class="primary" :disabled="busy || disabled" @click="saveRecord">{{ editingRecord ? '保存训练修改' : '保存训练记录' }}</button>
          <button role="button" :disabled="busy || disabled" @click="resetRecord">取消训练编辑</button>
        </view>
      </template>
      <text v-else class="meta">该周期尚未开始，暂不能记录训练。可先在首页切换日期与周期。</text>
    </view>
    <text v-if="message" class="notice" role="status">{{ message }}</text>
    <view class="card">
      <text class="title">{{ snapshot.selectedCycle ? '本周期训练记录' : '训练记录' }}</text>
      <text class="meta">按日期从新到旧。历史及归档周期内的记录可直接修改和删除，无需填写原因。</text>
      <text v-if="!cycleRecords.length" class="meta">本周期暂无训练记录</text>
      <view v-for="record in cycleRecords" :key="record.id" class="entry">
        <text class="entry-title">{{ record.date }}</text>
        <text class="meta">{{ record.bodyParts?.join(' / ') || '未分类' }}</text>
        <text class="content">{{ record.content }}</text>
        <text class="content">感受：{{ record.feeling || '未填写' }}</text>
        <text v-if="!trainedRecord(record)" class="meta">旧记录：尚未确认练过，保存后才会计入周历。</text>
        <image class="decoration" :src="trainingImage(record.date, record.bodyParts)" mode="widthFix" aria-label="自动训练趣味图片" />
        <view v-if="snapshot.selectedCycle" class="actions">
          <button role="button" :disabled="busy || disabled" :aria-label="`编辑训练记录 ${record.id}`" @click="editRecord(record)">编辑训练记录</button>
          <button role="button" :disabled="busy || disabled" :aria-label="`删除训练记录 ${record.id}`" @click="deletingRecord = record.id">删除训练记录</button>
        </view>
        <view v-if="deletingRecord === record.id" class="actions">
          <text class="meta">确认删除 {{ record.date }} 的这条训练记录？</text>
          <button role="button" :disabled="busy || disabled" @click="deleteRecord(record.id)">确认删除训练记录</button>
          <button role="button" :disabled="busy || disabled" @click="deletingRecord = undefined">取消训练删除</button>
        </view>
      </view>
    </view>
  </view>
</template>

<style scoped>
.card { padding: 28rpx; margin-bottom: 24rpx; border: 1rpx solid #e0e7e2; border-radius: 28rpx; background: #fff; }
.title { display: block; margin-bottom: 20rpx; font-size: 32rpx; font-weight: 700; }
.meta { display: block; margin: 12rpx 0; color: #626e66; font-size: 24rpx; line-height: 1.6; }
label { display: flex; flex-direction: column; gap: 12rpx; margin: 18rpx 0; font-size: 24rpx; }
input, textarea { box-sizing: border-box; width: 100%; min-height: 76rpx; padding: 16rpx; border: 1rpx solid #dce4de; border-radius: 18rpx; background: #f9fbfa; }
textarea { min-height: 140rpx; }
.date-picker { padding: 20rpx 16rpx; border: 1rpx solid #dce4de; border-radius: 18rpx; background: #f9fbfa; }
.actions { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 18rpx; }
button { margin: 0; font-size: 24rpx; color: #315e47; background: #f7faf8; }
.primary, .selected { color: #fff; background: #1f7a4c; }
.switch-row { flex-direction: row; align-items: center; justify-content: space-between; }
.entry { padding: 20rpx 0; border-top: 1rpx solid #edf1ee; }
.entry-title { display: block; font-size: 28rpx; font-weight: 600; }
.content { display: block; margin-top: 12rpx; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 26rpx; line-height: 1.6; }
.notice { display: block; padding: 20rpx; margin-bottom: 24rpx; background: #e5f2ea; border-radius: 18rpx; }
.calendar { display: flex; flex-direction: column; gap: 16rpx; margin: 24rpx 0; }
.calendar-day { border: 1rpx solid #e0e7e2; border-radius: 18rpx; padding: 16rpx; }
.outside { opacity: 0.55; }
.day-heading { width: 100%; text-align: left; }
.project { padding: 16rpx; margin-top: 12rpx; border-radius: 14rpx; background: #f7faf8; }
.completed { background: #e3f3e8; }
.decoration { display: block; width: 100%; max-width: 560rpx; margin: 20rpx auto; border-radius: 18rpx; }
</style>
