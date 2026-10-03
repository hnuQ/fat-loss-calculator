<script setup lang="ts">
import { ref } from "vue";
import { diaryBackup } from "../application/runtime";
import { readBackupFile, readNativeBackupPath, saveBackupFile, shareBackupFile } from "../infrastructure/uniBackupFiles";

const emit = defineEmits<{ (event: "restored"): void }>();
const password = ref("");
const protectedBackup = ref(false);
const content = ref("");
const path = ref("");
const lastFile = ref("");
const busy = ref(false);
const message = ref("");
function setProtection(event: Event) { protectedBackup.value = (event as unknown as { detail: { value: boolean } }).detail.value; }
async function run(action: () => Promise<void>) {
  if (busy.value) return;
  busy.value = true; message.value = "";
  try { await action(); } catch (error) { message.value = error instanceof Error ? error.message : "文件操作失败"; }
  finally { busy.value = false; password.value = ""; }
}
async function exportFile(kind: "backup" | "body" | "meals" | "training") {
  await run(async () => {
    if (kind === "backup" && protectedBackup.value && !password.value) throw new Error("请填写至少 8 个字符的备份密码");
    const data = kind === "backup" ? await diaryBackup.exportBackup(protectedBackup.value ? password.value : "") : await diaryBackup.exportCsv(kind);
    const name = `fat-loss-${kind}-${Date.now()}.${kind === "backup" ? "json" : "csv"}`;
    lastFile.value = await saveBackupFile(name, data);
    message.value = `已导出：${lastFile.value}`;
  });
}
async function chooseFile() { await run(async () => { content.value = await readBackupFile(); message.value = "已读取备份，确认后才能恢复"; }); }
async function loadPath() { await run(async () => { content.value = await readNativeBackupPath(path.value); message.value = "已读取备份，确认后才能恢复"; }); }
async function restore() {
  const confirmed = await new Promise<boolean>((resolve) => uni.showModal({ title: "恢复完整备份", content: "恢复会替换当前全部本地记录。请先导出当前备份；失败时保留原数据。是否继续？", success: (result) => resolve(result.confirm), fail: () => resolve(false) }));
  if (!confirmed) return;
  await run(async () => {
    await diaryBackup.restoreBackup(content.value, password.value);
    content.value = ""; message.value = "完整恢复成功。训练提醒会在打开训练页时同步；系统权限仍需单独授权。";
    emit("restored");
  });
}
</script>

<template>
  <view class="backup-card">
    <text class="heading">完整备份与恢复</text>
    <text>备份包含健康档案、周期、食材、餐次、原始记录、全部历史纠错、训练计划和提醒设置。密码无法找回。</text>
    <label class="row"><text>导出使用密码保护</text><switch :checked="protectedBackup" :disabled="busy" @change="setProtection" /></label>
    <input v-model="password" password :maxlength="1024" :disabled="busy" placeholder="密码（导出至少 8 字符；恢复填原密码）" />
    <button :disabled="busy" :loading="busy" @click="exportFile('backup')">导出完整备份 JSON</button>
    <button :disabled="busy" @click="chooseFile">选择完整备份文件（浏览器 / 微信）</button>
    <!-- #ifdef APP-PLUS -->
    <input v-model="path" :maxlength="2048" :disabled="busy" placeholder="Android 备份文件路径" />
    <button :disabled="busy" @click="loadPath">读取路径中的备份文件</button>
    <!-- #endif -->
    <textarea v-model="content" :disabled="busy" placeholder="也可在此粘贴完整 JSON 备份；CSV 无法恢复" :maxlength="20971520" />
    <button :disabled="busy || !content.trim()" @click="restore">确认替换并恢复</button>
    <text class="heading">CSV 查看与分享</text>
    <text>UTF-8 CSV 仅用于查看或分享，包含原始记录和纠错行，不能恢复应用。请自行选择可信的分享对象。</text>
    <view class="row"><button :disabled="busy" @click="exportFile('body')">身体 CSV</button><button :disabled="busy" @click="exportFile('meals')">餐食 CSV</button><button :disabled="busy" @click="exportFile('training')">训练 CSV</button></view>
    <button v-if="lastFile" @click="shareBackupFile(lastFile)">分享刚导出的文件</button>
    <text v-if="message" role="status">{{ message }}</text>
  </view>
</template>

<style scoped>
.backup-card { display: flex; flex-direction: column; gap: 16rpx; margin: 24rpx 0; padding: 28rpx; border: 1px solid #e0e9e3; border-radius: 24rpx; background: white; color: #365346; font-size: 25rpx; word-break: break-all; }
.heading { font-size: 32rpx; font-weight: 700; }
.row { display: flex; align-items: center; justify-content: space-between; gap: 10rpx; }
input, textarea { padding: 18rpx; border: 1px solid #cbdcd2; border-radius: 12rpx; width: auto; }
textarea { min-height: 140rpx; }
button { margin: 0; color: #176845; font-size: 25rpx; }
</style>
