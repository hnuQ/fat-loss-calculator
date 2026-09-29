<script setup lang="ts">
import { getCurrentInstance, nextTick, onMounted, watch } from "vue";

import type { WeightTrend } from "../domain/diary";

const props = defineProps<{ trend: WeightTrend }>();

const width = 320;
const height = 180;
const padding = 24;
const componentInstance = getCurrentInstance()?.proxy;

function draw(): void {
  const values = props.trend.points.map((point) => point.weightKg);
  if (props.trend.targetWeightKg !== undefined) {
    values.push(props.trend.targetWeightKg);
  }
  if (values.length === 0) {
    return;
  }

  const minimum = Math.min(...values) - 1;
  const maximum = Math.max(...values) + 1;
  const range = maximum - minimum || 1;
  const toY = (weightKg: number) =>
    padding + ((maximum - weightKg) / range) * (height - padding * 2);
  const toX = (day: number) =>
    padding + ((day - 1) / 89) * (width - padding * 2);
  const context = uni.createCanvasContext(
    "weight-trend-canvas",
    componentInstance,
  );

  context.setStrokeStyle("#e5e7eb");
  context.setLineWidth(1);
  context.beginPath();
  context.moveTo(padding, height - padding);
  context.lineTo(width - padding, height - padding);
  context.stroke();

  if (props.trend.targetWeightKg !== undefined) {
    const targetY = toY(props.trend.targetWeightKg);
    context.setStrokeStyle("#86b89b");
    context.beginPath();
    context.moveTo(padding, targetY);
    context.lineTo(width - padding, targetY);
    context.stroke();
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

onMounted(() => nextTick(draw));
watch(() => props.trend, () => nextTick(draw), { deep: true });
</script>

<template>
  <canvas
    id="weight-trend-canvas"
    canvas-id="weight-trend-canvas"
    class="trend-canvas"
    :style="{ width: `${width}px`, height: `${height}px` }"
  />
</template>

<style scoped>
.trend-canvas {
  width: 100%;
  max-width: 640rpx;
  margin: 0 auto;
}
</style>
