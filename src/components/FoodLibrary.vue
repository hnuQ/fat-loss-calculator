<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { foodLibrary } from "../application/runtime";
import type { Food, Nutrients } from "../domain/diary";
import { parseFoodNumber, validateCustomFood, type CustomFoodInput } from "../domain/foodLibrary";

const props = defineProps<{ canAdd: boolean; disabled?: boolean }>();
const emit = defineEmits<{ (event: "add", food: Food, amount: number): void }>();
const query = ref("");
const filter = ref<"all" | "recent" | "favorites" | "custom">("all");
const filters = [
  { value: "all" as const, label: "全部" },
  { value: "recent" as const, label: "最近使用" },
  { value: "favorites" as const, label: "收藏" },
  { value: "custom" as const, label: "自定义" },
];
const foods = ref<Food[]>([]);
const favorites = ref<string[]>([]);
const selected = ref<Food>();
const amount = ref("");
const preview = ref<Nutrients>();
const processing = ref(false);
const busy = computed(() => processing.value || props.disabled);
const message = ref("");
const showEditor = ref(false);
const editId = ref<string>();
const pendingDelete = ref<string>();
const form = reactive({ name: "", basis: "per100g" as CustomFoodInput["basis"], carbohydrate: "", protein: "", fat: "" });
const unit = computed(() => selected.value?.unit === "item" ? "个" : "g");

function customInput(): CustomFoodInput {
  return {
    name: form.name, basis: form.basis,
    carbohydrateGrams: parseFoodNumber(form.carbohydrate, "碳水"),
    proteinGrams: parseFoodNumber(form.protein, "蛋白质"),
    fatGrams: parseFoodNumber(form.fat, "脂肪"),
  };
}
const calculatedEnergy = computed(() => {
  try { return validateCustomFood(customInput()).nutrients.energyKcal; }
  catch { return "待填写有效数据"; }
});

async function load() {
  const result = await foodLibrary.browse(query.value, filter.value);
  foods.value = result.foods;
  favorites.value = result.favoriteIds;
}
async function run(action: () => Promise<void>) {
  if (busy.value) return;
  processing.value = true;
  message.value = "";
  try { await action(); }
  catch (error) { message.value = error instanceof Error ? error.message : "食材操作失败"; }
  finally { processing.value = false; }
}
async function search() { await run(load); }
async function changeFilter(value: typeof filter.value) {
  filter.value = value;
  await search();
}
function select(food: Food) {
  selected.value = food;
  amount.value = String(food.baseAmount);
  preview.value = undefined;
  message.value = "";
}
function edit(food?: Food) {
  editId.value = food?.id;
  form.name = food?.name ?? "";
  form.basis = food?.unit === "item" ? "perItem" : "per100g";
  form.carbohydrate = food ? String(food.nutrients.carbohydrateGrams) : "";
  form.protein = food ? String(food.nutrients.proteinGrams) : "";
  form.fat = food ? String(food.nutrients.fatGrams) : "";
  showEditor.value = true;
  message.value = "";
}
async function save() {
  await run(async () => {
    const food = await foodLibrary.saveCustomFood(customInput(), editId.value);
    select(food);
    showEditor.value = false;
    await load();
    message.value = "自定义食材已保存";
  });
}
async function remove(id: string) {
  await run(async () => {
    await foodLibrary.deleteCustomFood(id);
    if (selected.value?.id === id) { selected.value = undefined; preview.value = undefined; }
    if (editId.value === id) showEditor.value = false;
    pendingDelete.value = undefined;
    await load();
    message.value = "自定义食材已删除，已保存餐食保留原值";
  });
}
async function toggleFavorite(id: string) {
  await run(async () => { await foodLibrary.toggleFavorite(id); await load(); });
}
async function calculate(add = false) {
  await run(async () => {
    if (!selected.value) return;
    const quantity = parseFoodNumber(amount.value, "食用量");
    preview.value = await foodLibrary.preview(selected.value.id, quantity);
    await load();
    if (add && props.canAdd) emit("add", selected.value, quantity);
    else message.value = "本次数量已换算，并保存到最近使用";
  });
}
onMounted(search);
</script>

<template>
  <view class="library-card">
    <text class="heading">食材库</text>
    <text class="hint">78 种只读内置食材 · 液体按克 · 全蛋和蛋白按个</text>
    <view class="search-row">
      <input v-model="query" aria-label="食材名称搜索" placeholder="搜索内置或自定义食材名称" @confirm="search" />
      <button role="button" :disabled="busy" @click="search">搜索</button>
    </view>
    <view class="tabs">
      <button role="button" v-for="tab in filters" :key="tab.value" :class="{ active: filter === tab.value }" :disabled="busy" @click="changeFilter(tab.value)">{{ tab.label }}</button>
    </view>
    <button role="button" :disabled="busy" @click="edit()">新建自定义食材</button>
    <text v-if="message" class="notice" role="status">{{ message }}</text>

    <view v-if="showEditor" class="editor">
      <text class="heading">{{ editId ? '编辑自定义食材' : '新建自定义食材' }}</text>
      <label>食材名称<input v-model="form.name" aria-label="自定义食材名称" maxlength="60" placeholder="1–60 个字符" /></label>
      <view class="tabs">
        <button role="button" :class="{ active: form.basis === 'per100g' }" @click="form.basis = 'per100g'">每 100g</button>
        <button role="button" :class="{ active: form.basis === 'perItem' }" @click="form.basis = 'perItem'">每个</button>
      </view>
      <text class="hint">当前基准：{{ form.basis === 'per100g' ? '每 100g' : '每个' }}；三大营养素合计最多 {{ form.basis === 'per100g' ? '100' : '10,000' }}g，零值与小数有效。</text>
      <label>碳水（g）<input v-model="form.carbohydrate" type="digit" aria-label="自定义碳水" /></label>
      <label>蛋白质（g）<input v-model="form.protein" type="digit" aria-label="自定义蛋白质" /></label>
      <label>脂肪（g）<input v-model="form.fat" type="digit" aria-label="自定义脂肪" /></label>
      <text class="hint">热量 {{ calculatedEnergy }} kcal；4/4/9，各项热量取整后相加。</text>
      <view class="tabs"><button role="button" :disabled="busy" @click="save">保存自定义食材</button><button role="button" :disabled="busy" @click="showEditor = false">取消编辑</button></view>
    </view>

    <view v-if="selected" class="selection">
      <text class="heading">已选：{{ selected.name }}</text>
      <label>食用量（{{ unit }}）<input v-model="amount" type="digit" :aria-label="`食用量（${unit}）`" @input="preview = undefined" /></label>
      <text class="hint">大于 0，最多 {{ selected.unit === 'g' ? '100,000g' : '1,000个' }}，支持小数。</text>
      <view class="tabs"><button role="button" :disabled="busy" @click="calculate()">换算本次数量</button><button role="button" v-if="canAdd" :disabled="busy" @click="calculate(true)">添加到所选餐次</button></view>
      <text v-if="preview" class="hint">本次：碳水 {{ preview.carbohydrateGrams }}g · 蛋白质 {{ preview.proteinGrams }}g · 脂肪 {{ preview.fatGrams }}g · {{ preview.energyKcal }} kcal</text>
    </view>

    <text class="hint">当前结果 {{ foods.length }} 项；最近使用按最后使用排序，最多 20 项。</text>
    <text v-if="!foods.length" class="hint">没有找到匹配食材</text>
    <scroll-view class="food-list" scroll-y>
      <view v-for="food in foods" :key="food.id" class="food-row">
        <text class="food-name">{{ food.name }}</text>
        <text class="hint">{{ food.id.startsWith('custom-') ? '自定义' : '内置只读' }} · 每 {{ food.baseAmount }}{{ food.unit === 'g' ? 'g' : '个' }} · {{ food.nutrients.energyKcal }} kcal</text>
        <text class="hint">碳水 {{ food.nutrients.carbohydrateGrams }}g · 蛋白质 {{ food.nutrients.proteinGrams }}g · 脂肪 {{ food.nutrients.fatGrams }}g</text>
        <view class="tabs">
          <button role="button" :disabled="busy" @click="select(food)">选择 {{ food.name }}</button>
          <button role="button" :disabled="busy" @click="toggleFavorite(food.id)">{{ favorites.includes(food.id) ? '取消收藏' : '收藏' }} {{ food.name }}</button>
          <template v-if="food.id.startsWith('custom-')">
            <button role="button" :disabled="busy" @click="edit(food)">编辑 {{ food.name }}</button>
            <button role="button" :disabled="busy" @click="pendingDelete = food.id">删除 {{ food.name }}</button>
          </template>
        </view>
        <view v-if="pendingDelete === food.id" class="tabs"><text>删除此自定义食材？</text><button role="button" :disabled="busy" @click="remove(food.id)">确认删除</button><button role="button" @click="pendingDelete = undefined">取消删除</button></view>
      </view>
    </scroll-view>
  </view>
</template>

<style scoped>
.library-card { margin-bottom: 24rpx; padding: 28rpx; border: 1rpx solid #e0e7e2; border-radius: 28rpx; background: white; }
.heading, .hint, .notice, .food-name { display: block; }
.heading { margin-bottom: 16rpx; font-size: 32rpx; font-weight: 700; }
.hint { margin: 12rpx 0; color: #6b776f; font-size: 24rpx; line-height: 1.6; }
.notice { margin: 16rpx 0; padding: 16rpx; background: #e5f2ea; color: #315e47; }
.search-row, .tabs { display: flex; flex-wrap: wrap; align-items: center; gap: 12rpx; margin: 16rpx 0; }
input { min-height: 76rpx; padding: 0 20rpx; border: 1rpx solid #dce4de; border-radius: 18rpx; background: #f9fbfa; }
.search-row input { flex: 1; min-width: 180rpx; }
label { display: block; margin: 16rpx 0; font-size: 26rpx; }
button { margin: 0; font-size: 24rpx; color: #315e47; background: #f7faf8; }
.active { color: white; background: #1f7a4c; }
.editor, .selection { margin: 24rpx 0; padding: 20rpx; border: 1rpx solid #dce4de; border-radius: 18rpx; }
.food-list { max-height: 700rpx; }
.food-row { padding: 20rpx 0; border-top: 1rpx solid #edf1ee; }
.food-name { font-weight: 600; }
</style>
