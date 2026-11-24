// Windows 本机 CMake 工具链解析。
//
// 修复原因（2026-11-24）：三处打包脚本各自硬编码 `Visual Studio 17 2022` 生成器，
// 并把 `CMAKE` 环境变量当成一定存在的绝对路径。用户把 VS 2022 升级成 VS 2026（18.x）
// 后，旧路径只剩空目录：runtime-host 在 spawn 阶段直接 ENOENT，即使改对路径，生成器
// 也找不到 VS 2022 实例。这里统一按本机实际的 VS 大版本选择生成器，并在 `CMAKE`
// 指向不存在路径时回退到 PATH / VS 自带 cmake。
import { execFileSync, spawnSync } from "node:child_process";
import { existsSync } from "node:fs";
import { isAbsolute, join } from "node:path";

export const DEFAULT_WINDOWS_CMAKE_GENERATOR = "Visual Studio 17 2022";
export const WINDOWS_CMAKE_GENERATOR_ENV = "ZCODE_WINDOWS_CMAKE_GENERATOR";

const VSWHERE_RELATIVE = "Microsoft Visual Studio/Installer/vswhere.exe";
const VS_CMAKE_RELATIVE = "Common7/IDE/CommonExtensions/Microsoft/CMake/CMake/bin/cmake.exe";
const VC_TOOLS_COMPONENT = "Microsoft.VisualStudio.Component.VC.Tools.x86.x64";

let cachedInstallation;

function queryVswhere(vswhere, extraArgs, env) {
  try {
    const stdout = execFileSync(
      vswhere,
      ["-latest", "-products", "*", ...extraArgs, "-format", "json", "-utf8"],
      { encoding: "utf8", windowsHide: true, timeout: 15_000, env },
    );
    const parsed = JSON.parse(stdout.replace(/^\uFEFF/, "").trim() || "[]");
    return Array.isArray(parsed) && parsed.length > 0 ? parsed[0] : undefined;
  } catch {
    return undefined;
  }
}

/**
 * 本机最新的 Visual Studio 实例。先限定带 C++ 工具集的实例；Build Tools 的组件 id
 * 缺失时退回任意最新实例，生成器仍按 versionMajor 映射。
 */
export function detectVisualStudioInstallation(env = process.env) {
  if (cachedInstallation !== undefined) return cachedInstallation;
  const vswhere = join(
    env["ProgramFiles(x86)"]?.trim() || "C:/Program Files (x86)",
    VSWHERE_RELATIVE,
  );
  cachedInstallation = null;
  if (existsSync(vswhere)) {
    const instance =
      queryVswhere(vswhere, ["-requires", VC_TOOLS_COMPONENT], env) ??
      queryVswhere(vswhere, [], env);
    const installPath = instance?.installationPath;
    const versionMajor = Number.parseInt(
      String(instance?.installationVersion ?? "").split(".")[0],
      10,
    );
    if (installPath && Number.isFinite(versionMajor)) {
      cachedInstallation = { installPath, versionMajor };
    }
  }
  return cachedInstallation;
}

export function resolveWindowsCmakeGenerator(options = {}) {
  const env = options.env ?? process.env;
  const override = env[WINDOWS_CMAKE_GENERATOR_ENV]?.trim();
  if (override) return override;
  const visualStudio =
    options.visualStudio === undefined ? detectVisualStudioInstallation(env) : options.visualStudio;
  const major = visualStudio?.versionMajor;
  if (major >= 18) return "Visual Studio 18 2026";
  if (major === 17) return "Visual Studio 17 2022";
  if (major === 16) return "Visual Studio 16 2019";
  return DEFAULT_WINDOWS_CMAKE_GENERATOR;
}

let warnedAboutStaleCmake = false;

/** `CMAKE` 显式配置优先；绝对路径失效时回退 PATH，再回退 VS 自带 cmake。 */
export function resolveWindowsCmakeExecutable(options = {}) {
  const env = options.env ?? process.env;
  const configured = env.CMAKE?.trim().replace(/^"(.*)"$/, "$1");
  if (configured && (!isAbsolute(configured) || existsSync(configured))) return configured;
  if (configured && !warnedAboutStaleCmake) {
    warnedAboutStaleCmake = true;
    console.warn(`[windows-cmake] CMAKE=${configured} 不存在，改为自动查找 CMake。`);
  }
  const probe = spawnSync(process.platform === "win32" ? "where.exe" : "which", ["cmake"], {
    encoding: "utf8",
    windowsHide: true,
    timeout: 10_000,
    env,
  });
  const fromPath =
    probe.status === 0
      ? probe.stdout
          .split(/\r?\n/)
          .map((line) => line.trim())
          .find((line) => line && existsSync(line))
      : undefined;
  if (fromPath) return fromPath;
  const visualStudio =
    options.visualStudio === undefined ? detectVisualStudioInstallation(env) : options.visualStudio;
  const vsCmake = visualStudio?.installPath
    ? join(visualStudio.installPath, VS_CMAKE_RELATIVE)
    : undefined;
  if (vsCmake && existsSync(vsCmake)) return vsCmake;
  return "cmake";
}
