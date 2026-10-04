<script setup lang="ts">
import { trainingBodyParts, type TrainingBodyPart } from "../domain/training";
const props = defineProps<{ modelValue: TrainingBodyPart[]; disabled?: boolean }>();
const emit = defineEmits<{ (event: "update:modelValue", value: TrainingBodyPart[]): void }>();
function toggle(part: TrainingBodyPart) {
  emit("update:modelValue", props.modelValue.includes(part) ? props.modelValue.filter((item) => item !== part) : [...props.modelValue, part]);
}
</script>
<template>
  <view class="parts">
    <text class="label">训练部位（可选，多选）</text>
    <view class="choices">
      <button v-for="part in trainingBodyParts" :key="part" role="button" :aria-label="`训练部位${part}`" :aria-pressed="modelValue.includes(part)" :class="{ selected: modelValue.includes(part) }" :disabled="disabled" @click="toggle(part)">{{ part }}</button>
    </view>
  </view>
</template>
<style scoped>
.label { display: block; font-size: 24rpx; margin: 18rpx 0 12rpx; }
.choices { display: flex; flex-wrap: wrap; gap: 12rpx; }
button { margin: 0; font-size: 24rpx; color: #315e47; background: #f7faf8; }
.selected { color: #fff; background: #1f7a4c; }
</style>
