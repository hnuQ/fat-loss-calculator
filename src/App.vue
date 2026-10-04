<script lang="ts">
import { trainingDiary, trainingReminders } from "./application/runtime";
let visible = false;

export default {
  onLaunch() {
    console.info("减脂记录已启动");
  },
  onShow() {
    visible = true;
    trainingDiary.open().then((state) => {
      if (visible) trainingReminders.setForeground?.(true);
      if (state.warning) console.warn(state.warning);
    }).catch((error) => console.error("读取训练提醒设置失败", error));
  },
  onHide() { visible = false; trainingReminders.setForeground?.(false); },
};
</script>

<style>
button::after {
  border: none;
}
</style>
