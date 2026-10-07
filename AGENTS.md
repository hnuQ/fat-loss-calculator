## Agent skills

### Issue tracker

Issues are tracked in GitHub Issues. See `docs/agents/issue-tracker.md`.

### Triage labels

Use the five default triage labels. See `docs/agents/triage-labels.md`.

### Domain docs

Use the single-context layout. See `docs/agents/domain.md`.

### HBuilderX 与 Android 模拟器启动

- 每次 Android 验证前，先检查模拟器虚拟机为 `running`、指定设备的 `sys.boot_completed` 为 `1`，再运行应用；播放器进程存在不代表 Android 已启动。明确指定本机模拟器设备，手机断开后仅操作模拟器。
- HBuilderX CLI 先执行 `cli open`，再读取 `cli launch app-android --help`；运行命令使用 `launch app-android` 和明确的项目路径、`deviceId`、基座类型。
- 每轮选定一个已验证的 ADB 可执行文件与服务端口，连接、资源传输、重启和调试转发始终使用同一组参数。本机默认 `5037` 曾启动失败，`5038` 已验证可用；先检查现有服务，避免交替运行不同版本 ADB 或盲目重启共享服务。
- CLI 报“未检测到指定设备”时，先核对 CLI 与已连接 ADB 的服务是否一致。必要时使用现有标准基座：先备份资源和应用存储，再加载构建结果、运行公开页面及进程重开验证，结束后精确恢复原存储；标准基座结果须明确标注，不能当作签名 APK 验收。云打包需本轮另有授权。
- BlueStacks 启动失败且日志同时出现 `AddRedirect failed`、`VmmgrMachineConfigurationFailed` 时，检查 `showvminfo` 的 NAT 转发规则。本机曾因已存在 `tcp_5555_5555` 规则失败；仅在证据吻合、实例未运行时，备份并校验实例配置，通过工具授权移除该单条规则，让播放器重建。保留应用磁盘、数据和其他网络规则，失败时恢复原规则。
- 完成启动或修复须实际核对 ADB 连接、Android 启动完成及应用页面；记录运行环境和未验证范围。重启 Windows、改系统安全/虚拟化设置、清数据或重装另行授权。

### Issue completion commits

- After an issue passes acceptance, prepare exactly one coherent commit containing that issue's accepted project changes.
- Before running `git commit`, report the exact files and purpose of the staged payload, include the completed verification, and ask the user for explicit approval. Commit only after the user approves that payload.
- Stage issue-scoped files deliberately. Keep local evidence, generated artifacts, caches, and unrelated user assets out of the commit.

### Decision synchronization

At each phase boundary, and before tickets are created, implementation starts or resumes, or a ticket closes, check whether a decision confirmed after the current spec or tickets changes the product goal, observable behaviour, constraints, architecture, or acceptance criteria.

- Synchronize product goals and observable behaviour to the canonical spec and every affected open ticket before implementation continues.
- Create or supersede an ADR only when the decision is hard to reverse, surprising without context, and the result of a real trade-off. Preserve superseded decisions as history.
- Keep open-ticket acceptance criteria and blocking edges aligned with the updated spec. Preserve closed tickets; represent later changes with a linked follow-up ticket.
- Report the artifacts changed and any unresolved conflict. For external tracker writes, follow the project's execution and permission rules.
- This check complements the installed skills; skill invocation remains governed by each skill's metadata and explicit user invocations.
