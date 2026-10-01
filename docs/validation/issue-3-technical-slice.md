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

## 2026-10-01 追加验证（当前结论）

本节保留上方 2026-09-30 的首次验证记录作为历史，并以实际 Android 虚拟设备与微信开发者工具复核结果更新当前状态。

### 自动化与构建

- `pnpm test`：2 个测试文件、4 个测试全部通过。
- `pnpm type-check`：通过。
- `pnpm build:app-plus`：通过，编译器报告为 5.24（Vue 3）。
- `pnpm build:mp-weixin`：通过，编译器报告为 5.24（Vue 3）。
- HBuilderX 初次 CLI 运行因项目未显式声明 Vue 版本而按 Vue 2 查找编译器模块；在 `src/manifest.json` 增加 `"vueVersion": "3"` 后，同一 `launch app-android` 命令完成编译、同步与启动。未修改依赖或锁文件。

### Android 虚拟设备

- 官方 Android Emulator 的 API 35 x86_64 AVD 可启动，但 HBuilder 标准调试基座只提供 ARM ABI，出现 `spinWaitPeer timeout`、`framework.js uninitialized` 等白屏日志。另建 API 35 ARM64 AVD 后，官方模拟器在 x86_64 Windows 宿主明确拒绝启动：`Avd's CPU Architecture 'arm64' is not supported by the QEMU2 emulator on x86_64 host`。这些尝试作为历史保留；BlueStacks 完整验收通过后，两个 AVD、Emulator 包及对应的 x86_64/ARM64 系统镜像已于 2026-10-01 清理，AVD 配置备份保存在本机 `.codex-tmp/`。
- 当前完成验收的设备是 BlueStacks 5.22.280.1025 的现有 Pie64 实例。实际系统为 Android 9 / API 28，而非安装向导原计划的 Android 11；Issue #3 不限定 Android 版本，因此按实装环境记录，不宣称 Android 11。
- ADB 端点为 `127.0.0.1:5555`，设备状态为 `device`，型号 `SM-S908E`；ABI 列表为 `x86_64,x86,arm64-v8a,armeabi-v7a,armeabi`。HBuilderX 5.26 将其识别为 `samsung SM-S908E【127.0.0.1:5555】`。
- HBuilderX CLI 使用同一 `launch app-android` 闭环后报告：Vue 3 编译成功、手机端程序同步成功、`应用【减脂计算器】已启动`、`减脂记录已启动 at App.vue:4`。BlueStacks 日志显示 x86 Weex JS 引擎 `JSE start success` 与 `InitFramework`，没有复现官方 x86_64 AVD 上的白屏错误。
- 调试基座提示编译器 5.24 与手机端 SDK 5.26 不一致。本次完整旅程未发现因此造成的功能失败，但该提示仍是后续升级工具链时应重新验证的兼容性风险。

### Android 用户旅程与持久化证据

- 建档：昵称 `Issue3Profile`，男性、30 岁、170 cm、当前 70 kg、中等运动量、训练日、目标 65 kg。
- 计算：保存后显示营养基准 1715 kcal，碳水 175 g、蛋白质 112 g、脂肪 63 g，与工作簿契约一致。
- 食材：搜索“燕麦”，返回“燕麦（干）”；添加早餐 50 g 后显示 188.5 kcal，碳水 30 g、蛋白质 6.5 g、脂肪 3.5 g，当日剩余 1526.5 kcal。
- 体重：追加 2026-10-01 的 69.4 kg 记录，页面显示“体重已追加记录”并生成趋势点。
- 切换：按 Home 回到 BlueStacks 启动器后重新打开应用，业务页仍可用。
- 结束进程与重开：停止前 `io.dcloud.HBuilder` PID 为 4618；执行 `am force-stop io.dcloud.HBuilder` 后 `pidof` 无输出；重新启动后 PID 为 6501，前台 Activity 为 `io.dcloud.HBuilder/io.dcloud.PandoraEntryActivity`。
- 重开后界面仍显示 1715 kcal 基准、50 g 燕麦、188.5 kcal 当日记录、1526.5 kcal 剩余和体重趋势点。只读查询 `plus.storage.getItem('fat-loss-diary-state-v1')` 同时确认档案昵称 `Issue3Profile`、餐食 50 g / 188.5 kcal、体重 69.4 kg 与基准 1715 kcal 均保留。
- 本机证据位于 `.codex-tmp/issue3-bs-*.png` 与 `.codex-tmp/issue3-bs-*.xml`；关键文件包括 `issue3-bs-calculated`、`issue3-bs-search`、`issue3-bs-added`、`issue3-bs-weight-recorded`、`issue3-bs-reopen` 和 `issue3-bs-reopen-clean`。这些是本机验收附件，不作为源代码提交内容。

### 微信开发者工具

- 微信开发者工具 CLI 当前报告 IDE 服务地址 `http://127.0.0.1:38256`，`{"login":true}`，说明登录和服务端口已通过人工向导完成。
- `pnpm build:mp-weixin` 已生成 `dist/build/mp-weixin`，但其中 `project.config.json` 的 AppID 是 `touristappid`。
- 执行开发者工具导入时语义失败：code 10，`不存在此 AppID 请检查后重新输入`。因此目前没有微信开发者工具中的健康档案、计算、食材搜索和记录查看预览证据，不能宣称微信侧通过。
- 必须由项目所有者在微信开发者工具中选择有权限的真实小程序 AppID 或可用测试账号，再重新导入并完成核心预览。不得向自动化流程提供密码、二维码或私密凭证。

### 当时结论（微信 AppID 修复前）

Android 虚拟设备的编译、安装、启动、完整业务旅程与结束进程后的本地持久化已经通过实际设备级验证；浏览器不作为该结论的替代证据。Issue #3 仍应保持开启，唯一未完成的核心验收是使用有效 AppID 在微信开发者工具中完成核心预览。

## 2026-10-01 微信追加验证（公开测试 AppID）

本节保留上方 `touristappid` 导入失败记录作为历史。之后使用用户明确提供的公开测试 AppID `wx59a6c7dfad7e7e51` 重新构建并完成以下验证；未读取或处理密码、AppSecret、二维码等私密凭证。

- `pnpm build:mp-weixin` 成功，生成的 `dist/build/mp-weixin/project.config.json` 包含上述 AppID。
- 微信开发者工具 CLI 的 `open` 返回 `√ open`；`auto --auto-port 9420 --trust-project` 返回 `√ auto`，并明确报告使用 AppID `wx59a6c7dfad7e7e51`。
- 官方 `miniprogram-automator` 成功连接 `ws://127.0.0.1:9420`，当前页面为 `pages/index/index`，可读取页面数据、WXML 元素和微信本地存储并生成模拟器截图。
- 建档与计算：填写昵称 `Issue3WeChat`，男性、30 岁、170 cm、当前 70 kg、中等运动量、训练日、目标 65 kg；保存后显示 1715 kcal、碳水 175 g、蛋白质 112 g、脂肪 63 g。
- 食材：搜索“燕麦”后返回“燕麦（干）”与每 100 g 377 kcal；添加早餐 50 g 后显示 188.5 kcal、剩余 1526.5 kcal、碳水 30 g、蛋白质 6.5 g、脂肪 3.5 g。
- 体重：记录 69.2 kg 后页面提示“体重已追加记录”，趋势区出现真实数据点。
- 项目重开与持久化：依次执行开发者工具 CLI `close`、`open`、`auto` 并重新连接自动化客户端。重开后页面仍显示 1715 kcal 基准、188.5 kcal 当日记录、1526.5 kcal 剩余、50 g 燕麦及体重趋势点；`wx.getStorageSync('fat-loss-diary-state-v1')` 同时确认档案、基准、餐食和 69.2 kg 体重记录均完整保留。
- 本机界面证据位于 `.codex-tmp/issue3-wechat-initial.png`、`issue3-wechat-calculated.png`、`issue3-wechat-search.png`、`issue3-wechat-added.png`、`issue3-wechat-weight.png` 和 `issue3-wechat-reopen.png`；重开后的页面与存储快照位于 `.codex-tmp/issue3-wechat-reopen.json`。这些是本机验收附件，不作为源代码提交内容。

### 追加验证后的当前结论

Issue #3 要求的 Android 虚拟设备与微信开发者工具纵向样片均已完成实际运行、核心用户旅程和重开持久化验证。Android 证据来自 BlueStacks Pie64 虚拟设备，微信证据来自微信开发者工具模拟器与官方自动化协议；H5 仅作为回归辅助，不替代两端证据。Android 真机验证仍属于后续 Issue #13，不纳入本票据的完成条件。

参考：

- [uni-app CLI 快速开始](https://uniapp.dcloud.net.cn/quickstart-cli)
- [运行和调试 App](https://uniapp.dcloud.net.cn/tutorial/run/run-app)
- [关闭 uni统计](https://uniapp.dcloud.net.cn/uni-stat-public)
