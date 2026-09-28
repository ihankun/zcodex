# 本地内置插件载荷（可选，不入库）

本目录用于**本地补齐**官方桌面包里自带、但开源仓库没有源码的内置插件包。
放进来之后，`packages/desktop/scripts/stage-agent-bundle.mjs` 会在每次暂存 agent bundle 时
（dev 链与打包链共用）把它们复制到 `bundled-agents/<平台>/glm/packages/<包名>`，
electron-builder 再整目录发布到产物里的 `Contents/Resources/glm/packages/`，
应用启动时由内置插件 seed 装进插件缓存并写入内置市场分片。

**本目录只保留本文件**，其余内容全部被 `.gitignore` 忽略，不会进入提交。

## 补齐方法

以已安装的官方 app 为来源，把没有源码的那批插件包拷进来（macOS 示例）：

```bash
mkdir -p packages/desktop/vendor/official-plugins
cp -R /Applications/ZCode.app/Contents/Resources/glm/packages/. \
      packages/desktop/vendor/official-plugins/
```

不需要手工剔除任何目录，脚本自己处理：

- 只有带 `.zcode-plugin/plugin.json` 的目录会被拷贝（官方 seed 也按这个文件判定候选根目录，
  所以 `bundled-skills` 这类非插件目录会被自动忽略）；
- `browser-use-plugin`、`node-repl-host` 在仓库里有源码，会被跳过并打印
  `skipped vendored plugins built from source`——**仓库源码优先是刻意的**，
  否则同一目录会变成「源码构建 + 官方预编译」两份载荷的并集，dev 与打包产物行为不一致。

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
  官方发布包里的插件版本可能比本仓库定义表更新，升级上游后应重新拷一份。
- 部分插件依赖官方运行时能力（如 `zcode-cua-plugin` 的 frame contract），
  拷贝后是否完整可用需要实际打开验证。

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
