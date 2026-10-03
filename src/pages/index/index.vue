<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";

import { fatLossDiary } from "../../application/runtime";
import BodyProgress from "../../components/BodyProgress.vue";
import FoodLibrary from "../../components/FoodLibrary.vue";
import MealDiary from "../../components/MealDiary.vue";
import TrainingDiary from "../../components/TrainingDiary.vue";
import type {
  DiarySnapshot,
  FatLossCycle,
  Food,
} from "../../domain/diary";
import type { DayType, Sex, WeeklyExercise } from "../../domain/nutrition";

const sexOptions: Array<{ label: string; value: Sex }> = [
  { label: "男", value: "male" },
  { label: "女", value: "female" },
];
const exerciseOptions: Array<{ label: string; value: WeeklyExercise }> = [
  { label: "2–3 小时 / 2 次", value: "low" },
  { label: "4–5 小时 / 3 次", value: "medium" },
  { label: "6–7 小时 / 4 次", value: "high" },
  { label: "8–9 小时 / 5 次", value: "very-high" },
];
const dayTypeOptions: Array<{ label: string; value: DayType }> = [
  { label: "训练日", value: "training" },
  { label: "有氧 / 轻训日", value: "cardio" },
  { label: "休息日", value: "rest" },
];
const experienceOptions: Array<{ label: string; value: boolean }> = [
  { label: "有减脂基础", value: true },
  { label: "无减脂基础", value: false },
];
const snapshot = ref<DiarySnapshot>();
const page = ref<"today" | "training" | "progress">("today");
const busy = ref(false);
const message = ref("");
const selectedGroup = ref("breakfast");
const visibleGroups = computed(() => snapshot.value?.mealGroups.filter((group) => !group.hidden) ?? []);
watch(visibleGroups, (groups) => {
  if (!groups.some((group) => group.id === selectedGroup.value)) selectedGroup.value = groups[0]?.id ?? "";
});
const platform = fatLossDiary.getPlatformCapabilities();

const form = reactive({
  nickname: "",
  sex: "" as Sex | "",
  age: "",
  heightCm: "",
  currentWeightKg: "",
  weeklyExercise: "" as WeeklyExercise | "",
  hasFatLossExperience: undefined as boolean | undefined,
  targetWeightKg: "",
  userCarbohydrateGrams: "",
  userProteinGrams: "",
  userFatGrams: "",
});

const cycleForm = reactive({
  startDate: "",
  dayType: "" as DayType | "",
});

const heroTitle = computed(() => {
  if (!snapshot.value?.selectedCycle) return "今天";
  return snapshot.value.selectedDate === snapshot.value.today
    ? "今天"
    : snapshot.value.selectedDate;
});

const canRecordToday = computed(
  () =>
    snapshot.value?.selectedCycle?.id === snapshot.value?.activeCycle?.id &&
    snapshot.value?.selectedDate === snapshot.value?.today,
);

const actualPercentage = computed(() => {
  const baseline = snapshot.value?.baseline?.energyKcal ?? 0;
  const actual = snapshot.value?.actual.energyKcal ?? 0;
  return baseline > 0 ? Math.min(100, Math.round((actual / baseline) * 100)) : 0;
});

const energyStatus = computed(() => snapshot.value?.energyStatus);

function setPickerValue<T>(
  event: { detail: { value: string | number } },
  options: Array<{ value: T }>,
): T {
  return options[Number(event.detail.value)].value;
}

function toRequiredNumber(value: string): number {
  return Number.parseFloat(value);
}

function toOptionalNumber(value: string): number | undefined {
  return value.trim() ? Number.parseFloat(value) : undefined;
}

function buildUserTarget() {
  const values = [
    form.userCarbohydrateGrams,
    form.userProteinGrams,
    form.userFatGrams,
  ];
  if (values.every((value) => !value.trim())) return undefined;
  if (values.some((value) => !value.trim())) {
    throw new Error("请完整填写用户目标的碳水、蛋白质和脂肪，或全部留空");
  }
  return {
    carbohydrateGrams: toRequiredNumber(form.userCarbohydrateGrams),
    proteinGrams: toRequiredNumber(form.userProteinGrams),
    fatGrams: toRequiredNumber(form.userFatGrams),
  };
}

async function refresh(): Promise<void> {
  snapshot.value = await fatLossDiary.openDiary();
  cycleForm.startDate ||= snapshot.value.today;
}

async function establishProfile(): Promise<void> {
  busy.value = true;
  message.value = "";
  try {
    snapshot.value = await fatLossDiary.establishProfile({
      nickname: form.nickname,
      sex: form.sex as Sex,
      age: toRequiredNumber(form.age),
      heightCm: toRequiredNumber(form.heightCm),
      currentWeightKg: toRequiredNumber(form.currentWeightKg),
      weeklyExercise: form.weeklyExercise as WeeklyExercise,
      hasFatLossExperience: form.hasFatLossExperience as boolean,
      targetWeightKg: toOptionalNumber(form.targetWeightKg),
      userTarget: buildUserTarget(),
    });
    cycleForm.startDate = snapshot.value.today;
    message.value = "健康档案已保存，请创建减脂周期";
  } catch (error) {
    message.value = error instanceof Error ? error.message : "建档失败";
  } finally {
    busy.value = false;
  }
}

function formatMonthDay(date: string): string {
  return date.slice(5).replace("-", "/");
}

function weekdayLabel(date: string): string {
  const weekday = new Date(`${date}T00:00:00.000Z`).getUTCDay();
  return ["日", "一", "二", "三", "四", "五", "六"][weekday];
}

async function startCycle(): Promise<void> {
  busy.value = true;
  message.value = "";
  try {
    snapshot.value = await fatLossDiary.startCycle({
      startDate: cycleForm.startDate,
      dayType: cycleForm.dayType as DayType,
    });
    message.value = "90 日减脂周期已创建";
  } catch (error) {
    message.value = error instanceof Error ? error.message : "创建周期失败";
  } finally {
    busy.value = false;
  }
}

async function openDate(date: string, cycleId?: string): Promise<void> {
  try {
    snapshot.value = await fatLossDiary.openDiary({ date, cycleId });
  } catch (error) {
    message.value = error instanceof Error ? error.message : "切换日期失败";
  }
}

async function chooseCalendarDate(event: {
  detail: { value: string | number };
}): Promise<void> {
  await openDate(String(event.detail.value), snapshot.value?.selectedCycle?.id);
}

async function chooseDayType(dayType: DayType): Promise<void> {
  if (!snapshot.value?.activeCycle) return;
  busy.value = true;
  message.value = "";
  try {
    snapshot.value = await fatLossDiary.setDayType({
      cycleId: snapshot.value.activeCycle.id,
      date: snapshot.value.selectedDate,
      dayType,
    });
    message.value = "日型和营养基准已保存";
  } catch (error) {
    message.value = error instanceof Error ? error.message : "保存日型失败";
  } finally {
    busy.value = false;
  }
}

async function archiveCycle(): Promise<void> {
  busy.value = true;
  message.value = "";
  try {
    snapshot.value = await fatLossDiary.archiveActiveCycle();
    cycleForm.startDate = snapshot.value.today;
    cycleForm.dayType = "";
    message.value = "减脂周期已提前归档，可开始新周期";
  } catch (error) {
    message.value = error instanceof Error ? error.message : "归档周期失败";
  } finally {
    busy.value = false;
  }
}

async function viewCycle(cycle: FatLossCycle): Promise<void> {
  const today = snapshot.value?.today;
  const date =
    today && today >= cycle.startDate && today <= cycle.endDate
      ? today
      : cycle.startDate;
  await openDate(date, cycle.id);
}

async function addFood(food: Food, amount: number): Promise<void> {
  if (!canRecordToday.value || !selectedGroup.value || busy.value) return;
  busy.value = true;
  message.value = "";
  try {
    snapshot.value = await fatLossDiary.saveMeal({
      mealSlot: selectedGroup.value,
      foodId: food.id,
      amount,
      date: snapshot.value?.selectedDate,
    });
    message.value = `${food.name} 已保存到${visibleGroups.value.find((group) => group.id === selectedGroup.value)?.name}`;
  } catch (error) {
    message.value = error instanceof Error ? error.message : "保存餐食失败";
  } finally {
    busy.value = false;
  }
}

onMounted(async () => {
  try {
    await refresh();
  } catch (error) {
    message.value = error instanceof Error ? error.message : "读取记录失败";
  }
});
</script>

<template>
  <view class="page-shell">
    <view class="hero">
      <text class="eyebrow">90 天减脂记录</text>
      <text class="title">{{ page === 'progress' ? '进度' : page === 'training' ? '训练' : heroTitle }}</text>
      <text class="subtitle">只记录计算结果、实际摄入和真实体重</text>
    </view>

    <view v-if="message" class="message">{{ message }}</view>

    <view v-if="!snapshot?.profile" class="card">
      <text class="card-title">首次启动 · 建立健康档案</text>
      <text class="onboarding-copy">填写健康档案。带 * 的字段必须填写，缺失时不会保存。</text>
      <label class="field">
        <text>昵称 *</text>
        <input v-model="form.nickname" placeholder="请输入昵称" />
      </label>
      <view class="field-row">
        <label class="field compact">
          <text>性别 *</text>
          <picker
            :range="sexOptions"
            range-key="label"
            @change="form.sex = setPickerValue($event, sexOptions)"
          >
            <view class="picker-value">{{ sexOptions.find((item) => item.value === form.sex)?.label ?? '请选择性别' }}</view>
          </picker>
        </label>
        <label class="field compact">
          <text>年龄 *</text>
          <input v-model="form.age" type="number" placeholder="须年满 18 岁" />
        </label>
      </view>
      <view class="field-row">
        <label class="field compact">
          <text>身高（cm）*</text>
          <input v-model="form.heightCm" type="digit" placeholder="请输入身高" />
        </label>
        <label class="field compact">
          <text>当前体重（kg）*</text>
          <input v-model="form.currentWeightKg" type="digit" placeholder="请输入体重" />
        </label>
      </view>
      <label class="field">
        <text>每周运动频率 *</text>
        <picker
          :range="exerciseOptions"
          range-key="label"
          @change="form.weeklyExercise = setPickerValue($event, exerciseOptions)"
        >
          <view class="picker-value">{{ exerciseOptions.find((item) => item.value === form.weeklyExercise)?.label ?? '请选择每周运动频率' }}</view>
        </picker>
      </label>
      <view class="field-row">
        <label class="field compact">
          <text>减脂基础 *</text>
          <picker
            :range="experienceOptions"
            range-key="label"
            @change="form.hasFatLossExperience = setPickerValue($event, experienceOptions)"
          >
            <view class="picker-value">{{ experienceOptions.find((item) => item.value === form.hasFatLossExperience)?.label ?? '请选择' }}</view>
          </picker>
        </label>
        <label class="field compact">
          <text>目标体重（kg）</text>
          <input v-model="form.targetWeightKg" type="digit" placeholder="可选" />
        </label>
      </view>
      <text class="section-title">可选用户目标</text>
      <text class="onboarding-copy">如需记录自己的营养目标，请完整填写三项；它不会覆盖营养基准。</text>
      <view class="target-grid">
        <label class="field compact">
          <text>碳水（g）</text>
          <input v-model="form.userCarbohydrateGrams" type="digit" placeholder="可选" />
        </label>
        <label class="field compact">
          <text>蛋白质（g）</text>
          <input v-model="form.userProteinGrams" type="digit" placeholder="可选" />
        </label>
        <label class="field compact">
          <text>脂肪（g）</text>
          <input v-model="form.userFatGrams" type="digit" placeholder="可选" />
        </label>
      </view>
      <button class="primary-button" :loading="busy" @click="establishProfile">
        保存健康档案
      </button>
    </view>

    <template v-else>
      <view class="page-tabs">
        <button role="button" :class="{ selected: page === 'today' }" @click="page = 'today'">今天</button>
        <button role="button" :class="{ selected: page === 'training' }" @click="page = 'training'">训练</button>
        <button role="button" :class="{ selected: page === 'progress' }" @click="page = 'progress'">进度</button>
      </view>
      <view class="card profile-card">
        <view>
          <text class="card-title">{{ snapshot.profile.nickname }}的健康档案</text>
          <text class="profile-meta">年龄 {{ snapshot.profile.age }} 岁 · 身高 {{ snapshot.profile.heightCm }} cm · 当前体重 {{ snapshot.profile.currentWeightKg }} kg</text>
        </view>
        <view class="bmi-value">
          <text>BMI</text>
          <text class="energy-number">{{ snapshot.bmi }}</text>
          <text class="energy-unit">仅显示数值</text>
        </view>
      </view>

      <view v-if="!snapshot.activeCycle" class="card cycle-card">
        <text class="card-title">开始 90 日减脂周期</text>
        <text class="onboarding-copy">选择开始日期和首日日型。一个时间只能有一个进行中的周期。</text>
        <label class="field">
          <text>周期开始日期 *</text>
          <picker mode="date" :value="cycleForm.startDate" @change="cycleForm.startDate = String($event.detail.value)">
            <view class="picker-value">{{ cycleForm.startDate || '请选择开始日期' }}</view>
          </picker>
        </label>
        <label class="field">
          <text>首日日型 *</text>
          <picker
            :range="dayTypeOptions"
            range-key="label"
            @change="cycleForm.dayType = setPickerValue($event, dayTypeOptions)"
          >
            <view class="picker-value">{{ dayTypeOptions.find((item) => item.value === cycleForm.dayType)?.label ?? '请选择日型' }}</view>
          </picker>
        </label>
        <button class="primary-button" :loading="busy" @click="startCycle">创建周期</button>
      </view>

      <view v-else class="card cycle-card">
        <view class="cycle-heading">
          <view>
            <text class="card-title">进行中的减脂周期</text>
            <text class="profile-meta">{{ snapshot.activeCycle.startDate }} 至 {{ snapshot.activeCycle.endDate }}</text>
          </view>
          <view class="cycle-actions">
            <button
              v-if="snapshot.selectedCycle?.id !== snapshot.activeCycle.id"
              class="calendar-button"
              @click="viewCycle(snapshot.activeCycle)"
            >
              查看进行中
            </button>
            <button class="archive-button" :disabled="busy" @click="archiveCycle">提前归档</button>
          </view>
        </view>
      </view>

      <view v-if="snapshot.cycles.some((cycle) => cycle.status === 'archived')" class="card">
        <text class="card-title">已归档周期</text>
        <button
          v-for="cycle in snapshot.cycles.filter((item) => item.status === 'archived')"
          :key="cycle.id"
          class="history-button"
          @click="viewCycle(cycle)"
        >
          {{ cycle.startDate }} 至 {{ cycle.endDate }} · 查看
        </button>
      </view>

      <view v-if="snapshot.selectedCycle" class="card calendar-card">
        <view class="cycle-heading">
          <view>
            <text class="card-title">{{ snapshot.selectedCycle.status === 'active' ? '进行中' : '已归档' }}周期日期</text>
            <text class="profile-meta">当前查看 {{ snapshot.selectedDate }}</text>
          </view>
          <picker
            mode="date"
            :value="snapshot.selectedDate"
            :start="snapshot.selectedCycle.startDate"
            :end="snapshot.selectedCycle.endDate"
            @change="chooseCalendarDate"
          >
            <view class="calendar-button">完整日历</view>
          </picker>
        </view>
        <view class="date-strip">
          <button
            v-for="date in snapshot.dateStrip"
            :key="date"
            class="date-button"
            :class="{ selected: date === snapshot.selectedDate }"
            @click="openDate(date, snapshot.selectedCycle?.id)"
          >
            <text>周{{ weekdayLabel(date) }}</text>
            <text>{{ formatMonthDay(date) }}</text>
          </button>
        </view>
        <view
          v-if="snapshot.selectedCycle.id === snapshot.activeCycle?.id"
          class="day-type-row"
        >
          <button
            v-for="option in dayTypeOptions"
            :key="option.value"
            class="day-type-button"
            :class="{ selected: option.value === snapshot.dayType }"
            :disabled="busy || snapshot.selectedDate < snapshot.today"
            @click="chooseDayType(option.value)"
          >
            {{ option.label }}
          </button>
        </view>
        <text v-else class="profile-meta">日型：{{ dayTypeOptions.find((option) => option.value === snapshot?.dayType)?.label ?? '未记录' }}</text>
      </view>

      <view v-if="snapshot.selectedCycle && snapshot.isBlankDate" class="card blank-card">
        <text class="card-title">本日暂无记录</text>
        <text class="empty-copy">没有日型、营养、餐食、训练或身体记录，保持空白。</text>
      </view>

      <template v-if="page === 'today'">
      <view v-if="snapshot.baseline" class="card energy-card" :class="`status-${energyStatus}`">
        <view class="energy-ring" :style="{ '--progress': `${actualPercentage * 3.6}deg` }">
          <view class="energy-ring-inner">
            <text class="energy-number">{{ snapshot.actual.energyKcal }}</text>
            <text class="energy-unit">kcal 已记录</text>
          </view>
        </view>
        <view class="energy-copy">
          <text class="card-title">当日能量</text>
          <text>营养基准 {{ snapshot.baseline?.energyKcal }} kcal</text>
          <text>用户目标 {{ snapshot.userTarget ? `${snapshot.userTarget.energyKcal} kcal` : '未设置' }}</text>
          <text>实际摄入 {{ snapshot.actual.energyKcal }} kcal</text>
          <text>剩余额 {{ snapshot.remaining?.energyKcal }} kcal</text>
        </view>
      </view>

      <view v-if="snapshot.baseline" class="macro-grid">
        <view class="macro-card">
          <text>碳水</text>
          <text class="macro-value">实际 {{ snapshot.actual.carbohydrateGrams }}g</text>
          <text class="macro-meta">基准 {{ snapshot.baseline?.carbohydrateGrams }}g · 用户目标 {{ snapshot.userTarget ? `${snapshot.userTarget.carbohydrateGrams}g` : '未设置' }}</text>
          <text class="macro-meta">剩余额 {{ snapshot.remaining?.carbohydrateGrams }}g</text>
        </view>
        <view class="macro-card">
          <text>蛋白质</text>
          <text class="macro-value">实际 {{ snapshot.actual.proteinGrams }}g</text>
          <text class="macro-meta">基准 {{ snapshot.baseline?.proteinGrams }}g · 用户目标 {{ snapshot.userTarget ? `${snapshot.userTarget.proteinGrams}g` : '未设置' }}</text>
          <text class="macro-meta">剩余额 {{ snapshot.remaining?.proteinGrams }}g</text>
        </view>
        <view class="macro-card">
          <text>脂肪</text>
          <text class="macro-value">实际 {{ snapshot.actual.fatGrams }}g</text>
          <text class="macro-meta">基准 {{ snapshot.baseline?.fatGrams }}g · 用户目标 {{ snapshot.userTarget ? `${snapshot.userTarget.fatGrams}g` : '未设置' }}</text>
          <text class="macro-meta">剩余额 {{ snapshot.remaining?.fatGrams }}g</text>
        </view>
      </view>

      <MealDiary v-if="snapshot.selectedCycle" :snapshot="snapshot" :can-edit="!!(canRecordToday && snapshot.baseline)" :disabled="busy" :selected-group="selectedGroup" @change="snapshot = $event" @select="selectedGroup = $event" @working="busy = $event" />
      <text v-if="canRecordToday && snapshot.baseline" class="section-title">录入餐次：{{ visibleGroups.find((group) => group.id === selectedGroup)?.name ?? '请先显示或新增餐次' }}</text>

      <FoodLibrary :can-add="!!(canRecordToday && snapshot.baseline && selectedGroup)" :disabled="busy" @add="addFood" />
      </template>
      <BodyProgress v-if="page === 'progress' && snapshot.selectedCycle" :snapshot="snapshot" :can-edit="!!canRecordToday" :disabled="busy" @change="snapshot = $event" @working="busy = $event" />
      <TrainingDiary v-if="page === 'training'" :snapshot="snapshot" :can-edit="!!canRecordToday" :disabled="busy" @change="snapshot = $event" @working="busy = $event" />

      <view class="platform-note">
        <text>运行平台：{{ platform.kind }}</text>
        <text>本地持久化 {{ platform.localPersistence ? '可用' : '不可用' }} · 趋势图 {{ platform.canvas ? '可用' : '不可用' }}</text>
      </view>
    </template>
  </view>
</template>

<style scoped>
page {
  background: #f4f7f5;
}

.page-shell {
  min-height: 100vh;
  padding: 36rpx 28rpx 72rpx;
  color: #1c2b23;
  background: #f4f7f5;
  box-sizing: border-box;
}

.hero {
  display: flex;
  flex-direction: column;
  margin-bottom: 28rpx;
}
.page-tabs { display: flex; gap: 16rpx; margin-bottom: 24rpx; }
.page-tabs button { flex: 1; margin: 0; color: #315e47; background: white; }
.page-tabs .selected { color: white; background: #1f7a4c; }

.eyebrow {
  color: #4b7860;
  font-size: 24rpx;
  letter-spacing: 2rpx;
}

.title {
  margin-top: 8rpx;
  font-size: 56rpx;
  font-weight: 700;
}

.subtitle,
.food-meta,
.empty-copy,
.platform-note,
.onboarding-copy,
.profile-meta,
.macro-meta {
  color: #6b776f;
  font-size: 24rpx;
}

.onboarding-copy {
  display: block;
  margin: -10rpx 0 24rpx;
  line-height: 1.6;
}

.section-title {
  display: block;
  margin: 8rpx 0 20rpx;
  font-size: 28rpx;
  font-weight: 700;
}

.message {
  margin-bottom: 20rpx;
  padding: 20rpx 24rpx;
  border-radius: 20rpx;
  color: #315e47;
  background: #e5f2ea;
}

.card,
.macro-card {
  margin-bottom: 24rpx;
  padding: 28rpx;
  border: 1rpx solid #e0e7e2;
  border-radius: 28rpx;
  background: #ffffff;
  box-shadow: 0 10rpx 28rpx rgba(32, 67, 47, 0.06);
}

.card-title {
  display: block;
  margin-bottom: 24rpx;
  font-size: 32rpx;
  font-weight: 700;
}

.field-row,
.search-row,
.energy-card,
.profile-card,
.food-result,
.meal-row {
  display: flex;
  gap: 18rpx;
  align-items: center;
}

.field {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 10rpx;
  margin-bottom: 22rpx;
  color: #56645c;
  font-size: 24rpx;
}

.field input,
.picker-value,
.search-input {
  min-height: 76rpx;
  padding: 0 20rpx;
  border: 1rpx solid #dce4de;
  border-radius: 18rpx;
  color: #1c2b23;
  background: #f9fbfa;
  box-sizing: border-box;
  line-height: 76rpx;
}

.compact {
  min-width: 0;
}

.target-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 12rpx;
}

.primary-button,
.secondary-button,
.add-button {
  border: none;
  color: #ffffff;
  background: #1f7a4c;
}

.cycle-heading,
.cycle-actions,
.date-strip,
.day-type-row {
  display: flex;
  gap: 12rpx;
  align-items: center;
}

.cycle-heading {
  justify-content: space-between;
}

.cycle-actions {
  flex: 0 0 auto;
}

.cycle-heading .card-title {
  margin-bottom: 8rpx;
}

.archive-button,
.calendar-button,
.history-button,
.date-button,
.day-type-button {
  border: 1rpx solid #dce4de;
  color: #315e47;
  background: #f7faf8;
  font-size: 24rpx;
}

.archive-button {
  flex: 0 0 auto;
  margin: 0;
  color: #8f4b3f;
  background: #fff7f5;
}

.calendar-button {
  padding: 16rpx 20rpx;
  border-radius: 16rpx;
}

.history-button {
  margin-top: 14rpx;
  text-align: left;
}

.date-strip {
  margin: 28rpx 0;
  align-items: stretch;
}

.date-button {
  display: flex;
  min-width: 0;
  flex: 1;
  flex-direction: column;
  gap: 4rpx;
  margin: 0;
  padding: 12rpx 4rpx;
  line-height: 1.4;
}

.date-button.selected,
.day-type-button.selected {
  border-color: #1f7a4c;
  color: #ffffff;
  background: #1f7a4c;
}

.day-type-row {
  align-items: stretch;
}

.day-type-button {
  flex: 1;
  margin: 0;
  padding: 12rpx 6rpx;
  line-height: 1.4;
}

.blank-card {
  border-style: dashed;
  box-shadow: none;
}

.primary-button {
  border-radius: 22rpx;
}

.secondary-button,
.add-button {
  flex: 0 0 auto;
  border-radius: 18rpx;
  font-size: 26rpx;
}

.search-input {
  flex: 1;
}

.energy-card {
  justify-content: space-between;
}

.profile-card {
  justify-content: space-between;
}

.profile-card .card-title {
  margin-bottom: 12rpx;
}

.bmi-value {
  display: flex;
  flex: 0 0 auto;
  flex-direction: column;
  align-items: center;
  gap: 4rpx;
}

.energy-ring {
  display: flex;
  width: 220rpx;
  height: 220rpx;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: conic-gradient(#1f7a4c var(--progress), #e9eeeb 0);
}

.status-low .energy-ring {
  background: conic-gradient(#d58b35 var(--progress), #f3eadd 0);
}

.status-high .energy-ring {
  background: conic-gradient(#c95353 var(--progress), #f4e1e1 0);
}

.energy-ring-inner {
  display: flex;
  width: 164rpx;
  height: 164rpx;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  border-radius: 50%;
  background: #ffffff;
}

.energy-number {
  font-size: 42rpx;
  font-weight: 700;
}

.energy-unit {
  color: #6b776f;
  font-size: 22rpx;
}

.energy-copy {
  display: flex;
  flex: 1;
  flex-direction: column;
  gap: 12rpx;
}

.macro-grid {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 14rpx;
  margin-bottom: 24rpx;
}

.macro-card {
  margin: 0;
  padding: 22rpx 16rpx;
}

.macro-value {
  display: block;
  margin-top: 10rpx;
  color: #435149;
  font-size: 22rpx;
  font-weight: 600;
}

.macro-meta {
  display: block;
  margin-top: 8rpx;
  line-height: 1.5;
}

.food-result,
.meal-row {
  justify-content: space-between;
  margin-top: 20rpx;
  padding-top: 20rpx;
  border-top: 1rpx solid #edf1ee;
}

.food-result > view {
  display: flex;
  flex-direction: column;
}

.food-name {
  font-weight: 600;
}

.meal-list {
  margin-top: 26rpx;
}

.meal-row {
  color: #435149;
  font-size: 24rpx;
}

.platform-note {
  display: flex;
  flex-direction: column;
  gap: 8rpx;
  padding: 12rpx 8rpx;
}
</style>
