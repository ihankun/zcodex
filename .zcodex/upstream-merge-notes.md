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

| 文件                                                         | 说明                                                                                                                                                                                   |
| ------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/main/updateInstallCapability.ts`（新） | 读运行中 bundle 的 designated requirement；未签名或含 `cdhash` → 手动安装，否则自动安装；并判定手动安装能否升级为「脚本自动替换」                                                      |
| `packages/desktop/src/main/manualUpdateInstaller.ts`（新）   | 下载本平台安装包到「下载」目录、按清单 sha512/size 校验；`shell.openPath` 打开；派生分离的安装脚本                                                                                     |
| `packages/desktop/resources/macos-update-installer.sh`（新） | 等应用退出 → 挂载 DMG → `ditto` 到同卷暂存 → 原子替换 bundle（失败回滚）→ `xattr` 去隔离 → `open` 新版本；失败则打开 DMG 并拉回旧版本，日志在 `~/.zcodex/v2/logs/update-install-*.log` |

- 脚本随包发布：`electron-builder.config.js` 的 darwin `extraResources` 把它放到 `Contents/Resources/macos-update-installer.sh`；
  `updateInstallCapability` 在启动时判定 `manualInstallSupported`（非 AppTranslocation、bundle 目录可写、脚本存在），
  结果通过 `ManualUpdateInstallerPayload.canInstallAutomatically` 传给界面，决定按钮是「安装并重启」还是「打开安装包」。
  上游若改动 `extraResources` 或更新窗口高度常量（`resolveUpdateStatusWindowHeight`），注意保留这一项。

- 判定在每次启动时重新执行（`packages/desktop/src/main/autoUpdater.ts` 的 `initAutoUpdater`），
  签名后无需改代码即可恢复自动更新。
- 手动流程：`update-available` 带 `manualInstaller` → 用户点「下载安装包」→ 复用 `download-progress`
  上报进度 → 完成后 `update-downloaded` + `manualInstaller`，按钮是「安装并重启」（能自动替换时）
  或「打开安装包」（换不了 bundle 时），旁边另给「显示安装包」兜底入口。
- 安装命令：新 IPC `zcode:install-downloaded-update-installer` → `installDownloadedUpdate()`：
  落 `pendingPostUpdateReleaseNotes`（这次真的换版本了）→ 复用 `onBeforeQuitAndInstall` 停 host/agent →
  派生分离脚本 → `app.quit()`。**不要**把它改回 `quitAndInstallUpdate`：那条链路依赖 Squirrel 接管，
  在未签名构建上会把用户丢在一次没有任何后续动作的退出里。
- 只有「打开安装包手动拖」这条路不写 `pendingPostUpdateReleaseNotes`（那份记录会被启动流程当成
  「已有暂存更新」而显示「重启以更新」，与需要用户自己拖的事实不符）。
- 新增 i18n：`updateDialog.downloadInstaller` / `updateDialog.openInstaller` /
  `updateDialog.installAndRestart` / `updateDialog.showInstaller` /
  `updateDialog.manualInstallerAutoHint` / `updateDialog.manualInstallerReadyHint` /
  `updateReady.manualTooltip` / `updateReady.manualOpenTooltip` / `update.toast.manualReady` /
  `desktopMenu.help.downloadUpdateManually` / `desktopMenu.help.openDownloadedInstaller` /
  `desktopMenu.help.installAndRestart`（菜单文案同时出现在 `packages/shared/src/desktopMenu.ts`
  与 `packages/ui/src/i18n/locales/`，两处都要改）。

## 八、本次合并记录（2026-09-25，上游 v3.14.0 → v3.14.3）

上游提交：`29628c9 feat: update v3.14.3`（283 文件，+30342/−1768）。

**冲突 2 处，处理方式：**

| 文件                                                           | 冲突内容                                                                                                     | 处理                                                                                                                                       |
| -------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`                                                 | 上游把根版本改成 `3.14.3`                                                                                    | 保留本地版本号（合并时 `1.0.0`，合并后按 semver 升为 `1.1.0`）：fork 版本独立演进，`publish-github-release.mjs` 按根版本号校验 Release tag |
| `apps/zcode-cli/packages/contracts/src/tools/save-workflow.ts` | 上游精简了 `scope` 字段的 `.describe()` 文案，本地那行带 `~/.zcodex/workflows`（第二节规则要求的路径字面量） | 取上游的简写，把 `~/.zcodex/workflows` 写回该行                                                                                            |

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

- **fork 版本号与上游解耦**：根 `package.json` 的 `version` 就是应用版本（`build-metadata.mjs` 的 `appVersion` → electron-builder `extraMetadata.version`），因此合并上游后要顺带按 semver 决定 fork 版本：合入上游**功能版**升 minor（本次 1.0.0 → 1.1.0），只合修复升 patch，不要跟随上游的 `3.14.x` 数字。

## 九、内置插件载荷本地补齐（2026-09-28 新增，可选）

### 1. 为什么需要

官方安装包的 `Contents/Resources/glm/packages/` 有 14 个内置插件包，开源仓库只包含
`browser-use-plugin`、`node-repl-host`（以及非插件的 `bundled-skills`）的源码；其余 12 个
（pdf / documents / spreadsheets / presentations / image-search / android-emulator / ios-simulator /
plugin-creator / skill-creator / restore-legacy-sessions / zcode-guide / zcode-cua）是官方预编译资产。
缺了载荷，源码构建的产物既不会 seed 这些插件，内置市场分片也是空的（合并目录 40 → 28 条），
插件市场里搜不到它们。

**先排除误判**：这跟 fork 版本号（1.1.0 vs 上游 3.14.x）无关，两边 `cdn-marketplace.json` 条目数相同（26）。
判定链是「内置定义表（已在开源仓库） + 载荷（不在） → 启动 seed → 内置市场分片」。

### 2. 改动清单（合并冲突时保护本地版本）

| 文件                                                       | 说明                                                                                                                                                                                  |
| ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/scripts/stage-agent-bundle.mjs`          | 新增 `stageVendoredOfficialPlugins()`，由 `stageAgentBundle()` 在清空 `glm` 之后调用；新增导出常量 `VENDORED_OFFICIAL_PLUGIN_ROOT_RELATIVE` / `AGENT_PLUGIN_SOURCE_PACKAGES_RELATIVE` |
| `packages/desktop/vendor/official-plugins/README.md`（新） | 补齐方法与来源优先级说明；**该目录下的载荷全部被 `.gitignore` 忽略，不入库**                                                                                                          |
| `.gitignore`                                               | `packages/desktop/vendor/official-plugins/*` 加 `!README.md` 例外                                                                                                                     |
| `README.md`                                                | 打包章节新增「可选：随包带上官方的内置插件载荷」                                                                                                                                      |

### 3. 必须遵守的约束

- **载荷只能在清空 `glm` 之后落盘**：`stageAgentBundle()` 会 `rmSync` 重建 `glm`，所以既不能手工往
  `bundled-agents/<平台>/glm/packages/` 里放（下次构建就没），也不能只改 `bundled-agents/...` 里的内容。
- **来源优先级是「仓库源码 > vendor」，不能反过来**：`browser-use-plugin`、`node-repl-host` 有源码，
  被刻意跳过（日志 `skipped vendored plugins built from source`）。若叠加 vendor 里的官方预编译副本，
  同一目录会变成两份载荷的并集，seed 的 hash 随机器变化，dev 与打包产物行为不一致。
- **只认带 `.zcode-plugin/plugin.json` 的目录**，与官方 seed 的候选根判定
  （`bootstrap/bundled-plugins.ts` 的 `resolveFilesystemPluginRoot`）保持一致；`bundled-skills` 因此被自动忽略。
- vendor 目录缺省时必须静默跳过：公开检出与 CI 没有这个目录，构建不能因此失败。

### 4. 注意

- 载荷要与源码里的内置定义表版本对得上（`apps/zcode-cli/packages/bootstrap/src/app/official-plugin-definitions.ts`）。
  合并上游后应从新版官方 app 重新拷一份，否则 `requiredSeedPaths` 缺失会告警并跳过该插件（只影响单个插件）。
- 这些是官方预编译资产，自用可以，**对外分发存在许可风险**。

### 5. 实测结果（2026-09-28，官方 app 3.14.3 + fork 1.1.0）

以官方 `ZCode.app` 的 `glm/packages` 为来源实测（探针：把暂存结果当打包后的
`Resources/glm` 用，以该项目录为 cwd 调真实的 `resolveOfficialPluginRoots`）：

| 指标                      | 官方 app | 本次构建 |
| ------------------------- | -------- | -------- |
| 内置市场分片              | 14       | 14       |
| 合并后 `marketplace.json` | 40       | **40**   |
| 真正落盘的插件缓存        | 16       | 13       |

构成：12 个来自 vendor（+ 2 个源码构建的 browser-use / node-repl-host = 14 条内置定义），
`bundled-skills` 无 manifest 被忽略。官方那 16 个里多出的 `document-skills`、`zcode-cua`
是历史版本留下的旧目录（`document-skills` 已拆分为 documents/pdf/presentations/spreadsheets）。

**唯一缺的插件是 `zcode-guide`**：官方载荷是 `0.3.0`（技能重组为 `skills/zcode-configuration-guide`、
`skills/diagnosing-*`，`dynamic-workflows` 移到了 `bundled-skills`），而本仓库定义表仍按 `0.2.0`
要求 `commands/workflow.md` 与 `skills/dynamic-workflows/*`。seed 会按设计降级：跳过该插件、
写 `ZCODE_PLUGIN_SEED_INCOMPLETE` 告警并列出缺失文件，不影响其它插件。要对齐需同时改定义表的
`version` 与 `requiredSeedPaths`（上游文件，合并时注意保护）。

## 八、UI 定制：Logo / 布局 / 模型设置空状态（2026-09-29）

本次为纯用户可见层的 UI 定制，未改任何内部标识符、包名或协议常量。合并上游时若这些文件冲突，
按以下本地意图处理。

### 1. 设置页移除 Windows 左上角 logo

- `packages/ui/src/WindowsTopLeftLogo.tsx`（删除）—— Windows 设置页左上角的品牌 logo 组件，已无引用。
- `packages/ui/src/SettingsPage.tsx`—— 移除 `{isWindowsDesktop ? <WindowsTopLeftLogo /> : null}` 渲染与
  对应 import。

### 2. 设置页左侧菜单上移（仅 Windows，不影响 macOS/Linux）

`packages/ui/src/SettingsPage.tsx`（左栏 `aside` 顶部 spacer）：
- 原无条件 `h-12 [app-region:drag]` 占位（48px，用于标题栏拖拽区与 Windows logo 占位对齐）。
- 现改为 `cn("[app-region:drag]", isWindowsDesktop ? "h-0" : "h-12")`：Windows 去掉该占位、菜单顶到最上；
  macOS/Linux 保持 `h-12` 不变。窗口拖拽仍由右侧 `h-12` 标题区（`[app-region:drag]`）承担。
- 合并冲突时注意：只改 Windows 分支，别动 mac 分支。

### 3. 主页左上角：一直显示折叠侧栏图标，去掉 logo

- `packages/ui/src/DesktopTopOverlay.tsx`—— Windows/Linux（`usesCustomCaptionArea`）下第一个工具按钮
  原为「默认 logo、hover 切换到折叠侧栏图标」，现改为**恒显折叠侧栏图标**（`SidebarToggleIcon`），
  不再显示 `logo-zai.svg`。
- 清理了不再使用的 `appLogoUrl` 传递链：`DesktopTopOverlay.tsx`（prop 与解构）、
  `app-shell/WorkspaceShellLayout.tsx`（解构与传参）、`app-shell/types.ts`（`WorkspaceShell` 类型定义）、
  `App.tsx`（import 与传参）。
- **注意**：`WorkspaceSidebarCollapsedRail.tsx` 的侧栏收起态 logo（自引用 `logo-zai.svg`）不受影响、未改动，
  也不在待删范围。

### 4. 模型设置：无配置时右侧显示空状态引导（去掉永久「加载中」）

- `packages/ui/src/settings/model-provider-section/Detail.tsx`—— `if (!selectedNavItem)` 分支改为：
  `presetLoading` 为 true（仍在加载）时显示加载卡片，否则显示空状态引导（不再一直停留在「加载中」）。
- `packages/ui/src/settings/model-provider-section/StatusCards.tsx`—— 新增 `ModelProviderEmptyGuideCard`。
- `packages/ui/src/i18n/locales/zh-CN.ts`、`en-US.ts`—— 新增 `settings.modelProvider.emptyGuide` 文案。

### 合并自查

```bash
# 确认 WindowsTopLeftLogo 无残留引用
grep -rn "WindowsTopLeftLogo" packages --include='*.ts' --include='*.tsx' --include='*.js'
# 确认主页左侧按钮不再用 appLogoUrl（仅侧栏收起态保留 logo-zai.svg 自引用）
grep -rn "appLogoUrl" packages/ui/src
# 必跑验证
pnpm --filter @zcode/ui typecheck && npx oxlint packages/ui/src
```
