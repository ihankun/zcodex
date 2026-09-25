import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { app, net, shell } from "electron";
import { getAppConfigDir } from "@zcode/services/node";
import { logger } from "./logger.js";

export interface ManualUpdateInstallerTarget {
  /** 安装包下载地址（provider 解析后的绝对地址）。 */
  url: string;
  /** 清单里声明的文件名，落盘时沿用，便于用户在自己电脑上找到它。 */
  fileName: string;
  /** 清单声明的 sha512（base64）。 */
  sha512: string;
  /** 清单声明的字节数。 */
  size: number;
}

export interface ManualUpdateInstallerProgress {
  transferredBytes: number;
  totalBytes: number;
}

/** 用户取消导致的下载中止；调用方据此按「取消下载」而不是「下载失败」收敛状态。 */
export class ManualUpdateDownloadCancelledError extends Error {
  constructor() {
    super("manual update download cancelled");
    this.name = "ManualUpdateDownloadCancelledError";
  }
}

const UNKNOWN_TOTAL_PROGRESS_STEP_BYTES = 1024 * 1024;

/** Electron 的 IncomingMessage 运行时实现了 Readable 接口，但类型声明只列了事件。 */
type PausableIncomingMessage = Electron.IncomingMessage & {
  pause(): void;
  resume(): void;
};

function sha512OfFile(filePath: string): Promise<string> {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha512");
    createReadStream(filePath)
      .on("error", rejectHash)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolveHash(hash.digest("base64")));
  });
}

async function isCompleteDownload(
  filePath: string,
  target: ManualUpdateInstallerTarget,
): Promise<boolean> {
  try {
    const fileStat = await stat(filePath);
    if (!fileStat.isFile() || fileStat.size !== target.size) {
      return false;
    }
  } catch {
    return false;
  }
  return (await sha512OfFile(filePath)) === target.sha512;
}

/**
 * 把本平台安装包下载到系统「下载」目录，校验通过后再改名落盘；
 * 临时文件只用于失败/取消时清理，避免用户看到一个不完整的安装包。
 */
export async function downloadManualUpdateInstaller(options: {
  target: ManualUpdateInstallerTarget;
  signal: AbortSignal;
  onProgress: (progress: ManualUpdateInstallerProgress) => void;
}): Promise<{ filePath: string }> {
  const { target, signal, onProgress } = options;
  if (signal.aborted) {
    throw new ManualUpdateDownloadCancelledError();
  }

  const downloadDir = app.getPath("downloads");
  await mkdir(downloadDir, { recursive: true });
  // 文件名来自远端清单，取 basename 防止越出下载目录写文件。
  const filePath = join(downloadDir, basename(target.fileName));
  if (await isCompleteDownload(filePath, target)) {
    logger.info(`[manual-update] reuse downloaded installer ${filePath}`);
    return { filePath };
  }

  const tempPath = `${filePath}.download`;
  await rm(tempPath, { force: true });

  const totalBytes = target.size;
  const hash = createHash("sha512");
  let transferredBytes = 0;
  let lastReportedPercent = -1;
  let lastReportedBytes = 0;
  const writeStream = createWriteStream(tempPath);

  try {
    await new Promise<void>((resolveDownload, rejectDownload) => {
      let request: ReturnType<typeof net.request> | null = null;
      let settled = false;
      const settle = (error?: Error) => {
        if (settled) {
          return;
        }
        settled = true;
        signal.removeEventListener("abort", onAbort);
        if (error) {
          rejectDownload(error);
          return;
        }
        resolveDownload();
      };
      const onAbort = () => {
        request?.abort();
        settle(new ManualUpdateDownloadCancelledError());
      };

      writeStream.on("error", (error) => settle(error));
      // 响应结束后才 close 写流，确保落在磁盘上的字节数与校验口径一致。
      writeStream.on("finish", () => settle());

      signal.addEventListener("abort", onAbort, { once: true });
      const installerRequest = net.request(target.url);
      request = installerRequest;

      installerRequest.on("error", (error) => settle(error));
      installerRequest.on("response", (response) => {
        const statusCode = response.statusCode ?? 0;
        if (statusCode < 200 || statusCode >= 300) {
          settle(new Error(`installer download failed with status ${statusCode}`));
          return;
        }

        response.on("error", (error) => settle(error));
        response.on("data", (chunk: Buffer) => {
          const pausableResponse = response as PausableIncomingMessage;
          hash.update(chunk);
          transferredBytes += chunk.length;
          // 磁盘慢于网络时先暂停响应，避免整包堆在内存里。
          if (!writeStream.write(chunk)) {
            pausableResponse.pause();
            writeStream.once("drain", () => pausableResponse.resume());
          }

          if (totalBytes > 0) {
            const percent = Math.floor((transferredBytes / totalBytes) * 100);
            if (percent !== lastReportedPercent) {
              lastReportedPercent = percent;
              onProgress({ transferredBytes, totalBytes });
            }
            return;
          }
          if (transferredBytes - lastReportedBytes >= UNKNOWN_TOTAL_PROGRESS_STEP_BYTES) {
            lastReportedBytes = transferredBytes;
            onProgress({ transferredBytes, totalBytes: 0 });
          }
        });
        response.on("end", () => writeStream.end());
      });
      installerRequest.end();
    });

    const sha512 = hash.digest("base64");
    if (transferredBytes !== totalBytes || sha512 !== target.sha512) {
      throw new Error(
        `installer verification failed (bytes=${transferredBytes}/${totalBytes}, sha512Matched=${sha512 === target.sha512})`,
      );
    }

    await rename(tempPath, filePath);
    logger.info(
      `[manual-update] installer downloaded ${filePath} bytes=${transferredBytes} sha512Matched=true`,
    );
    return { filePath };
  } catch (error) {
    writeStream.destroy();
    await rm(tempPath, { force: true });
    throw error;
  }
}

export async function openManualUpdateInstaller(filePath: string): Promise<void> {
  const openError = await shell.openPath(filePath);
  if (openError) {
    throw new Error(`open installer failed: ${openError}`);
  }
}

/**
 * 起一个脱离本进程的安装脚本：它先等本进程退出，再挂载 DMG、替换 bundle、重新打开应用。
 *
 * 必须 detached + unref：应用马上要自杀，脚本得活下来接管后续步骤。
 * 返回日志路径便于排查——脚本失败时用户只会看到应用重启回旧版本，原因只在日志里。
 */
export async function startManualUpdateInstall(options: {
  installerFilePath: string;
  scriptPath: string;
}): Promise<{ logFilePath: string }> {
  if (process.platform !== "darwin") {
    throw new Error(`manual install script is macOS only (platform=${process.platform})`);
  }

  const bundlePath = resolve(app.getAppPath(), "../../..");
  const logDir = join(getAppConfigDir(), "logs");
  await mkdir(logDir, { recursive: true });
  const logFilePath = join(logDir, `update-install-${Date.now()}.log`);
  await writeFile(logFilePath, "", "utf-8");

  const child = spawn(
    "/bin/sh",
    [options.scriptPath, String(process.pid), bundlePath, options.installerFilePath, logFilePath],
    { detached: true, stdio: "ignore" },
  );
  child.unref();
  logger.info(
    `[manual-update] install script spawned pid=${child.pid ?? "unknown"} bundle=${bundlePath} log=${logFilePath}`,
  );
  return { logFilePath };
}
