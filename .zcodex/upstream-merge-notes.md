# 本地定制变更记录（合并上游参考）

> 本目录用于记录本项目相对上游 ZCode 主版本的本地定制，处理合并冲突时先读本文档。
> 记录时间：2026-09-24。上游基线：ZCode 3.14.3（`feat: update v3.14.3`）。

## 一、本次变更概述

两类最小改动，**均为用户可见层，未改内部标识符**：

| 变更          | 原值                                    | 现值                                       |
| ------------- | --------------------------------------- | ------------------------------------------ |
| 打包应用名    | `ZCode` / `ZCode Dev` / `ZCode Preview` | `ZCodex` / `ZCodex Dev` / `ZCodex Preview` |
| home 数据目录 | `~/.zcode/`                             | `~/.zcodex/`                               |

历史数据不做迁移；项目内 `.zcode/` 目录与上游保持互认。

## 二、已改动清单（合并冲突时保护本地版本）

### 1. 应用名（7 个文件）

- `packages/desktop/package.json` — `productName: "ZCodex"`
- `packages/desktop/scripts/desktop-product-identity.mjs` — 正式版 `ZCodex`、Preview 版 `ZCodex Preview`
- `packages/desktop/scripts/devElectronAppBundle.mjs` — `DEV_ELECTRON_APP_NAME = "ZCodex Dev"`
- `packages/desktop/src/main/desktopRuntimeEnv.ts` — 运行时应用名三态（Dev/Preview/正式）
- `packages/desktop/src/main/desktopLinuxDeepLinkRegistration.ts` — Linux `.desktop` 注册名回退值 `"ZCodex"`
- `packages/desktop/electron-builder.config.js` — `.app` 路径回退名 `?? "ZCodex"`
- `packages/services/src/paths.ts` — Windows 禁止目录守卫（`Program Files\ZCodex`、`...\Programs\ZCodex`）

### 2. home 数据目录（约 99 个文件，关键字面量 `.zcode` → `.zcodex`）

**中心枢纽（改动会被大面积继承，优先看）：**

- `packages/services/src/paths.ts` — `getZCodeDataRootDir()` 返回 `{dataBaseDir}/.zcodex`
- `packages/services/src/storage/adapters/rootsResolver.ts` — `ZCODE_DATA_DIR_NAME = ".zcodex"`（常量名保留）

**desktop**：`desktopDataBaseDirBootstrap.ts`、`desktopChromiumHardwareAccelerationBootstrap.ts`、`main/index.ts`（setting.json 引导读取）、`desktopRuntimeEnv.ts`（`ZCODE_HOME` fallback）、`exportLogs.ts`（归档前缀 `.zcodex/cli/...`）、`mcpUserDirectory/`（user 级 segments）、`host/remotePromptAttachments.ts`、`desktopCommandHandlers.ts`（清除数据确认文案）

**远端部署**：`packages/server/src/remote/deployShared.ts`（`REMOTE_BASE = "~/.zcodex/server"`）、`connect.ts`、`zcodeAgentBundleWrapper.ts`、`packages/zcode-server-cli/src/runtime/paths.ts`

**services**：`settingService`、`deviceMid`、`telemetryCore`、`subagentsService`、`subagentStorage`、`pluginSyncService`、`node.ts`、`settingsSyncService`、`skillSyncService`、`skillsService`、`commandsService`、`mcpSyncService`、`providerRuntimeResolver`、`modelTrajectoryFileTail`、`zcodeAgentService`、`zcodeTaskServiceAdapter`、`hooksService`（仅 user 级分支）

**CLI（apps/zcode-cli）**：`contracts/src/config/index.ts`（`DefaultRuntimeConfig.storage`）、`cli/clipboard-image.ts`、`sea-runtime-tools.ts`、`provider-runtime-env.ts`、`adapters/` 下 context/config/auth/trust-store/session-store/workflow/runner-debug/execution-utils/device-mid/logging、`telemetry/bootstrap.ts`、`debug/server/sources.ts`、`bootstrap/` 下 script-workflow-tool-port、script-workflow-utils、create-app（mailbox）、`contracts/src/tools/saved-workflow.ts` 的 `SAVED_WORKFLOW_GLOBAL_DIR`

**作用域拆分点（容易合并错，重点核对）**：

- `apps/zcode-cli/packages/adapters/src/commands/roots.ts` 与 `skills/roots.ts` — 原 user/project 共用 `ZCODE_DIR = ".zcode"`，现拆为：user 级 `USER_ZCODE_DIR = ".zcodex"`，project 级保持 `.zcode`
- `packages/services/src/hooks/hooksService.ts` — 同一表达式内 workspace 分支 `.zcode` 不变、home 分支 `.zcodex/cli`
- `packages/services/src/settings-sync/settingsSyncService.ts`、`skillsService.ts`、`commandsService.ts`、`mcpSyncService.ts`、`mcpUserDirectory/index.ts` — `user*Segments` 用 `.zcodex`，`workspace*Segments` 用 `.zcode`
- `apps/zcode-cli/packages/contracts/src/tools/saved-workflow.ts` — `SAVED_WORKFLOW_GLOBAL_DIR = ".zcodex/workflows"`（home），`SAVED_WORKFLOW_PROJECT_DIR` 保持 `.zcode/workflows`
- `packages/ui/src/lib/skillSourceFilter.ts` — 路径来源检测同时匹配 `/.zcodex/...`（新用户级）与 `/.zcode/...`（项目级），勿删任一分支

### 3. 启动强制升级 gate（已禁用）

- `packages/desktop/src/main/index.ts` — 删除了 `maybeBlockStartupForForceUpdate` 的启动调用（保留 `forceUpdateGuard.ts` 本体）。原因：fork 版本号独立演进，必然低于上游线上 `minimalVersion`，gate 会永久拦截启动。上游更新此段启动逻辑时，不要恢复该调用。
- `packages/desktop/build/dmg_background.png` 与 `dmg_background@2x.png` — DMG 安装界面背景图，文字由 ZCODE 重绘为 ZCODEX（PIL 生成，保留箭头与装饰图标）。上游更新此图后需重新处理文字。
- `packages/desktop/src/main/desktopWindowChrome.ts` — 删除了 `applyAppIcon()`（启动时 `app.dock.setIcon` 覆盖 Dock 图标，导致丢失 macOS 系统渲染的图标光泽）。上游更新此段启动逻辑时，不要恢复该调用。
- `packages/ui/src/Root.tsx` — `canEnterNativeThemeSyncSurface` 简化为 `!isStartupRenderBlocked`（上游原条件要求 workspaceShellPath/isSettingsTabActive/welcome 之一命中）。原因：主题是应用级偏好，不属于某个 workspace/设置页，"已进主界面但未打开任何项目"的空态在上游条件下不会同步 `nativeTheme.themeSource`，侧边栏毛玻璃（vibrancy）会跟随系统外观而与内容主题不一致（系统深色 + 应用浅色时侧边栏发黑）。注意毛玻璃效果是有意保留的，不要给侧边栏容器加不透明背景。上游改动此启动条件时需重新评估。

## 三、踩坑记录（不要再重复）

- **`packages/desktop/src/main/index.ts` 的 `@zcode/shared` 导入列表必须保留 `ZCODE_PRODUCT_FLAVOR`。**
  它在本文件内被 `app.whenReady()` 回调用到（Windows AUMID、`initAutoUpdater({ enabled: ... })`）。
  删掉导入后 tsup/esbuild 不做类型检查，构建照常成功，但运行时在此处抛
  `ReferenceError: ZCODE_PRODUCT_FLAVOR is not defined`，使整个 `app.whenReady()`
  的 async 链路中断：`registerPlatformIpcHandlers()`（同一个回调内、更早的位置）
  之后的启动步骤全部不执行。外部表现是：
  ① 窗口只能由 `activate`（点 Dock）兜底创建，看起来"应用在后台、点 Dock 才显示"；
  ② renderer 侧所有 `ipcRenderer.invoke` 通道都报 `No handler registered`，
  其中 `PlatformCmd.SetTitleBarTheme` 失效 ⇒ `nativeTheme.themeSource` 不再随
  应用主题同步 ⇒ 浅色主题下侧边栏毛玻璃仍是深色、"跟随系统"也会被主进程里
  写死的兜底值钉住。
  验证方法：启动日志出现 `[error] [main] unhandledRejection` 且
  `[primary-window] creating main window (app-activate)`（正常应为 `app-ready`）。
  注意根 `pnpm typecheck` 只构建 `packages/desktop/tsconfig.host.json`，不覆盖
  `tsconfig.main.json`（Electron main/preload/renderer），所以这个错误不会被现有
  检查拦住；改动 main 进程后建议单独跑
  `pnpm exec tsc -p packages/desktop/tsconfig.main.json --noEmit`。
- **不要为了让毛玻璃跟随主题去手写 `nativeTheme.themeSource` 兜底或重建 vibrancy。**
  Electron 的 `nativeTheme.themeSource` 在 macOS 上会直接设置 `NSApp.appearance`
  （`UpdateMacOSAppearanceForOverrideValue`），窗口与 `NSVisualEffectView` 立即跟随，
  不需要 `setVibrancy(null)/setVibrancy(v)` 重建；把 `"system"` 解析成具体
  `dark/light` 反而会让渲染进程的 `prefers-color-scheme` 被永久钉死、`change`
  事件不再派发。renderer 的 `useDesktopNativeThemeSync` → `SetTitleBarTheme` 是
  唯一的主题同步路径，链路正常时无需任何兜底。

## 四、明确未改动（合并冲突时可直接采用上游）

| 类别                | 说明                                                                                              |
| ------------------- | ------------------------------------------------------------------------------------------------- |
| npm 包名 `@zcode/*` | 全部 29 个包的 name、dependencies、import 均未动                                                  |
| 环境变量 `ZCODE_*`  | 约 300 个 env 名未动（含 `ZCODE_DATA_BASE_DIR`、`ZCODE_HOME`）                                    |
| CLI 命令名          | `bin: { zcode }`、`zcode.cjs`、`bin/zcode.mjs` 未动                                               |
| IPC 通道名          | `zcode-task`、`zcode:select-file` 等 channels.ts 通道字符串未动                                   |
| 协议常量            | `ZCODE_PROTOCOL_NAME = "ZCode Protocol"`、`com.zcode/` MCP 命名空间、`Symbol.for("zcode.*")` 未动 |
| 深链 scheme         | `zcode://`（OAuth 回调、share/import、workspace/open）未动                                        |
| 项目内目录          | `<项目>/.zcode/`（config.json、skills、agents、commands、workflows）、`.zcodeignore` 未动         |
| 品牌文案            | i18n（en-US/zh-CN）、菜单项、Agent 系统提示词（"You are ZCode, ..."）、TUI 文案、README 未动      |
| 隐藏文件            | `.zcode-plugin/`、`.zcode-beta`、`.zcode-install-manifest` 等未动                                 |

## 四、合并冲突决策表

| 冲突场景                                                                                   | 处理方式                                                                                                                           |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| 上游改动第二节所列文件的**非路径行**                                                       | 手工合并，保留本地 `.zcodex` / `ZCodex` 字面量                                                                                     |
| 上游**新增** home 级路径拼接（`homedir(), ".zcode"`、`~/.zcode`、`$HOME/.zcode`）          | 采用上游后手动改为 `.zcodex`                                                                                                       |
| 上游新增/修改 **user vs workspace** 目录 segments                                          | 对照本文件二.4 的拆分表，仅 user 级改 `.zcodex`                                                                                    |
| 上游改 productName / 应用名相关                                                            | 保留本地 `ZCodex` 命名                                                                                                             |
| 上游改项目内 `.zcode`、`.zcode-plugin`、`.zcodeignore` 逻辑                                | 直接采用上游                                                                                                                       |
| 上游改品牌文案（i18n、提示词、菜单）                                                       | 直接采用上游                                                                                                                       |
| 上游改 `ZCODE_*` env、包名、IPC 通道、协议常量                                             | 直接采用上游（本地未定制，无冲突基础）                                                                                             |
| 上游改桌面自动更新（`autoUpdater.ts`、服务端 manifest provider、`initAutoUpdater` 传入项） | 保留本地 GitHub Release 方案（第七节），不要恢复服务端清单、`manifestUpdateProvider`、`deviceMid` / `resolveEndpointOrigin` 传入项 |
| 上游新增数据目录子目录（v2 下新文件等）                                                    | 路径经由枢纽函数（`getZCodeDataRootDir`/`getAppConfigDir`）时自动跟随，无需改；硬编码 `.zcode` 的才需要手动改                      |

## 五、合并后自查命令

```bash
# 应只剩 workspace 级与内部标识符的 .zcode；home 级拼接不应出现
grep -rn 'homedir(), "\.zcode"\|join(home[A-Za-z]*, "\.zcode"\|~/.zcode\|\$HOME/\.zcode' \
  packages apps scripts --include='*.ts' --include='*.tsx' --include='*.mjs' \
  | grep -v node_modules | grep -v '/dist/' | grep -v '/out/' | grep -v bundled-agents

# 应用名应保持 ZCodex
grep -rn '"ZCode"\|productName.*ZCode[^ ]' packages/desktop --include='*.json' --include='*.ts' --include='*.mjs'

# 必跑验证
pnpm typecheck && pnpm lint && pnpm architecture:check --changed
```

## 六、注意事项

1. 本目录（`.zcodex/`）是**文档目录**，与 home 下的数据目录 `~/.zcodex/` 无关，也不会被项目的 `.zcode` 配置扫描机制读取。
2. 打包产物（`.zcode-runtime/`、`dist/`、`packages/desktop/bundled-agents/`）为构建生成物，改名后重新构建即可，无需手改。
3. `third-party/inventory.json` 记录了文件内容 sha256，涉及第三方声明文件的合并后需重新生成声明材料（见 `third-party/README.md`）。
4. 若未来要改品牌文案或内部标识符（包名、env、协议），应更新本文档后再动手。
5. 桌面自动更新的分发方式见第七节；改 `autoUpdater.ts`、`githubReleaseUpdateFeed.ts` 或 `scripts/github-release-channel.mjs` 前先读该节，客户端与发布脚本依赖同一套清单命名。

## 七、桌面自动更新源：GitHub Release（2026-09-24 后新增）

### 1. 为什么改

上游桌面自动更新依赖 `https://zcode.z.ai/api/v1/releases/electron/manifest`，只有上游发布通道才有对应
清单与安装包，fork 自己打的包永远检查不到更新。改成读自己仓库的 GitHub Release 后，fork 可以独立发版。

### 2. 改动清单（合并冲突时保护本地版本）

| 文件                                                          | 说明                                                                                                                                                                                                         |
| ------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `packages/desktop/scripts/github-release-channel.mjs`（新）   | 仓库 owner/repo、feed 基址、tag 规则、清单命名规则；main 进程与发布脚本共用                                                                                                                                  |
| `packages/desktop/scripts/github-release-channel.d.mts`（新） | 上述模块的声明文件，供 main 进程 TS 导入                                                                                                                                                                     |
| `packages/desktop/src/main/githubReleaseUpdateFeed.ts`（新）  | `GitHubReleaseUpdateProvider`：按 `<通道>-<平台>-<架构>.yml` 取清单、解析安装包地址、把旧 blockmap 指向历史 Release                                                                                          |
| `packages/desktop/scripts/publish-github-release.mjs`（新）   | 发布脚本：改名清单、注入 release notes、校验 sha512、输出/执行 `gh release` 命令                                                                                                                             |
| `packages/desktop/src/main/manifestUpdateProvider.ts`（删除） | 服务端 manifest provider，已无引用                                                                                                                                                                           |
| `packages/desktop/src/main/autoUpdater.ts`                    | `applyManifestUpdateProvider` → `applyGitHubReleaseUpdateFeed`；`InitAutoUpdaterOptions` 删除 `deviceMid` / `resolveEndpointOrigin`；`pendingManifestReleaseChannelRefresh` → `pendingReleaseChannelRefresh` |
| `packages/desktop/src/main/index.ts`                          | `initAutoUpdater` 调用去掉 `deviceMid` / `resolveEndpointOrigin`                                                                                                                                             |
| `README.md`、`NOTICE.md`、根 `package.json`                   | 发布流程说明、网络行为描述、`publish:github` 脚本入口                                                                                                                                                        |

### 3. 约定（改动前先确认这三条）

- 客户端请求 `https://github.com/ihankun/zcodex/releases/latest/download/<通道>-<平台>-<架构>.yml`；
  清单名必须带架构，否则同一 Release 里第二个架构的清单会覆盖第一个。
- Release tag 必须是 `v<版本>`，且 Release 不能是 pre-release（`releases/latest` 会跳过 pre-release）；
  差分更新按这个约定到 `releases/download/v<旧版本>/` 取旧 `.blockmap`，取不到时退回全量下载。
- 通道来自设置里的「接收 preview 版本」：stable → `latest-*.yml`，preview → `preview-*.yml`；
  两个通道的清单与安装包必须都在**同一个最新 Release** 里，否则另一个通道的用户取不到文件。

### 4. 注意事项

- `ZCODE_UPDATE_FEED_URL` / `--zcode-update-feed-url` 的语义随之变成「清单与安装包的静态目录基址」
  （仍只在开发构建生效），不再指向服务端 manifest 接口；用本地目录联调时请把清单按命名规则放好。
- GitHub Release 资源只保证单 Range 请求，`GitHubReleaseUpdateProvider.isUseMultipleRangeRequest`
  必须保持 `false`。
- 上游若重新引入「按平台/架构向服务端要清单」的逻辑，不要直接采用：本地只有一个 GitHub 发布源。

### 5. 手动安装回退（未签名 macOS 构建）

Squirrel 比对的是运行中应用与下载包的**签名标识要求（designated requirement）**。`identity: null`
打包时 electron-builder 直接跳过签名，运行中的包保留 Electron 自带的 ad-hoc 签名，标识是
`cdhash H"..."`（每个构建都不同），自动安装在 staging 阶段必然失败（本仓 dev 记录里的
`SQRLUpdaterErrorDomain code=2` 就是这一类）。

| 文件                                                         | 说明                                                                                    |
| ------------------------------------------------------------ | --------------------------------------------------------------------------------------- |
| `packages/desktop/src/main/updateInstallCapability.ts`（新） | 读运行中 bundle 的 designated requirement；未签名或含 `cdhash` → 手动安装，否则自动安装 |
| `packages/desktop/src/main/manualUpdateInstaller.ts`（新）   | 下载本平台安装包到「下载」目录、按清单 sha512/size 校验、`shell.openPath` 打开          |

- 判定在每次启动时重新执行（`packages/desktop/src/main/autoUpdater.ts` 的 `initAutoUpdater`），
  签名后无需改代码即可恢复自动更新。
- 手动流程：`update-available` 状态带 `manualInstaller` 字段 → 用户点「下载安装包」→
  复用 `download-progress` 状态上报进度 → 完成后 `update-downloaded` + `manualInstaller`，
  打开安装包并把按钮切成「打开安装包」（新 IPC `zcode:open-downloaded-update-installer`）。
- 手动模式不写 `pendingPostUpdateReleaseNotes`：那份记录会被启动流程当成「已有暂存更新」而显示
  「重启以更新」，与手动安装的事实不符。
- 新增 i18n：`updateDialog.downloadInstaller` / `updateDialog.openInstaller` /
  `updateDialog.manualInstallHint` / `updateDialog.manualInstallerReadyHint` /
  `updateReady.manualTooltip` / `update.toast.manualReady` /
  `desktopMenu.help.downloadUpdateManually` / `desktopMenu.help.openDownloadedInstaller`
  （前三者的菜单文案同时出现在 `packages/shared/src/desktopMenu.ts` 与 `packages/ui/src/i18n/locales/`）。

## 八、本次合并记录（2026-09-25，上游 v3.14.0 → v3.14.3）

上游提交：`29628c9 feat: update v3.14.3`（283 文件，+30342/−1768）。

**冲突 2 处，处理方式：**

| 文件                                                           | 冲突内容                                                                                                     | 处理                                                                                         |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------- |
| `package.json`                                                 | 上游把根版本改成 `3.14.3`                                                                                    | 保留本地 `1.0.0`：fork 版本独立演进，`publish-github-release.mjs` 按根版本号校验 Release tag |
| `apps/zcode-cli/packages/contracts/src/tools/save-workflow.ts` | 上游精简了 `scope` 字段的 `.describe()` 文案，本地那行带 `~/.zcodex/workflows`（第二节规则要求的路径字面量） | 取上游的简写，把 `~/.zcodex/workflows` 写回该行                                              |

**上游新增内容（直接采用，无本地定制）：**

- Bot 接入：`packages/services/src/bots/**`（Feishu / Telegram / 微信 / Webhook）、
  `packages/ui/src/BotsDialog/**`、`packages/ui/src/botsUi.ts`、`packages/desktop/src/host/cronBotDelivery.ts`，
  以及 desktop / services 对 `@larksuiteoapi/node-sdk` 的依赖 → **合并后必须 `pnpm install`**。
- Bot 的存储走 `getAppConfigDir()`（`packages/services/src/bots/repo.ts` 等），因此自动落在
  `~/.zcodex/v2` 下，无需再改路径字面量。
- 桌面 main 的 Bot 远端 workspace 重连/状态 IPC handler（`packages/desktop/src/main/index.ts`）。

**这次合并的两个注意点：**

1. 上游新文件**不跑 oxfmt**。合并后 `pnpm fmt:check` 从 1 个失败文件（`packages/desktop/src/main/desktopRuntimeEnv.ts`，本地既有）变成 33 个，其中 31 个是上游新文件原样带入（`bots/**`、`BotsDialog/**` 等）。
   **不要**为了 `fmt:check` 去格式化这些上游文件，否则每次合并都会在这些文件上产生冲突；只格式化本地改动的文件。
   同上，`README.md` 上游版本本身也不是 oxfmt 干净的，不要顺手格式化。
2. 上游改写 `packages/desktop/src/main/index.ts` 时，本地三项定制都保留：`ZCODE_PRODUCT_FLAVOR` 导入（第三节踩坑）、
   force-gate 启动调用保持删除、`initAutoUpdater({ ..., updateFeedSource })` 参数保持本地版本（不再有 `deviceMid` / `resolveEndpointOrigin`）。

**合并后自查结果：** 第五节两条 grep 干净（home 级拼接无残留 `.zcode`、应用名仍为 `ZCodex`）；
`pnpm typecheck` / `pnpm lint`（70 警告 0 错误）/ `pnpm architecture:check --changed` 通过。
`tsconfig.main.json` 类型错误 82 → 86、`tsconfig.renderer.json` 125 → 126，新增部分全部落在与上游逐字节一致的文件里
（上游自身的既有类型缺口），本地定制文件没有新增错误。
