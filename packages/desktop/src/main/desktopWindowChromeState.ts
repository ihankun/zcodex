import { release as readPlatformRelease } from "node:os";
import type { DesktopWindowChromeState, DesktopWindowEffect } from "@zcode/shared";

const WINDOWS_11_FIRST_BUILD = 22000;
// DWM system backdrop（setBackgroundMaterial）从 Windows 11 22H2 开始提供；
// 21H2（22000）只支持原生圆角，不能拿同一门槛判断窗口特效。
const WINDOWS_11_22H2_FIRST_BUILD = 22621;

export function resolveMacOSMajorVersion(
  platform: NodeJS.Platform,
  platformRelease: string,
): number | null {
  if (platform !== "darwin") return null;

  const darwinMajor = Number.parseInt(platformRelease.split(".")[0] ?? "", 10);
  if (!Number.isFinite(darwinMajor)) return null;

  // Tahoe 起产品版本从 15 跳到 26，不能继续套用旧的 Darwin - 9 映射。
  return darwinMajor >= 25 ? darwinMajor + 1 : darwinMajor - 9;
}

export function supportsNativeWindowsRoundedCorners(
  platform: NodeJS.Platform,
  platformRelease: string,
): boolean {
  if (platform !== "win32") return false;

  const build = Number.parseInt(platformRelease.split(".")[2] ?? "", 10);
  return Number.isFinite(build) && build >= WINDOWS_11_FIRST_BUILD;
}

function supportsWindowsBackgroundMaterial(
  platform: NodeJS.Platform,
  platformRelease: string,
): boolean {
  if (platform !== "win32") return false;

  const build = Number.parseInt(platformRelease.split(".")[2] ?? "", 10);
  return Number.isFinite(build) && build >= WINDOWS_11_22H2_FIRST_BUILD;
}

function resolveDesktopWindowChromeState(
  isMaximized: boolean,
  platform: NodeJS.Platform = process.platform,
  platformRelease: string = readPlatformRelease(),
  windowEffect: DesktopWindowEffect = "default",
): DesktopWindowChromeState {
  const supportsWindowEffect = supportsWindowsBackgroundMaterial(platform, platformRelease);

  return {
    isMaximized,
    macOSMajorVersion: resolveMacOSMajorVersion(platform, platformRelease),
    supportsNativeRoundedCorners: supportsNativeWindowsRoundedCorners(platform, platformRelease),
    supportsWindowEffect,
    // 不支持 DWM system backdrop 时窗口层没有材质可透出，必须把有效值收敛为
    // default，避免 renderer 把外壳切成半透明后露出黑底。
    windowEffect: supportsWindowEffect ? windowEffect : "default",
  };
}

export function resolveCurrentDesktopWindowChromeState(
  isMaximized: boolean,
  windowEffect: DesktopWindowEffect,
): DesktopWindowChromeState {
  return resolveDesktopWindowChromeState(
    isMaximized,
    process.platform,
    readPlatformRelease(),
    windowEffect,
  );
}

/** 当前平台真正可用的窗口特效；用于 main 内存值与 renderer 状态保持一致。 */
export function resolveEffectiveDesktopWindowEffect(
  windowEffect: DesktopWindowEffect,
): DesktopWindowEffect {
  return supportsWindowsBackgroundMaterial(process.platform, readPlatformRelease())
    ? windowEffect
    : "default";
}
