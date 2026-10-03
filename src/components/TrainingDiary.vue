<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { trainingDiary } from "../application/runtime";
import type { DiarySnapshot } from "../domain/diary";
import { trainingState, type TrainingPlan, type TrainingRecord, type TrainingState } from "../domain/training";

const props = defineProps<{ snapshot: DiarySnapshot; canEdit: boolean; disabled: boolean }>();
const emit = defineEmits<{ (event: "change", snapshot: DiarySnapshot): void; (event: "working", value: boolean): void }>();
const state = ref<TrainingState>(trainingState());
const capability = trainingDiary.capability();
const plans = computed(() => state.value.plans.filter((plan) => !plan.deletedAt));
const message = ref("");
const busy = ref(false);
const editingPlan = ref<string>();
const deletingPlan = ref<string>();
const deletingRecord = ref<string>();
const editingRecord = ref<string>();
const planForm = reactive({ title: "", content: "" });
const recordForm = reactive({ planId: undefined as string | undefined, title: "", content: "", completed: false, feeling: "" });
const reminderForm = reactive({ enabled: false, weekdays: [] as number[], time: "" });
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
function resetRecord() {
  editingRecord.value = undefined; deletingRecord.value = undefined;
  Object.assign(recordForm, { planId: undefined, title: "", content: "", completed: false, feeling: "" });
}
function resetPlan() { editingPlan.value = undefined; deletingPlan.value = undefined; planForm.title = ""; planForm.content = ""; }
watch([() => props.snapshot.selectedDate, () => props.snapshot.selectedCycle?.id], () => { resetRecord(); message.value = ""; });
function editPlan(plan: TrainingPlan) { resetPlan(); editingPlan.value = plan.id; Object.assign(planForm, { title: plan.title, content: plan.content }); }
function usePlan(plan: TrainingPlan) { resetRecord(); Object.assign(recordForm, { planId: plan.id, title: plan.title, content: plan.content }); }
function editRecord(record: TrainingRecord) { resetRecord(); editingRecord.value = record.id; Object.assign(recordForm, { planId: record.planId, title: record.title, content: record.content, completed: record.completed, feeling: record.feeling }); }
function toggleWeekday(day: number) { reminderForm.weekdays = reminderForm.weekdays.includes(day) ? reminderForm.weekdays.filter((item) => item !== day) : [...reminderForm.weekdays, day]; }
function setCompleted(event: Event) { recordForm.completed = (event as unknown as { detail: { value: boolean } }).detail.value; }
function setReminderEnabled(event: Event) { reminderForm.enabled = (event as unknown as { detail: { value: boolean } }).detail.value; }
function textValue(event: Event) { return (event as unknown as { detail: { value: string } }).detail.value; }
async function run(action: () => Promise<void>) {
  if (busy.value || props.disabled) return;
  busy.value = true; emit("working", true); message.value = "";
  try { await action(); }
  catch (error) { message.value = error instanceof Error ? error.message : "训练操作失败"; }
  finally { busy.value = false; emit("working", false); }
}
async function savePlan() { await run(async () => { state.value = await trainingDiary.savePlan({ ...planForm, id: editingPlan.value }); resetPlan(); message.value = "训练计划已保存"; }); }
async function deletePlan(id: string) { await run(async () => { state.value = await trainingDiary.deletePlan(id); resetPlan(); message.value = "训练计划已删除，已保存的训练记录保留"; }); }
async function saveRecord() { await run(async () => { emit("change", await trainingDiary.saveRecord({ ...recordForm, id: editingRecord.value, date: props.snapshot.selectedDate })); resetRecord(); message.value = "当天训练记录已保存"; }); }
async function deleteRecord(id: string) { await run(async () => { emit("change", await trainingDiary.deleteRecord(id)); resetRecord(); message.value = "当天训练记录已删除"; }); }
async function saveReminder() { await run(async () => { state.value = await trainingDiary.saveReminder({ ...reminderForm }); Object.assign(reminderForm, state.value.reminder); message.value = reminderForm.enabled ? "每周训练提醒已安排" : "训练提醒已关闭，系统安排已取消"; }); }
onMounted(async () => {
  await run(async () => { const opened = await trainingDiary.open(); state.value = opened; Object.assign(reminderForm, opened.reminder); message.value = opened.warning; });
});
</script>

<template>
  <view class="training-diary">
    <view class="card">
      <text class="title">自己的训练计划</text>
      <text class="meta">训练内容由你填写。记录训练不会改变营养基准、实际摄入或剩余额。</text>
      <label>训练名称 *<input v-model="planForm.title" aria-label="计划训练名称" maxlength="100" placeholder="填写自己的训练名称" /></label>
      <label>训练内容 *<textarea v-model="planForm.content" aria-label="计划训练内容" maxlength="2000" placeholder="填写自己的训练安排" auto-height @blur="planForm.content = textValue($event)" /></label>
      <view class="actions">
        <button role="button" class="primary" :disabled="busy || disabled" @click="savePlan">{{ editingPlan ? '保存计划修改' : '创建训练计划' }}</button>
        <button role="button" v-if="editingPlan" :disabled="busy || disabled" @click="resetPlan">取消计划编辑</button>
      </view>
      <text v-if="!plans.length" class="meta">暂无训练计划</text>
      <view v-for="plan in plans" :key="plan.id" class="entry">
        <text class="entry-title">{{ plan.title }}</text>
        <text class="content">{{ plan.content }}</text>
        <view class="actions">
          <button role="button" v-if="canEdit" :disabled="busy || disabled" :aria-label="`使用训练计划 ${plan.id}`" @click="usePlan(plan)">记录此计划</button>
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
    <view v-if="canEdit" class="card">
      <text class="title">{{ editingRecord ? '编辑当天训练' : '记录今天的训练' }}</text>
      <label>训练名称 *<input v-model="recordForm.title" aria-label="当天训练名称" maxlength="100" placeholder="填写训练名称，或选择已有计划" /></label>
      <label>训练内容 *<textarea v-model="recordForm.content" aria-label="当天训练内容" maxlength="2000" placeholder="填写实际训练内容" auto-height @blur="recordForm.content = textValue($event)" /></label>
      <label class="switch-row"><text>已完成</text><switch :checked="recordForm.completed" aria-label="当天训练已完成" :disabled="busy || disabled" @change="setCompleted" /></label>
      <label>训练感受<textarea v-model="recordForm.feeling" aria-label="当天训练感受" maxlength="2000" placeholder="可选，记录自己的感受" auto-height @blur="recordForm.feeling = textValue($event)" /></label>
      <view class="actions">
        <button role="button" class="primary" :disabled="busy || disabled" @click="saveRecord">{{ editingRecord ? '保存训练修改' : '保存当天训练' }}</button>
        <button role="button" :disabled="busy || disabled" @click="resetRecord">取消训练编辑</button>
      </view>
    </view>
    <text v-if="message" class="notice" role="status">{{ message }}</text>
    <view class="card">
      <text class="title">{{ snapshot.selectedDate }} · 训练记录</text>
      <text v-if="!canEdit" class="meta">仅当天进行中周期可记录。结束日期的训练内容、完成状态和感受均不可改写。</text>
      <text v-if="!snapshot.trainingRecords.length" class="meta">本日暂无训练记录</text>
      <view v-for="record in snapshot.trainingRecords" :key="record.id" class="entry">
        <text class="entry-title">{{ record.title }} · {{ record.completed ? '已完成' : '未完成' }}</text>
        <text class="content">{{ record.content }}</text>
        <text class="content">感受：{{ record.feeling || '未填写' }}</text>
        <view v-if="canEdit" class="actions">
          <button role="button" :disabled="busy || disabled" :aria-label="`编辑训练记录 ${record.id}`" @click="editRecord(record)">编辑当天训练</button>
          <button role="button" :disabled="busy || disabled" :aria-label="`删除训练记录 ${record.id}`" @click="deletingRecord = record.id">删除当天训练</button>
        </view>
        <view v-if="deletingRecord === record.id" class="actions">
          <button role="button" :disabled="busy || disabled" @click="deleteRecord(record.id)">确认删除当天训练</button>
          <button role="button" :disabled="busy || disabled" @click="deletingRecord = undefined">取消训练删除</button>
        </view>
      </view>
    </view>
    <view class="card">
      <text class="title">每周训练提醒</text>
      <text class="meta">默认关闭。主动选择星期和时间并保存后启用；关闭或修改会替换原安排。</text>
      <text class="meta">{{ capability.message }}</text>
      <label class="switch-row"><text>启用训练提醒</text><switch aria-label="启用训练提醒" :checked="reminderForm.enabled" :disabled="(!capability.supported && !reminderForm.enabled) || busy || disabled" @change="setReminderEnabled" /></label>
      <view v-if="capability.supported && reminderForm.enabled">
        <view class="weekday-row">
          <button role="button" v-for="(label, index) in weekdays" :key="label" :aria-label="`提醒星期${label}`" :class="{ selected: reminderForm.weekdays.includes(index + 1) }" :disabled="busy || disabled" @click="toggleWeekday(index + 1)">周{{ label }}</button>
        </view>
        <picker mode="time" :value="reminderForm.time" :disabled="busy || disabled" @change="reminderForm.time = String($event.detail.value)"><view class="time-value">提醒时间：{{ reminderForm.time || '请选择' }}</view></picker>
      </view>
      <button role="button" v-if="capability.supported || state.reminder.enabled" class="primary" :disabled="busy || disabled" @click="saveReminder">保存训练提醒设置</button>
      <text class="meta">{{ state.reminder.enabled ? `已保存：每周${state.reminder.weekdays.map((day) => weekdays[day - 1]).join('、')} ${state.reminder.time}` : '训练提醒已关闭' }}</text>
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
.actions, .weekday-row { display: flex; flex-wrap: wrap; gap: 12rpx; margin-top: 18rpx; }
button { margin: 0; font-size: 24rpx; color: #315e47; background: #f7faf8; }
.primary, .selected { color: #fff; background: #1f7a4c; }
.switch-row { flex-direction: row; align-items: center; justify-content: space-between; }
.entry { padding: 20rpx 0; border-top: 1rpx solid #edf1ee; }
.entry-title { display: block; font-size: 28rpx; font-weight: 600; }
.content { display: block; margin-top: 12rpx; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 26rpx; line-height: 1.6; }
.notice { display: block; padding: 20rpx; margin-bottom: 24rpx; background: #e5f2ea; border-radius: 18rpx; }
.time-value { padding: 24rpx 0; font-size: 28rpx; }
</style>
