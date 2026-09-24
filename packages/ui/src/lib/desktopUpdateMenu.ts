import {
  ZCODE_PRODUCT_FLAVOR,
  type ZCodeProductFlavor,
  type UpdateStatePayload,
} from "@zcode/shared";

// 更新入口跟随产品身份而不是后端环境：Preview 身份（含生产后端的 Preview）禁用更新器。
export function shouldShowDesktopUpdateEntry(
  flavor: ZCodeProductFlavor = ZCODE_PRODUCT_FLAVOR,
): boolean {
  return flavor === "production";
}

export function getUpdateMenuLabelId(state: UpdateStatePayload | null) {
  switch (state?.kind) {
    case "checking":
      return "desktopMenu.help.checkingForUpdates";
    case "update-available":
      return state.manualInstaller
        ? "desktopMenu.help.downloadUpdateManually"
        : "desktopMenu.help.updateAvailableVersion";
    case "download-progress":
      return "desktopMenu.help.downloadingUpdateProgress";
    case "update-downloaded":
      return state.manualInstaller
        ? "desktopMenu.help.openDownloadedInstaller"
        : "desktopMenu.help.restartToUpdate";
    case "idle":
    default:
      return "titleBar.menu.help.checkForUpdates";
  }
}

export function getUpdateMenuLabelValues(
  state: UpdateStatePayload | null,
): Record<string, string> | undefined {
  switch (state?.kind) {
    case "update-available":
    case "update-downloaded":
      return { version: state.version };
    case "download-progress":
      return { progress: state.progress };
    default:
      return undefined;
  }
}

/** 手动安装模式下载完成后，更新入口点开的是安装包而不是重启安装。 */
export function isManualInstallerUpdate(state: UpdateStatePayload | null): boolean {
  return Boolean(
    state &&
    (state.kind === "update-available" ||
      state.kind === "download-progress" ||
      state.kind === "update-downloaded") &&
    state.manualInstaller,
  );
}
