# 内置插件载荷（已入库）

官方桌面包的 `Contents/Resources/glm/packages/` 里有 14 个内置插件包，开源仓库只带
`browser-use-plugin`、`node-repl-host` 的源码；其余插件是官方预编译资产，没有源码。
本目录存放其中**会被打包**的那 12 个载荷，已入库，因此任意平台（含 Windows）干净检出后
打包就能带上它们，不必各机器手工从官方 app 拷一份。

打包链路：
`stage-agent-bundle.mjs` 每次暂存 agent bundle 时（dev 链与打包链共用）把它们复制到
`bundled-agents/<平台>/glm/packages/<包名>` → electron-builder 整目录发布到产物里的
`Contents/Resources/glm/packages/` → 应用启动时由内置插件 seed 装进插件缓存并写入内置市场分片。

## 入库范围

**入库（12 个）** —— 仓库没有源码、又必须随包分发：

| 目录 | 插件名 | 版本 |
| --- | --- | --- |
| `android-emulator-plugin` | android-emulator | 0.1.0 |
| `documents-plugin` | documents | 0.1.7 |
| `image-search-plugin` | image-search | 0.1.1 |
| `ios-simulator-plugin` | ios-simulator | 0.1.0 |
| `pdf-plugin` | pdf | 0.1.7 |
| `plugin-creator-plugin` | plugin-creator | 0.1.1 |
| `presentations-plugin` | presentations | 0.1.7 |
| `restore-legacy-sessions-plugin` | restore-legacy-sessions | 0.1.0 |
| `skill-creator-plugin` | skill-creator | 0.1.0 |
| `spreadsheets-plugin` | spreadsheets | 0.1.7 |
| `zcode-cua-plugin` | computer-use | 0.6.3 |
| `zcode-guide-plugin` | zcode-guide | 0.3.0 |

**不入库（`.gitignore` 已排除）**：

- `browser-use-plugin`、`node-repl-host`：仓库 `apps/zcode-cli/packages/` 下有源码，
  `stageVendoredOfficialPlugins` 按「仓库源码 > vendor」的优先级跳过 vendor 副本
  （日志 `skipped vendored plugins built from source`）。**仓库源码优先是刻意的**，
  否则同一插件目录会变成「源码构建 + 官方预编译」两份载荷的并集，dev 与打包产物行为不一致。
  本地若从官方 app 拷过它们，留在目录里被忽略即可。
- `bundled-skills`：不是插件（没有 `.zcode-plugin/plugin.json`），由源码单独 stage。
- 各插件内的 `node_modules`：平台专有原生二进制（如 `zcode-cua-plugin` 下的
  darwin `sharp`/`koffi`），提交后在其他平台无法加载；且入库载荷不含它、本地含它时，
  同一插件会算出两份不同的 seed hash。暂存时也会显式过滤掉 `node_modules`。

**容易踩的坑：`dist/` 不在排除范围，必须保留 `.gitignore` 末尾的 re-include。**
`android-emulator-plugin`、`ios-simulator-plugin` 的 `dist/` 是**运行必需**产物 ——
它们的 `.mcp.json` 与 `.zcode-plugin/plugin.json` 都指向 `${ZCODE_PLUGIN_ROOT}/dist/mcp/server.js`，
缺了整个插件的 MCP 服务起不来。而 `.gitignore` 顶层有一条构建产物规则 `dist/`，
会连目录一起排除；git 不会进入被排除的目录，所以只写 `dist/**` 不够，必须先
`!packages/desktop/vendor/official-plugins/*/dist/` 把目录本身 re-include 回来。
校验是否漏文件：

```bash
git ls-files --others --ignored --exclude-standard packages/desktop/vendor/official-plugins/ \
  | grep -vE '/node_modules/|/(browser-use-plugin|node-repl-host|bundled-skills)/'
# 应无输出
```

## 升级上游后重新对齐载荷

以官方 app 为来源覆盖那 12 个目录（macOS 示例）：

```bash
for p in android-emulator documents image-search ios-simulator pdf plugin-creator \
         presentations restore-legacy-sessions skill-creator spreadsheets \
         zcode-cua zcode-guide; do
  rm -rf "packages/desktop/vendor/official-plugins/${p}-plugin"
  cp -R "/Applications/ZCode.app/Contents/Resources/glm/packages/${p}-plugin" \
        packages/desktop/vendor/official-plugins/
done
```

不要整目录 `cp -R .` 后再删：`browser-use-plugin`、`node-repl-host`、`bundled-skills`
和插件内的 `node_modules` 都在 `.gitignore` 里，拷进来只会留下永远不被使用的本地残留。

放好后正常打包即可，日志里会出现 `staged vendored official plugins: pdf-plugin, ...`。
只想验证暂存结果（不打包）：直接看 `packages/desktop/bundled-agents/<平台>/glm/packages/`。

## 注意

- **不要**把载荷直接放进 `packages/desktop/bundled-agents/<平台>/glm/packages/`：
  `stageAgentBundle()` 每次构建都会 `rmSync` 重建 `glm`，手工放的会被清掉。
- 这些包是官方预编译资产，**不是开源代码**。自己本机使用没问题；
  一旦随构建产物对外分发，属于再分发官方二进制，存在版权与许可风险，需要自行确认。
- 载荷版本要与源码里的内置插件定义表对得上
  （`apps/zcode-cli/packages/bootstrap/src/app/official-plugin-definitions.ts` 的 `version` 与
  `requiredSeedPaths`）。版本不一致时**不会**报错构建，而是该插件被 seed 跳过并在日志里告警
  （`ZCODE_PLUGIN_SEED_INCOMPLETE`，附带缺失文件清单），其余插件不受影响。
- 本目录在 `.oxlintrc.json` 与 `.prettierignore` 里被排除：它们是第三方产物，
  **不要**为了 `fmt:check` / `lint` 去格式化或修补，否则每次从官方 app 重新拷一份都会产生无意义 diff。

## 实测结论（2026-09-28，官方 app 3.14.3 + fork 1.1.0）

以官方 `ZCode.app` 的 `glm/packages` 为来源时：

- 暂存 12 个：android-emulator、documents、image-search、ios-simulator、pdf、plugin-creator、
  presentations、restore-legacy-sessions、skill-creator、spreadsheets、zcode-cua、zcode-guide；
  跳过 2 个（源码构建的 browser-use、node-repl-host），非插件的 `bundled-skills` 忽略；
- 走一遍真实 seed（`resolveOfficialPluginRoots`）：内置市场分片 14 条，
  合并后的 `marketplace.json` **40 条**，与官方安装包的 40 条一致；
- 有 13 个插件真正落进插件缓存。`zcode-guide` 被跳过：官方载荷是 `0.3.0`（技能重组为
  `skills/zcode-configuration-guide`、`skills/diagnosing-*`，`dynamic-workflows` 已移到
  `bundled-skills`），而本仓库定义表仍按 `0.2.0` 要求 `commands/workflow.md` 与
  `skills/dynamic-workflows/*`。要对齐需同步更新定义表的 `version` 与 `requiredSeedPaths`
  （改动的是上游文件，合并时注意保护）。
- `zcode-cua-plugin` 依赖的 `@zcode/zcode-cua` 在本仓库是 fail-closed 占位包
  （见 `packages/zcode-cua/package.json`），即 Computer Use 在本构建里不工作；
  入库的 cua 载荷只带 docs/skills/client script，不含官方 `node_modules`。
