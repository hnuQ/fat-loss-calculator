<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";

import { fatLossDiary } from "../../application/runtime";
import WeightTrendCanvas from "../../components/WeightTrendCanvas.vue";
import type {
  DiarySnapshot,
  Food,
  MealSlot,
  WeightTrend,
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
const mealOptions: Array<{ label: string; value: MealSlot }> = [
  { label: "早餐", value: "breakfast" },
  { label: "午加餐", value: "morning-snack" },
  { label: "午餐", value: "lunch" },
  { label: "晚加餐", value: "evening-snack" },
  { label: "晚餐", value: "dinner" },
  { label: "练后餐", value: "post-workout" },
];

const snapshot = ref<DiarySnapshot>();
const trend = ref<WeightTrend>();
const busy = ref(false);
const message = ref("");
const searchQuery = ref("");
const searchResults = ref<Food[]>([]);
const selectedMealIndex = ref(0);
const foodAmount = ref(50);
const weightKg = ref("");
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
  dayType: "" as DayType | "",
  userCarbohydrateGrams: "",
  userProteinGrams: "",
  userFatGrams: "",
});

const actualPercentage = computed(() => {
  const baseline = snapshot.value?.baseline?.energyKcal ?? 0;
  const actual = snapshot.value?.actual.energyKcal ?? 0;
  return baseline > 0 ? Math.min(100, Math.round((actual / baseline) * 100)) : 0;
});

const energyStatus = computed(() => {
  const baseline = snapshot.value?.baseline?.energyKcal ?? 0;
  const actual = snapshot.value?.actual.energyKcal ?? 0;
  if (!baseline || actual < baseline * 0.9) return "low";
  if (actual > baseline * 1.1) return "high";
  return "within";
});

function setPickerValue<T>(
  event: { detail: { value: string | number } },
  options: Array<{ value: T }>,
): T {
  return options[Number(event.detail.value)].value;
}

function setMeal(event: { detail: { value: string | number } }): void {
  selectedMealIndex.value = Number(event.detail.value);
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
  if (snapshot.value.profile) {
    trend.value = await fatLossDiary.readWeightTrend();
  }
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
      dayType: form.dayType as DayType,
      userTarget: buildUserTarget(),
    });
    trend.value = await fatLossDiary.readWeightTrend();
    message.value = "健康档案和营养基准已保存";
  } catch (error) {
    message.value = error instanceof Error ? error.message : "建档失败";
  } finally {
    busy.value = false;
  }
}

function searchFoods(): void {
  searchResults.value = fatLossDiary.searchFoods(searchQuery.value);
  message.value = searchResults.value.length ? "" : "没有找到匹配食材";
}

async function addFood(food: Food): Promise<void> {
  busy.value = true;
  message.value = "";
  try {
    snapshot.value = await fatLossDiary.saveMeal({
      mealSlot: mealOptions[selectedMealIndex.value].value,
      foodId: food.id,
      amount: Number(foodAmount.value),
    });
    message.value = `${food.name} 已保存到${mealOptions[selectedMealIndex.value].label}`;
  } catch (error) {
    message.value = error instanceof Error ? error.message : "保存餐食失败";
  } finally {
    busy.value = false;
  }
}

async function recordWeight(): Promise<void> {
  busy.value = true;
  message.value = "";
  try {
    snapshot.value = await fatLossDiary.recordWeight({
      weightKg: Number(weightKg.value),
    });
    trend.value = await fatLossDiary.readWeightTrend();
    weightKg.value = "";
    message.value = "体重已追加记录";
  } catch (error) {
    message.value = error instanceof Error ? error.message : "记录体重失败";
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
      <text class="title">今天</text>
      <text class="subtitle">只记录计算结果、实际摄入和真实体重</text>
    </view>

    <view v-if="message" class="message">{{ message }}</view>

    <view v-if="!snapshot?.profile" class="card">
      <text class="card-title">首次启动 · 建立健康档案</text>
      <text class="onboarding-copy">第 1 步：填写健康档案。带 * 的字段必须填写，缺失时不会计算。</text>
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
      <text class="section-title">第 2 步：选择计算日型</text>
      <label class="field">
        <text>日型 *</text>
        <picker
          :range="dayTypeOptions"
          range-key="label"
          @change="form.dayType = setPickerValue($event, dayTypeOptions)"
        >
          <view class="picker-value">{{ dayTypeOptions.find((item) => item.value === form.dayType)?.label ?? '请选择日型' }}</view>
        </picker>
      </label>
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
        保存并计算营养基准
      </button>
    </view>

    <template v-else>
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

      <view class="card energy-card" :class="`status-${energyStatus}`">
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
          <text>剩余 {{ snapshot.remaining?.energyKcal }} kcal</text>
        </view>
      </view>

      <view class="macro-grid">
        <view class="macro-card">
          <text>碳水</text>
          <text class="macro-value">实际 {{ snapshot.actual.carbohydrateGrams }}g</text>
          <text class="macro-meta">基准 {{ snapshot.baseline?.carbohydrateGrams }}g · 用户目标 {{ snapshot.userTarget ? `${snapshot.userTarget.carbohydrateGrams}g` : '未设置' }}</text>
        </view>
        <view class="macro-card">
          <text>蛋白质</text>
          <text class="macro-value">实际 {{ snapshot.actual.proteinGrams }}g</text>
          <text class="macro-meta">基准 {{ snapshot.baseline?.proteinGrams }}g · 用户目标 {{ snapshot.userTarget ? `${snapshot.userTarget.proteinGrams}g` : '未设置' }}</text>
        </view>
        <view class="macro-card">
          <text>脂肪</text>
          <text class="macro-value">实际 {{ snapshot.actual.fatGrams }}g</text>
          <text class="macro-meta">基准 {{ snapshot.baseline?.fatGrams }}g · 用户目标 {{ snapshot.userTarget ? `${snapshot.userTarget.fatGrams}g` : '未设置' }}</text>
        </view>
      </view>

      <view class="card">
        <text class="card-title">记录餐食</text>
        <view class="search-row">
          <input v-model="searchQuery" class="search-input" placeholder="搜索燕麦、米饭、鸡蛋…" />
          <button class="secondary-button" @click="searchFoods">搜索</button>
        </view>
        <view class="field-row">
          <label class="field compact">
            <text>餐次</text>
            <picker :range="mealOptions" range-key="label" @change="setMeal">
              <view class="picker-value">{{ mealOptions[selectedMealIndex].label }}</view>
            </picker>
          </label>
          <label class="field compact">
            <text>食用量</text>
            <input v-model.number="foodAmount" type="digit" />
          </label>
        </view>
        <view v-for="food in searchResults" :key="food.id" class="food-result">
          <view>
            <text class="food-name">{{ food.name }}</text>
            <text class="food-meta">每 {{ food.baseAmount }}{{ food.unit === 'g' ? 'g' : '个' }} · {{ food.nutrients.energyKcal }} kcal</text>
            <text class="food-meta">本次添加 {{ foodAmount }}{{ food.unit === 'g' ? 'g' : '个' }}</text>
          </view>
          <button class="add-button" :disabled="busy" @click="addFood(food)">添加</button>
        </view>
        <view v-if="snapshot.meals.length" class="meal-list">
          <view v-for="meal in snapshot.meals" :key="meal.id" class="meal-row">
            <text>{{ mealOptions.find((item) => item.value === meal.mealSlot)?.label }} · {{ meal.foodName }}</text>
            <text>{{ meal.amount }}{{ meal.unit === 'g' ? 'g' : '个' }} / {{ meal.nutrients.energyKcal }} kcal</text>
          </view>
        </view>
      </view>

      <view class="card">
        <text class="card-title">90 天体重趋势</text>
        <view class="search-row">
          <input v-model="weightKg" class="search-input" type="digit" placeholder="今天的体重（kg）" />
          <button class="secondary-button" :disabled="busy" @click="recordWeight">记录</button>
        </view>
        <WeightTrendCanvas v-if="trend?.points.length" :trend="trend" />
        <text v-else class="empty-copy">记录体重后显示真实称重点，不补齐空白日期。</text>
      </view>

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
  color: #315e47;
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
