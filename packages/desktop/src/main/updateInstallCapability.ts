import { execFile } from "node:child_process";
import { resolve } from "node:path";
import { app } from "electron";
import { logger } from "./logger.js";

export interface UpdateInstallCapability {
  /** `true`：由 electron-updater 下载并安装；`false`：下载安装包后交给用户手动安装。 */
  autoInstall: boolean;
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
    return { autoInstall: true, reason: "non-darwin" };
  }
  if (!app.isPackaged) {
    // 开发态继续走自动路径：更新器在未打包时本来就被跳过，只有显式开启 dev 更新时才会用到，
    // 而那条链路依赖 electron-updater 的下载/就绪状态来验证 UI 闭环。
    return { autoInstall: true, reason: "unpackaged-dev" };
  }

  // app.getAppPath() 指向 `<App>.app/Contents/Resources/app.asar`，向上三级是 bundle 根。
  const bundlePath = resolve(app.getAppPath(), "../../..");
  const requirement = await readDesignatedRequirement(bundlePath);
  if (!requirement) {
    return { autoInstall: false, reason: "no-code-signature" };
  }
  // ad-hoc 签名（含 electron-builder identity=null 时保留的 Electron 自带签名）的标识要求是
  // `cdhash H"..."`，每个构建都不同，Squirrel 比对新旧包必然失败，安装只会白下载一份完整包。
  // Developer ID 与自签名证书的标识要求由证书决定、跨版本稳定，可以自动安装。
  if (/\bcdhash\b/.test(requirement)) {
    return { autoInstall: false, reason: `build-specific-requirement: ${requirement}` };
  }
  return { autoInstall: true, reason: requirement };
}

export function resolveUpdateInstallCapability(): Promise<UpdateInstallCapability> {
  cachedCapability ??= detectCapability().then((capability) => {
    logger.info(
      `[auto-update] install capability autoInstall=${capability.autoInstall} reason=${capability.reason}`,
    );
    return capability;
  });
  return cachedCapability;
}
