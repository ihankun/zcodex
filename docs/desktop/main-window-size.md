# Desktop Main Window Size and Position

## Spec

- 桌面主窗口由 `packages/desktop/src/main/desktopWindowChrome.ts` 的 `createBrowserWindow` 统一创建。
- 首次启动或没有合法历史状态时，默认窗口尺寸保持 `1200x800`，位置交给系统默认放置。
- 用户调整或移动主窗口后，桌面端在短防抖结束时保存最近一次非最大化窗口的宽高与左上角位置；完整退出并重新启动后恢复最近一次已经完成持久化的尺寸与位置。
- 最大化状态与普通窗口尺寸/位置分开保存：最大化退出后，下次启动先用最近一次普通尺寸与位置创建窗口，再恢复最大化，避免把最大化后的屏幕尺寸和位置污染普通窗口状态。
- 恢复尺寸与位置必须是有限整数，并按当前显示器可用工作区收敛；历史尺寸缺失、损坏或小于窗口最小尺寸时回退到默认尺寸。保存的位置若已不在任何当前显示器上（例如外接屏被拔掉），回到主显示器居中，避免窗口出现在不可见区域；位置字段缺失时保持系统默认放置，与旧版本行为一致。显示器、分辨率或缩放比例变化后不得创建超出当前工作区的主窗口。
- 用户可拖拽调整窗口宽度，高度不得低于 `640px`，避免 1280x720 桌面环境因可用高度低于 768px 而无法调整窗口大小，同时保留主工作区、顶部栏和底部输入区域的基本可用空间。
- 最小宽度保持 `480px`，用于兼容较窄桌面窗口；移动 Web 端不复用 Electron `BrowserWindow` 约束。
- 窗口尺寸与位置状态是 app-global 的桌面设置，不按 workspace、remote session 或窗口 ID 隔离；Web、手机 `/remote`、辅助窗口和任务恢复状态不读取或写入该字段。

## Implementation

- 通过 Electron `BrowserWindow` 构造参数 `minHeight: 640` 约束桌面主窗口 resize 下限。
- 主进程启动时从 `setting.json` 读取并校验 `desktopWindowSize`（含可选 `x` / `y`），窗口创建时按当前显示器工作区选择并收敛位置；窗口创建后监听 `resize` / `move` / `maximize` / `unmaximize` 事件，将稳定状态异步写回设置服务。连续 resize/move 使用短防抖，最大化状态变化立即刷新。窗口 close 只取消尚未触发的防抖，不启动新的尺寸写入；应用完整退出阶段也不再创建尺寸写入，避免退出屏障完成后遗留仍持有 `setting.json.lock` 的异步任务。用户在防抖完成前立即退出时，允许丢弃最后一次尚未持久化的尺寸/位置。
- 该约束只作用于桌面端主窗口，不影响 Web 端、手机 `/remote` 或不可 resize 的辅助弹窗。

## Impact Brief

| Field            | Value                                                                        |
| ---------------- | ---------------------------------------------------------------------------- |
| Developer intent | 完整重启 ZCode 后恢复用户上次调整的主窗口尺寸与位置                          |
| Capability       | Desktop main window size and position persistence                            |
| Change layer     | persistence / recovery                                                       |
| Operating mode   | planning                                                                     |
| Primary seeds    | `createWindow`、`createBrowserWindow`、`AppSettings`、`createSettingService` |
| Out of scope     | 多窗口独立尺寸、辅助窗口、Web/手机端                                         |

| User scenario       | UI entry                                      | Display owner            | Commit action                              | Authority/persistence                         | Mode boundary                                |
| ------------------- | --------------------------------------------- | ------------------------ | ------------------------------------------ | --------------------------------------------- | -------------------------------------------- |
| 调整/移动后重启应用 | Electron 主窗口边缘/标题栏拖动/系统最大化控件 | Electron `BrowserWindow` | resize/move/maximize/unmaximize 后更新设置 | `~/.zcode/v2/setting.json` 的 app-global 字段 | 仅 packaged/dev Desktop main；Web/手机不参与 |

### Must-preserve invariants

- 恢复尺寸/位置不能延长 Local Host、renderer 或 workspace 恢复关键路径；设置读取失败继续使用 `1200x800` 与系统默认位置。
- Windows 最大化 chrome 通知仍由现有 maximize/unmaximize 监听器负责，尺寸/位置持久化不改变 renderer 协议。
- 桌面 continuous 与手机 replayable 链路、workspace identity、task/session snapshot 均不受影响。
- 所有文件 IO 继续通过异步设置服务完成，不在 Electron resize/move 回调中使用同步文件 API。

## Accepted Cases

| Case           | Setup                      | Action                        | Assertion                             |
| -------------- | -------------------------- | ----------------------------- | ------------------------------------- |
| WINDOW-SIZE-01 | 无历史尺寸                 | 创建主窗口                    | 使用 `1200x800`                       |
| WINDOW-SIZE-02 | 合法历史普通尺寸           | 重启并创建主窗口              | 构造参数恢复历史宽高                  |
| WINDOW-SIZE-03 | 历史尺寸超过当前主屏工作区 | 重启并创建主窗口              | 宽高收敛到工作区，不低于窗口最小值    |
| WINDOW-SIZE-04 | 普通尺寸后最大化退出       | 重启并创建主窗口              | 以普通尺寸创建，再调用 maximize       |
| WINDOW-SIZE-05 | resize/maximize/unmaximize | 等待持久化回调                | 保存非最大化宽高和独立 maximized 状态 |
| WINDOW-SIZE-06 | 已创建主窗口               | 触发窗口 close 或应用退出准备 | 不启动新的窗口尺寸设置写入            |
| WINDOW-POS-01  | 无历史位置                 | 创建主窗口                    | 不传 `x`/`y`，保持系统默认放置        |
| WINDOW-POS-02  | 合法历史位置               | 重启并创建主窗口              | 构造参数恢复历史 `x`/`y`              |
| WINDOW-POS-03  | 历史位置在已断开的显示器上 | 重启并创建主窗口              | 回到主显示器居中                      |
| WINDOW-POS-04  | 历史位置部分超出当前工作区 | 重启并创建主窗口              | 位置收敛到工作区内                    |
| WINDOW-POS-05  | move                       | 等待持久化回调                | 保存非最大化窗口的 `x`/`y`            |
