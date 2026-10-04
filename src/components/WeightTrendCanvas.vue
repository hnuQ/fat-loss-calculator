<script setup lang="ts">
import { getCurrentInstance, nextTick, onMounted, ref, watch } from "vue";

import type { BodyTrend } from "../domain/bodyTrend";

const props = defineProps<{ trend: BodyTrend }>();

const width = ref(280);
const height = 220;
const padding = 28;
const left = 58;
const componentInstance = getCurrentInstance()?.proxy;

function draw(): void {
  const context = uni.createCanvasContext("weight-trend-canvas", componentInstance);
  context.clearRect(0, 0, width.value, height);
  const { minimum, maximum, ticks } = props.trend.axis;
  const range = maximum - minimum || 1;
  const toY = (weightKg: number) =>
    padding + ((maximum - weightKg) / range) * (height - padding * 2);
  const toX = (day: number) =>
    left + ((day - 1) / 89) * (width.value - left - padding);

  context.setStrokeStyle("#e5e7eb");
  context.setLineWidth(1);
  context.beginPath();
  context.moveTo(left, padding);
  context.lineTo(left, height - padding);
  context.lineTo(width.value - padding, height - padding);
  context.stroke();
  context.setFillStyle("#626e66");
  context.setFontSize(10);
  context.fillText(props.trend.unit, 0, 12);
  ticks.forEach((tick) => {
    const y = toY(tick);
    context.setStrokeStyle("#edf1ee");
    context.beginPath();
    context.moveTo(left, y); context.lineTo(width.value - padding, y); context.stroke();
    context.fillText(String(tick), 0, y + 3);
  });
  context.fillText(props.trend.startDate.slice(5), left, height - 5);
  context.fillText(props.trend.endDate.slice(5), width.value - padding - 32, height - 5);

  if (props.trend.target !== undefined) {
    const targetY = toY(props.trend.target);
    context.setStrokeStyle("#86b89b");
    context.setLineDash([6, 4], 0);
    context.beginPath();
    context.moveTo(left, targetY);
    context.lineTo(width.value - padding, targetY);
    context.stroke();
    context.setLineDash([], 0);
    context.setFillStyle("#4b7860");
    context.setFontSize(11);
    context.fillText(`目标 ${props.trend.target} kg`, left, targetY - 5);
  }

  if (props.trend.points.length > 0) {
    context.setStrokeStyle("#1f7a4c");
    context.setLineWidth(2);
    context.beginPath();
    props.trend.points.forEach((point, index) => {
      const x = toX(point.day);
      const y = toY(point.value);
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
      context.arc(toX(point.day), toY(point.value), 4, 0, Math.PI * 2);
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
  <text class="empty-copy">{{ trend.label }} · 纵轴 {{ trend.axis.minimum }}–{{ trend.axis.maximum }} {{ trend.unit }}{{ trend.axis.minimum > 0 ? '（非零起点）' : '' }}</text>
  <text v-if="!trend.points.length" class="empty-copy">暂无{{ trend.label }}测量记录</text>
  <text v-else class="empty-copy">{{ trend.points.length }} 个实际测量点 · 连线只连接测量，不生成缺失日期数据</text>
  <text v-if="trend.target !== undefined" class="empty-copy">目标参考虚线：{{ trend.target }} kg</text>
  <view class="point-list">
    <text v-for="(point, index) in trend.points" :key="`${point.date}-${index}`" class="empty-copy">{{ point.date }} · {{ point.value }} {{ trend.unit }}</text>
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
