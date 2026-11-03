# Windows Window Effect

## 背景

Windows 桌面端的主窗口已经通过 Electron `backgroundMaterial` 请求 DWM 系统背景材质，但 renderer 的 `DesktopWindowFrame` 根节点在 Windows 上使用不透明底色，材质始终被内容层遮住。设置页需要提供一个可切换的窗口特效，让用户选择是否让侧边栏和内容面板外圈透出 DWM 材质，同时保持中间内容区不透明，避免影响阅读。

DWM 的 system backdrop（`setBackgroundMaterial`）只在 Windows 11 22H2（build 22621）及以上可用；Windows 10 的亚克力是另一套 `SetWindowCompositionAttribute` 机制，Electron 未暴露，因此不在本功能范围内。

## 产品语义

设置项名称：窗口特效。仅 Windows 桌面且系统支持时显示。

| 选项 | 窗口层材质 | renderer 外壳 | 内容区 |
| --- | --- | --- | --- |
| 默认 | 沿用当前 acrylic，保持启动/加载观感 | 不透明 `bg-background-win-alt`，与改动前一致 | 不透明 `bg-background` |
| 亚克力 | `acrylic`：实时模糊窗口背后的内容 | 半透明 `--color-background-alt` | 不透明 `bg-background` |
| 云母 | `mica`：采样桌面壁纸的柔和底色 | 半透明 `--color-background-alt` | 不透明 `bg-background` |

- “外壳”指 `DesktopWindowFrame` 根节点覆盖的区域：左侧边栏、内容面板四周 6px 留白、顶部拖拽条。这些区域自身没有背景，原先显示的就是根节点底色。
- 内容面板（`data-workspace-conversation-frame`、`data-settings-panel-frame`）继续使用 `bg-background`，不随特效改变。
- 默认值：`default`。存量用户升级后视觉与当前版本一致。
- 修改即时生效，不需要重启；窗口重建后从 `setting.json` 恢复。
- Windows 10、Windows 11 21H2、macOS、Linux、Web 不显示该设置行；主进程把有效值归一为 `default`，不会出现“已选亚克力但窗口没有材质”的黑圈。
- 系统“透明效果”关闭时由 DWM 回落为实色，功能不报错。

## 状态所有权

`setting.json` 是唯一持久化事实；main 进程持有当前生效值的内存投影，并通过既有窗口外观状态通道回传，renderer 不另行维护可写副本。

```text
设置页 Select
  -> Host SettingService.update()
  -> setting.json (desktopWindowEffect)
  -> platform.syncAppSettings(patch)
  -> main currentDesktopWindowEffect
  -> win.setBackgroundMaterial(...)
  -> PlatformChannels.DesktopWindowChromeStateChanged
  -> html.window-effect-{acrylic|mica}
  -> DesktopWindowFrame 根节点半透明
```

- 读取：`DesktopWindowChromeState.windowEffect` / `supportsWindowEffect`，与 `isMaximized`、`supportsNativeRoundedCorners` 同一条 getter + event 通道。
- 写入：设置页通过通用设置服务写入，再经 `syncAppSettings` 同步给 main；不新增 IPC channel。
- 启动首帧：main 在创建窗口时把有效值写入 renderer 的 bootstrap query，`main.tsx` 在 React 渲染前同步根节点 class，避免先实色后透明的闪烁。

## 实现边界

- 主进程 `buildDesktopWindowVisualOptions` 按 `default`/`acrylic` 映射 `acrylic`、`mica` 映射 `mica`；默认档保留 acrylic 是为了不改变现有启动和加载阶段的窗口观感。
- 运行时通过 `applyWindowsWindowEffect` 调用 `setBackgroundMaterial`，并复用有界双帧 `invalidate()` 处理 DWM 合成 surface 的残留；与托盘恢复、遮挡后焦点回补的既有重绘策略保持一致。
- 不设置 `transparent: true`：Windows 分层窗口会失去 DWM system backdrop。
- 半透明外壳复用 `--color-background-alt`，与 macOS vibrancy 的透明底层策略一致；不新增平台专用色 token，避免主题维护分叉。
- `desktopWindowEffect` 只表达 Windows 桌面窗口外观；Web 和手机端读取到该字段也不产生平台动作。
- 设置字段在完整 schema 中使用 `.catch("default")`，坏值只回退该字段，不把整份 `setting.json` 读回默认；patch schema 保持严格校验。

## 验证

- Windows 11 22H2+：设置 → 外观 → 界面设置切换默认/亚克力/云母，确认侧边栏和 6px 外圈变化、内容区不变；明暗主题、最大化、设置页内切换、重启恢复。
- Windows 11 22H2+ 打开系统“透明效果”与关闭各验证一次；关闭时允许回落为实色，但不得出现黑底或不可读文字。
- Windows 10 / Windows 11 21H2：窗口特效行不显示，界面保持实色，无黑圈。
- macOS、Linux、Web、手机 Web：不显示该行，布局与其他外观设置不受影响。
- E2E `UP-03` 覆盖 class 切换、根节点与内容面板的透明度断言、`setting.json` 持久化；DWM 原生材质无法从 Electron 读回，材质的实际观感由人工验收确认。
- 执行 `pnpm typecheck`、`pnpm lint` 和 `pnpm architecture:check --changed`。
