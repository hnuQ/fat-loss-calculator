<script lang="ts">
import { trainingDiary } from "./application/runtime";

export default {
  onLaunch() {
    console.info("减脂记录已启动");
    trainingDiary.open().then((state) => {
      if (state.warning) console.warn(state.warning);
    }).catch((error) => console.error("读取训练提醒设置失败", error));
  },
};
</script>

<style>
button::after {
  border: none;
}
</style>
