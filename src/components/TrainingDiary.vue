<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { trainingDiary } from "../application/runtime";
import type { DiarySnapshot } from "../domain/diary";
import { trainingState, type TrainingBodyPart, type TrainingPlan, type TrainingRecord, type TrainingSchedule, type TrainingState, type TrainingWeek } from "../domain/training";
import { trainingImage } from "../application/trainingImages";
import { addCalendarDays } from "../domain/cycle";
import TrainingParts from "./TrainingParts.vue";

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
const planForm = reactive({ title: "", content: "", bodyParts: [] as TrainingBodyPart[] });
const recordForm = reactive({ planId: undefined as string | undefined, scheduleId: undefined as string | undefined, title: "", content: "", bodyParts: [] as TrainingBodyPart[], completed: false, feeling: "", saveAsPlan: false });
const scheduleForm = reactive({ id: undefined as string | undefined, planId: undefined as string | undefined, date: props.snapshot.selectedDate, title: "", content: "", bodyParts: [] as TrainingBodyPart[] });
const week = ref<TrainingWeek>();
const weekDate = ref(props.snapshot.selectedDate);
const selectedPlan = computed(() => recordForm.planId ? plans.value.findIndex((plan) => plan.id === recordForm.planId) + 1 : 0);
const planOptions = computed(() => ["独立填写临时内容", ...plans.value.map((plan) => plan.title)]);
const scheduleEditable = computed(() => props.snapshot.selectedCycle?.status === "active" && scheduleForm.date >= props.snapshot.today && scheduleForm.date >= props.snapshot.selectedCycle.startDate && scheduleForm.date <= props.snapshot.selectedCycle.endDate);
const reminderForm = reactive({ enabled: false, weekdays: [] as number[], time: "" });
const weekdays = ["一", "二", "三", "四", "五", "六", "日"];
function resetRecord() {
  editingRecord.value = undefined; deletingRecord.value = undefined;
  Object.assign(recordForm, { planId: undefined, scheduleId: undefined, title: "", content: "", bodyParts: [], completed: false, feeling: "", saveAsPlan: false });
}
function resetPlan() { editingPlan.value = undefined; deletingPlan.value = undefined; planForm.title = ""; planForm.content = ""; planForm.bodyParts = []; }
function resetSchedule(date = scheduleForm.date) { Object.assign(scheduleForm, { id: undefined, planId: undefined, date, title: "", content: "", bodyParts: [] }); }
async function loadWeek() { if (props.snapshot.selectedCycle) week.value = await trainingDiary.openWeek({ cycleId: props.snapshot.selectedCycle.id, date: weekDate.value }); else week.value = undefined; }
watch([() => props.snapshot.selectedDate, () => props.snapshot.selectedCycle?.id], () => { resetRecord(); resetSchedule(props.snapshot.selectedDate); weekDate.value = props.snapshot.selectedDate; message.value = ""; void run(loadWeek); });
function editPlan(plan: TrainingPlan) { resetPlan(); editingPlan.value = plan.id; Object.assign(planForm, { title: plan.title, content: plan.content, bodyParts: [...(plan.bodyParts ?? [])] }); }
function usePlan(plan: TrainingPlan) {
  if (!editingRecord.value) { const scheduleId = recordForm.scheduleId; resetRecord(); recordForm.scheduleId = scheduleId; }
  Object.assign(recordForm, { planId: plan.id, title: plan.title, content: plan.content, bodyParts: [...(plan.bodyParts ?? [])] });
}
function choosePlan(event: Event) {
  const plan = plans.value[Number(textValue(event)) - 1];
  Object.assign(recordForm, { planId: plan?.id, title: plan?.title ?? "", content: plan?.content ?? "", bodyParts: [...(plan?.bodyParts ?? [])] });
}
function chooseSchedulePlan(event: Event) {
  const plan = plans.value[Number(textValue(event)) - 1];
  Object.assign(scheduleForm, { planId: plan?.id, title: plan?.title ?? "", content: plan?.content ?? "", bodyParts: [...(plan?.bodyParts ?? [])] });
}
function editRecord(record: TrainingRecord) { resetRecord(); editingRecord.value = record.id; Object.assign(recordForm, { planId: record.planId, scheduleId: record.scheduleId, title: record.title, content: record.content, bodyParts: [...(record.bodyParts ?? [])], completed: record.completed, feeling: record.feeling }); }
function editSchedule(schedule: TrainingSchedule) { Object.assign(scheduleForm, { ...schedule, bodyParts: [...(schedule.bodyParts ?? [])] }); }
function useSchedule(schedule: TrainingSchedule) { const record = week.value?.days.flatMap((day) => day.records).find((item) => item.scheduleId === schedule.id); if (record) editRecord(record); else { resetRecord(); Object.assign(recordForm, { scheduleId: schedule.id, title: schedule.title, content: schedule.content, bodyParts: [...(schedule.bodyParts ?? [])] }); } }
async function moveWeek(offset: number) { await run(async () => { weekDate.value = addCalendarDays(weekDate.value, offset); await loadWeek(); }); }
async function saveSchedule() { await run(async () => { if (!props.snapshot.selectedCycle) return; await trainingDiary.saveSchedule({ ...scheduleForm, cycleId: props.snapshot.selectedCycle.id }); resetSchedule(); await loadWeek(); message.value = "训练排期已保存"; }); }
async function deleteSchedule(id: string) { await run(async () => { await trainingDiary.deleteSchedule(id); resetSchedule(); await loadWeek(); message.value = "排期已删除，实际记录保留"; }); }
function toggleWeekday(day: number) { reminderForm.weekdays = reminderForm.weekdays.includes(day) ? reminderForm.weekdays.filter((item) => item !== day) : [...reminderForm.weekdays, day]; }
function setCompleted(event: Event) { recordForm.completed = (event as unknown as { detail: { value: boolean } }).detail.value; }
function setSaveAsPlan(event: Event) { recordForm.saveAsPlan = (event as unknown as { detail: { value: boolean } }).detail.value; }
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
async function saveRecord() { await run(async () => { emit("change", await trainingDiary.saveRecord({ ...recordForm, id: editingRecord.value, date: props.snapshot.selectedDate })); state.value = await trainingDiary.open(); await loadWeek(); resetRecord(); message.value = "当天训练记录已保存"; }); }
async function deleteRecord(id: string) { await run(async () => { emit("change", await trainingDiary.deleteRecord(id)); await loadWeek(); resetRecord(); message.value = "当天训练记录已删除"; }); }
async function saveReminder() { await run(async () => { state.value = await trainingDiary.saveReminder({ ...reminderForm }); Object.assign(reminderForm, state.value.reminder); message.value = reminderForm.enabled ? "每周训练提醒已安排" : "训练提醒已关闭，系统安排已取消"; }); }
onMounted(async () => {
  await run(async () => { const opened = await trainingDiary.open(); state.value = opened; Object.assign(reminderForm, opened.reminder); await loadWeek(); message.value = opened.warning; });
});
</script>

<template>
  <view class="training-diary">
    <view v-if="week && snapshot.selectedCycle" class="card">
      <text class="title">训练周历</text>
      <text class="meta">逐日填写排期，可在同一天添加多个项目。浅绿色表示实际记录已确认完成。</text>
      <view class="actions">
        <button role="button" :disabled="busy || disabled || week.days[0].date <= snapshot.selectedCycle.startDate" @click="moveWeek(-7)">上一周</button>
        <text class="meta">{{ week.days[0].date }} — {{ week.days[6].date }}</text>
        <button role="button" :disabled="busy || disabled || week.days[6].date >= snapshot.selectedCycle.endDate" @click="moveWeek(7)">下一周</button>
      </view>
      <view class="calendar">
        <view v-for="(day, index) in week.days" :key="day.date" class="calendar-day" :class="{ outside: !day.inCycle }">
          <button role="button" class="day-heading" :disabled="!day.inCycle || busy || disabled" :aria-label="`排期日期 ${day.date}`" @click="resetSchedule(day.date)">周{{ weekdays[index] }} · {{ day.date.slice(5) }}</button>
          <text v-if="!day.inCycle" class="meta">周期外</text>
          <view v-for="project in day.projects" :key="project.id" class="project" :class="{ completed: project.completed }">
            <text class="entry-title">{{ project.title }}</text>
            <text class="meta">{{ project.bodyParts?.join(' / ') || '未分类' }}</text>
            <text class="content">{{ project.content }}</text>
            <text v-if="project.record" class="meta">实际：{{ project.record.title }} · {{ project.record.content }}</text>
            <view class="actions">
              <button v-if="canEdit && day.date === snapshot.today" role="button" :disabled="busy || disabled" :aria-label="`记录排期 ${project.id}`" @click="useSchedule(project)">{{ project.record ? '编辑实际记录' : '记录实际训练' }}</button>
              <button v-if="snapshot.selectedCycle.status === 'active' && day.date >= snapshot.today" role="button" :disabled="busy || disabled" :aria-label="`编辑排期 ${project.id}`" @click="editSchedule(project)">编辑排期</button>
              <button v-if="snapshot.selectedCycle.status === 'active' && day.date >= snapshot.today" role="button" :disabled="busy || disabled" :aria-label="`删除排期 ${project.id}`" @click="deleteSchedule(project.id)">删除排期</button>
            </view>
          </view>
          <view v-for="record in day.records.filter((item) => !item.scheduleId)" :key="record.id" class="project" :class="{ completed: record.completed }">
            <text class="entry-title">{{ record.title }}</text><text class="meta">{{ record.bodyParts?.join(' / ') || '未分类' }}</text>
          </view>
        </view>
      </view>
      <text class="title">{{ scheduleForm.date }} · {{ scheduleForm.id ? '编辑排期' : '添加排期' }}</text>
      <text v-if="!scheduleEditable" class="meta">过去日期及归档周期的排期只读。</text>
      <view v-else>
        <picker :range="planOptions" :disabled="busy || disabled" @change="chooseSchedulePlan"><view class="time-value">选择排期模板：{{ plans.find((plan) => plan.id === scheduleForm.planId)?.title || '独立填写' }}</view></picker>
        <label>排期训练名称 *<input v-model="scheduleForm.title" aria-label="排期训练名称" maxlength="100" /></label>
        <label>排期训练内容 *<textarea v-model="scheduleForm.content" aria-label="排期训练内容" maxlength="2000" auto-height @blur="scheduleForm.content = textValue($event)" /></label>
        <TrainingParts v-model="scheduleForm.bodyParts" :disabled="busy || disabled" />
        <view class="actions"><button role="button" class="primary" :disabled="busy || disabled" @click="saveSchedule">保存训练排期</button><button role="button" :disabled="busy || disabled" @click="resetSchedule()">取消排期编辑</button></view>
      </view>
    </view>
    <view class="card">
      <text class="title">自己的训练计划</text>
      <text class="meta">训练内容由你填写。记录训练不会改变营养基准、实际摄入或剩余额。</text>
      <label>训练名称 *<input v-model="planForm.title" aria-label="计划训练名称" maxlength="100" placeholder="填写自己的训练名称" /></label>
      <label>训练内容 *<textarea v-model="planForm.content" aria-label="计划训练内容" maxlength="2000" placeholder="填写自己的训练安排" auto-height @blur="planForm.content = textValue($event)" /></label>
      <TrainingParts v-model="planForm.bodyParts" :disabled="busy || disabled" />
      <view class="actions">
        <button role="button" class="primary" :disabled="busy || disabled" @click="savePlan">{{ editingPlan ? '保存计划修改' : '创建训练计划' }}</button>
        <button role="button" v-if="editingPlan" :disabled="busy || disabled" @click="resetPlan">取消计划编辑</button>
      </view>
      <text v-if="!plans.length" class="meta">暂无训练计划</text>
      <view v-for="plan in plans" :key="plan.id" class="entry">
        <text class="entry-title">{{ plan.title }}</text>
        <text class="meta">{{ plan.bodyParts?.join(' / ') || '未分类' }}</text>
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
      <picker :range="planOptions" :value="selectedPlan" :disabled="busy || disabled" @change="choosePlan"><view class="time-value">选择训练计划：{{ planOptions[selectedPlan] || '独立填写临时内容' }}</view></picker>
      <text v-if="recordForm.scheduleId" class="meta">正在记录所选排期的实际训练，修改内容不会改写排期。</text>
      <label>训练名称 *<input v-model="recordForm.title" aria-label="当天训练名称" maxlength="100" placeholder="填写训练名称，或选择已有计划" /></label>
      <label>训练内容 *<textarea v-model="recordForm.content" aria-label="当天训练内容" maxlength="2000" placeholder="填写实际训练内容" auto-height @blur="recordForm.content = textValue($event)" /></label>
      <TrainingParts v-model="recordForm.bodyParts" :disabled="busy || disabled" />
      <image v-if="recordForm.title || recordForm.content" class="decoration" :src="trainingImage(snapshot.selectedDate, recordForm.bodyParts)" mode="widthFix" aria-label="自动训练趣味图片" />
      <label class="switch-row"><text>同时保存为训练计划</text><switch :checked="recordForm.saveAsPlan" aria-label="同时保存为训练计划" :disabled="busy || disabled" @change="setSaveAsPlan" /></label>
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
        <text class="meta">{{ record.bodyParts?.join(' / ') || '未分类' }}</text>
        <text class="content">{{ record.content }}</text>
        <text class="content">感受：{{ record.feeling || '未填写' }}</text>
        <image class="decoration" :src="trainingImage(record.date, record.bodyParts)" mode="widthFix" aria-label="自动训练趣味图片" />
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
.calendar { display: flex; flex-direction: column; gap: 16rpx; margin: 24rpx 0; }
.calendar-day { border: 1rpx solid #e0e7e2; border-radius: 18rpx; padding: 16rpx; }
.outside { opacity: 0.55; }
.day-heading { width: 100%; text-align: left; }
.project { padding: 16rpx; margin-top: 12rpx; border-radius: 14rpx; background: #f7faf8; }
.completed { background: #e3f3e8; }
.decoration { display: block; width: 100%; max-width: 560rpx; margin: 20rpx auto; border-radius: 18rpx; }
</style>
