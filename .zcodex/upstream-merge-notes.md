# 本地定制变更记录（合并上游参考）

> 本文件记录本 fork（**ZCodex**）相对上游 ZCode 的**全部**本地定制，处理合并冲突时先读它。
> 上游基线：ZCode v3.14.3 = `29628c9`（= `origin/main`）。fork 版本号独立演进，当前 `1.1.2`。
> **判定某处是不是本地定制，不要凭记忆**：上游提交就在本地对象库里，直接
> `git diff 29628c9 dev -- . ':(exclude)packages/desktop/vendor'` 即全部本地改动；
> 只看「是否涉及 `.zcode` 字样」就能把约 2/3 的改动（home 目录改名）与真正的行为改动分开
> （2026-09-30 实测：144 个修改文件中 99 个只改了字样）。
> 最近复核：2026-09-30。

## 一、概览

| 定制                                                    | 影响面                                      | 详见 |
| ------------------------------------------------------- | ------------------------------------------- | ---- |
| 打包应用名 `ZCode` → `ZCodex`                           | 7 个文件                                    | 2.1  |
| home 数据目录 `~/.zcode/` → `~/.zcodex/`                | 99 个文件（纯字样改动）                     | 2.2  |
| UI 定制：Logo / 布局 / 模型设置 / 供应商入口            | `packages/ui`                               | 2.3  |
| 启动与桌面行为：force-gate、Dock 图标、DMG 底图         | `packages/desktop/src/main`、`build/`       | 2.4  |
| 桌面自动更新改走 GitHub Release，未签名构建回退手动安装 | desktop + shared + client + ui + web + 构建 | 2.5  |
| 内置插件载荷入库                                        | 构建流程与产物                              | 2.6  |

**改动性质**：多数是用户可见层（应用名、界面、更新流程），但下面四处**改了内部行为**，合并时最容易出事：

- 启动强制升级 gate 已禁用（2.4.1）
- 桌面自动更新不再读服务端 manifest，改读 GitHub Release（2.5）
- home 数据目录改名，且 user 级与项目级作用域要分开处理（2.2）
- 内置插件的 seed 结果随定义表变化：入库载荷 + 对齐后的 `official-plugin-definitions.ts`（2.6）

**明确未改的内部标识符**：npm 包名、`ZCODE_*` 环境变量名、CLI 命令名、IPC 通道名、协议常量、深链 scheme、项目内 `<项目>/.zcode/` 目录。清单见第四节。

历史数据不做迁移；项目内 `.zcode/` 与上游保持互认。

## 二、本地定制清单（合并冲突时保护本地版本）

### 2.1 应用名（7 个文件）

| 变更       | 原值                                    | 现值                                       |
| ---------- | --------------------------------------- | ------------------------------------------ |
| 打包应用名 | `ZCode` / `ZCode Dev` / `ZCode Preview` | `ZCodex` / `ZCodex Dev` / `ZCodex Preview` |

- `packages/desktop/package.json` — `productName: "ZCodex"`
- `packages/desktop/scripts/desktop-product-identity.mjs` — 正式版 `ZCodex`、Preview 版 `ZCodex Preview`
- `packages/desktop/scripts/devElectronAppBundle.mjs` — `DEV_ELECTRON_APP_NAME = "ZCodex Dev"`
- `packages/desktop/src/main/desktopRuntimeEnv.ts` — 运行时应用名三态（Dev/Preview/正式）
- `packages/desktop/src/main/desktopLinuxDeepLinkRegistration.ts` — Linux `.desktop` 注册名回退值 `"ZCodex"`
- `packages/desktop/electron-builder.config.js` — `.app` 路径回退名 `?? "ZCodex"`
- `packages/services/src/paths.ts` — Windows 禁止目录守卫（`Program Files\ZCodex`、`...\Programs\ZCodex`）

注意 `packages/desktop/package.json` 的 `"author": "ZCode"` 与
`packages/desktop/src/main/mcpUserDirectory/legacy.ts` 里的 `join(appData, "ZCode", …)`
是**有意保留**的（作者字段、旧版 appData 迁移路径），别当成漏改。

### 2.2 home 数据目录（99 个文件，关键字面量 `.zcode` → `.zcodex`）

只涉及该字样、没有其他改动的文件实测 100 个；下面按模块列出，但**列表不追求穷尽**，
新增 home 级路径拼接时按同样规则处理即可。

**中心枢纽（改动会被大面积继承，优先看）：**

- `packages/services/src/paths.ts` — `getZCodeDataRootDir()` 返回 `{dataBaseDir}/.zcodex`
- `packages/services/src/storage/adapters/rootsResolver.ts` — `ZCODE_DATA_DIR_NAME = ".zcodex"`（常量名保留）

**desktop**：`desktopDataBaseDirBootstrap.ts`、`desktopChromiumHardwareAccelerationBootstrap.ts`、`main/index.ts`（setting.json 引导读取）、`desktopRuntimeEnv.ts`（`ZCODE_HOME` fallback）、`exportLogs.ts`（归档前缀 `.zcodex/cli/...`）、`mcpUserDirectory/`（user 级 segments）、`host/remotePromptAttachments.ts`、`desktopCommandHandlers.ts`（清除数据确认文案）

**远端部署**：`packages/server/src/remote/deployShared.ts`（`REMOTE_BASE = "~/.zcodex/server"`）、`connect.ts`、`zcodeAgentBundleWrapper.ts`、`packages/zcode-server-cli/src/runtime/paths.ts`

**services**：`settingService`、`deviceMid`、`telemetryCore`、`subagentsService`、`subagentStorage`、`pluginSyncService`、`node.ts`、`settingsSyncService`、`skillSyncService`、`skillsService`、`commandsService`、`mcpSyncService`、`providerRuntimeResolver`、`modelTrajectoryFileTail`、`zcodeAgentService`、`zcodeTaskServiceAdapter`、`hooksService`（仅 user 级分支）

**CLI（apps/zcode-cli）**：`contracts/src/config/index.ts`（`DefaultRuntimeConfig.storage`）、`cli/clipboard-image.ts`、`sea-runtime-tools.ts`、`provider-runtime-env.ts`、`adapters/` 下 context/config/auth/trust-store/session-store/workflow/runner-debug/execution-utils/device-mid/logging、`telemetry/bootstrap.ts`、`debug/server/sources.ts`、`bootstrap/` 下 script-workflow-tool-port、script-workflow-utils、create-app（mailbox）、`contracts/src/tools/saved-workflow.ts` 的 `SAVED_WORKFLOW_GLOBAL_DIR`

**作用域拆分点（最容易合并错，重点核对）**：

- `apps/zcode-cli/packages/adapters/src/commands/roots.ts` 与 `skills/roots.ts` — 原 user/project 共用 `ZCODE_DIR = ".zcode"`，现拆为：user 级 `USER_ZCODE_DIR = ".zcodex"`，project 级保持 `.zcode`
- `packages/services/src/hooks/hooksService.ts` — 同一表达式内 workspace 分支 `.zcode` 不变、home 分支 `.zcodex/cli`
- `packages/services/src/settings-sync/settingsSyncService.ts`、`skillsService.ts`、`commandsService.ts`、`mcpSyncService.ts`、`mcpUserDirectory/index.ts` — `user*Segments` 用 `.zcodex`，`workspace*Segments` 用 `.zcode`
- `apps/zcode-cli/packages/contracts/src/tools/saved-workflow.ts` — `SAVED_WORKFLOW_GLOBAL_DIR = ".zcodex/workflows"`（home），`SAVED_WORKFLOW_PROJECT_DIR` 保持 `.zcode/workflows`
- `packages/ui/src/lib/skillSourceFilter.ts` — 路径来源检测同时匹配 `/.zcodex/...`（新用户级）与 `/.zcode/...`（项目级），**勿删任一分支**

### 2.3 UI 定制

均未改内部标识符、包名或协议常量。合并时若这些文件冲突，按下面的本地意图处理。

#### 2.3.1 设置页移除 Windows 左上角 logo

- `packages/ui/src/WindowsTopLeftLogo.tsx`（删除）—— Windows 设置页左上角的品牌 logo 组件，已无引用。
- `packages/ui/src/SettingsPage.tsx` — 移除 `{isWindowsDesktop ? <WindowsTopLeftLogo /> : null}` 渲染与对应 import。

#### 2.3.2 设置页左侧菜单上移（仅 Windows，不影响 macOS/Linux）

`packages/ui/src/SettingsPage.tsx`（左栏 `aside` 顶部 spacer）：

- 原无条件 `h-12 [app-region:drag]` 占位（48px，用于标题栏拖拽区与 Windows logo 占位对齐）。
- 现改为 `cn("[app-region:drag]", isWindowsDesktop ? "h-0" : "h-12")`：Windows 去掉该占位、菜单顶到最上；macOS/Linux 保持 `h-12` 不变。窗口拖拽仍由右侧 `h-12` 标题区（`[app-region:drag]`）承担。
- 合并冲突时注意：只改 Windows 分支，别动 mac 分支。

#### 2.3.3 主页左上角：恒显折叠侧栏图标，去掉 logo

- `packages/ui/src/DesktopTopOverlay.tsx` — Windows/Linux（`usesCustomCaptionArea`）下第一个工具按钮原为「默认 logo、hover 切换到折叠侧栏图标」，现改为**恒显折叠侧栏图标**（`SidebarToggleIcon`），不再显示 `logo-zai.svg`。
- 清理了不再使用的 `appLogoUrl` 传递链：`DesktopTopOverlay.tsx`（prop 与解构）、`app-shell/WorkspaceShellLayout.tsx`（解构与传参）、`app-shell/types.ts`（`WorkspaceShell` 类型定义）、`App.tsx`（import 与传参）。
- **注意**：`WorkspaceSidebarCollapsedRail.tsx` 的侧栏收起态 logo（自引用 `logo-zai.svg`）不受影响、未改动，也不在待删范围。

#### 2.3.4 模型设置：无配置时右侧显示空状态引导（去掉永久「加载中」）

- `packages/ui/src/settings/model-provider-section/Detail.tsx` — `if (!selectedNavItem)` 分支改为：`presetLoading` 为 true（仍在加载）时显示加载卡片，否则显示空状态引导（不再一直停留在「加载中」）。
- `packages/ui/src/settings/model-provider-section/StatusCards.tsx` — 新增 `ModelProviderEmptyGuideCard`。
- `packages/ui/src/i18n/locales/zh-CN.ts`、`en-US.ts` — 新增 `settings.modelProvider.emptyGuide` 文案。

#### 2.3.5 隐藏未登录的智谱品牌入口（2026-09-29）

品牌入口只在对应族已连接账号时默认展示；未连接时不占侧栏，用户可在「添加供应商」里主动展开，
连接后由 family domain 接管常驻。

- `packages/ui/src/settings/ModelProviderSection.tsx` — `shouldShowPresetProviderForActiveOAuth(presetId, familyDomain)` 改为 `isPresetProviderConnected(presetId, provider)`（判 `provider?.accountState?.availability === "available"`）；新增 `revealedPresetIds` 状态记录用户主动展开过的入口；`presetProviders` 由 `filter().map()` 改为 `flatMap()`，并新增 `presetPickerEntries` 传给选择器。
- `packages/ui/src/settings/model-provider-section/ProviderTemplatePicker.tsx` — 新增可选 props `presets` / `onSelectPreset`；在 `group.id === "zhipu"` 分组下渲染品牌入口卡片（testId `TID_MODEL_PROVIDER_TEMPLATE_ITEM` + `preset-<id>`）。
- `packages/ui/src/settings/model-provider-section/Navigation.tsx` — 分组过滤由 `group.id !== "custom" || group.items.length > 0` 改为 `group.items.length > 0 || (group.id === "preset" && presetLoading)`：空分组不显示，但预设分组在加载中保持可见，避免侧栏跳动。
- `packages/ui/src/settings/model-provider-section/useModelProviderNavigation.ts` — Start Plan 条目只在对应预设可见时才注入，避免品牌入口隐藏后智谱登录项被塞回侧栏。

#### 2.3.6 只有一个供应商时不显示厂商前缀（2026-09-29）

`packages/ui/src/v4/composer/modelTriggerDisplay.ts` — 在 `resolveV4ModelTriggerDisplay` 里，
非空供应商数 ≤ 1 时直接返回 `{ fullLabel: modelLabel, modelLabel }`，不再拼 `${providerName}/` 前缀
（只有一个供应商时前缀没有区分意义，反而冗长）。

### 2.4 启动与桌面行为

#### 2.4.1 启动强制升级 gate 已禁用

- `packages/desktop/src/main/index.ts` — 删除了 `maybeBlockStartupForForceUpdate` 的启动调用。原因：fork 版本号独立演进（1.x），必然低于上游线上 release 下发的 `minimalVersion`，gate 会永久拦截启动。上游更新此段启动逻辑时，**不要恢复该调用**。
- `packages/desktop/src/main/forceUpdateGuard.ts`（254 行）、`forceUpdatePrompt.ts`（641 行）—— **刻意保留为不可达代码**，不要因为「全仓没有调用点」就删（2026-09-30 复核过，结论与直觉相反）：
  - 保留 = 与上游逐字节一致，上游改这两个文件时零冲突；删除 = 上游每次碰它们都产生 delete/modify 冲突。
  - 守卫并未损坏：它读的是 `/api/v1/client/configs`（`DEFAULT_ZCODE_ENDPOINT_ORIGIN`），**不依赖**已删除的 `manifestUpdateProvider`；弹窗文案内联在 `forceUpdatePrompt.ts` 自己的 `messages` 里，也没占用 i18n locales。
  - 删除会级联：`autoUpdater.ts` 的 `requestForceAutoUpdate` 唯一消费者就是这个守卫，删后它立刻变死代码 —— 而 `autoUpdater.ts` 是本地改动最重的文件（见 2.5），不该再动它；`@zcode/shared` 的 `getForceUpdateMinimalVersionFromConfig` / `resolveForceUpdateRequirement` / `ForceUpdateRequirement` 也要跟着清理。
  - 已知代价：`pnpm knip` 会一直把这两个文件列进 unused files（基线噪音），这是接受它的理由。

#### 2.4.2 Dock 图标只在未打包态覆盖

`packages/desktop/src/main/index.ts` — `applyAppIcon(iconPath)` 改为只在 `!app.isPackaged` 时调用
（上游是无条件调用）。`packages/desktop/src/main/desktopWindowChrome.ts` 已恢复为与上游逐字节一致，
不必再裁决；完整原因见第三节「Dock 图标」条。

#### 2.4.3 DMG 安装界面底图重绘

`packages/desktop/build/dmg_background.png` 与 `dmg_background@2x.png` — 文字由 ZCODE 重绘为 ZCODEX
（PIL 生成，保留箭头与装饰图标）。上游更新此图后需重新处理文字。

### 2.5 桌面自动更新源：GitHub Release

#### 为什么改

上游桌面自动更新依赖 `https://zcode.z.ai/api/v1/releases/electron/manifest`，只有上游发布通道才有对应
清单与安装包，fork 自己打的包永远检查不到更新。改成读自己仓库的 GitHub Release 后，fork 可以独立发版。

#### 改动清单（合并冲突时保护本地版本）

**新增：**

| 文件                                                    | 说明                                                                                                                                                                                   |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/scripts/github-release-channel.mjs`   | 仓库 owner/repo、feed 基址、tag 规则、清单命名规则；main 进程与发布脚本共用                                                                                                            |
| `packages/desktop/scripts/github-release-channel.d.mts` | 上述模块的声明文件，供 main 进程 TS 导入                                                                                                                                               |
| `packages/desktop/src/main/githubReleaseUpdateFeed.ts`  | `GitHubReleaseUpdateProvider`：按 `<通道>-<平台>-<架构>.yml` 取清单、解析安装包地址、把旧 blockmap 指向历史 Release                                                                    |
| `packages/desktop/scripts/publish-github-release.mjs`   | 发布脚本：改名清单、注入 release notes、校验 sha512、输出/执行 `gh release` 命令                                                                                                       |
| `packages/desktop/src/main/updateInstallCapability.ts`  | 读运行中 bundle 的 designated requirement；未签名或含 `cdhash` → 手动安装，否则自动安装；并判定手动安装能否升级为「脚本自动替换」                                                      |
| `packages/desktop/src/main/manualUpdateInstaller.ts`    | 下载本平台安装包到「下载」目录、按清单 sha512/size 校验；`shell.openPath` 打开；派生分离的安装脚本                                                                                     |
| `packages/desktop/resources/macos-update-installer.sh`  | 等应用退出 → 挂载 DMG → `ditto` 到同卷暂存 → 原子替换 bundle（失败回滚）→ `xattr` 去隔离 → `open` 新版本；失败则打开 DMG 并拉回旧版本，日志在 `~/.zcodex/v2/logs/update-install-*.log` |

**删除：** `packages/desktop/src/main/manifestUpdateProvider.ts`（服务端 manifest provider，已无引用）。

**修改（这些文件往往不是只改更新逻辑，合并时逐个看）：**

| 文件                                                                                                                           | 说明                                                                                                                                                                                                                                                                                                                                        |
| ------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/src/main/autoUpdater.ts`                                                                                     | `applyManifestUpdateProvider` → `applyGitHubReleaseUpdateFeed`；`InitAutoUpdaterOptions` 删除 `deviceMid` / `resolveEndpointOrigin`；`pendingManifestReleaseChannelRefresh` → `pendingReleaseChannelRefresh`；**新增两个 IPC handler**（`PlatformChannels.OpenDownloadedUpdateInstaller` / `InstallDownloadedUpdateInstaller`，见文件末尾） |
| `packages/desktop/src/main/index.ts`                                                                                           | `initAutoUpdater` 调用去掉 `deviceMid` / `resolveEndpointOrigin`；新增更新窗口高度常量与 `resolveUpdateStatusWindowHeight` 的三个分支（见第三节「类型收窄守卫」条）                                                                                                                                                                         |
| `packages/desktop/src/preload/index.ts`                                                                                        | 上述两个通道的 bridge                                                                                                                                                                                                                                                                                                                       |
| `packages/desktop/src/renderer/src/desktopPlatform.ts`                                                                         | `IPlatformService` 的两个新方法接到 `window.zcode`                                                                                                                                                                                                                                                                                          |
| `packages/desktop/electron-builder.config.js`                                                                                  | darwin `extraResources` 带上 `macos-update-installer.sh`；publish 段注释说明清单由 main 进程指定                                                                                                                                                                                                                                            |
| `packages/desktop/dev-app-update.yml`                                                                                          | 注释更新：清单与安装包地址由 `GitHubReleaseUpdateProvider` 提供，这里的 generic url 只作本地配置占位                                                                                                                                                                                                                                        |
| `packages/shared/src/update.ts`                                                                                                | 新增 `ManualUpdateInstallerPayload` 与 `{ kind: "manual-ready" }` 更新状态                                                                                                                                                                                                                                                                  |
| `packages/shared/src/platform.ts`                                                                                              | `IPlatformService` 新增 `openDownloadedUpdateInstaller()` / `installDownloadedUpdateInstaller()`                                                                                                                                                                                                                                            |
| `packages/shared/src/channels.ts`                                                                                              | `PlatformChannels` 新增上述两个通道                                                                                                                                                                                                                                                                                                         |
| `packages/shared/src/index.ts`                                                                                                 | 导出 `ManualUpdateInstallerPayload`                                                                                                                                                                                                                                                                                                         |
| `packages/shared/src/desktopMenu.ts`                                                                                           | 新增 `desktopMenu.help.downloadUpdateManually` / `openDownloadedInstaller` / `installAndRestart` 文案 key                                                                                                                                                                                                                                   |
| `packages/client/src/globals.d.ts`                                                                                             | `window.zcode` 上补两个新方法声明                                                                                                                                                                                                                                                                                                           |
| `packages/ui/src/UpdateStatusDialog.tsx`、`UpdateStatusDialogController.tsx`、`UpdateStatusButton.tsx`、`updateStatusModel.ts` | 更新窗口按 `manualInstaller` 显示「安装并重启 / 打开安装包 / 显示安装包」，并渲染更新说明                                                                                                                                                                                                                                                   |
| `packages/ui/src/lib/desktopUpdateMenu.ts`                                                                                     | 桌面菜单里的手动更新入口                                                                                                                                                                                                                                                                                                                    |
| `packages/ui/src/root/useRootPlatformEffects.ts`                                                                               | 新增 `manual-ready` 的 toast 分支                                                                                                                                                                                                                                                                                                           |
| `packages/ui/src/i18n/locales/zh-CN.ts`、`en-US.ts`                                                                            | 新增 `updateDialog.*` / `updateReady.*` / `update.toast.manualReady` 文案                                                                                                                                                                                                                                                                   |
| `packages/web/src/main.tsx`                                                                                                    | Web 平台实现把这两个方法 stub 成 resolved（Web 没有桌面更新）                                                                                                                                                                                                                                                                               |
| `README.md`、`NOTICE.md`、根 `package.json`                                                                                    | 发布流程说明、网络行为描述、`publish:github` 脚本入口                                                                                                                                                                                                                                                                                       |

#### 约定（改动前先确认这三条）

- 客户端请求 `https://github.com/ihankun/zcodex/releases/latest/download/<通道>-<平台>-<架构>.yml`；清单名必须带架构，否则同一 Release 里第二个架构的清单会覆盖第一个。
- Release tag 必须是 `v<版本>`，且 Release 不能是 pre-release（`releases/latest` 会跳过 pre-release）；差分更新按这个约定到 `releases/download/v<旧版本>/` 取旧 `.blockmap`，取不到时退回全量下载。
- 通道来自设置里的「接收 preview 版本」：stable → `latest-*.yml`，preview → `preview-*.yml`；两个通道的清单与安装包必须都在**同一个最新 Release** 里，否则另一个通道的用户取不到文件。

#### 注意事项

- `ZCODE_UPDATE_FEED_URL` / `--zcode-update-feed-url` 的语义随之变成「清单与安装包的静态目录基址」（仍只在开发构建生效），不再指向服务端 manifest 接口；用本地目录联调时请把清单按命名规则放好。
- GitHub Release 资源只保证单 Range 请求，`GitHubReleaseUpdateProvider.isUseMultipleRangeRequest` 必须保持 `false`。
- 上游若重新引入「按平台/架构向服务端要清单」的逻辑，不要直接采用：本地只有一个 GitHub 发布源。

#### 手动安装回退（未签名 macOS 构建）

Squirrel 比对的是运行中应用与下载包的**签名标识要求（designated requirement）**。`identity: null`
打包时 electron-builder 直接跳过签名，运行中的包保留 Electron 自带的 ad-hoc 签名，标识是
`cdhash H"..."`（每个构建都不同），自动安装在 staging 阶段必然失败（本仓 dev 记录里的
`SQRLUpdaterErrorDomain code=2` 就是这一类）。

- 脚本随包发布：`electron-builder.config.js` 的 darwin `extraResources` 把它放到 `Contents/Resources/macos-update-installer.sh`；`updateInstallCapability` 在启动时判定 `manualInstallSupported`（非 AppTranslocation、bundle 目录可写、脚本存在），结果通过 `ManualUpdateInstallerPayload.canInstallAutomatically` 传给界面，决定按钮是「安装并重启」还是「打开安装包」。上游若改动 `extraResources` 或更新窗口高度常量（`resolveUpdateStatusWindowHeight`），注意保留这一项。
- 判定在每次启动时重新执行（`autoUpdater.ts` 的 `initAutoUpdater`），签名后无需改代码即可恢复自动更新。
- 手动流程：`update-available` 带 `manualInstaller` → 用户点「下载安装包」→ 复用 `download-progress` 上报进度 → 完成后 `update-downloaded` + `manualInstaller`，按钮是「安装并重启」（能自动替换时）或「打开安装包」（换不了 bundle 时），旁边另给「显示安装包」兜底入口。
- 安装命令：IPC `zcode:install-downloaded-update-installer` → `installDownloadedUpdate()`：落 `pendingPostUpdateReleaseNotes`（这次真的换版本了）→ 复用 `onBeforeQuitAndInstall` 停 host/agent → 派生分离脚本 → `app.quit()`。**不要**把它改回 `quitAndInstallUpdate`：那条链路依赖 Squirrel 接管，在未签名构建上会把用户丢在一次没有任何后续动作的退出里。
- 只有「打开安装包手动拖」这条路不写 `pendingPostUpdateReleaseNotes`（那份记录会被启动流程当成「已有暂存更新」而显示「重启以更新」，与需要用户自己拖的事实不符）。
- 菜单文案同时出现在 `packages/shared/src/desktopMenu.ts` 与 `packages/ui/src/i18n/locales/`，两处都要改。

### 2.6 内置插件载荷入库

#### 为什么需要

官方安装包的 `Contents/Resources/glm/packages/` 有 14 个内置插件包，开源仓库只包含
`browser-use-plugin`、`node-repl-host`（以及非插件的 `bundled-skills`）的源码；其余 12 个
（pdf / documents / spreadsheets / presentations / image-search / android-emulator / ios-simulator /
plugin-creator / skill-creator / restore-legacy-sessions / zcode-guide / zcode-cua）是官方预编译资产。
缺了载荷，源码构建的产物既不会 seed 这些插件，内置市场分片也是空的（合并目录 40 → 28 条），
插件市场里搜不到它们。

**先排除误判**：这跟 fork 版本号（1.1.x vs 上游 3.14.x）无关，两边 `cdn-marketplace.json` 条目数相同（26）。
判定链是「内置定义表（已在开源仓库） + 载荷（原先缺，现已入库） → 启动 seed → 内置市场分片」。

**这 12 个载荷已入库**（原先只在本地、被 `.gitignore` 忽略）。原因：载荷只在某一台机器上存在时，
在另一平台（尤其 Windows）干净检出后打包就又没有插件，必须能随仓库一起走。
入库后任意平台打包都会带上，不再需要各机器手工从官方 app 拷一份。

#### 入库范围（关键决策）

`packages/desktop/vendor/official-plugins/` 的 61MB 里只有约 2.2MB 真正会被打包，
其余是**永远用不到的死载荷**，故不入库（`.gitignore` 逐条排除）：

| 排除项                                 | 体积 | 原因                                                                                                                                                       |
| -------------------------------------- | ---- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `browser-use-plugin`、`node-repl-host` | 38M  | 仓库 `apps/zcode-cli/packages/` 下有源码，`stageVendoredOfficialPlugins` 按「仓库源码 > vendor」跳过 vendor 副本；入库只会让同一插件出现两份载荷           |
| `bundled-skills`                       | 152K | 不是插件（无 `.zcode-plugin/plugin.json`），由源码单独 stage                                                                                               |
| `*/node_modules`                       | 18M  | 平台专有原生二进制（`zcode-cua-plugin` 下的 darwin `libvips`/`koffi`/`sharp`），其他平台加载不了；且入库载荷不含它、本地含它会让同一插件算出两份 seed hash |

`zcode-cua-plugin` 的 `node_modules` 尤其没有价值：它只含 sharp/koffi 等，连它 `package.json`
声明的 `@zcode/zcode-cua` 都没有，而该包在本仓库是 fail-closed 占位
（`packages/zcode-cua/package.json`：_ships without Computer Use_）；其 client script
（`scripts/computer-use-client.mjs`）只 import Node 内置模块，不引用任何原生依赖。

#### 改动清单（合并冲突时保护本地版本）

| 文件                                                                       | 说明                                                                                                                                                                                                                                                                                                                                   |
| -------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `packages/desktop/scripts/stage-agent-bundle.mjs`                          | 新增 `stageVendoredOfficialPlugins()`，由 `stageAgentBundle()` 在清空 `glm` 之后调用；新增导出常量 `VENDORED_OFFICIAL_PLUGIN_ROOT_RELATIVE` / `AGENT_PLUGIN_SOURCE_PACKAGES_RELATIVE`；新增 `excludedVendoredPluginAssetNames`（`.DS_Store` + `node_modules`）与 `shouldCopyVendoredPluginAsset`                                       |
| `packages/desktop/vendor/official-plugins/**`（新，12 个插件载荷入库）     | 仓库没有源码的内置插件预编译资产，随仓库分发以保证任意平台打包都带插件                                                                                                                                                                                                                                                                 |
| `packages/desktop/vendor/official-plugins/README.md`（新）                 | 入库范围、升级上游后重新对齐载荷的方法、来源优先级与许可说明                                                                                                                                                                                                                                                                           |
| `.gitignore`                                                               | 逐条排除 `browser-use-plugin/`、`node-repl-host/`、`bundled-skills/`、`*/node_modules/`；不再整目录忽略。**并保留 `!…/*/dist/` 与 `!…/\*/dist/**`两条 re-include**：顶层`dist/`会连目录排除，而 android-emulator / ios-simulator 的`dist/mcp/server.js` 是运行必需产物                                                                 |
| `.oxlintrc.json`、`.prettierignore`、`knip.json`                           | 把 `packages/desktop/vendor/official-plugins` 排除出 lint/fmt/未使用检查：第三方产物不该被格式化或当作项目源码分析，否则每次重新拷载荷都产生无意义 diff                                                                                                                                                                                |
| `README.md`                                                                | 打包章节的「可选：随包带上官方的内置插件载荷」改为「内置插件载荷」，说明已入库                                                                                                                                                                                                                                                         |
| `apps/zcode-cli/packages/bootstrap/src/app/official-plugin-definitions.ts` | **zcode-guide 的 `version` 与 `requiredSeedPaths` 已按入库的 0.3.0 载荷对齐**（`0.2.0` → `0.3.0`；4 个旧路径 `commands/workflow.md` + `skills/dynamic-workflows/*` → 6 篇技能正文）。这是 2.6 这组改动里唯一改到的上游源码文件，合并时**必须**保住这三个值，否则该插件又被 seed 跳过（见下方实测结果与「定义表与入库载荷必须对齐」条） |

#### 必须遵守的约束

- **载荷只能在清空 `glm` 之后落盘**：`stageAgentBundle()` 会 `rmSync` 重建 `glm`，所以既不能手工往 `bundled-agents/<平台>/glm/packages/` 里放（下次构建就没），也不能只改 `bundled-agents/...` 里的内容。
- **来源优先级是「仓库源码 > vendor」，不能反过来**：`browser-use-plugin`、`node-repl-host` 有源码，被刻意跳过（日志 `skipped vendored plugins built from source`）。若叠加 vendor 里的官方预编译副本，同一目录会变成两份载荷的并集，seed 的 hash 随机器变化，dev 与打包产物行为不一致。
- **只认带 `.zcode-plugin/plugin.json` 的目录**，与官方 seed 的候选根判定（`bootstrap/bundled-plugins.ts` 的 `resolveFilesystemPluginRoot`）保持一致；`bundled-skills` 因此被自动忽略。
- **`node_modules` 一律不进 vendor 载荷，也不进 bundle**：它在 `.gitignore` 里，语义是「随机器变化的本地产物」。入库载荷不含它，本地若含它就会算出两份 seed hash —— 这正是来源优先级要避免的同一类不一致。暂存时由 `shouldCopyVendoredPluginAsset` 过滤，不能只靠 `.gitignore`（vendor 是读工作树，不是读索引）。
- **插件自带的 `dist/` 必须入库**：`.gitignore` 顶层的 `dist/`（构建产物）会连目录一起排除，而 android-emulator / ios-simulator 的 MCP 服务就是 `dist/mcp/server.js`（`.mcp.json` 与 `plugin.json` 都指向它）。git 不进入被排除的目录，所以必须 re-include 目录本身，只写 `dist/**` 无效。改动 `.gitignore` 或重新拷载荷后用下面的命令校验，别只在打包日志里看到「staged 12 个」就认为完整 —— 目录少文件时它照样报 12 个：

  ```bash
  git ls-files --others --ignored --exclude-standard packages/desktop/vendor/official-plugins/ \
    | grep -vE '/node_modules/|/(browser-use-plugin|node-repl-host|bundled-skills)/'
  # 应无输出
  ```

- vendor 目录缺省时必须静默跳过：载荷虽已入库，但缺目录时构建不能因此失败。

#### 注意

- **定义表与入库载荷必须对齐，重新拷载荷后要一起改定义表**。这里有两个独立的门：
  - `requiredSeedPaths`：seed 前逐项检查（`findMissingOfficialPluginSeedPaths`），缺任一项就以 `ZCODE_PLUGIN_SEED_INCOMPLETE` **跳过整个插件**并回退旧缓存。这是最容易踩的——路径存在与否只看载荷，写错了插件就静默装不上。
  - `version`：决定插件缓存目录名 `cache/<marketplace>/<name>/<version>`，也被 SEA 清单按名精确匹配（`item.version === definition.version`）。拷了新版本载荷却不改 version，缓存目录名会与实际内容不符，旧版本 fallback 判定也跟着错。
  - 合并上游后从新版官方 app 重新拷载荷时，要同步更新定义表的 `version` 与 `requiredSeedPaths`（当前 zcode-guide 已是本地对齐后的值）。
- 从官方 app 拷载荷时**只覆盖定义表里那 12 个目录**，不要把 `browser-use-plugin`、`node-repl-host`、`bundled-skills` 或插件内的 `node_modules` 一起拷进来（具体命令见该目录 README.md）。
- 这些是官方预编译资产，自用可以，**对外分发存在许可风险**。

#### 实测结果

**2026-09-28（官方 app 3.14.3 + fork 1.1.0，定义表尚未对齐）：**

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

那次唯一缺的是 `zcode-guide`，原因是定义表按 `0.2.0` 钉 `commands/workflow.md` 与
`skills/dynamic-workflows/*`，而入库载荷是 `0.3.0`（技能已重组为 `skills/zcode-configuration-guide`、
`skills/diagnosing-*`，`dynamic-workflows` 移到了 `bundled-skills`），四个路径全部缺失，
于是 seed 按设计降级、只影响该插件。

**2026-09-30（定义表已对齐）：** 同一探针，源码构建的两个插件也一起 stage 后实测：

```
vendor 载荷暂存：12 个（跳过 browser-use-plugin, node-repl-host）
最终落进缓存的插件：14 个
ZCODE_PLUGIN_SEED_INCOMPLETE 告警：0 条
  zcode-guide 缓存版本目录：0.3.0
```

即 14 条内置定义**全部**落盘，不再有被跳过的插件。

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
  应用主题同步 ⇒ 浅色主题下侧边栏毛玻璃仍是深色。注意主进程**没有**任何写死的
  主题兜底值：`themeSource` 全仓只有 `desktopMainIpcPlatform.ts` 里这一个写入点，
  handler 失效时它停留在 Electron 默认的 `"system"`，于是窗口 vibrancy 与
  Windows 标题栏跟随系统外观、而内容仍按应用主题渲染，两者不一致。
  验证方法：启动日志出现 `[error] [main] unhandledRejection` 且
  `[primary-window] creating main window (app-activate)`（正常应为 `app-ready`）。
  注意根 `pnpm typecheck` 只构建 `packages/desktop/tsconfig.host.json`，不覆盖
  `tsconfig.main.json`（Electron main/preload/renderer），所以这个错误不会被现有
  检查拦住；改动 main 进程后建议单独跑
  `pnpm exec tsc -p packages/desktop/tsconfig.main.json --noEmit`（既有缺口基线 **86** 个错误）。
- **不要再给 `Root.tsx` 的 `canEnterNativeThemeSyncSurface` 加特例（2026-09-30 已回退为上游条件）。**
  该条件曾经被本地简化为 `!isStartupRenderBlocked`，理由写作「无 workspace 的空态不同步
  `nativeTheme.themeSource`，侧边栏毛玻璃发黑」。这个理由是误诊，且现象在该状态下**不可达**：
  - `nativeTheme.themeSource` 全仓只有一个写入点，即渲染进程的 `SetTitleBarTheme`
    handler（`desktopMainIpcPlatform.ts`），主进程没有任何初始值或兜底；它唯一的驱动者是
    `useDesktopNativeThemeSync`，而后者由 `Root.tsx` 的 `hasEnteredNativeThemeSyncSurface`
    单向 latch 控制 —— 所以上面第 1 条那个导入缺失 bug 会让它在**所有**界面状态失效，
    不只是空态，那才是当时看到「毛玻璃发黑」的真因。
  - 侧边栏只挂在 `WorkspaceShellLayout.tsx` 里，而 `WorkspaceShellLayout` ← `App` ←
    `RootWorkspaceContent`，后者只在 `workspaceShellPath` 有值时渲染
    （`Root.tsx` 的 `!workspaceShellPath ? (isSettingsTabActive ? <SettingsPage/> : null) : …`）。
    也就是说：**侧边栏只可能出现在上游条件已经放行的状态里**，被多放行出来的
    「无 workspace + 非设置页 + 非欢迎页」状态下主内容区渲染 `null`，没有侧边栏可供发黑。
    回退后该文件与上游逐字节一致，合并时不必再裁决。毛玻璃效果本身是有意保留的，
    不要给侧边栏容器加不透明背景。
- **macOS 的 Dock 图标：`applyAppIcon` 只能用于未打包态（2026-09-30 定案）。**
  这里曾经整体删掉 `applyAppIcon()` 的调用，理由写作「`app.dock.setIcon` 覆盖 Dock 图标导致
  丢失 macOS 系统渲染的光泽」。这个理由与实际资源不符：`build/icon.icns` 里的 1024px 表示与
  `build/icon.png` **逐像素完全相同**（electron-builder 直接拿这张 PNG 生成 icns），而这张 PNG
  本来就已经带圆角方块＋投影、alpha 干净。两条路径喂给系统的 artwork 是同一份，不存在
  「换图丢失光泽」的机制。
  但**整体删除**有确定的副作用：开发态 app bundle 是
  `node_modules/electron/dist/Electron.app` 的原样拷贝（`devElectronAppBundle.mjs` 只 patch
  Info.plist 的显示名/包名/URL scheme，不写图标），`CFBundleIconFile` 仍是 `electron.icns`，
  删掉调用后 `pnpm dev:desktop` 的 Dock 显示 Electron 默认图标（全仓 `app.dock.setIcon`
  再无其他调用点）。
  所以正确形态是 `if (!app.isPackaged) applyAppIcon(iconPath);`：打包态走 bundle 的 `.icns`，
  开发态保留产品 logo。上游若改动这段启动逻辑，保留这个条件判断即可。
- **`resolveUpdateStatusWindowHeight` 里 `idle || checking` 那个早返回不能删（看着冗余，实为类型收窄守卫）。**
  它返回的值与函数末尾的 fallthrough 完全相同，很容易被当成「等价的多余分支」清掉。
  但它真正的作用是把 `idle` / `checking` 提前从 `UpdateStatePayload` 联合类型里剔出去：
  `releaseNotes` 只声明在 `update-available`（`manualInstaller` 只在 `update-downloaded`）上，
  少了这一步收窄，下面的 `state.releaseNotes` 会报
  `TS2339: Property 'releaseNotes' does not exist on type '{ kind: "idle"; … }'`，
  主进程类型检查从 86 变 87。删除时**必须**跑
  `pnpm exec tsc -p packages/desktop/tsconfig.main.json --noEmit` 对比 86 这个基线，
  根 `pnpm typecheck` 覆盖不到 main 进程，看不出这个回归。
  注意这个函数整体是本地改过的（上游只有 download-progress / update-downloaded 两个分支），
  三个新增分支（idle-or-checking 收窄、releaseNotes 加高、manualInstaller 加高）都是 2.5
  「更新窗口高度」的一部分，合并时需要整体保留。
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
| IPC 通道名          | `zcode-task`、`zcode:select-file` 等 channels.ts 通道字符串未动（2.5 新增的两个通道除外）         |
| 协议常量            | `ZCODE_PROTOCOL_NAME = "ZCode Protocol"`、`com.zcode/` MCP 命名空间、`Symbol.for("zcode.*")` 未动 |
| 深链 scheme         | `zcode://`（OAuth 回调、share/import、workspace/open）未动                                        |
| 项目内目录          | `<项目>/.zcode/`（config.json、skills、agents、commands、workflows）、`.zcodeignore` 未动         |
| 品牌文案            | i18n（en-US/zh-CN）、菜单项、Agent 系统提示词（"You are ZCode, ..."）、TUI 文案未动               |
| 隐藏文件            | `.zcode-plugin/`、`.zcode-beta`、`.zcode-install-manifest` 等未动                                 |

> `README.md`、`NOTICE.md` **已**被本地改写（打包流程、内置插件载荷、自动更新源三节），
> 不再属于「未改动」，冲突时按本文件对应小节处理。

## 五、合并冲突决策表

| 冲突场景                                                                                   | 处理方式                                                                                                                                               |
| ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 上游改动第二节所列文件的**非路径行**                                                       | 手工合并，保留本地 `.zcodex` / `ZCodex` 字面量                                                                                                         |
| 上游**新增** home 级路径拼接（`homedir(), ".zcode"`、`~/.zcode`、`$HOME/.zcode`）          | 采用上游后手动改为 `.zcodex`                                                                                                                           |
| 上游新增/修改 **user vs workspace** 目录 segments                                          | 对照 2.2 的作用域拆分点，仅 user 级改 `.zcodex`                                                                                                        |
| 上游改 productName / 应用名相关                                                            | 保留本地 `ZCodex` 命名                                                                                                                                 |
| 上游改项目内 `.zcode`、`.zcode-plugin`、`.zcodeignore` 逻辑                                | 直接采用上游                                                                                                                                           |
| 上游改品牌文案（i18n、提示词、菜单）                                                       | 直接采用上游                                                                                                                                           |
| 上游改 `ZCODE_*` env、包名、IPC 通道、协议常量                                             | 直接采用上游（本地未定制，无冲突基础）                                                                                                                 |
| 上游改桌面自动更新（`autoUpdater.ts`、服务端 manifest provider、`initAutoUpdater` 传入项） | 保留本地 GitHub Release 方案（2.5），不要恢复服务端清单、`manifestUpdateProvider`、`deviceMid` / `resolveEndpointOrigin` 传入项                        |
| 上游改 UI 的 Logo / 侧栏布局 / 模型设置导航                                                | 对照 2.3，按本地意图保留（只动 Windows 分支，别动 mac 分支）                                                                                           |
| 上游改内置插件相关（`glm/packages`、seed、`official-plugin-definitions.ts`）               | 对照 2.6。定义表与入库载荷不一致时改定义表、不改载荷；**保住 zcode-guide 的 `version: "0.3.0"` 与那 6 条 `requiredSeedPaths`**，其余条目可直接采用上游 |
| 上游新增数据目录子目录（v2 下新文件等）                                                    | 路径经由枢纽函数（`getZCodeDataRootDir`/`getAppConfigDir`）时自动跟随，无需改；硬编码 `.zcode` 的才需要手动改                                          |

## 六、合并后自查命令

```bash
# ① home 级 .zcode 拼接不应出现。
#    vendor 载荷里官方的 .zcode 是刻意保留的（如 restore-legacy-sessions 扫描旧数据），必须排除。
grep -rn 'homedir(), "\.zcode"\|join(home[A-Za-z]*, "\.zcode"\|~/.zcode\b\|\$HOME/\.zcode\b' \
  packages apps scripts --include='*.ts' --include='*.tsx' --include='*.mjs' \
  | grep -v node_modules | grep -v '/dist/' | grep -v '/out/' \
  | grep -v bundled-agents | grep -v 'packages/desktop/vendor/'
# 期望：无输出

# ② 应用名应保持 ZCodex。下面两处命中是**有意保留**的旧标识，不要改：
#    - packages/desktop/package.json 的 "author": "ZCode"（作者字段，不是产品名）
#    - packages/desktop/src/main/mcpUserDirectory/legacy.ts 的 join(appData, "ZCode", …)
#      （从旧版 ZCode 的 appData 目录迁移数据的历史路径）
grep -rn '"ZCode"\|productName.*ZCode[^ ]' packages/desktop --include='*.json' --include='*.ts' --include='*.mjs'

# ③ fmt 失败清单 ∩ 本地改过/新增的文件，应为空（README.md 例外：上游版本本身就不干净）
#    上游自带失败基线：32 个（2026-09-30）。这个总数只增不减是正常的（上游新文件不跑 oxfmt），
#    真正要盯的是「交集」有没有多出自己改过的文件。
comm -12 \
  <(pnpm fmt:check 2>&1 | grep -E '\([0-9]+m?s\)$' | sed -E 's/ \([0-9]+m?s\)$//' | sort) \
  <(git diff --name-only 29628c9 -- . ':(exclude)packages/desktop/vendor' | sort)

# ④ 必跑验证
pnpm typecheck && pnpm lint && pnpm architecture:check --changed
# 改动过 main / preload / renderer 时额外跑（既有缺口基线 86 个错误，别让它变多）
pnpm exec tsc -p packages/desktop/tsconfig.main.json --noEmit
```

**CLI（`apps/zcode-cli`）侧的验证口径**：`pnpm --dir apps/zcode-cli typecheck` 走的是 turbo，
但本机 `apps/zcode-cli/node_modules` 只装了 tsc/oxlint/oxfmt、没有 turbo，这条命令会以
`sh: turbo: command not found` 失败（环境问题，不是代码问题）。改到 CLI 代码时直接跑包内脚本：

```bash
# 以改动所在的包为例（bootstrap）
cd apps/zcode-cli/packages/bootstrap
../../node_modules/.bin/tsc --noEmit      # 应通过
../../node_modules/.bin/oxlint src        # 既有基线：20 errors / 22 warnings
#   20 个 error 全是上游文件的 eslint(max-lines)，见 v4-gateway / bundled-plugins 等；
#   判定标准同 ③：只要报错文件不是自己改的就没引入回归。
```

## 七、历史合并记录（追加式）

> 每合并一次上游，在下面追加一条：上游提交号与版本、冲突清单及处理方式、上游带来的新依赖
> （需 `pnpm install`）、以及本次复核出的异常。**不要**把当下的定制状态写在这里 —— 那属于第二节。

### 2026-09-25 上游 v3.14.0 → v3.14.3

上游提交：`29628c9 feat: update v3.14.3`（283 文件，+30342/−1768）。

**冲突 2 处，处理方式：**

| 文件                                                           | 冲突内容                                                                                                   | 处理                                                                                                                                       |
| -------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| `package.json`                                                 | 上游把根版本改成 `3.14.3`                                                                                  | 保留本地版本号（合并时 `1.0.0`，合并后按 semver 升为 `1.1.0`）：fork 版本独立演进，`publish-github-release.mjs` 按根版本号校验 Release tag |
| `apps/zcode-cli/packages/contracts/src/tools/save-workflow.ts` | 上游精简了 `scope` 字段的 `.describe()` 文案，本地那行带 `~/.zcodex/workflows`（2.2 规则要求的路径字面量） | 取上游的简写，把 `~/.zcodex/workflows` 写回该行                                                                                            |

**上游新增内容（直接采用，无本地定制）：**

- Bot 接入：`packages/services/src/bots/**`（Feishu / Telegram / 微信 / Webhook）、
  `packages/ui/src/BotsDialog/**`、`packages/ui/src/botsUi.ts`、`packages/desktop/src/host/cronBotDelivery.ts`，
  以及 desktop / services 对 `@larksuiteoapi/node-sdk` 的依赖 → **合并后必须 `pnpm install`**。
- Bot 的存储走 `getAppConfigDir()`（`packages/services/src/bots/repo.ts` 等），因此自动落在
  `~/.zcodex/v2` 下，无需再改路径字面量。
- 桌面 main 的 Bot 远端 workspace 重连/状态 IPC handler（`packages/desktop/src/main/index.ts`）。

**注意点：**

1. 上游新文件**不跑 oxfmt**，合并后 `pnpm fmt:check` 的失败数会变多（本次 1 → 33，其中 31 个是
   上游新文件原样带入的 `bots/**`、`BotsDialog/**` 等）。**不要**为了 `fmt:check` 去格式化这些
   上游文件，否则每次合并都会在这些文件上产生冲突；只格式化本地改动的文件。判定方法见第六节 ③。
2. 上游改写 `packages/desktop/src/main/index.ts` 时，本地三项定制都保留：`ZCODE_PRODUCT_FLAVOR` 导入
   （第三节踩坑）、force-gate 启动调用保持删除、`initAutoUpdater({ ..., updateFeedSource })` 参数
   保持本地版本（不再有 `deviceMid` / `resolveEndpointOrigin`）。

**合并后自查结果：** 第六节两条 grep 干净（home 级拼接无残留 `.zcode`、应用名仍为 `ZCodex`）；
`pnpm typecheck` / `pnpm lint`（70 警告 0 错误）/ `pnpm architecture:check --changed` 通过。
`tsconfig.main.json` 类型错误 82 → 86、`tsconfig.renderer.json` 125 → 126，新增部分全部落在与上游
逐字节一致的文件里（上游自身的既有类型缺口），本地定制文件没有新增错误。

## 八、注意事项

1. 本目录（`.zcodex/`）是**文档目录**，与 home 下的数据目录 `~/.zcodex/` 无关，也不会被项目的 `.zcode` 配置扫描机制读取。
2. 打包产物（`.zcode-runtime/`、`dist/`、`packages/desktop/bundled-agents/`）为构建生成物，改名后重新构建即可，无需手改。
3. `third-party/inventory.json` 记录了文件内容 sha256，涉及第三方声明文件的合并后需重新生成声明材料（见 `third-party/README.md`）。
4. **fork 版本号与上游解耦**：根 `package.json` 的 `version` 就是应用版本（`build-metadata.mjs` 的 `appVersion` → electron-builder `extraMetadata.version`），所以每次合并上游后要按 semver 决定 fork 版本：合入上游**功能版**升 minor（如 1.0.0 → 1.1.0），只合修复升 patch，**不要**跟随上游的 `3.14.x` 数字。`publish-github-release.mjs` 按根版本号校验 Release tag。
5. 若未来要改品牌文案或内部标识符（包名、env、协议），应先更新本文档再动手。
6. 本文档自身也是本仓文件，改完要跑 `npx oxfmt .zcodex/upstream-merge-notes.md`，否则会进 `fmt:check` 失败清单。
