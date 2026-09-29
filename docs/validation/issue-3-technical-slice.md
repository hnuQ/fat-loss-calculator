# Issue #3 技术纵向样片验证记录

验证日期：2026-09-30

## 已验证

- `pnpm test`：公开应用行为测试通过可替换的内存仓储覆盖建档、工作簿公式契约、食材搜索、餐食保存、跨会话读取、跨日汇总边界、体重记录与 90 天趋势。
- `pnpm type-check`：Vue 与 TypeScript 类型检查通过。
- `pnpm build:app-plus`：从共享源码生成 App 资源到 `dist/build/app`。
- `pnpm build:mp-weixin`：从共享源码生成微信小程序工程到 `dist/build/mp-weixin`。
- `pnpm build:h5`：辅助浏览器构建通过；在 390 × 844 视口完成建档、添加 50 g 燕麦、记录体重、刷新后读取本地记录的人工旅程验证。
- 计算、仓储、时间来源、趋势构建和平台能力均通过接口或依赖注入形成可替换边界。
- `manifest.json` 显式关闭 `uniStatistics`，样片不启用 DCloud 统计上报。

## 工作簿公式契约

来源：`减脂计算器3.0.xlsx` 的固定系数与 4/4/9 换算规则。

- 输入：男性、70 kg、每周运动 4–5 小时且约 3 次、训练日。
- 固定系数：碳水 2.5 g/kg、蛋白质 1.6 g/kg、脂肪 0.9 g/kg、训练日系数 1。
- 预期输出：碳水 175 g、蛋白质 112 g、脂肪 63 g、能量 1715 kcal。
- 契约仅冻结可复算的公式与字面值，不移植工作簿中的处方性健康建议。

## 尚未完成的设备级证据

- 当前机器未发现 HBuilderX、Android Debug Bridge 或可用 Android 设备/模拟器，因此尚未生成并安装 APK，也未完成 Android 真机运行验证。
- 当前机器未发现微信开发者工具，因此尚未完成 `dist/build/mp-weixin` 的导入和预览。
- 生产 `uniStorage` 适配器目前只有 H5 刷新后的持久化证据；Android 与微信端的重开读取仍需随设备级验证一并确认。
- H5 人工验证只是共享业务链路的辅助证据，不能替代上述 Android 与微信端验收。
- `manifest.json` 使用样片 AppID；云端打包或正式小程序预览前仍需配置项目所有者的 DCloud AppID、微信 AppID 与签名材料。

## 结论

同一套 Vue 3、TypeScript、领域模型和本地持久化逻辑可以生成 App 与微信小程序资源，自动化公开行为和浏览器辅助旅程均未发现关键能力缺口。目前没有证据支持改用 uni-app x；Issue #3 应保持开启，直到补齐 Android 可安装/运行和微信开发者工具预览证据。

参考：

- [uni-app CLI 快速开始](https://uniapp.dcloud.net.cn/quickstart-cli)
- [运行和调试 App](https://uniapp.dcloud.net.cn/tutorial/run/run-app)
- [关闭 uni统计](https://uniapp.dcloud.net.cn/uni-stat-public)
