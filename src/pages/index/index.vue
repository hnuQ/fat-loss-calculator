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
  sex: "male" as Sex,
  age: 30,
  heightCm: 170,
  currentWeightKg: 70,
  weeklyExercise: "medium" as WeeklyExercise,
  hasFatLossExperience: false,
  targetWeightKg: 65,
  dayType: "training" as DayType,
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

function setExperience(event: Event): void {
  form.hasFatLossExperience = (
    event as Event & { detail: { value: boolean } }
  ).detail.value;
}

function setMeal(event: { detail: { value: string | number } }): void {
  selectedMealIndex.value = Number(event.detail.value);
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
    snapshot.value = await fatLossDiary.establishProfile({ ...form });
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
      <text class="card-title">建立健康档案</text>
      <label class="field">
        <text>昵称</text>
        <input v-model="form.nickname" placeholder="可选" />
      </label>
      <view class="field-row">
        <label class="field compact">
          <text>性别</text>
          <picker
            :range="sexOptions"
            range-key="label"
            @change="form.sex = setPickerValue($event, sexOptions)"
          >
            <view class="picker-value">{{ sexOptions.find((item) => item.value === form.sex)?.label }}</view>
          </picker>
        </label>
        <label class="field compact">
          <text>年龄</text>
          <input v-model.number="form.age" type="number" />
        </label>
      </view>
      <view class="field-row">
        <label class="field compact">
          <text>身高（cm）</text>
          <input v-model.number="form.heightCm" type="digit" />
        </label>
        <label class="field compact">
          <text>当前体重（kg）</text>
          <input v-model.number="form.currentWeightKg" type="digit" />
        </label>
      </view>
      <label class="field">
        <text>每周运动</text>
        <picker
          :range="exerciseOptions"
          range-key="label"
          @change="form.weeklyExercise = setPickerValue($event, exerciseOptions)"
        >
          <view class="picker-value">{{ exerciseOptions.find((item) => item.value === form.weeklyExercise)?.label }}</view>
        </picker>
      </label>
      <label class="field">
        <text>日型</text>
        <picker
          :range="dayTypeOptions"
          range-key="label"
          @change="form.dayType = setPickerValue($event, dayTypeOptions)"
        >
          <view class="picker-value">{{ dayTypeOptions.find((item) => item.value === form.dayType)?.label }}</view>
        </picker>
      </label>
      <view class="field-row">
        <label class="field compact">
          <text>目标体重（kg）</text>
          <input v-model.number="form.targetWeightKg" type="digit" />
        </label>
        <label class="field compact checkbox-field">
          <text>减脂基础</text>
          <switch
            color="#1f7a4c"
            :checked="form.hasFatLossExperience"
            @change="setExperience"
          />
        </label>
      </view>
      <button class="primary-button" :loading="busy" @click="establishProfile">
        保存并计算营养基准
      </button>
    </view>

    <template v-else>
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
          <text>剩余 {{ snapshot.remaining?.energyKcal }} kcal</text>
        </view>
      </view>

      <view class="macro-grid">
        <view class="macro-card">
          <text>碳水</text>
          <text class="macro-value">{{ snapshot.actual.carbohydrateGrams }} / {{ snapshot.baseline?.carbohydrateGrams }}g</text>
        </view>
        <view class="macro-card">
          <text>蛋白质</text>
          <text class="macro-value">{{ snapshot.actual.proteinGrams }} / {{ snapshot.baseline?.proteinGrams }}g</text>
        </view>
        <view class="macro-card">
          <text>脂肪</text>
          <text class="macro-value">{{ snapshot.actual.fatGrams }} / {{ snapshot.baseline?.fatGrams }}g</text>
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
.platform-note {
  color: #6b776f;
  font-size: 24rpx;
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

.checkbox-field {
  align-items: flex-start;
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
