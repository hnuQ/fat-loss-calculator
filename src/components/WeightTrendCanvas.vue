<script setup lang="ts">
import { getCurrentInstance, nextTick, onMounted, ref, watch } from "vue";

import type { WeightTrend } from "../domain/diary";

const props = defineProps<{ trend: WeightTrend }>();

const width = ref(280);
const height = 180;
const padding = 24;
const componentInstance = getCurrentInstance()?.proxy;

function draw(): void {
  const context = uni.createCanvasContext("weight-trend-canvas", componentInstance);
  context.clearRect(0, 0, width.value, height);
  const values = props.trend.points.map((point) => point.weightKg);
  if (props.trend.targetWeightKg !== undefined) {
    values.push(props.trend.targetWeightKg);
  }
  if (values.length === 0) {
    context.draw();
    return;
  }

  const minimum = Math.min(...values) - 1;
  const maximum = Math.max(...values) + 1;
  const range = maximum - minimum || 1;
  const toY = (weightKg: number) =>
    padding + ((maximum - weightKg) / range) * (height - padding * 2);
  const toX = (day: number) =>
    padding + ((day - 1) / 89) * (width.value - padding * 2);

  context.setStrokeStyle("#e5e7eb");
  context.setLineWidth(1);
  context.beginPath();
  context.moveTo(padding, height - padding);
  context.lineTo(width.value - padding, height - padding);
  context.stroke();
  context.setFillStyle("#626e66");
  context.setFontSize(10);
  context.fillText(`${maximum.toFixed(1)} kg`, 0, 12);
  context.fillText(`${minimum.toFixed(1)} kg`, 0, height - padding - 4);
  context.fillText(props.trend.startDate.slice(5), padding, height - 5);
  context.fillText(props.trend.endDate.slice(5), width.value - padding - 32, height - 5);

  if (props.trend.targetWeightKg !== undefined) {
    const targetY = toY(props.trend.targetWeightKg);
    context.setStrokeStyle("#86b89b");
    context.setLineDash([6, 4], 0);
    context.beginPath();
    context.moveTo(padding, targetY);
    context.lineTo(width.value - padding, targetY);
    context.stroke();
    context.setLineDash([], 0);
    context.setFillStyle("#4b7860");
    context.setFontSize(11);
    context.fillText(`目标 ${props.trend.targetWeightKg} kg`, padding, targetY - 5);
  }

  if (props.trend.points.length > 0) {
    context.setStrokeStyle("#1f7a4c");
    context.setLineWidth(2);
    context.beginPath();
    props.trend.points.forEach((point, index) => {
      const x = toX(point.day);
      const y = toY(point.weightKg);
      if (index === 0) {
        context.moveTo(x, y);
      } else {
        context.lineTo(x, y);
      }
    });
    context.stroke();

    context.setFillStyle("#1f7a4c");
    props.trend.points.forEach((point) => {
      context.beginPath();
      context.arc(toX(point.day), toY(point.weightKg), 4, 0, Math.PI * 2);
      context.fill();
    });
  }

  context.draw();
}

onMounted(() => nextTick(() => {
  uni.createSelectorQuery().in(componentInstance).select(".trend-wrapper").boundingClientRect((rect) => {
    if (!Array.isArray(rect) && rect?.width) width.value = Math.floor(rect.width);
    nextTick(draw);
  }).exec();
}));
watch(() => props.trend, () => nextTick(draw), { deep: true });
</script>

<template>
  <view class="trend-wrapper">
  <canvas
    id="weight-trend-canvas"
    canvas-id="weight-trend-canvas"
    class="trend-canvas"
    :style="{ width: `${width}px`, height: `${height}px` }"
  />
  <text v-if="!trend.points.length" class="empty-copy">暂无称重记录，目标线仅作参考。</text>
  <text v-else class="empty-copy">{{ trend.points.length }} 个实际称重点 · 连线只连接测量，不生成缺失日期数据</text>
  <text v-if="trend.targetWeightKg !== undefined" class="empty-copy">目标参考虚线：{{ trend.targetWeightKg }} kg</text>
  <view class="point-list">
    <text v-for="(point, index) in trend.points" :key="`${point.date}-${index}`" class="empty-copy">{{ point.date }} · {{ point.weightKg }} kg</text>
  </view>
  </view>
</template>

<style scoped>
.trend-canvas {
  width: 100%;
  margin: 0 auto;
}
.trend-wrapper { overflow: hidden; max-width: 640rpx; margin: 0 auto; }
.empty-copy { display: block; margin: 12rpx 0; color: #626e66; font-size: 24rpx; }
.point-list { max-height: 200rpx; overflow-y: auto; }
</style>
