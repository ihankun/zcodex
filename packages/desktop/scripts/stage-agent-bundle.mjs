// Agent bundle 的暂存动作：把 apps/zcode-cli/packages/cli/dist/zcode.cjs 放进
// bundled-agents/<平台>/glm，并写 meta。
//
// dev 与打包**必须**用同一份暂存实现。
// 只有打包链（prepare-agent-node-bundle.mjs）会暂存是不够的，dev 链
// （scripts/build-desktop-agent-cli.mjs）不会；而 dev 未打包时的 agent 二进制由
// desktopRuntimeEnv.ts 的 resolveBundledZCodeAgentBinaryPath() 解析，候选**只有**
// bundled-agents/，没有 cli/dist/。于是 dev 一直跑着上一次打包时留下的那份 ——
// 实测陈旧 3 天，任何 agent CLI 侧改动在 dev 里静默不生效，排查时会把「改动没生效」
// 误判成「代码没起作用」。两边共用这一份，dev 与打包不可能再各自漂移。
//
// 除 zcode.cjs 之外，这里还顺带补上本地 vendor 目录里的内置插件载荷（可选，gitignore），
// 原因是同一个：载荷也只能在清空 glm 之后落盘，交给别的步骤做就会和 dev 漂移。
import {
  copyFileSync,
  cpSync,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";

export const AGENT_BUNDLE_SOURCE_RELATIVE = "apps/zcode-cli/packages/cli/dist/zcode.cjs";

// 仓库自带源码的官方插件工作区根目录。用它判定「哪个插件由源码构建」，
// 见 stageVendoredOfficialPlugins 的来源优先级说明。
export const AGENT_PLUGIN_SOURCE_PACKAGES_RELATIVE = "apps/zcode-cli/packages";

// 本地补齐的内置插件载荷目录（gitignore，见同目录 README.md）。
// 官方桌面包里有 12 个内置插件包在开源仓库没有源码，靠它才能随本地构建一起打包。
export const VENDORED_OFFICIAL_PLUGIN_ROOT_RELATIVE = "packages/desktop/vendor/official-plugins";

export function resolveAgentBundlePaths({ repoRoot, platformKey }) {
  const glmDir = resolve(repoRoot, "packages", "desktop", "bundled-agents", platformKey, "glm");
  return {
    cliBundlePath: resolve(repoRoot, AGENT_BUNDLE_SOURCE_RELATIVE),
    glmDir,
    stagedBundlePath: resolve(glmDir, "zcode.cjs"),
    stagedMetaPath: resolve(glmDir, ".node-bundle-meta.json"),
  };
}

/**
 * 把 vendor 目录里的内置插件载荷补进 glm/packages（本地自用，见
 * packages/desktop/vendor/official-plugins/README.md）。
 *
 * 必须在这里做，不能靠手工往 bundled-agents/<平台>/glm/packages/ 里放：stageAgentBundle
 * 每次都会 rmSync 重建 glm 目录，dev 链（scripts/build-desktop-agent-cli.mjs）和打包链
 * （prepare-agent-node-bundle.mjs）都会调，手工放进去的载荷会被下一次构建清掉。
 *
 * 目录缺省时静默跳过：这是可选的本地补齐，公开检出没有这个目录也必须能正常构建。
 * 只认带 .zcode-plugin/plugin.json 的目录 —— 官方 seed 也按这个文件判定候选根目录
 * （bootstrap/official-plugin-definitions.ts 的 rootCandidates + bundled-plugins.ts
 * 的 resolveFilesystemPluginRoot），缺它的目录既不会被 seed 也不可能在市场里出现。
 */
export function stageVendoredOfficialPlugins({ repoRoot, glmDir, log = console.log }) {
  const vendorRoot = resolve(repoRoot, VENDORED_OFFICIAL_PLUGIN_ROOT_RELATIVE);
  const result = { staged: [], skipped: [] };
  if (!existsSync(vendorRoot)) return result;

  for (const entry of readdirSync(vendorRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const sourceRoot = resolve(vendorRoot, entry.name);
    const manifestPath = resolve(sourceRoot, ".zcode-plugin", "plugin.json");
    if (!existsSync(manifestPath)) continue;
    // 插件载荷的来源优先级：仓库源码 > vendor。
    // browser-use-plugin 与 node-repl-host 在仓库里有源码（prepare-agent-node-bundle.mjs 的
    // officialPluginPackages 会按源码构建后 stage），若再叠加 vendor 里的官方预编译副本，
    // 同一目录会变成两份载荷的并集：dev 与打包产物取的载荷不同、seed 的 hash 随机器变化。
    // 凡是仓库有源码的插件一律跳过，让源码构建保持唯一权威。
    const sourceManifestPath = resolve(
      repoRoot,
      AGENT_PLUGIN_SOURCE_PACKAGES_RELATIVE,
      entry.name,
      ".zcode-plugin",
      "plugin.json",
    );
    if (existsSync(sourceManifestPath)) {
      result.skipped.push(entry.name);
      continue;
    }
    cpSync(sourceRoot, resolve(glmDir, "packages", entry.name), {
      recursive: true,
      // 从官方安装包里拷出来的载荷会带 .DS_Store，它只影响 seed 的文件清单 hash。
      filter: (sourcePath) => basename(sourcePath) !== ".DS_Store",
    });
    // 带上载荷自报版本：本地定义表（official-plugin-definitions.ts）滞后于官方载荷时，
    // 这里能直接看出来，不用等到用户反馈「插件装上了但功能对不上」。
    result.staged.push(`${entry.name}@${readPluginManifestVersion(manifestPath)}`);
  }

  if (result.staged.length > 0) {
    log(`[stage:agent-bundle] staged vendored official plugins: ${result.staged.join(", ")}`);
  }
  if (result.skipped.length > 0) {
    log(
      `[stage:agent-bundle] skipped vendored plugins built from source: ${result.skipped.join(", ")}`,
    );
  }
  return result;
}

function readPluginManifestVersion(manifestPath) {
  try {
    return JSON.parse(readFileSync(manifestPath, "utf8")).version ?? "unknown";
  } catch {
    return "unknown";
  }
}

/**
 * 干净重建 glm 目录再拷贝。清空是刻意的：electron-builder 整目录拷贝
 * bundled-agents/<平台>/glm → resources/glm，本地工作树里上一次构建残留的原生二进制
 * （zcode-agent / zcode-acp 等）和旧 meta 会被一并打进安装包（CI 干净检出不会有，本地会）。
 */
export function stageAgentBundle({ repoRoot, platformKey, log = console.log }) {
  const { cliBundlePath, glmDir, stagedBundlePath, stagedMetaPath } = resolveAgentBundlePaths({
    repoRoot,
    platformKey,
  });
  if (!existsSync(cliBundlePath)) {
    throw new Error(`[stage:agent-bundle] agent bundle 源产物不存在：${cliBundlePath}`);
  }
  rmSync(glmDir, { recursive: true, force: true });
  mkdirSync(glmDir, { recursive: true });
  copyFileSync(cliBundlePath, stagedBundlePath);
  const meta = {
    runtime: "electron-node",
    entry: "zcode.cjs",
    platform: platformKey,
    source: AGENT_BUNDLE_SOURCE_RELATIVE,
  };
  writeFileSync(stagedMetaPath, `${JSON.stringify(meta, null, 2)}\n`, "utf8");
  log(`[stage:agent-bundle] staged ${stagedBundlePath}`);
  const vendored = stageVendoredOfficialPlugins({ repoRoot, glmDir, log });
  return { stagedBundlePath, stagedMetaPath, vendored };
}
