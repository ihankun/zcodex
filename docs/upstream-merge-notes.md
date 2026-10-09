# 本地定制变更记录（合并上游参考）

> 本文件记录本 fork（**ZCodex**）相对上游 ZCode 的**全部**本地定制，处理合并冲突时先读它。
> 上游基线：ZCode v3.14.3 = `29628c9`（= `origin/main`）。fork 版本号独立演进，当前 `1.1.2`。
> **判定某处是不是本地定制，不要凭记忆**：上游提交就在本地对象库里，直接
> `git diff 29628c9 dev -- . ':(exclude)packages/desktop/vendor'` 即全部本地改动；
> 只看「是否涉及 `.zcode` 字样」就能把约 2/3 的改动（数据目录改名）与真正的行为改动分开
> （2026-09-30 实测：144 个修改文件中 99 个只改了字样）。
> 最近复核：2026-10-08。

## 一、概览

| 定制                                                      | 影响面                                      | 详见 |
| --------------------------------------------------------- | ------------------------------------------- | ---- |
| 打包应用名 `ZCode` → `ZCodex`，主窗口标题同步             | 9 个文件                                    | 2.1  |
| 数据目录统一改名 `.zcode` → `.zcodex`（home 级 + 项目级） | 99 个文件（home 字样）+ 约 40 处（项目级）  | 2.2  |
| UI 定制：Logo / 布局 / 模型设置 / 供应商入口              | `packages/ui`                               | 2.3  |
| 启动与桌面行为：force-gate、Dock 图标、DMG 底图           | `packages/desktop/src/main`、`build/`       | 2.4  |
| 桌面自动更新改走 GitHub Release，未签名构建回退手动安装   | desktop + shared + client + ui + web + 构建 | 2.5  |
| 内置插件载荷入库                                          | 构建流程与产物                              | 2.6  |
| 用户可见产品名与文案统一为 `ZCodex`                       | ui i18n / web / CLI / 托盘 / 安装器文案     | 2.7  |
| Finder 右键「在ZCodex中打开」的 Services 注册             | desktop main（上游代码，仅改文案）          | 2.8  |

**改动性质**：多数是用户可见层（应用名、界面、更新流程），但下面四处**改了内部行为**，合并时最容易出事：

- 启动强制升级 gate 已禁用（2.4.1）
- 桌面自动更新不再读服务端 manifest，改读 GitHub Release（2.5）
- 数据目录改名：**home 级与项目级现已统一为 `.zcodex`**，不再区分 user/项目作用域（2.2）
- 内置插件的 seed 结果随定义表变化：入库载荷 + 对齐后的 `official-plugin-definitions.ts`（2.6）

**明确未改的内部标识符**：npm 包名、`ZCODE_*` 环境变量名、CLI 命令名、IPC 通道名、协议常量、深链 scheme、
以及 `.zcodeignore`、`.zcode-plugin/`、`.zcode-beta`、`.zcode-install-manifest` 这类隐藏文件名。清单见第四节。

**数据迁移不做**：改名不回读旧目录。已有的 home 数据与项目目录需要用户自行把 `.zcode/` 改名成 `.zcodex/`，
否则不会被读取（2026-10-08 起项目级与 home 级同此口径）。

## 二、本地定制清单（合并冲突时保护本地版本）

### 2.1 应用名与窗口标题（9 个文件）

| 变更       | 原值                                    | 现值                                       |
| ---------- | --------------------------------------- | ------------------------------------------ |
| 打包应用名 | `ZCode` / `ZCode Dev` / `ZCode Preview` | `ZCodex` / `ZCodex Dev` / `ZCodex Preview` |
| 主窗口标题 | `ZCode`                                 | `ZCodex`                                   |

- `packages/desktop/package.json` — `productName: "ZCodex"`
- `packages/desktop/scripts/desktop-product-identity.mjs` — 正式版 `ZCodex`、Preview 版 `ZCodex Preview`
- `packages/desktop/scripts/devElectronAppBundle.mjs` — `DEV_ELECTRON_APP_NAME = "ZCodex Dev"`
- `packages/desktop/src/main/desktopRuntimeEnv.ts` — 运行时应用名三态（Dev/Preview/正式）
- `packages/desktop/src/main/desktopLinuxDeepLinkRegistration.ts` — Linux `.desktop` 注册名回退值 `"ZCodex"`
- `packages/desktop/electron-builder.config.js` — `.app` 路径回退名 `?? "ZCodex"`
- `packages/services/src/paths.ts` — Windows 禁止目录守卫（`Program Files\ZCodex`、`...\Programs\ZCodex`）
- `packages/desktop/src/renderer/index.html` — `<title>ZCodex</title>`（2026-10-08 新增）
- `packages/shared/src/process-names.ts` — `formatZCodeRendererProcessName` 里的默认标题特例（2026-10-08 新增）

**窗口标题这条容易被忽略，但它是最外显的应用名之一**：macOS Dock 图标右键菜单里带勾的第一行
不是应用名，而是「当前窗口」项显示的**窗口标题**，即 `index.html` 的 `<title>`。改名前 `lsappinfo`
/ `Info.plist` / Spotlight 全都已经是 `ZCodex`，只有那一行还是 `ZCode`——排查时别只看 bundle 身份。

两处必须一起改：`<title>` 改了而 `process-names.ts` 的特例没改，
`document.title` 不再命中默认值分支，渲染进程名会从 `zcode-renderer-main` 退化成
`zcode-renderer-zcodex`，在**资源管理器**的进程列表里直接可见
（`resourceManagerProcessNames.ts` / `resourceManagerWindow.ts` 都用它给渲染进程命名）。

注意 `packages/desktop/package.json` 的 `"author": "ZCode"` 与
`packages/desktop/src/main/mcpUserDirectory/legacy.ts` 里的 `join(appData, "ZCode", …)`
是**有意保留**的（作者字段、旧版 appData 迁移路径），别当成漏改。

尚未改动的同类品牌字样（要改就得成组决定，见第四节）：`packages/web/index.html` 的
`<title>ZCode</title>`（网页标签标题）、`packages/desktop/src/renderer/cua-permission-panel.html`
的 `ZCode Computer Use`、`apps/zcode-cli/packages/debug/index.html` 的 `ZCode 调试台`，
以及 `process-names.ts` 里 `"ZCode - "` 远程窗口前缀（当前 desktop 没有任何代码设置这种标题，
分支是否可达未证实，故未动）。

### 2.2 数据目录：`.zcode` → `.zcodex`（home 级与项目级统一，2026-10-08 起）

本 fork 把**所有**数据/配置目录统一为 `.zcodex`，**不再区分 user 级与项目级作用域**：

- **home 级**：`{dataBaseDir}/.zcodex`（`getZCodeDataRootDir()`）、CLI 的 `~/.zcodex/cli/...`。99 个文件，纯字样改动。
- **项目级**：`<项目>/.zcodex/`。2026-10-08 之前曾是 `.zcode`（与上游 CLI 互认），现已统一；
  改动点见本节末尾「项目级（2026-10-08 新增）」。

只涉及该字样、没有其他改动的文件实测 100 个；下面按模块列出，但**列表不追求穷尽**，
新增路径拼接时按同样规则处理即可。

**中心枢纽（改动会被大面积继承，优先看）：**

- `packages/services/src/paths.ts` — `getZCodeDataRootDir()` 返回 `{dataBaseDir}/.zcodex`
- `packages/services/src/storage/adapters/rootsResolver.ts` — `ZCODE_DATA_DIR_NAME = ".zcodex"`（常量名保留）

**desktop**：`desktopDataBaseDirBootstrap.ts`、`desktopChromiumHardwareAccelerationBootstrap.ts`、`main/index.ts`（setting.json 引导读取）、`desktopRuntimeEnv.ts`（`ZCODE_HOME` fallback）、`exportLogs.ts`（归档前缀 `.zcodex/cli/...`）、`mcpUserDirectory/`（user 级 segments）、`host/remotePromptAttachments.ts`、`desktopCommandHandlers.ts`（清除数据确认文案）

**远端部署**：`packages/server/src/remote/deployShared.ts`（`REMOTE_BASE = "~/.zcodex/server"`）、`connect.ts`、`zcodeAgentBundleWrapper.ts`、`packages/zcode-server-cli/src/runtime/paths.ts`

**services**：`settingService`、`deviceMid`、`telemetryCore`、`subagentsService`、`subagentStorage`、`pluginSyncService`、`node.ts`、`settingsSyncService`、`skillSyncService`、`skillsService`、`commandsService`、`mcpSyncService`、`providerRuntimeResolver`、`modelTrajectoryFileTail`、`zcodeAgentService`、`zcodeTaskServiceAdapter`、`hooksService`（仅 user 级分支）

**CLI（apps/zcode-cli）**：`contracts/src/config/index.ts`（`DefaultRuntimeConfig.storage`）、`cli/clipboard-image.ts`、`sea-runtime-tools.ts`、`provider-runtime-env.ts`、`adapters/` 下 context/config/auth/trust-store/session-store/workflow/runner-debug/execution-utils/device-mid/logging、`telemetry/bootstrap.ts`、`debug/server/sources.ts`、`bootstrap/` 下 script-workflow-tool-port、script-workflow-utils、create-app（mailbox）、`contracts/src/tools/saved-workflow.ts` 的 `SAVED_WORKFLOW_GLOBAL_DIR`

**项目级（2026-10-08 新增，`<项目>/.zcodex/`）：**

作用是让全仓只剩一个目录名，合并上游时冲突退化成纯字面量替换。改动点：

| 文件                                                                                                                                                                                                                                                         | 项目级用途                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- |
| `apps/zcode-cli/packages/adapters/src/skills/roots.ts`、`commands/roots.ts`                                                                                                                                                                                  | 原 `ZCODE_DIR = ".zcode"` 与 `USER_ZCODE_DIR = ".zcodex"` **合并为一个** `".zcodex"`；`scope === "user" ? … : …` 三元分支删除 |
| `apps/zcode-cli/packages/adapters/src/config/project-config.adapter.ts`                                                                                                                                                                                      | `basename(configDirectory) === ".zcode"` 判定                                                                                 |
| `packages/services/src/skills/skillsService.ts`                                                                                                                                                                                                              | workspace skills 根                                                                                                           |
| `packages/services/src/commands/commandsService.ts`                                                                                                                                                                                                          | `workspaceDirectorySegments`                                                                                                  |
| `packages/services/src/subagents/subagentStorage.ts`                                                                                                                                                                                                         | workspace agents 根                                                                                                           |
| `packages/services/src/mcp-sync/mcpSyncService.ts`                                                                                                                                                                                                           | `workspaceConfigDirSegments`                                                                                                  |
| `packages/services/src/settings-sync/settingsSyncService.ts`                                                                                                                                                                                                 | `workspace*Segments`（skills / commands / plugins / config.json）                                                             |
| `packages/services/src/hooks/hooksService.ts`                                                                                                                                                                                                                | workspace 分支与 `editable` 判定（home 分支仍是 `.zcodex/cli`，现在两分支同字面量）                                           |
| `packages/desktop/src/main/mcpUserDirectory/index.ts`                                                                                                                                                                                                        | `workspaceConfigDirSegments`                                                                                                  |
| `packages/shared/src/workspace-hook-config.ts`、`workspace-hook-mutation.ts`                                                                                                                                                                                 | 候选路径、`baseDir` 推断、`WorkspaceHookConfigFileKind` 的 `".zcode/config.json"` 字面量                                      |
| `apps/zcode-cli/packages/contracts/src/hooks/workspace-hook-trust.ts`                                                                                                                                                                                        | 上述 kind 的 zod 枚举（信任记录持久化该值）                                                                                   |
| `apps/zcode-cli/packages/contracts/src/tools/saved-workflow.ts`                                                                                                                                                                                              | `SAVED_WORKFLOW_PROJECT_DIR`、`WORKFLOW_DRAFTS_DIR`                                                                           |
| `apps/zcode-cli/packages/bootstrap/src/subagents.ts`、`plugins.ts`、`app/script-workflow-*.ts`、`app/workspace-hook-review-mutation.ts`、`builtin-prompt-command.ts`                                                                                         | 项目 agents 目录、workspace plugin 配置、workflow 读写与 scope 判定、hook 评审写入路径、`/init` 提示词里的隐藏指令候选路径    |
| `apps/zcode-cli/packages/core/src/subagent/persistent-memory.ts`、`memory/memory-file-path.ts`、`runtime/helpers/plan-file-continuity.ts`、`tool/handlers/workflow-drafts.ts`、`tool/handlers/saved-workflows/store.ts`、`permission/workflow-draft-path.ts` | agent-memory、memory 文件、plan 文件、workflow-drafts / workflows 落点                                                        |
| `apps/zcode-cli/packages/dynamic-workflow-runtime/src/child-entry-file.ts`、`harness.ts`、`child-source.ts`                                                                                                                                                  | `workflow-runs` 入口文件落点                                                                                                  |
| `packages/ui/src/lib/skillSourceFilter.ts`                                                                                                                                                                                                                   | 路径来源检测只需匹配 `/.zcodex/`（原 `.zcode` 分支删除，**注意同名的 `.agents` 分支保留**）                                   |
| `packages/ui/src/settings/saved-workflows/useSavedWorkflowsDirectoryWatch.ts`                                                                                                                                                                                | `<ws>/.zcodex/workflows` 监听                                                                                                 |
| `apps/zcode-cli/packages/bundled-skills/skills/dynamic-workflows/SKILL.md`                                                                                                                                                                                   | 技能正文里的路径说明（`.zcodex/workflow-drafts/`、`.zcodex/workflows/`）                                                      |
| `packages/desktop/build/installer.nsh`                                                                                                                                                                                                                       | Windows 安装器「安装目录内含数据目录」阻断扫描                                                                                |
| `apps/zcode-cli/packages/core/src/memory/memory-file-path.ts`                                                                                                                                                                                                | 记忆文件的敏感路径拒绝段 `.zcode` → `.zcodex`（配置目录不该被当作记忆落点）                                                   |
| `apps/zcode-cli/packages/contracts/src/tools/workflow.ts`                                                                                                                                                                                                    | `Workflow` 工具 `name` 描述里的 `.zcodex/workflows/`                                                                          |
| `apps/zcode-cli/packages/cli/src/dwf-child-command.ts`、`bootstrap/src/zcode-protocol/mcp.ts`、`packages/ui/src/lib/windowsFileLinkEscapeRemarkPlugin.ts` 等                                                                                                 | 仅注释/示例里的路径说明                                                                                                       |
| `README.md`、`README.en.md`、`NOTICE.md`、`apps/zcode-cli/README.md`、`apps/zcode-cli/packages/debug/README.md`、`apps/zcode-cli/tools/prompt-trajectory/README.md`                                                                                          | 文档路径：含顺带修正的旧残留（见 2.2.1）                                                                                      |

**不再有作用域拆分**：原先「user 级 `.zcodex` / 项目级 `.zcode`」的两套字面量与三元分支已全部消除。
上游若重新引入 user/workspace 两条路径分支，两边都取 `.zcodex`，不要恢复 `.zcode`。

#### 2.2.1 顺带修正的既有残留（2026-10-08 复核）

改名时发现这些地方**本应在上一次 home 目录改名时就改掉**，属于漏改，一并修正：

| 位置                                                                                                     | 原值               | 现值                | 影响                                                               |
| -------------------------------------------------------------------------------------------------------- | ------------------ | ------------------- | ------------------------------------------------------------------ |
| `packages/desktop/build/installer.nsh`                                                                   | 扫描 `.zcode`      | 扫描 `.zcodex`      | Windows 安装器的数据目录阻断实际扫的是旧名                         |
| `packages/ui/src/i18n/locales/zh-CN.ts`、`en-US.ts`                                                      | 「`.zcode/v2`」    | 「`.zcodex/v2`」    | 设置页数据目录说明文案                                             |
| `apps/zcode-cli/README.md`、`packages/debug/README.md`、`tools/prompt-trajectory/README.md`、`NOTICE.md` | `~/.zcode/cli/...` | `~/.zcodex/cli/...` | CLI 文档里的用户配置/数据库路径                                    |
| `README.md`、`README.en.md`                                                                              | `~/.zcode/runtime` | `~/.zcodex/runtime` | 命令行版安装目录说明（`installer.mjs` 实际已是 `.zcodex/runtime`） |

#### 2.2.2 刻意不改的 `.zcode` 字样

- **vendor 载荷内的官方文档**：`packages/desktop/vendor/official-plugins/zcode-guide-plugin/skills/*/SKILL.md`
  仍写 `.zcode/config.json`。这是官方预编译资产，改它会与官方载荷产生内容差异（2.6 的来源优先级 / seed hash
  一致性要求载荷保持原样），因此**保留**。代价：这个内置插件的文档对本 fork 路径不再准确，属已知不准确处。
- `SENSITIVE_MEMORY_PATH_SEGMENTS` 之外的其他 `.zcode` 命中均为内部标识符，见第四节。

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

#### 2.3.6 触发器不显示厂商前缀，tooltip 仍显示完整来源（2026-10-08）

`packages/ui/src/v4/composer/modelTriggerDisplay.ts` + `V4ComposerToolbar.tsx` —— composer 的
模型触发器只显示模型名；**鼠标悬停的 tooltip 与 aria-label 仍显示 `厂商/模型`**。

两处配合，缺一不可：

- `resolveV4ModelTriggerDisplay` 不再产出 `providerPrefix`（删掉「非 family 且非单供应商」那段），
  返回 `{ fullLabel, modelLabel }`：`fullLabel` 仍是完整标签（非 family 供应商会带
  `${providerName}/`），`modelLabel` 是裸模型名。
- `V4ComposerToolbar.tsx` 把 `triggerLabel` 从 `fullLabel` 改成 `modelLabel`。**必须改**：
  `RollingToolbarLabel` 的规则是「`prefix` 与 `value` 同时存在才渲染 `prefix+value`，否则渲染
  `label`」——`providerPrefix` 不再产出后，trigger 的可见文字完全由 `label` 决定，而
  `tooltipTitle` / aria-label 仍走 `fullLabel`。只改其中一处会得到「前缀回到触发器上」（改反）
  或「tooltip 也丢了来源」（改少了）。

- 效果：宽窄容器下 trigger 都只有模型名（等价于上游的 compact 态）。
- 历史：2026-09-29 起是「非空供应商数 ≤ 1 时不显示」，2026-10-08 改为一律不显示。
- 内置 family 供应商（`account:zai-*` / `account:bigmodel-*`）的 tooltip 也**不带**厂商名，
  这是 `formatProviderModelLabel` 的上游规则（连接名拼进模型文案会重复展示套餐信息），本地未改。
- `providerPrefix` 字段与 `V4ComposerToolbar.tsx` 的 `triggerLabelPrefix` 透传**保留**
  （现在恒为 `undefined`），以维持与上游最小差异。上游若改这段，不要恢复拼前缀。
- 模型不在当前菜单里时走另一条分支（`!selectedGroup || !selectedItem`），仍用
  `resolveV4ModelTriggerLabel` 的结果，语义未变。
- 由 `packages/ui/test/modelTriggerDisplay.test.ts` 钉住（本地定制的回归防线，合并后要跑）。

#### 2.3.7 帮助菜单隐藏上游产品入口（2026-10-09）

两处菜单都要改，它们是**不同的东西**，别只改一处：

**① app 内的帮助下拉**（`packages/ui/src/WorkspaceHelpMenuButton.tsx`）——移除指向上游产品服务的
四项：**产品文档 / 用户社群 / 问题上报 / 给产品提需求**；只保留「资源管理器 / 检查更新 / 关于 ZCodex」。
顺带删掉了现在会打头的分隔线，并加了「非桌面端不渲染该按钮」的门（剩下三项全是桌面专属，
Web 上否则会剩一个点开是空的菜单）。

**② macOS 原生菜单栏的「帮助」菜单**（`packages/desktop/src/main/desktopApplicationMenu.ts`）——
移除 **更新日志**（`helpWhatsNew` → `OpenChangelog`）与 **问题上报**（`helpFeedback` → `OpenFeedback`）。
更新日志那项连同它后面的分隔线一起删（在 macOS 上它原本是菜单第一项，留着会让菜单以分隔线开头）；
非 macOS 分支（关于 / 检查更新）自带的分隔线保留。菜单剩下：切换开发者工具 / 资源管理器 /
导出日志 / 清除所有数据（后两者之间、以及资源管理器之前的分隔线仍在）。

- `packages/ui/src/lib/helpMenuActions.ts` **保留为不可达代码**（它只服务被移除的两项）：
  理由同第三节的 `forceUpdateGuard`——留着与上游逐字节一致，删除会让上游每次改动都产生
  delete/modify 冲突。已知代价：`pnpm knip` 会把它列进 unused files（基线噪音）。
- `DesktopCommandIds.OpenChangelog` 的 handler（`desktopCommandHandlers.ts`）与
  `desktopMenu.ts` 的 `helpWhatsNew` / `helpFeedback` 文案**保留**：前者与上游逐字节一致、
  后者仍是命令面板等处的文案来源（同下条）。
- **仍未动**：命令面板（`quickpick/quickPickCommands.ts`）里仍有这四个命令；
  i18n 的 `workspaceHeader.help.{docs,community,issueReport,productRequest}` 与
  `desktopMenu.ts` 的 `titleBar.menu.help.{whatsNew,feedback}` 文案都保留（它们仍是那处的文案来源）。

#### 2.3.8 左下角账号菜单移除「升级」入口（2026-10-09）

`packages/ui/src/WorkspaceSidebarFooterUsageSummary.tsx` 的菜单内容里，GLM 套餐的
**「升级 / 续费」项**（`TID_SIDEBAR_CODING_PLAN_UPGRADE_BUTTON`）已移除；同一组的
「使用统计」保留。它原本「始终显示」，并带 Coding Plan entry gate 与 funnel 埋点。

**连带清理**（做法同 2.3.3「删 UI 元素 + 清理传递链」）：

- `WorkspaceSidebarFooterUsageSummary.tsx`：删掉该菜单项，以及只为它服务的导入
  （`useCodingPlanEntryGate`、`isMaxCodingPlanSnapshot`、`createCodingPlanFunnelContext`、
  `resolveCodingPlanEntryPlanState`、`resolveSidebarCodingPlanUpgradeFallbackProviderId`）与局部量
  （`upgradeActionLabelId`、`upgradeProviderSnapshot`）；state hook 里为它计算的
  `upgradeTargetProviderId` / `selectedUpgradeProviderId` 一并删除。
- `WorkspaceSidebarFooter.tsx`、`WorkspaceSidebar.tsx`、`SettingsPage.tsx`：`onUpgradeClick`
  这条 prop 链、两侧的 `handleOpenCodingPlanUpgrade*` 与 `useCodingPlanUpgradeDialog()` 解构都已删除。
- **刻意保留**：`WorkspaceSidebarFooterUsageSummaryContent` 的 `state` prop 现在不再被读取，
  但**保留声明**——清掉它会牵动调用方（footer，以及同文件里那个全仓已无人引用的包装组件
  `WorkspaceSidebarFooterUsageSummary`）与 footer 的 state 计算，收益不抵改动面。
  另外 `CodingPlanUpgradeDialogProvider` 与套餐卡上的升级入口**没动**：设置页等处仍有其他升级入口。
- i18n 的 `sidebar.usage.plan.upgrade` / `.renew` 文案保留（仍是套餐卡的文案来源）。

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

### 2.7 用户可见产品名与文案统一为 `ZCodex`（2026-10-08）

把用户会看到的产品名从 `ZCode` 改成 `ZCodex`。**内部标识符一律不动**（见第四节），改的只是
「用户看到的名字与句子」。合并上游时这些文件按本节的意图保留本地版本。

| 位置                                                                                                                                                            | 说明                                                                                              |
| --------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `packages/ui/src/i18n/locales/en-US.ts`、`zh-CN.ts`                                                                                                             | 全部用户可见文案里的产品名（约 100 处/文件）——启动屏、引导、Bot、分享导入、设置页等，是最大的一块 |
| `apps/zcode-cli/packages/i18n/src/locales/en-US.ts`、`zh-CN.ts`                                                                                                 | 仅 TUI 的 `starting`（`ZCode Protocol` 是协议名，保留）                                           |
| `apps/zcode-cli/packages/tui/src/app-sidebar.tsx`                                                                                                               | `PRODUCT_NAME`（宽度由 `displayWidth` 推导，改长自动适配）                                        |
| `apps/zcode-cli/packages/debug/index.html`                                                                                                                      | 调试台页面标题                                                                                    |
| `packages/web/index.html`、`packages/web/src/main.tsx`                                                                                                          | 网页标签标题与各路由的 `document.title`                                                           |
| `packages/web/src/auth/webAuthLocale.ts`                                                                                                                        | 登录页品牌名                                                                                      |
| `packages/web/src/share/ConversationShareLandingPage.tsx`、`share/conversationSharePreviewClient.ts`、`share/mockConversationSharePreviewClient.ts`             | 公开分享页的品牌与文案（含非 mock 客户端的校验提示）                                              |
| `packages/ui/src/lib/builtinSkillI18n.ts`                                                                                                                       | 内置技能描述文案（Browser Use / 插件创建等）                                                      |
| `packages/ui/src/v4/ConversationShareReadonlyTimeline.tsx`                                                                                                      | 只读分享页的「需要更新版本」提示                                                                  |
| `packages/ui/src/app-shell/WorkspaceShellLayout.tsx`                                                                                                            | 工作区标题属性 `ZCode / <目录名>`                                                                 |
| `packages/ui/src/v4/conversationProjectionStore.ts`                                                                                                             | 运行时回收后展示的错误文案（**只改展示串，`includes(...)` 匹配串不动**）                          |
| `apps/zcode-cli/packages/debug/src/App.tsx`                                                                                                                     | 调试台页面可见标题（`index.html` 的 `<title>` 另算一处）                                          |
| `packages/ui/src/WorkspaceSidebarFooter.tsx`、`WorkspaceSidebar/WorkspaceSidebarCollapsedRail.tsx`、`WelcomeScreen.tsx`、`onboarding/OnboardingWelcomeView.tsx` | 侧栏账号兜底名、logo 的 `alt` 与 `aria-label`                                                     |
| `packages/shared/src/desktopMenu.ts`                                                                                                                            | Windows/Linux 托盘 tooltip 与菜单项文案                                                           |
| `packages/desktop/src/renderer/cua-permission-panel.html`、`renderer/cuaPermissionPanelMessages.ts`                                                             | CUA 权限面板的窗口标题、可见名称与文案                                                            |
| `packages/desktop/src/main/about.ts`                                                                                                                            | About 面板：`ABOUT_APPLICATION_NAME`、标题与版权行                                                |
| `packages/desktop/src/main/desktopWindowsOpenFolderContextMenu.ts`                                                                                              | Windows 资源管理器右键菜单文案（**注册表键名 `ZCode.OpenInZCode` 不动**，同 Finder 那条的理由）   |
| `packages/shared/src/zcode-slash-command-help.ts`                                                                                                               | 斜杠命令帮助文本里的「credential store」                                                          |
| `packages/zcode-server-cli/src/cli.ts`                                                                                                                          | `ZCodex Server ...` / `ZCodex TUI` 等 stdout 文案                                                 |
| `packages/services/src/bots/messages.ts`、`bots/{feishu,telegram,weixin}ChannelRuntime.ts`、`bots/providers/weixinProvider.ts`                                  | Bot 在聊天里发出的文案（helpTitle、远端未连接提示、窗口占用提示）                                 |
| `packages/desktop/build/installer.nsh`                                                                                                                          | 仅「安装目录含数据目录」弹窗文案（NSIS 函数名与 `ZCode-*.log` 日志文件名不动）                    |

**刻意不改（要改先想清楚）：**

- `ZCode Protocol`：协议名，属内部标识符。
- **Agent 系统提示词**（`core/src/context/sections/cli-prefix.ts` 的 "You are ZCode, an interactive
  coding agent"、`subagent/explore.ts`、`runtime/methods/workspace-generate-text.ts` 的连通性探针）：
  改它会改变模型的自我认知，并动到 **prompt 缓存前缀**，属行为改动，需单独决策。
- `packages/shared/src/openrouter-attribution.ts` 的 `X-OpenRouter-Title: "ZCode"`：发给第三方服务的
  归属标识。
- `packages/services/src/runtime-tools/appCaCert.ts` 的 CA `organizationName: "ZCode"`：改了会让用户
  已信任的本地 CA 与实际签发的证书主体不一致，必须和迁移一起考虑。
- `packages/shared/src/plugin-display-name.ts` 的 `zcode: "ZCode"`：插件 slug → 显示名的映射，与插件 id 绑定。
- `packages/web/src/share/ConversationShareLandingPage.tsx` 的 `ZCODE_DOWNLOAD_URL`：仍指
  `https://zcode.z.ai`（上游站点）。改名后它与「下载 ZCodex」的文案不再对应，改指 fork 的 Release 页
  属产品决策，未擅自改。
- 代码注释里提到 `ZCode` 的地方（不影响用户）。
- **匹配 agent/runtime 输出的字符串**（改了会让识别失效，因为产出方仍是 `ZCode` 前缀的文本）：
  `packages/ui/src/v4/conversationProjectionStore.ts` 的 `message.includes("ZCode agent transport
closed" / "ZCode Protocol client disposed" / "ZCode Protocol client is disposed" / "ZCode Agent
runtime is not running")`、`packages/ui/src/lib/zcodeUiError.ts` 的
  `GENERIC_ZCODE_UI_ERROR_MESSAGES`（含 `"ZCode session failed"`）。
- `packages/ui/src/hooks/workspacePrepareRpc.ts` 的 `version: "ZCode Protocol/1"`：协议版本串。
- `packages/ui/src/feedback/feedbackSubmit{Submission,Description}.ts` 的
  `FEEDBACK_ZCODE_AGENT_LABEL = "ZCode Agent"`：一个值同时进反馈**载荷**与描述文案，改它会改变上报数据。
- desktop / services 的内部错误与日志文本（如 `"ZCode task service is not initialized."`、
  `"ZCode credentials are corrupt"`、`"ZCode agent warmup ..."`）：面向排查，不是产品名展示。
- `packages/desktop/src/host/browserControlMainBridge.ts` 的 `"ZCode In-app Browser"`：
  内嵌浏览器（CDP/Playwright）看到的浏览器名。
- `apps/zcode-cli/packages/browser-use-plugin/**` 的 `SKILL.md` 与 `docs/*.md`：面向 Agent 的
  技能文档，随插件分发（改动等同于改 prompt 文本，且与 `.agents/skills` 镜像副本相关）。

#### 2.7.1 补漏：夹在句子里的产品名（2026-10-09）

上一轮漏了一类：**产品名夹在句子中间**的文案（`"关于 ZCode"`、`"无法解压 ZCode 远程资源"`），
因为当时用的是「裸 `"ZCode"` 精确匹配」。这次补上，扫描模式改为
**「引号内出现『空格 + ZCode』」**（`rg -nP '"[^"]*[ ]ZCode(?!x)'`）——这个模式专抓夹在句子里的产品名，
比裸引号匹配可靠。补改的文件：

- `packages/shared/src/desktopMenu.ts` — `titleBar.menu.help.about`：`关于 ZCode` → `关于 ZCodex`（en 同理）。
  这是 macOS **原生菜单栏**「关于」项的文案来源；UI i18n 里同名 key 上一轮已改，所以当时表现为
  「app 内菜单已对、原生菜单还是旧名」。
- `packages/desktop/src/main/desktopOAuthDeepLink.ts` — 深链确认弹窗的标题与正文（4 条）。
- `packages/server/src/remote/remoteAssetPreflight.ts` — 远端缺少 curl/wget/tar/sha256sum 时的
  用户可见错误（3 条）。
- `packages/shared/src/plugin-marketplaces.ts` — 官方市场的描述文案。

**这次扫描同时确认了几处「不能改」，别当成漏改：**

- `packages/services/src/file/workspaceFileIgnore.ts` — 生成的 `.zcodeignore` 模板里仍写 ZCode。
  其中**两行 marker 是被逐行比较的**（`line.trim() === WORKSPACE_FILE_SEARCH_IGNORE_*_MARKER`，
  用于「从 .gitignore 同步 / 恢复默认规则」的分区识别）；只改 header 不改 marker 会让生成的
  文件里两个名字混用，所以整份保持原样。
- `packages/desktop/src/main/forceUpdateGuard.ts`、`forceUpdatePrompt.ts` — 文案随「保留为不可达代码」
  一并保留（§2.4.1）。
- CLI/Agent 提示词与工具描述（`core/src/context/sections/{cli-prefix,identity}.ts`、
  `bootstrap/src/builtin-prompt-command.ts`、`core/src/system-reminder/incoming-message.ts`、
  `core/src/tool/handlers/{agent,read}.ts`、`core/src/runtime/helpers/attachment-path-reference.ts` 等）：
  属 prompt 类，改它会动 prompt 缓存前缀（见本节开头）。
- 内部诊断文本（`zcode-server-cli` 的 stderr、credential 读取错误、telemetry 状态校验、
  `logger.*` 文案）：面向排查，不是产品名展示。
- **尚未处理（用户可见，但要单独确认）**：`apps/zcode-cli/packages/bootstrap/src/app/official-plugin-definitions.ts`
  里内置插件的商店描述与 `zcode-guide` 的 `displayName`（约 10 处）。该文件是合并最敏感的一处
  （必须保住 zcode-guide 的 `version: "0.3.0"` 与那 6 条 `requiredSeedPaths`，见 2.6），
  改这批 listing 文案不影响 seed，但要和上游改动一起看，故留待单独处理。

### 2.8 Finder 右键「在ZCode中打开」是谁注册的（2026-10-08）

这条右键菜单**不是安装包注册的，而是应用每次启动时写的** macOS Services
（Automator workflow + `NSServices`），实现在 `packages/desktop/src/main/desktopFinderOpenFolderWorkflow.ts`
（上游代码，本轮只改文字）：

- 落点 `~/Library/Services/Open in ZCode.workflow/`；菜单里显示的文字来自 `Contents/Info.plist` 的
  `CFBundleName` 与 `NSServices[0].NSMenuItem.default`（两者都取 `SERVICES_MENU_LABELS[locale]`）。
- 写完调 `/System/Library/CoreServices/pbs -update` 刷新 Services 索引；仅内容变化时重写，
  所以改文案后**只要重启应用**菜单项就会就地更新，不会留下旧副本。
- 作用域：`NSRequiredContext.NSApplicationIdentifier = com.apple.finder`，且 `NSSendFileTypes`
  只收 `public.folder` / `public.directory`——只有右键**文件夹**时才有这一项。
- 本地定制只改 `SERVICES_MENU_LABELS`（`在ZCode中打开` → `在ZCodex中打开`、`Open in ZCode` →
  `Open in ZCodex`）。目录名 `Open in ZCode.workflow`、`CFBundleIdentifier`
  (`dev.zcode.app.finder-open-workflow`)、`WORKFLOW_VERSION` 都保持原样：改目录名会在
  `~/Library/Services` 留下旧副本，Finder 里就出现两个同名项，得再写清理逻辑。
- **目前没有开关可以关掉它**：`installFinderOpenFolderWorkflow` 每次启动都执行，删掉目录会被重建。
  要能关就得加设置项（未实现）。

### 2.9 供应商余量查询（DeepSeek / OpenCode Go，2026-10-09）

fork 新增的功能，上游没有：在【模型设置 → 供应商卡片】与【输入框上下文用量面板】两处显示
DeepSeek 金额余额（含赠金/充值分项）与 OpenCode Go 的 5h / 1w / 1m 用量。
完整方案与验收场景见 `docs/specs/provider-balance-query.md`。

**新增文件**（上游不会有；冲突时保留本地）：
`packages/shared/src/provider-balance.ts`（支持余量的 provider 名单，services 与 UI 共读这一份）、
`packages/services/src/usage-stats/providers/{providerBalanceSupport,deepseekBalanceProvider,openCodeGoUsageProvider,providerBalanceRegistry}.ts`、
`packages/ui/src/hooks/useProviderBalance.ts`、`packages/ui/src/lib/providerBalancePresentation.ts`、
`packages/ui/src/provider-balance/ProviderBalanceRows.tsx`、
`packages/ui/src/settings/model-provider-section/ProviderBalanceSection.tsx`、
`packages/ui/src/chat-input-toolbar/ProviderBalancePanel.tsx`。

**改到的上游文件**（合并时要保住这些挂钩，别整段采用上游版本）：

- `packages/shared/src/usage-quota.ts`、`usage-stats.ts`：新增 `PROVIDER_USAGE_WINDOW_LIMIT_TYPE`、
  `ProviderUsageWindowPeriod`、`UsageProviderMoneyBalance`，以及 `UsageEntitlementSnapshot.balance`。
- `packages/services/src/usage-stats/usageStatsService.ts`：`getEntitlementSnapshot` 前置一条
  「名单内 provider → 第三方派发表」的分支；新增可选依赖 `providerSettingsService`（读该 provider
  配置里的 `access.apiKey`，且只认 `access.type === "api-key"`）。
- `packages/services/src/node.ts`、`packages/desktop/src/host/remoteWorkspaceServiceCollection.ts`：
  装配处多传 `providerSettingsService`（缺省时行为与上游一致）。
- `packages/ui/src/v4/composer/V4ComposerToolbar.tsx`、`chat-input-toolbar/contextUsage.tsx`：
  新增 `providerBalance` 段，与 GLM 的 Start Plan / Coding Plan 段并列且互斥；
  hover 刷新复用既有 `onAccess` 链路（60s access 窗口 + in-flight 合并）。
- `packages/ui/src/settings/model-provider-section/Detail.tsx`：通用 provider 分支多渲染一个余量区块。
- `packages/ui/src/i18n/locales/{zh-CN,en-US}.ts`：`settings.modelProvider.providerBalance.*` 13 条
  与 `planCard.usage.month`。
- 单测：`packages/services/test/providerBalanceNormalize.test.ts`、
  `packages/ui/test/providerBalancePresentation.test.ts`（合并上游后要一起跑）。

**刻意不动**：`BigModelUsageQuotaProvider` 与 GLM 的 coding-plan / start-plan 链路一行未改；
OpenCode Zen（`opencode-zen-*`）不在名单内——其用量端点未经验证，宁可不显示余量段。

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
- **改了 `apps/zcode-cli/packages/contracts` 源码后要重建它的 `dist`，否则 `bootstrap` 的类型检查会报假错。**
  `bootstrap`（以及 `server`/`zcode-server-cli` 的产物）解析 `@zcode/contracts` 走的是 `dist/*.d.ts`，
  不是源码。2026-10-08 实测：改掉 `workspace-hook-trust.ts` 里的 `configFileKind` 字面量后，
  `cd apps/zcode-cli/packages/bootstrap && ../../node_modules/.bin/tsc --noEmit` 报
  `Type '".zcode/config.json"' is not assignable to type 'WorkspaceHookConfigFileKind'. Did you mean
'".zcodex/config.json"'?` —— 源码里已经没有这个字面量，报的是 `contracts/dist` 里的旧声明。
  先 `cd apps/zcode-cli/packages/contracts && ../../node_modules/.bin/tsc` 重建即可。
  同理，`packages/*/dist`、`packages/desktop/bundled-agents/`、`apps/zcode-cli/packages/cli/dist/zcode.cjs`
  都是产物：**改了路径字面量后必须重新构建，运行时才生效**（正在运行的 app 不会自动跟上）。

## 四、明确未改动（合并冲突时可直接采用上游）

| 类别                | 说明                                                                                                                                                |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm 包名 `@zcode/*` | 全部 29 个包的 name、dependencies、import 均未动                                                                                                    |
| 环境变量 `ZCODE_*`  | 约 300 个 env 名未动（含 `ZCODE_DATA_BASE_DIR`、`ZCODE_HOME`）                                                                                      |
| CLI 命令名          | `bin: { zcode }`、`zcode.cjs`、`bin/zcode.mjs` 未动                                                                                                 |
| IPC 通道名          | `zcode-task`、`zcode:select-file` 等 channels.ts 通道字符串未动（2.5 新增的两个通道除外）                                                           |
| 协议常量            | `ZCODE_PROTOCOL_NAME = "ZCode Protocol"`、`com.zcode/` MCP 命名空间、`Symbol.for("zcode.*")` 未动                                                   |
| 深链 scheme         | `zcode://`（OAuth 回调、share/import、workspace/open）未动                                                                                          |
| 品牌文案            | 用户可见文案**已**统一为 `ZCodex`（见 2.7）；仍未动的只有 Agent 系统提示词（"You are ZCode, ..."）、协议名 `ZCode Protocol` 与第三方归属标识        |
| 隐藏文件            | `.zcodeignore`、`.zcode-plugin/`、`.zcode-beta`、`.zcode-install-manifest` 等未动                                                                   |
| 其他非目录标识符    | `window.zcode`、`meta.zcode` / `provider.zcode` / `model.zcode` 数据字段、`dev.zcode.*` bundle id、`com.zhipu.zcode.server`、`zcode/` MCP meta 前缀 |
| vendor 载荷内容     | `packages/desktop/vendor/official-plugins/**` 一字不改（含其中仍写 `.zcode/config.json` 的 zcode-guide 技能文档）；理由见 2.2.2 与 2.6              |

> `README.md`、`NOTICE.md` **已**被本地改写（打包流程、内置插件载荷、自动更新源三节），
> 不再属于「未改动」，冲突时按本文件对应小节处理。

## 五、合并冲突决策表

| 冲突场景                                                                                         | 处理方式                                                                                                                                               |
| ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 上游改动第二节所列文件的**非路径行**                                                             | 手工合并，保留本地 `.zcodex` / `ZCodex` 字面量                                                                                                         |
| 上游**新增**数据目录路径拼接（home 级或项目级：`homedir(), ".zcode"`、`~/.zcode`、`.zcode/xxx`） | 采用上游后手动改为 `.zcodex`                                                                                                                           |
| 上游新增/修改 **user vs workspace** 目录 segments                                                | 两级都取 `.zcodex`；作用域已统一（2.2），不要恢复 `.zcode`                                                                                             |
| 上游改 productName / 应用名相关                                                                  | 保留本地 `ZCodex` 命名                                                                                                                                 |
| 上游改 `.zcode-plugin/`、`.zcodeignore` 逻辑                                                     | 直接采用上游（这两类是未改动的标识符）；项目内 `.zcodex/` 目录逻辑按 2.2 处理                                                                          |
| 上游改品牌文案（i18n、提示词、菜单）                                                             | 直接采用上游                                                                                                                                           |
| 上游改 `ZCODE_*` env、包名、IPC 通道、协议常量                                                   | 直接采用上游（本地未定制，无冲突基础）                                                                                                                 |
| 上游改桌面自动更新（`autoUpdater.ts`、服务端 manifest provider、`initAutoUpdater` 传入项）       | 保留本地 GitHub Release 方案（2.5），不要恢复服务端清单、`manifestUpdateProvider`、`deviceMid` / `resolveEndpointOrigin` 传入项                        |
| 上游改 UI 的 Logo / 侧栏布局 / 模型设置导航                                                      | 对照 2.3，按本地意图保留（只动 Windows 分支，别动 mac 分支）                                                                                           |
| 上游改内置插件相关（`glm/packages`、seed、`official-plugin-definitions.ts`）                     | 对照 2.6。定义表与入库载荷不一致时改定义表、不改载荷；**保住 zcode-guide 的 `version: "0.3.0"` 与那 6 条 `requiredSeedPaths`**，其余条目可直接采用上游 |
| 上游新增数据目录子目录（v2 下新文件等）                                                          | 路径经由枢纽函数（`getZCodeDataRootDir`/`getAppConfigDir`）时自动跟随，无需改；硬编码 `.zcode` 的才需要手动改                                          |

## 六、合并后自查命令

```bash
# ① 数据目录名一律应是 `.zcodex`：home 级拼接与项目级目录名都不应再出现 `.zcode`。
#    刻意保留、命中属正常的：`.zcodeignore` / `.zcode-plugin/` / `.zcode-beta` /
#    `.zcode-install-manifest`（隐藏文件名），以及 `window.zcode`、`meta.zcode`、`dev.zcode.*`、
#    `com.zhipu.zcode.server`、`zcode/` 等非目录标识符（本命令已排除 `com.zcode/` 一类）。
#    vendor 载荷、mock-cdn 与 bundled-agents 里的 `.zcode` 也是刻意保留的（官方的
#    restore-legacy-sessions 会扫描旧数据目录，zcode-guide 技能文档仍按官方原样写
#    `.zcode/config.json`），故一并排除——它们都是产物或第三方资产，不是本仓源码。
grep -rnE '"\.zcode"|\.zcode[\\/]|~/\.zcode([^a-zA-Z0-9_-]|$)|homedir\(\), "\.zcode"' \
  packages apps scripts config --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.md' \
  | grep -v node_modules | grep -v '/dist/' | grep -v '/out/' \
  | grep -v bundled-agents | grep -v mock-cdn \
  | grep -v 'packages/desktop/vendor/' | grep -v 'com\.zcode/'
# 期望：无输出（2026-10-08 实测改前 89 处、改后 0 处）

# ② 应用名应保持 ZCodex。下面两处命中是**有意保留**的旧标识，不要改：
#    - packages/desktop/package.json 的 "author": "ZCode"（作者字段，不是产品名）
#    - packages/desktop/src/main/mcpUserDirectory/legacy.ts 的 join(appData, "ZCode", …)
#      （从旧版 ZCode 的 appData 目录迁移数据的历史路径）
grep -rn '"ZCode"\|productName.*ZCode[^ ]' packages/desktop --include='*.json' --include='*.ts' --include='*.mjs'

# ③ fmt 失败清单 ∩ 本地改过/新增的文件，应为空。
#    上游自带失败基线：31 个（2026-10-08）。总数只增不减是正常的（上游新文件不跑 oxfmt），
#    真正要盯的是「交集」有没有多出自己改过的文件。
#    例外（上游版本本身就不干净，本 fork 只动了其中一行文案；格式化它们会在上游文件上产生
#    几十到几百行 diff，与「只格式化本地改动的文件」冲突）：README.md、
#    packages/services/src/bots/{feishuChannelRuntime,telegramChannelRuntime,weixinChannelRuntime}.ts、
#    packages/services/src/bots/providers/weixinProvider.ts
comm -12 \
  <(pnpm fmt:check 2>&1 | grep -E '\([0-9]+m?s\)$' | sed -E 's/ \([0-9]+m?s\)$//' | sed 's/^[^ ]* //' | sort) \
  <(git diff --name-only 29628c9 -- . ':(exclude)packages/desktop/vendor' | sort) \
  | grep -vE '^README\.md$|^packages/services/src/bots/(feishuChannelRuntime|telegramChannelRuntime|weixinChannelRuntime)\.ts$|^packages/services/src/bots/providers/weixinProvider\.ts$'
# 期望：无输出（2026-10-08 实测通过）

# ④ 必跑验证
pnpm typecheck && pnpm lint && pnpm architecture:check --changed
# 改动过 main / preload / renderer 时额外跑（既有缺口基线 86 个错误，别让它变多）
pnpm exec tsc -p packages/desktop/tsconfig.main.json --noEmit

# ⑤ 自有测试文件很少，用 node:test + tsx 跑。
#    **必须在包目录内跑**：ui 的测试走 `@/*` 别名，从仓库根跑时 tsx 取根 tsconfig（无该别名），
#    会以 `Cannot find package '@/lib'` 报假失败（2026-10-08 实测）。
cd packages/services && ../../node_modules/.bin/tsx --test test/*.test.ts
cd packages/ui       && ../../node_modules/.bin/tsx --test test/*.test.ts
cd packages/desktop  && ../../node_modules/.bin/tsx --test test/*.test.ts
# 基线：services 10 passed / ui 10 passed / desktop 3 passed（2026-10-08）
#    ui/test/modelTriggerDisplay.test.ts 钉的是 2.3.6「触发器不显示厂商前缀、tooltip 保留来源」
#      这条本地定制，合并上游后必须跑：改回上游实现会产出 providerPrefix，该测试会红。
#    desktop/test/rendererWindowTitle.test.ts 钉的是 2.1 里「窗口标题 ↔ 渲染进程名」的耦合：
#      它读 renderer/index.html 的 `<title>` 喂给 formatZCodeRendererProcessName，断言得到
#      `zcode-renderer-main`。只把标题单边改回 `ZCode`（或只改一处）就会红。
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

1. 本文档放在 `docs/`。2026-10-08 之前它在 `.zcodex/`，而项目级配置目录改名后也叫 `.zcodex/`，
   两者同名会造成语义混淆（那个目录现在就是产品的项目配置位置），因此移出——`docs/` 不被任何
   产品机制扫描，也不在第六节自查命令的扫描范围内，本文里的 `.zcode` 字面量不会干扰自查。
   反过来说，**不要把文档放进项目的 `.zcodex/`**：那里是产品配置目录，
   `<项目>/.zcodex/AGENTS.md` 还会被当成工作区的隐藏指令候选文件读取。
2. 打包产物（`.zcode-runtime/`、`dist/`、`packages/desktop/bundled-agents/`）为构建生成物，改名后重新构建即可，无需手改。
3. `third-party/inventory.json` 记录了文件内容 sha256，涉及第三方声明文件的合并后需重新生成声明材料（见 `third-party/README.md`）。
4. **fork 版本号与上游解耦**：根 `package.json` 的 `version` 就是应用版本（`build-metadata.mjs` 的 `appVersion` → electron-builder `extraMetadata.version`），所以每次合并上游后要按 semver 决定 fork 版本：合入上游**功能版**升 minor（如 1.0.0 → 1.1.0），只合修复升 patch，**不要**跟随上游的 `3.14.x` 数字。`publish-github-release.mjs` 按根版本号校验 Release tag。
5. 若未来要改品牌文案或内部标识符（包名、env、协议），应先更新本文档再动手。
6. 本文档自身也是本仓文件，改完要跑 `npx oxfmt docs/upstream-merge-notes.md`，否则会进 `fmt:check` 失败清单。
