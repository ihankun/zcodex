import type { ElectronReleaseChannel, Locale } from "./protocol.js";

export interface PostUpdateReleaseNotesPayload {
  version: string;
  title: string;
  markdown: string;
  releaseDate?: string;
  releaseNotesByLocale?: Partial<Record<Locale, { title: string; markdown: string }>>;
}

/**
 * 用户从菜单手动点击"检查更新"后，main 进程回传给 renderer 的结果。
 * Renderer 根据 kind 展示对应的 toast；不要与启动时的自动 check 混用。
 */
export type UpdateCheckResultPayload =
  | { kind: "up-to-date"; currentVersion: string }
  | {
      kind: "available";
      version: string;
      channel?: ElectronReleaseChannel;
      releaseNotes?: PostUpdateReleaseNotesPayload;
    }
  | { kind: "downloading"; version: string }
  | { kind: "already-downloading"; version: string; progress: string }
  | { kind: "ready"; version: string }
  /** 手动安装模式下安装包已就绪：界面提示打开安装包，而不是重启安装。 */
  | { kind: "manual-ready"; version: string }
  | { kind: "dev-skipped" }
  | { kind: "error"; message: string };

/**
 * 手动安装模式：当前构建无法由 electron-updater 自动安装时（macOS 未签名或 ad-hoc 签名的构建，
 * Squirrel 比对签名标识必然失败），改为下载本平台安装包并交给用户手动替换。
 */
export interface ManualUpdateInstallerPayload {
  /** 安装包文件名；界面据此提示用户到「下载」目录找它。 */
  fileName: string;
}

/**
 * 桌面自动更新器的持续状态，用于同步原生菜单和 Windows 自绘标题栏菜单。
 */
export type UpdateStatePayload =
  | { kind: "idle"; enabled: boolean }
  | { kind: "checking"; enabled: boolean }
  | {
      kind: "update-available";
      enabled: boolean;
      version: string;
      channel?: ElectronReleaseChannel;
      releaseNotes?: PostUpdateReleaseNotesPayload;
      /** 存在时表示这轮更新走手动安装，界面不再引导自动下载安装。 */
      manualInstaller?: ManualUpdateInstallerPayload;
    }
  | {
      kind: "download-progress";
      enabled: boolean;
      progress: string;
      transferredBytes?: number;
      totalBytes?: number;
      version?: string;
      channel?: ElectronReleaseChannel;
      releaseNotes?: PostUpdateReleaseNotesPayload;
      manualInstaller?: ManualUpdateInstallerPayload;
    }
  | {
      kind: "update-downloaded";
      enabled: boolean;
      version: string;
      channel?: ElectronReleaseChannel;
      releaseNotes?: PostUpdateReleaseNotesPayload;
      manualInstaller?: ManualUpdateInstallerPayload;
    };
