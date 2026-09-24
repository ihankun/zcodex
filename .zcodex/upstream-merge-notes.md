# 本地定制变更记录（合并上游参考）

> 本目录用于记录本项目相对上游 ZCode 主版本的本地定制，处理合并冲突时先读本文档。
> 记录时间：2026-09-24。上游基线：ZCode 3.14.0（`feat: open source`）。

## 一、本次变更概述

两类最小改动，**均为用户可见层，未改内部标识符**：

| 变更 | 原值 | 现值 |
| --- | --- | --- |
| 打包应用名 | `ZCode` / `ZCode Dev` / `ZCode Preview` | `ZCodex` / `ZCodex Dev` / `ZCodex Preview` |
| home 数据目录 | `~/.zcode/` | `~/.zcodex/` |

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

## 三、明确未改动（合并冲突时可直接采用上游）

| 类别 | 说明 |
| --- | --- |
| npm 包名 `@zcode/*` | 全部 29 个包的 name、dependencies、import 均未动 |
| 环境变量 `ZCODE_*` | 约 300 个 env 名未动（含 `ZCODE_DATA_BASE_DIR`、`ZCODE_HOME`） |
| CLI 命令名 | `bin: { zcode }`、`zcode.cjs`、`bin/zcode.mjs` 未动 |
| IPC 通道名 | `zcode-task`、`zcode:select-file` 等 channels.ts 通道字符串未动 |
| 协议常量 | `ZCODE_PROTOCOL_NAME = "ZCode Protocol"`、`com.zcode/` MCP 命名空间、`Symbol.for("zcode.*")` 未动 |
| 深链 scheme | `zcode://`（OAuth 回调、share/import、workspace/open）未动 |
| 项目内目录 | `<项目>/.zcode/`（config.json、skills、agents、commands、workflows）、`.zcodeignore` 未动 |
| 品牌文案 | i18n（en-US/zh-CN）、菜单项、Agent 系统提示词（"You are ZCode, ..."）、TUI 文案、README 未动 |
| 隐藏文件 | `.zcode-plugin/`、`.zcode-beta`、`.zcode-install-manifest` 等未动 |

## 四、合并冲突决策表

| 冲突场景 | 处理方式 |
| --- | --- |
| 上游改动第二节所列文件的**非路径行** | 手工合并，保留本地 `.zcodex` / `ZCodex` 字面量 |
| 上游**新增** home 级路径拼接（`homedir(), ".zcode"`、`~/.zcode`、`$HOME/.zcode`） | 采用上游后手动改为 `.zcodex` |
| 上游新增/修改 **user vs workspace** 目录 segments | 对照本文件二.4 的拆分表，仅 user 级改 `.zcodex` |
| 上游改 productName / 应用名相关 | 保留本地 `ZCodex` 命名 |
| 上游改项目内 `.zcode`、`.zcode-plugin`、`.zcodeignore` 逻辑 | 直接采用上游 |
| 上游改品牌文案（i18n、提示词、菜单） | 直接采用上游 |
| 上游改 `ZCODE_*` env、包名、IPC 通道、协议常量 | 直接采用上游（本地未定制，无冲突基础） |
| 上游新增数据目录子目录（v2 下新文件等） | 路径经由枢纽函数（`getZCodeDataRootDir`/`getAppConfigDir`）时自动跟随，无需改；硬编码 `.zcode` 的才需要手动改 |

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
