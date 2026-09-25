import { execFile } from "node:child_process";
import { accessSync, constants, existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { app } from "electron";
import { logger } from "./logger.js";

const MANUAL_UPDATE_INSTALLER_SCRIPT_NAME = "macos-update-installer.sh";

export interface UpdateInstallCapability {
  /** `true`：由 electron-updater 下载并安装；`false`：下载安装包后交给用户手动安装。 */
  autoInstall: boolean;
  /** `true`：`autoInstall` 为 `false` 时仍可由辅助脚本退出应用、替换 bundle 并重新打开。 */
  manualInstallSupported: boolean;
  /** 判定依据，只用于日志排查。 */
  reason: string;
}

const CODESIGN_TIMEOUT_MS = 10_000;

let cachedCapability: Promise<UpdateInstallCapability> | null = null;

function readDesignatedRequirement(bundlePath: string): Promise<string | null> {
  return new Promise((resolveRequirement) => {
    // codesign 把签名标识要求写到 stderr；-d 只读取签名，不做整包校验，因此可以放在启动路径上。
    execFile(
      "/usr/bin/codesign",
      ["-d", "-r-", bundlePath],
      { timeout: CODESIGN_TIMEOUT_MS },
      (error, stdout, stderr) => {
        if (error) {
          resolveRequirement(null);
          return;
        }
        resolveRequirement(
          `${stdout}${stderr}`.match(/designated\s*=>\s*(.+)/)?.[1]?.trim() ?? null,
        );
      },
    );
  });
}

async function detectCapability(): Promise<UpdateInstallCapability> {
  if (process.platform !== "darwin") {
    return { autoInstall: true, manualInstallSupported: false, reason: "non-darwin" };
  }
  if (!app.isPackaged) {
    // 开发态继续走自动路径：更新器在未打包时本来就被跳过，只有显式开启 dev 更新时才会用到，
    // 而那条链路依赖 electron-updater 的下载/就绪状态来验证 UI 闭环。
    return { autoInstall: true, manualInstallSupported: false, reason: "unpackaged-dev" };
  }

  // app.getAppPath() 指向 `<App>.app/Contents/Resources/app.asar`，向上三级是 bundle 根。
  const bundlePath = resolve(app.getAppPath(), "../../..");
  const manualInstallSupport = resolveManualInstallSupport(bundlePath);
  const requirement = await readDesignatedRequirement(bundlePath);
  if (!requirement) {
    return {
      autoInstall: false,
      manualInstallSupported: manualInstallSupport.supported,
      reason: `no-code-signature; ${manualInstallSupport.reason}`,
    };
  }
  // ad-hoc 签名（含 electron-builder identity=null 时保留的 Electron 自带签名）的标识要求是
  // `cdhash H"..."`，每个构建都不同，Squirrel 比对新旧包必然失败，安装只会白下载一份完整包。
  // Developer ID 与自签名证书的标识要求由证书决定、跨版本稳定，可以自动安装。
  if (/\bcdhash\b/.test(requirement)) {
    return {
      autoInstall: false,
      manualInstallSupported: manualInstallSupport.supported,
      reason: `build-specific-requirement: ${requirement}; ${manualInstallSupport.reason}`,
    };
  }
  return {
    autoInstall: true,
    manualInstallSupported: manualInstallSupport.supported,
    reason: requirement,
  };
}

/**
 * 手动安装能否升级成「自动替换」：辅助脚本要能改名 bundle、把新 app 移进来、再重新打开。
 * 以下情况只能退回「打开安装包让用户拖」：
 *   - 从 DMG/下载目录直接启动触发了 App Translocation，运行路径是随机只读目录，改它没有意义；
 *   - 当前 bundle 不是 `.app`，或所在目录没有写权限（装在受保护位置、非 admin 用户）。
 * 脚本本身缺失时同样降级，所以顺手确认资源在不在。
 */
function resolveManualInstallSupport(bundlePath: string): { supported: boolean; reason: string } {
  if (!bundlePath.endsWith(".app")) {
    return { supported: false, reason: `bundle is not an .app: ${bundlePath}` };
  }
  if (bundlePath.includes("/AppTranslocation/")) {
    return { supported: false, reason: `app is translocated: ${bundlePath}` };
  }
  const scriptPath = resolveManualUpdateInstallerScriptPath();
  if (!scriptPath) {
    return { supported: false, reason: "update installer script missing" };
  }
  try {
    accessSync(dirname(bundlePath), constants.W_OK);
  } catch {
    return { supported: false, reason: `bundle directory not writable: ${dirname(bundlePath)}` };
  }
  return { supported: true, reason: `manual install script ready: ${scriptPath}` };
}

/** 打包后随 extraResources 发布；开发态（app.isPackaged=false）没有这一步，返回 null。 */
export function resolveManualUpdateInstallerScriptPath(): string | null {
  // 开发态（未打包）与在 Electron 之外跑测试时都拿不到 resources 目录，
  // 这两种情况都只能退回「打开安装包」。
  if (!app.isPackaged || !process.resourcesPath) {
    return null;
  }
  const scriptPath = join(process.resourcesPath, MANUAL_UPDATE_INSTALLER_SCRIPT_NAME);
  return existsSync(scriptPath) ? scriptPath : null;
}

export function resolveUpdateInstallCapability(): Promise<UpdateInstallCapability> {
  cachedCapability ??= detectCapability().then((capability) => {
    logger.info(
      `[auto-update] install capability autoInstall=${capability.autoInstall} manualInstallSupported=${capability.manualInstallSupported} reason=${capability.reason}`,
    );
    return capability;
  });
  return cachedCapability;
}
