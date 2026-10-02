<script setup lang="ts">
import { reactive, ref } from "vue";
import { fatLossDiary } from "../application/runtime";
import type { DiarySnapshot, MealRecord, MealSummary, Nutrients } from "../domain/diary";
import { parseFoodNumber } from "../domain/foodLibrary";

const props = defineProps<{ snapshot: DiarySnapshot; canEdit: boolean; disabled: boolean; selectedGroup: string }>();
const emit = defineEmits<{
  (event: "change", snapshot: DiarySnapshot): void;
  (event: "select", id: string): void;
  (event: "working", value: boolean): void;
}>();
const expanded = reactive<Record<string, boolean>>({ breakfast: true });
const showConfig = ref(false);
const names = reactive<Record<string, string>>({});
const newName = ref("");
const editing = ref<string>();
const amount = ref("");
const destination = ref("");
const pendingDelete = ref<string>();
const busy = ref(false);
const message = ref("");
function nutrients(value: Nutrients) {
  return `碳水 ${value.carbohydrateGrams}g · 蛋白质 ${value.proteinGrams}g · 脂肪 ${value.fatGrams}g · ${value.energyKcal} kcal`;
}
async function run(action: () => Promise<DiarySnapshot>) {
  if (busy.value || props.disabled) return;
  busy.value = true;
  emit("working", true);
  message.value = "";
  try { emit("change", await action()); }
  catch (error) { message.value = error instanceof Error ? error.message : "餐食操作失败"; }
  finally { busy.value = false; emit("working", false); }
}
function selection() { return { cycleId: props.snapshot.selectedCycle?.id, date: props.snapshot.selectedDate }; }
function toggleConfig() {
  for (const group of props.snapshot.mealGroups) names[group.id] = group.name;
  showConfig.value = !showConfig.value;
}
async function configure(group: MealSummary, hidden = group.hidden) {
  await run(() => fatLossDiary.configureMealGroup({ id: group.id, name: names[group.id] ?? group.name, hidden }, selection()));
}
function edit(meal: MealRecord) {
  editing.value = meal.id;
  amount.value = String(meal.amount);
  destination.value = meal.mealSlot;
}
async function save(meal: MealRecord) {
  await run(async () => {
    const snapshot = await fatLossDiary.updateMeal({ id: meal.id, amount: parseFoodNumber(amount.value, "食用量"), mealSlot: destination.value });
    editing.value = undefined;
    return snapshot;
  });
}
async function remove(id: string) {
  await run(async () => {
    const snapshot = await fatLossDiary.deleteMeal(id);
    pendingDelete.value = undefined;
    return snapshot;
  });
}
</script>

<template>
  <view class="diary">
    <view class="heading"><text class="title">六餐日记</text><button role="button" @click="toggleConfig">{{ showConfig ? '收起餐次设置' : '餐次设置' }}</button></view>
    <text v-if="message" role="status" class="notice">{{ message }}</text>
    <text v-if="!canEdit" class="meta">当前日期仅供查看；餐食只能在当天录入、编辑和删除。</text>
    <view v-if="showConfig" class="config card">
      <view v-for="group in snapshot.mealGroups" :key="group.id" class="config-row">
        <input v-model="names[group.id]" :aria-label="`${group.name}餐次名称`" maxlength="30" />
        <button role="button" :disabled="busy || disabled" @click="configure(group)">保存 {{ group.name }}名称</button>
        <button role="button" :disabled="busy || disabled" @click="configure(group, !group.hidden)">{{ group.hidden ? '重新显示' : '隐藏' }} {{ group.name }}</button>
      </view>
      <text class="meta">隐藏只收起餐次，已有餐食仍计入全天汇总。</text>
      <input v-model="newName" aria-label="新增餐次名称" maxlength="30" placeholder="新增餐次名称" />
      <button role="button" :disabled="busy || disabled" @click="run(async () => { const result = await fatLossDiary.addMealGroup(newName, selection()); newName = ''; return result; })">新增餐次</button>
    </view>
    <view v-for="group in snapshot.mealGroups.filter((item) => !item.hidden)" :key="group.id" class="card meal-card">
      <view class="heading">
        <button role="button" class="group-title" :aria-expanded="!!expanded[group.id]" @click="expanded[group.id] = !expanded[group.id]">{{ group.name }} · {{ group.meals.length }} 条 · {{ expanded[group.id] ? '收起' : '展开' }}</button>
        <button role="button" v-if="canEdit" :disabled="busy || disabled" :class="{ selected: selectedGroup === group.id }" @click="emit('select', group.id); expanded[group.id] = true">{{ selectedGroup === group.id ? '已选餐次' : `录入到${group.name}` }}</button>
      </view>
      <text class="meta meal-total">餐次汇总：{{ nutrients(group.actual) }}</text>
      <view v-if="expanded[group.id]">
        <text v-if="!group.meals.length" class="meta">暂无餐食记录</text>
        <view v-for="meal in group.meals" :key="meal.id" class="entry">
          <text class="entry-name">{{ meal.foodName }} · {{ meal.amount }}{{ meal.unit === 'g' ? 'g' : '个' }}</text>
          <text class="meta">{{ nutrients(meal.nutrients) }}</text>
          <view v-if="canEdit" class="actions"><button role="button" :disabled="busy || disabled" @click="edit(meal)">编辑餐食 {{ meal.foodName }}</button><button role="button" :disabled="busy || disabled" @click="pendingDelete = meal.id">删除餐食 {{ meal.foodName }}</button></view>
          <view v-if="editing === meal.id && canEdit" class="editor">
            <label>食用量（{{ meal.unit === 'g' ? 'g' : '个' }}）<input v-model="amount" type="digit" aria-label="编辑餐食数量" /></label>
            <text class="meta">按此记录保存时的食材数据换算。</text>
            <view class="actions"><button role="button" v-for="target in snapshot.mealGroups.filter((item) => !item.hidden)" :key="target.id" :class="{ selected: destination === target.id }" @click="destination = target.id">移至{{ target.name }}</button></view>
            <view class="actions"><button role="button" :disabled="busy || disabled" @click="save(meal)">保存餐食修改</button><button role="button" @click="editing = undefined">取消餐食编辑</button></view>
          </view>
          <view v-if="pendingDelete === meal.id && canEdit" class="actions"><text>删除这条餐食？</text><button role="button" :disabled="busy || disabled" @click="remove(meal.id)">确认删除餐食</button><button role="button" @click="pendingDelete = undefined">取消删除餐食</button></view>
        </view>
      </view>
    </view>
    <text v-if="snapshot.mealGroups.some((group) => group.hidden)" class="meta">部分餐次已隐藏，其记录仍计入全天实际摄入；在餐次设置中重新显示。</text>
  </view>
</template>

<style scoped>
.diary { margin-bottom: 24rpx; }
.heading, .actions, .config-row { display: flex; flex-wrap: wrap; align-items: center; gap: 12rpx; }
.heading { justify-content: space-between; margin-bottom: 18rpx; }
.title { font-size: 32rpx; font-weight: 700; }
.card { padding: 24rpx; margin-bottom: 18rpx; background: white; border: 1rpx solid #e0e7e2; border-radius: 24rpx; }
button { margin: 0; font-size: 24rpx; color: #315e47; background: #f7faf8; }
.group-title { padding: 0; background: white; font-size: 28rpx; font-weight: 600; }
.group-title::after { border: none; }
.selected { color: white; background: #1f7a4c; }
.meta { display: block; margin: 12rpx 0; color: #626e66; font-size: 24rpx; line-height: 1.6; }
.entry { border-top: 1rpx solid #edf1ee; padding: 20rpx 0; }
.entry-name { font-size: 28rpx; font-weight: 600; }
input { min-height: 76rpx; padding: 0 20rpx; border: 1rpx solid #dce4de; border-radius: 18rpx; background: #f9fbfa; }
.config-row { margin-bottom: 16rpx; }
.config-row input { flex: 1; min-width: 160rpx; }
.editor { margin-top: 16rpx; padding: 16rpx; background: #f9fbfa; }
.notice { display: block; margin: 16rpx 0; }
</style>
