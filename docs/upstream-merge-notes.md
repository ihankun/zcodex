# 本地定制变更记录（合并上游参考）

> 本文件记录本 fork（**ZCodex**）相对上游 ZCode 的**全部**本地定制，处理合并冲突时先读它。
> 上游基线：**ZCode v3.15.1 = `aac4755`**（= `origin/main`；上一基线 v3.14.3 = `29628c9`，已并入 dev）。
> fork 版本号独立演进，当前 `1.3.0`（v3.15.1 合并 + 删除插件载荷机制这一轮）。
> **判定某处是不是本地定制，不要凭记忆**：上游提交就在本地对象库里，直接
> `git diff aac4755 dev -- .` 即全部本地改动；
> 只看「是否涉及 `.zcode` 字样」就能把约 2/3 的改动（数据目录改名）与真正的行为改动分开
> （2026-09-30 实测：144 个修改文件中 99 个只改了字样）。
> 最近复核：2026-10-12（合并 v3.15.1）。

## 一、概览

| 定制                                                      | 影响面                                      | 详见 |
| --------------------------------------------------------- | ------------------------------------------- | ---- |
| 打包应用名 `ZCode` → `ZCodex`，主窗口标题同步             | 9 个文件                                    | 2.1  |
| 数据目录统一改名 `.zcode` → `.zcodex`（home 级 + 项目级） | 99 个文件（home 字样）+ 约 40 处（项目级）  | 2.2  |
| UI 定制：Logo / 布局 / 模型设置 / 供应商入口              | `packages/ui`                               | 2.3  |
| 启动与桌面行为：force-gate、Dock 图标、DMG 底图           | `packages/desktop/src/main`、`build/`       | 2.4  |
| 桌面自动更新改走 GitHub Release，未签名构建回退手动安装   | desktop + shared + client + ui + web + 构建 | 2.5  |
| 内置插件：纯源码 seed（载荷机制已删除）                   | 构建流程与产物                              | 2.6  |
| 用户可见产品名与文案统一为 `ZCodex`                       | ui i18n / web / CLI / 托盘 / 安装器文案     | 2.7  |
| Finder 右键「在ZCodex中打开」的 Services 注册             | desktop main（上游代码，仅改文案）          | 2.8  |

**改动性质**：多数是用户可见层（应用名、界面、更新流程），但下面四处**改了内部行为**，合并时最容易出事：

- 启动强制升级 gate 已禁用（2.4.1）
- 桌面自动更新不再读服务端 manifest，改读 GitHub Release（2.5）
- 数据目录改名：**home 级与项目级现已统一为 `.zcodex`**，不再区分 user/项目作用域（2.2）
- 内置插件的 seed 结果随定义表变化：`official-plugin-definitions.ts` 与插件源码必须对齐（2.6）

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

| 文件                                                                                                                                                                                                                                                                                                                            | 项目级用途                                                                                                                                                  |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/zcode-cli/packages/adapters/src/skills/roots.ts`、`commands/roots.ts`                                                                                                                                                                                                                                                     | 原 `ZCODE_DIR = ".zcode"` 与 `USER_ZCODE_DIR = ".zcodex"` **合并为一个** `".zcodex"`；`scope === "user" ? … : …` 三元分支删除                               |
| `apps/zcode-cli/packages/adapters/src/config/project-config.adapter.ts`                                                                                                                                                                                                                                                         | `basename(configDirectory) === ".zcode"` 判定                                                                                                               |
| `packages/services/src/skills/skillsService.ts`                                                                                                                                                                                                                                                                                 | workspace skills 根                                                                                                                                         |
| `packages/services/src/commands/commandsService.ts`                                                                                                                                                                                                                                                                             | `workspaceDirectorySegments`                                                                                                                                |
| `packages/services/src/subagents/subagentStorage.ts`                                                                                                                                                                                                                                                                            | workspace agents 根                                                                                                                                         |
| `packages/services/src/mcp-sync/mcpSyncService.ts`                                                                                                                                                                                                                                                                              | `workspaceConfigDirSegments`                                                                                                                                |
| `packages/services/src/settings-sync/settingsSyncService.ts`                                                                                                                                                                                                                                                                    | `workspace*Segments`（skills / commands / plugins / config.json）                                                                                           |
| `packages/services/src/hooks/hooksService.ts`                                                                                                                                                                                                                                                                                   | workspace 分支与 `editable` 判定（home 分支仍是 `.zcodex/cli`，现在两分支同字面量）                                                                         |
| `packages/desktop/src/main/mcpUserDirectory/index.ts`                                                                                                                                                                                                                                                                           | `workspaceConfigDirSegments`                                                                                                                                |
| `packages/shared/src/workspace-hook-config.ts`、`workspace-hook-mutation.ts`                                                                                                                                                                                                                                                    | 候选路径、`baseDir` 推断、`WorkspaceHookConfigFileKind` 的 `".zcode/config.json"` 字面量                                                                    |
| `apps/zcode-cli/packages/contracts/src/hooks/workspace-hook-trust.ts`                                                                                                                                                                                                                                                           | 上述 kind 的 zod 枚举（信任记录持久化该值）                                                                                                                 |
| `apps/zcode-cli/packages/contracts/src/tools/saved-workflow.ts`                                                                                                                                                                                                                                                                 | `SAVED_WORKFLOW_PROJECT_DIR`、`WORKFLOW_DRAFTS_DIR`                                                                                                         |
| `apps/zcode-cli/packages/bootstrap/src/subagents.ts`、`plugins.ts`、`app/script-workflow-*.ts`、`app/workspace-hook-review-mutation.ts`、`builtin-prompt-command.ts`                                                                                                                                                            | 项目 agents 目录、workspace plugin 配置、workflow 读写与 scope 判定、hook 评审写入路径、`/init` 提示词里的隐藏指令候选路径                                  |
| `apps/zcode-cli/packages/core/src/subagent/persistent-memory.ts`、`memory/memory-file-path.ts`、`runtime/helpers/plan-file-continuity.ts`、`tool/handlers/workflow-drafts.ts`、`tool/handlers/saved-workflows/store.ts`、`permission/workflow-draft-path.ts`                                                                    | agent-memory、memory 文件、plan 文件、workflow-drafts / workflows 落点                                                                                      |
| `apps/zcode-cli/packages/dynamic-workflow-runtime/src/child-entry-file.ts`、`harness.ts`、`child-source.ts`                                                                                                                                                                                                                     | `workflow-runs` 入口文件落点                                                                                                                                |
| `packages/ui/src/lib/skillSourceFilter.ts`                                                                                                                                                                                                                                                                                      | 路径来源检测只需匹配 `/.zcodex/`（原 `.zcode` 分支删除，**注意同名的 `.agents` 分支保留**）                                                                 |
| `packages/ui/src/settings/saved-workflows/useSavedWorkflowsDirectoryWatch.ts`                                                                                                                                                                                                                                                   | `<ws>/.zcodex/workflows` 监听                                                                                                                               |
| `apps/zcode-cli/packages/bundled-skills/skills/dynamic-workflows/SKILL.md`                                                                                                                                                                                                                                                      | 技能正文里的路径说明（`.zcodex/workflow-drafts/`、`.zcodex/workflows/`）                                                                                    |
| `apps/zcode-cli/packages/zcode-guide-plugin/skills/**/SKILL.md`（6 篇，2026-10-12 新增）                                                                                                                                                                                                                                        | 用户可见的配置路径全部改为 `.zcodex`（`~/.zcodex/cli/config.json`、`<repo>/.zcodex/...`、技能/命令发现根）；`.zcode-plugin/`、`.agents/`、`zcode.json` 不动 |
| `apps/zcode-cli/packages/skill-creator-plugin/skills/skill-creator/SKILL.md`、`zcode-cua-plugin/scripts/sync-cache.mjs`、`{ios-simulator,android-emulator}-plugin/README.md`、`bundled-skills/README.md`、`bundled-skills/skills/dynamic-workflows/examples.md`、`dynamic-workflow/docs/execution-engine.md`（2026-10-12 新增） | 同类用户可见路径（技能创建位置、插件缓存目录、模拟器插件文档、`workflow-runs` 落点、示例文案）                                                              |
| `apps/zcode-cli/packages/restore-legacy-sessions-plugin/**`（2026-10-12 新增）                                                                                                                                                                                                                                                  | **只改目的地**：`--task-index` / `--cli-db` 默认值与 SKILL/README 里的「新存储」路径 → `.zcodex`；来源 `~/.zcode/v2/sessions` 保持 `.zcode`（历史遗留数据） |
| `packages/desktop/build/installer.nsh`                                                                                                                                                                                                                                                                                          | Windows 安装器「安装目录内含数据目录」阻断扫描                                                                                                              |
| `apps/zcode-cli/packages/core/src/memory/memory-file-path.ts`                                                                                                                                                                                                                                                                   | 记忆文件的敏感路径拒绝段 `.zcode` → `.zcodex`（配置目录不该被当作记忆落点）                                                                                 |
| `apps/zcode-cli/packages/contracts/src/tools/workflow.ts`                                                                                                                                                                                                                                                                       | `Workflow` 工具 `name` 描述里的 `.zcodex/workflows/`                                                                                                        |
| `apps/zcode-cli/packages/cli/src/dwf-child-command.ts`、`bootstrap/src/zcode-protocol/mcp.ts`、`packages/ui/src/lib/windowsFileLinkEscapeRemarkPlugin.ts` 等                                                                                                                                                                    | 仅注释/示例里的路径说明                                                                                                                                     |
| `README.md`、`README.en.md`、`NOTICE.md`、`apps/zcode-cli/README.md`、`apps/zcode-cli/packages/debug/README.md`、`apps/zcode-cli/tools/prompt-trajectory/README.md`                                                                                                                                                             | 文档路径：含顺带修正的旧残留（见 2.2.1）                                                                                                                    |

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

- **`restore-legacy-sessions` 插件的「来源」路径**：`~/.zcode/v2/sessions`、`~/.zcode/v2/tasks-index.sqlite`
  等只作为**历史遗留数据的来源**出现，保持 `.zcode` 才正确（官方 ZCode 与改名前的老 fork 都写在那里）。
  但同一插件里指向**新存储**的路径（`--task-index` / `--cli-db` 的默认值、"New ZCode session DB"）
  在 2026-10-12 已改为 `.zcodex`——它们是当前 fork 的真实写入目标，不改就等于把会话恢复到不存在的目录。
- **`window.zcode.*` / `globalThis.zcode` / `com.zcode/` 等 JS 与协议命名空间**：见第四节，一律不动。
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
五项：**产品文档 / 用户社群 / 问题上报 / 给产品提需求**（本地定制），以及上游 v3.15.1 新增的
**报告安全问题**（`vulnerabilityReport*`，同样是上游产品服务入口，一并不显示）。
保留「导出日志 / 资源管理器 / 检查更新 / 关于 ZCodex」，其中导出日志是上游 v3.15.1 新增项，本地采纳。
顺带删掉了现在会打头的分隔线，并加了「非桌面端不渲染该按钮」的门（剩下几项全是桌面专属，
Web 上否则会剩一个点开是空的菜单）。

**② macOS 原生菜单栏的「帮助」菜单**（`packages/desktop/src/main/desktopApplicationMenu.ts`）——
移除 **更新日志**（`helpWhatsNew` → `OpenChangelog`）与 **问题上报**（`helpFeedback` → `OpenFeedback`）。
更新日志那项连同它后面的分隔线一起删（在 macOS 上它原本是菜单第一项，留着会让菜单以分隔线开头）；
非 macOS 分支（关于 / 检查更新）自带的分隔线保留。菜单剩下：切换开发者工具 / 资源管理器 /
导出日志 / 清除所有数据（后两者之间、以及资源管理器之前的分隔线仍在）。

- `packages/ui/src/lib/helpMenuActions.ts` **不是死代码，别删**（2026-10-12 更正）：
  上游 v3.15.1 起「导出日志」走 `helpMenuActions.exportLogs`（①里保留的那项），
  Windows 自绘标题栏菜单 `WindowsCaptionMenuButton.tsx` 还用它做 `openIssueReport` /
  `openProductDocs` / `exportLogs`（上游文件，本地未动）。该文件与上游逐字节一致。
- `DesktopCommandIds.OpenChangelog` 的 handler（`desktopCommandHandlers.ts`）与
  `desktopMenu.ts` 的 `helpWhatsNew` / `helpFeedback` 文案**保留**：前者与上游逐字节一致、
  后者仍是命令面板等处的文案来源（同下条）。
- **仍未动**：命令面板（`quickpick/quickPickCommands.ts`）里仍有这四个命令；
  i18n 的 `workspaceHeader.help.{docs,community,issueReport,productRequest,reportVulnerability}` 与
  `desktopMenu.ts` 的 `titleBar.menu.help.{whatsNew,feedback}` 文案都保留（它们仍是别处的文案来源）。

#### 2.3.8 左下角账号菜单移除「升级」入口（2026-10-09）

`packages/ui/src/WorkspaceSidebarFooterUsageSummary.tsx` 的菜单内容里，GLM 套餐的
**「升级 / 续费」项**（`TID_SIDEBAR_CODING_PLAN_UPGRADE_BUTTON`）已移除；同一组的
「使用统计」保留。它原本「始终显示」，并带 Coding Plan entry gate 与 funnel 埋点。

**连带清理**（做法同 2.3.3「删 UI 元素 + 清理传递链」）：

- `WorkspaceSidebarFooterUsageSummary.tsx`：删掉该菜单项，以及只为它服务的导入
  （`useCodingPlanEntryGate`、`isMaxCodingPlanSnapshot`、`createCodingPlanFunnelContext`、
  `resolveCodingPlanEntryPlanState`）与局部量（`upgradeActionLabelId`、`upgradeProviderSnapshot`）。
- `WorkspaceSidebarFooter.tsx`、`WorkspaceSidebar.tsx`、`SettingsPage.tsx`：`onUpgradeClick`
  这条 prop 链、两侧的 `handleOpenCodingPlanUpgrade*` 与 `useCodingPlanUpgradeDialog()` 解构都已删除。
- **`upgradeTargetProviderId` / `selectedUpgradeProviderId` 必须保留**（2026-10-12 更正）：
  上游 v3.15.1 新增的营销触达 `components/marketing-touch/MarketingTouchProvider.tsx` 会调用
  `useWorkspaceSidebarFooterUsageSummaryState()` 并消费 `upgradeTargetProviderId`（用于定位升级目标
  弹窗）。连带 `resolveSidebarCodingPlanUpgradeFallbackProviderId` 的导入与
  `SidebarUsageCodingPlanProviderId` 类型导入也要留着。合并时若按旧笔记把这两个量删掉，
  上游新代码会因取不到字段而报类型错误——这是本次合并踩到的坑之一（第三节）。
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

### 2.6 内置插件：纯源码 seed（2026-10-12 删除载荷机制）

**当前状态：本 fork 不再携带任何预编译插件载荷，内置插件一律从仓库源码 seed。**
2026-10-12 之前这里记的是「12 个官方预编译载荷入库 + `stageVendoredOfficialPlugins` 暂存」，
上游 v3.15.1 把全部插件源码开源后那套机制整体失效（详见第七节本次合并记录），已按用户决定删除。
**这是本 fork 少有的「净减少」定制：相关文件现在与上游逐字节一致，不必再保护。**

#### 删除清单（再看到这些字样即为残留）

| 已删除 / 已还原                                                            | 说明                                                                          |
| -------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `packages/desktop/vendor/**`（61MB、240 个文件）                           | 12 个官方预编译载荷，整目录 `git rm`                                          |
| `packages/desktop/scripts/stage-agent-bundle.mjs`                          | 还原为上游版本（删掉 `stageVendoredOfficialPlugins`、两个导出常量与过滤函数） |
| `.gitignore`                                                               | 删掉四条载荷排除与两条 `dist/` re-include（那段注释也一并删）                 |
| `.oxlintrc.json`、`.prettierignore`、`knip.json`                           | 删掉 `packages/desktop/vendor/official-plugins` 的排除项                      |
| `README.md` 打包章节「内置插件载荷」                                       | 改写为「源码随仓库发布、由 `prepare-agent-node-bundle.mjs` 按源码 stage」     |
| `apps/zcode-cli/packages/bootstrap/src/app/official-plugin-definitions.ts` | **保留**本地版本（见下条），它不属于载荷机制                                  |

#### 现在插件从哪来（改 seed/插件问题时先看这条）

两条链各自解析，互不依赖 vendor：

- **dev（monorepo）**：agent 入口是 `apps/zcode-cli/packages/cli/dist/zcode.cjs`
  （`packages/services/src/zcode-agent/zcodeAgentProcessManager.ts` 的
  `resolveBundledWorkspaceZCodeAgentCommand`，优先于打包态 Electron Node 分支）。
  `bundled-plugins.ts` 的 `candidateBaseDirs()` 取 `entrypointDir()` = `apps/zcode-cli/packages/cli/dist`，
  命中定义表的 `../../<name>-plugin` 候选 → 直接从 `apps/zcode-cli/packages/<name>-plugin` seed。
  **注意 dev 不看 `bundled-agents/<平台>/glm/packages/`**（那里只有 `zcode.cjs`）。
- **打包**：`prepare-agent-node-bundle.mjs` 的 `stageOfficialPlugins()` 按源码 stage 到
  `bundled-agents/<平台>/glm/packages/*-plugin`（另有 `bundled-skills`、sharp/koffi 闭包），
  打包后 seed 走 `entrypointDir()` = `resources/glm` 的 `packages/<name>-plugin` 候选。
  `officialPluginPackages`（15 条）与定义表 15 条一一对应，含 `visualize`。

#### 仍然必须遵守的约束

- **定义表与插件源码必须对齐**，两个独立的门都在
  `apps/zcode-cli/packages/bootstrap/src/app/official-plugin-definitions.ts`：
  - `requiredSeedPaths`：seed 前逐项检查（`findMissingOfficialPluginSeedPaths`），缺任一项就以
    `ZCODE_PLUGIN_SEED_INCOMPLETE` **跳过整个插件**并回退旧缓存——最容易踩，写错路径插件就静默装不上。
  - `version`：决定缓存目录名 `cache/<marketplace>/<name>/<version>`，也被 SEA 清单按名精确匹配
    （`item.version === definition.version`）。改了插件内容要同步 manifest / 定义表的 version 语义。
  - **本地定制**：zcode-guide 的 `requiredSeedPaths` 是本 fork 的加固版（6 篇技能正文都钉住，
    上游只钉 1 篇），`version` 与上游一致为 `0.3.0`。合并时保住这 6 条，别退回上游的单条。
- **只认带 `.zcode-plugin/plugin.json` 的目录**，与 `resolveFilesystemPluginRoot` 的候选根判定一致；
  `bundled-skills` 因此不参与插件 seed（由 `prepare-agent-node-bundle.mjs` 的 `bundledSkillPack` 单独 stage）。
- **`node_modules` 不进 bundle**：打包 stage 的顶层白名单（`includedOfficialPluginTopLevelPaths`）
  与 `excludedOfficialPluginAssetNames` 已排除它；平台专有原生二进制（sharp/koffi）由
  `stageSharpForNodeReplPlugin` / `stageKoffiForCuaPlugin` 单独补。
- **插件自带的 `dist/` 必须被 stage**：android-emulator / ios-simulator 的 MCP 服务就是
  `dist/mcp/server.js`（`.mcp.json` 与 `plugin.json` 都指向它）。白名单里有 `dist`，别删。
- **`restore-legacy-sessions` 的路径要区分来源与目的地**：来源 `~/.zcode/v2/sessions` 保持 `.zcode`
  （历史遗留数据），目的地（`--task-index` / `--cli-db` 默认值）必须是 `.zcodex`，见 2.2.2。

> 历史（2026-09-28 ~ 2026-10-12）：官方安装包的 `Contents/Resources/glm/packages/` 里有 12 个
> 开源仓库没有源码的插件，缺了它们源码构建的产物既不会 seed、内置市场分片也是空的
> （合并目录 40 → 28 条）。当时的做法是把载荷入库并写一套 vendor 暂存逻辑，细节与两次实测
> 记录见第七节对应条目与 git 历史。

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
- **上游 v3.15.1 起 `pnpm fmt:check` 不再是「只检查」：脚本是 `oxfmt --check || oxfmt`。**
  检查失败时它会**直接格式化整个仓库**并返回成功——既会污染工作区（合并中途尤其危险），
  又永远拿不到失败信号。要判断格式就用 `node_modules/.bin/oxfmt --check`（仓库级）或
  `oxfmt --check <file>`，**不要**再把 `pnpm fmt:check` 当检查门。
  另：上游同时升级了 `oxfmt`，本机旧二进制对上游文件的口径不同，实测 **2463 个文件**被判「不干净」
  （合并前基线是 31）。判断本地改动是否引入格式问题，必须 `pnpm install` 装上新版后再重算基线。
- **`oxfmt` 的「复制到 /tmp 再检查」是无效测法。** oxfmt 按**文件路径**解析配置与 ignorePatterns，
  项目外的副本会被跳过（既可能报通过、也可能什么都不做）。要对比「上游版本是否也不干净」，
  用 `git show <ref>:<path> > <项目内临时路径>`（同扩展名、在仓库内）再 `oxfmt --check`。
- **上游 v3.15.1 带来完整 vitest 测试套件（6236 个测试文件），我们的测试口径必须跟着变。**
  - `pnpm test:unit` = `vitest run`；`pnpm verify:pre-push` 现在是
    `lint && architecture:check --changed && test:unit:affected`。
  - **我们自己的 4 个 `node:test` 文件会落进 vitest 的 include（`packages/\*/test/**/\*.test.ts`）并被收集，
在 vitest 下必然失败**（它们用的是 `node:test`）：`packages/services/test/providerBalanceNormalize.test.ts`、
`packages/ui/test/providerBalancePresentation.test.ts`、`packages/ui/test/modelTriggerDisplay.test.ts`、
`packages/desktop/test/rendererWindowTitle.test.ts`。**待办：转成 vitest 写法**
（`import { test, expect } from "vitest"`；注意 `expect(x).toEqual(y)`会忽略`undefined`属性，
像「不该有 providerPrefix 键」这类回归断言要用`toStrictEqual`）。
  - 上游新测试里**大量断言上游字面量**（`.zcode` 路径、`ZCode` 应用名/进程名），在本 fork 会失败；
    `packages/desktop/test/manifestUpdateProvider.test.ts` 更是直接测我们已删除的文件。
    这批失败属于「上游 spec 与 fork 行为不同」，不要靠改产品代码去迁就。
  - 上游删掉了原来的 4 个 `node:test` 文件（`providerConfigMigration`、`importedClaudeRecovery`、
    两个 `nonCliAcpRetirement`）——第六节 ⑤ 的清单已更新。
- **`pnpm typecheck` 的项目清单变长了**：现在含 `apps/dev-docs`、`packages/e2e-report`、
  `packages/desktop/tsconfig.e2e.json`，需要新依赖（`vitest`、`@modelcontextprotocol/ext-apps`、
  `lottie-web`、`elkjs`、`@wdio/electron-types`、`@wdio/globals/types`、`mocha`）。
  没装依赖时它报的是 39 处 `TS2307` + 级联的隐式 any，**全是环境噪音**；
  要验证本地改动，用合并前那份项目清单做范围化检查：
  `pnpm exec tsc -b packages/rpc packages/provider packages/provider-node packages/shared packages/services packages/client packages/server packages/zcode-server-cli packages/ui packages/web packages/desktop/tsconfig.host.json`。
- **解冲突时最容易犯的三种错（2026-10-12 实测踩全了，务必用 typecheck + lint 兜住）：**
  1. **hunk 拼接出重复声明**：把「我们的一整段」和「上游的一整段」直接相加，而两段都含同一行
     （`function downloadAvailableUpdate(...)`、`const pendingChannel = ...`、整块 import）。
     合并后 `oxlint` 会报 `Identifier 'x' has already been declared`，主进程 tsc 更会因语法错误**提前中止**
     （错误数从 92 掉到 1，看着像变好了，其实根本没检查完）。
  2. **上游新增代码消费了我们删掉的东西**：本轮 `MarketingTouchProvider` 用了
     `upgradeTargetProviderId`（我们在 2.3.8 删了），`helpMenuActions`（我们标记为不可达）
     又被上游新增的「导出日志」项用上。**结论：删 UI 元素时只删「渲染 + 该元素独有的数据流」，
     共享的 state 字段/工具函数要先确认上游有没有新消费者**；解完冲突立刻跑范围化 typecheck。
  3. **「取上游 + 重新施加改名」时忘了上游也改了导入/导出**：本轮上游把 `downloadAvailableUpdate`
     导出（供其单测）、把 `createWindowsDesktopTray` 改名 `createDesktopTray`、
     给 `OFFICIAL_ZCODE_GUIDE_REQUIRED_SEED_PATHS` 加 `export` —— 重新施加本地改名时要把这些一起带上。
- **判断「插件少没少」要看 seed 的两条链，别只看 `glm/packages`。** dev 的 agent 入口是
  `apps/zcode-cli/packages/cli/dist/zcode.cjs`（`zcodeAgentProcessManager.ts` 的
  `resolveBundledWorkspaceZCodeAgentCommand`，优先于打包态分支），插件由定义表的
  `../../<name>-plugin` 候选从**源码树**解析，**dev 根本不看 `bundled-agents/<平台>/glm/packages/`**；
  打包链才由 `prepare-agent-node-bundle.mjs` 的 `stageOfficialPlugins()` 按源码 stage 到 `glm/packages`。
  2026-10-12 曾因「vendor 载荷全被跳过」误判成 dev 要丢插件，白查一轮——详见 2.6。

## 四、明确未改动（合并冲突时可直接采用上游）

| 类别                  | 说明                                                                                                                                                |
| --------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| npm 包名 `@zcode/*`   | 全部 29 个包的 name、dependencies、import 均未动                                                                                                    |
| 环境变量 `ZCODE_*`    | 约 300 个 env 名未动（含 `ZCODE_DATA_BASE_DIR`、`ZCODE_HOME`）                                                                                      |
| CLI 命令名            | `bin: { zcode }`、`zcode.cjs`、`bin/zcode.mjs` 未动                                                                                                 |
| IPC 通道名            | `zcode-task`、`zcode:select-file` 等 channels.ts 通道字符串未动（2.5 新增的两个通道除外）                                                           |
| 协议常量              | `ZCODE_PROTOCOL_NAME = "ZCode Protocol"`、`com.zcode/` MCP 命名空间、`Symbol.for("zcode.*")` 未动                                                   |
| 深链 scheme           | `zcode://`（OAuth 回调、share/import、workspace/open）未动                                                                                          |
| 品牌文案              | 用户可见文案**已**统一为 `ZCodex`（见 2.7）；仍未动的只有 Agent 系统提示词（"You are ZCode, ..."）、协议名 `ZCode Protocol` 与第三方归属标识        |
| 隐藏文件              | `.zcodeignore`、`.zcode-plugin/`、`.zcode-beta`、`.zcode-install-manifest` 等未动                                                                   |
| 其他非目录标识符      | `window.zcode`、`meta.zcode` / `provider.zcode` / `model.zcode` 数据字段、`dev.zcode.*` bundle id、`com.zhipu.zcode.server`、`zcode/` MCP meta 前缀 |
| `window.zcode` 等 API | 插件源码里的 `window.zcode.*` / `globalThis.zcode` / `com.zcode/` 命名空间未动（visualize 的 Gen UI 契约、MCP meta 前缀）；理由见 2.2.2             |

> `README.md`、`NOTICE.md` **已**被本地改写（打包流程、内置插件载荷、自动更新源三节），
> 不再属于「未改动」，冲突时按本文件对应小节处理。

## 五、合并冲突决策表

| 冲突场景                                                                                         | 处理方式                                                                                                                                                                    |
| ------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 上游改动第二节所列文件的**非路径行**                                                             | 手工合并，保留本地 `.zcodex` / `ZCodex` 字面量                                                                                                                              |
| 上游**新增**数据目录路径拼接（home 级或项目级：`homedir(), ".zcode"`、`~/.zcode`、`.zcode/xxx`） | 采用上游后手动改为 `.zcodex`                                                                                                                                                |
| 上游新增/修改 **user vs workspace** 目录 segments                                                | 两级都取 `.zcodex`；作用域已统一（2.2），不要恢复 `.zcode`                                                                                                                  |
| 上游改 productName / 应用名相关                                                                  | 保留本地 `ZCodex` 命名                                                                                                                                                      |
| 上游改 `.zcode-plugin/`、`.zcodeignore` 逻辑                                                     | 直接采用上游（这两类是未改动的标识符）；项目内 `.zcodex/` 目录逻辑按 2.2 处理                                                                                               |
| 上游改品牌文案（i18n、提示词、菜单）                                                             | 直接采用上游                                                                                                                                                                |
| 上游改 `ZCODE_*` env、包名、IPC 通道、协议常量                                                   | 直接采用上游（本地未定制，无冲突基础）                                                                                                                                      |
| 上游改桌面自动更新（`autoUpdater.ts`、服务端 manifest provider、`initAutoUpdater` 传入项）       | 保留本地 GitHub Release 方案（2.5），不要恢复服务端清单、`manifestUpdateProvider`、`deviceMid` / `resolveEndpointOrigin` 传入项                                             |
| 上游改 UI 的 Logo / 侧栏布局 / 模型设置导航                                                      | 对照 2.3，按本地意图保留（只动 Windows 分支，别动 mac 分支）                                                                                                                |
| 上游改内置插件相关（`glm/packages`、seed、`official-plugin-definitions.ts`）                     | 对照 2.6。**保住 zcode-guide 的 `version: "0.3.0"` 与那 6 条 `requiredSeedPaths`**（本 fork 加固版），其余条目可直接采用上游；`stage-agent-bundle.mjs` 现已与上游逐字节一致 |
| 上游新增数据目录子目录（v2 下新文件等）                                                          | 路径经由枢纽函数（`getZCodeDataRootDir`/`getAppConfigDir`）时自动跟随，无需改；硬编码 `.zcode` 的才需要手动改                                                               |

## 六、合并后自查命令

```bash
# ① 数据目录名一律应是 `.zcodex`：home 级拼接与项目级目录名都不应再出现 `.zcode`。
#    刻意保留、命中属正常的：`.zcodeignore` / `.zcode-plugin/` / `.zcode-beta` /
#    `.zcode-install-manifest`（隐藏文件名），以及 `window.zcode`、`meta.zcode`、`dev.zcode.*`、
#    `com.zhipu.zcode.server`、`zcode/` 等非目录标识符（本命令已排除 `com.zcode/` 一类）。
#    mock-cdn 与 bundled-agents 里的 `.zcode` 是产物，故一并排除。
#
#    **2026-10-12（v3.15.1）起必须再排除四类上游资产，否则输出 1720 行噪音**：
#      · 上游 vitest / E2E 测试与夹具（`**/test/**`、`**/e2e/**`、`*.test.ts(x)`）——1556+ 行，全是上游字面量；
#      · `apps/zcode-cli/docs/**` 上游设计文档——88 行（2.2.2 刻意不改）；
#      · `apps/zcode-cli/packages/*-plugin/**` 官方插件源码——用户可见的配置路径已在
#        2026-10-12 改为 `.zcodex`，剩下的是刻意保留项（restore-legacy-sessions 的历史来源路径、
#        `window.zcode` API、`.zcode-plugin/` manifest 目录，见 2.2.2）；
#      · `bundled-skills` 与 `dynamic-workflow/docs` 等其余随源码发布的官方内容。
#    排除后应无输出。
grep -rnE '"\.zcode"|\.zcode[\\/]|~/\.zcode([^a-zA-Z0-9_-]|$)|homedir\(\), "\.zcode"' \
  packages apps scripts config --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.md' \
  | grep -v node_modules | grep -v '/dist/' | grep -v '/out/' \
  | grep -v bundled-agents | grep -v mock-cdn | grep -v bundled-skills \
  | grep -v 'com\.zcode/' \
  | grep -vE '/(test|tests|e2e|__tests__|docs)/|\.test\.ts' \
  | grep -v '^apps/zcode-cli/packages/[^/]*-plugin/'
# 期望：无输出（2026-10-12 实测排除后 0 行）

# ② 应用名应保持 ZCodex。下面两处命中是**有意保留**的旧标识，不要改：
#    - packages/desktop/package.json 的 "author": "ZCode"（作者字段，不是产品名）
#    - packages/desktop/src/main/mcpUserDirectory/legacy.ts 的 join(appData, "ZCode", …)
#      （从旧版 ZCode 的 appData 目录迁移数据的历史路径）
#    2026-10-12 起 `packages/desktop/test/**`（含 E2E）会给出几十条 `"ZCode"`，全是上游测试
#    的期望字面量（上游应用名仍是 ZCode），**不是本地回归**，排除即可。
grep -rn '"ZCode"\|productName.*ZCode[^ ]' packages/desktop --include='*.json' --include='*.ts' --include='*.mjs' \
  | grep -v node_modules | grep -v '/test/'
# 期望：只剩上面两处有意保留的命中 + productName/identity 脚本里的 ZCodex

# ③ fmt 失败清单 ∩ 本地改过/新增的文件，应为空。
#    **用 `oxfmt --check` 而不是 `pnpm fmt:check`**：后者自 v3.15.1 起是 `oxfmt --check || oxfmt`，
#    检查失败会直接格式化全仓并返回成功（见第三节）。且上游升级过 oxfmt，本机旧二进制口径下
#    上游文件大面积「不干净」（2026-10-12 实测 2463 个），**装好新依赖后要重算这个基线**。
#    真正要盯的是「交集」有没有多出自己改过的文件。
#    已知例外（上游版本本身就不干净、本 fork 只动了其中一行；格式化它们会在上游文件上产生
#    几十到几百行 diff）：2026-10-12 合并后交集 30 个文件里 28 个属此类（逐文件与上游版本比对确认），
#    含 README.md、NOTICE.md、knip.json、electron-builder.config.js、bots/**、
#    mcpSyncService / settingsSyncService / skillsService / usageStatsService、
#    ui 的 i18n locales / builtinSkillI18n / mcpStore / TaskActionMenuContent / WorkspaceShellLayout 等。
comm -12 \
  <(node_modules/.bin/oxfmt --check 2>&1 | rg -o '^\S+\.(ts|tsx|md|json|html|mjs|cjs|js) ' | sed 's/ $//' | sort -u) \
  <(git diff --name-only aac4755 -- . | sort)
# 期望：无输出（例外文件按上一条逐个人工确认）

# ④ 必跑验证
pnpm lint && pnpm architecture:check --changed
# typecheck：上游 v3.15.1 起项目清单含 apps/dev-docs / packages/e2e-report / tsconfig.e2e.json，
# 需要新依赖；没装依赖时 `pnpm typecheck` 报的全是环境噪音。范围化验证用合并前那份清单：
pnpm exec tsc -b packages/rpc packages/provider packages/provider-node packages/shared packages/services \
  packages/client packages/server packages/zcode-server-cli packages/ui packages/web packages/desktop/tsconfig.host.json
# 改动过 main / preload / renderer 时额外跑（既有缺口基线：main 92、renderer 161，别让它变多）
pnpm exec tsc -p packages/desktop/tsconfig.main.json --noEmit
pnpm exec tsc -p packages/desktop/tsconfig.renderer.json --noEmit

# ⑤ 自有测试（2026-10-12 现状：**我们自己的 node:test 文件与上游 vitest 套件并存**）
#    上游 v3.15.1 的 vitest include 是 `packages/*/test/**/*.test.ts`，会把这 4 个文件一并收集，
#    因此 `pnpm test:unit` 目前对它们必然失败——**待办：转成 vitest 写法**（见第三节）。
#    转换完成前用 tsx 单独跑（**必须在包目录内跑**：ui 的测试走 `@/*` 别名，
#    从仓库根跑会以 `Cannot find package '@/lib'` 报假失败）。
cd packages/services && ../../node_modules/.bin/tsx --test test/providerBalanceNormalize.test.ts
cd packages/ui       && ../../node_modules/.bin/tsx --test test/modelTriggerDisplay.test.ts test/providerBalancePresentation.test.ts
cd packages/desktop  && ../../node_modules/.bin/tsx --test test/rendererWindowTitle.test.ts
# 基线：services 6 / ui 12 / desktop 3，共 21 passed（2026-10-12）
#    ui/test/modelTriggerDisplay.test.ts 钉的是 2.3.6「触发器不显示厂商前缀、tooltip 保留来源」
#      这条本地定制，合并上游后必须跑：改回上游实现会产出 providerPrefix，该测试会红。
#    desktop/test/rendererWindowTitle.test.ts 钉的是 2.1 里「窗口标题 ↔ 渲染进程名」的耦合：
#      它读 renderer/index.html 的 `<title>` 喂给 formatZCodeRendererProcessName，断言得到
#      `zcode-renderer-main`。只把标题单边改回 `ZCode`（或只改一处）就会红。
#    services/test/providerBalanceNormalize.test.ts、ui/test/providerBalancePresentation.test.ts
#      钉的是 2.9 余量查询的归一化与展示规则。
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

### 2026-10-12 上游 v3.14.3 → v3.15.1

上游提交：`aac4755 feat: update to v3.15.1`（11736 文件，+1942918/−25090；含上游首次开放的
内置插件源码、vitest 测试套件与 dev-docs / e2e-report 等新工作区）。

**冲突 36 处，全部落在本文档预测范围内**（这是对文档健壮性的一次实测：没有一处是文档没提到的）。
处理方式与逐条裁决见合并提交 `147ce14b` 的说明；要点：

| 类别                 | 文件                                                                                                                                                     | 处理                                                                                                                              |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| 纯字面量改名         | 17 个（`paths.ts`、`rootsResolver.ts`、`mcpUserDirectory`、`zcodeAgent`、`subagents`、`installer.nsh`、i18n locales、`builtinSkillI18n`、`SKILL.md` 等） | 取上游版本后重新施加 `.zcode`→`.zcodex` / `ZCode`→`ZCodex`                                                                        |
| 结构性               | `autoUpdater.ts`                                                                                                                                         | 保留 GitHub Release 与手动安装；采纳上游 stale-ready 守卫、下载失败复查、`downloadAvailableUpdate` 导出                           |
| 结构性               | `main/index.ts`                                                                                                                                          | 保留 `applyAppIcon` 条件与 force-gate 移除；采纳上游 tray 改名与能力探测                                                          |
| 结构性               | `manifestUpdateProvider.ts`（上游改 / 本地删）、`services/device/deviceMid.ts`（上游删 / 本地改）                                                        | 前者保留删除，后者接受删除（逻辑重构进 CLI adapters）                                                                             |
| 结构性               | `services/node.ts`                                                                                                                                       | CUA helper 候选路径改由上游 `resolveStandaloneStatusLaunchCandidates` 提供（开源构建占位返回空），本地在该处的 `.zcodex` 随之消失 |
| 结构性               | `official-plugin-definitions.ts`                                                                                                                         | 保住 zcode-guide 的 `version: 0.3.0` 与 6 条 `requiredSeedPaths`，采纳上游 `export`                                               |
| 结构性               | `WorkspaceHelpMenuButton.tsx`                                                                                                                            | 保留本地精简；采纳上游新增的「导出日志」，不显示上游新增的「报告安全问题」                                                        |
| 结构性               | `WorkspaceShellLayout` / `App.tsx` / `ModelProviderSection` / `WorkspaceSidebar*`                                                                        | 保留本地改动，采纳上游新增（手机远控壳、营销导航、`webRemoteControlFeatureEnabled` 等）                                           |
| 结构性               | `package.json` / `knip.json` / `.gitignore` / `NOTICE.md`                                                                                                | 保留本地（fork 版本号、机器产物忽略、更新流程描述），采纳上游新增条目（vendor 排除项已于 2026-10-12 随载荷机制删除）              |
| 上游新增源码里的路径 | 22 个文件、205 处 `.zcode`                                                                                                                               | 按 2.2 规则改名（含上游新增的 `wdio.conf.ts` E2E 配置）；`*-plugin/` 官方载荷文档与 `docs/` 设计文档按 2.2.2 保持原样             |

**上游带来的新依赖（必须 `pnpm install`，本次因断网未装）**：`vitest`（含
`@vitest/coverage-v8` 等）、`@modelcontextprotocol/ext-apps`、`lottie-web`、`elkjs`、
`@wdio/electron-types`、`@wdio/globals`、`mocha`、以及上游升级的 `oxfmt`。装好后要重算：
`pnpm typecheck` 基线、fmt 基线（旧二进制口径下 2463 个「不干净」，不可信）、
`pnpm test:unit` 的失败集。

**本次复核出的异常（已写入第三节）**：`pnpm fmt:check` 变成会格式化全仓的脚本；上游 vitest 会
收集我们的 `node:test` 文件（待转 vitest）；上游新测试大量断言上游字面量，在本 fork 必然失败；
`pnpm typecheck` 清单变长需要新依赖；解冲突时踩到「hunk 拼接出重复声明」「上游新代码消费了我们
删掉的 state 字段」「忘了带上游新增的 export / 改名」三类错。

**上游开源内置插件源码，2.6 的入库载荷整体失效（当天已按用户决定删除）**：v3.15.1 把 12 个插件的
源码全部随仓库发布，`stageVendoredOfficialPlugins` 对每个 vendor 目录都走「源码优先」分支，
实测 `staged: []` / `skipped: 14`。dev 与打包链各自都不依赖它（dev 走
`apps/zcode-cli/packages/cli/dist/zcode.cjs` 入口 + 定义表 `../../<name>-plugin` 候选从源码 seed；
打包链由 `prepare-agent-node-bundle.mjs` 的 `stageOfficialPlugins()` 按源码 stage）。
即：**本地定制没有丢功能，但 61MB 载荷与相关排除配置已成为死重量**，按 2.6 的删除清单
已整体删除（2026-10-12，用户决定；连带消除官方预编译资产的对外分发许可风险）。

**同批的用户可见路径修正**：插件源码开源后顺手把**用户可见的配置路径**改成本 fork 的 `.zcodex`
（zcode-guide 6 篇技能共 70 处、skill-creator、`zcode-cua-plugin/scripts/sync-cache.mjs`、
ios/android 模拟器 README、`bundled-skills` README 与 dynamic-workflows 示例、
`dynamic-workflow/docs/execution-engine.md`），并把 `restore-legacy-sessions` 的**目的地**默认值
（`--task-index` / `--cli-db`）改为 `.zcodex`（来源仍保持 `~/.zcode`，那是历史遗留数据）。
上游测试与 `apps/zcode-cli/docs/**` 一律不动——它们断言/描述的是上游行为。

**合并后自查结果：** 第六节两条 grep 干净；`pnpm lint` 62 警告 0 错误；
`pnpm architecture:check --changed` 0 违规；范围化 typecheck 仅剩环境类缺模块错误；
主进程 `tsconfig.main.json` 86 → **92**、渲染进程 125/126 → **161**，新增部分逐行比对确认全部落在
**上游逐字代码**里（本地定制文件未新增）；自有单测 21 个全过。

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
