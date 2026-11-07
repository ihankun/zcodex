import { BrowserWindow, screen } from "electron";
import type { Rectangle } from "electron";
import type { AppSettings } from "@zcode/shared";

export const DEFAULT_DESKTOP_WINDOW_WIDTH = 1200;
export const DEFAULT_DESKTOP_WINDOW_HEIGHT = 800;
export const MIN_DESKTOP_WINDOW_WIDTH = 480;
export const MIN_DESKTOP_WINDOW_HEIGHT = 640;
const WINDOW_SIZE_PERSIST_DEBOUNCE_MS = 250;
// 保存的位置至少要有这么多像素落在某块显示器的工作区内，才认为它仍然可用。
// 窗口被拖到屏幕外或外接屏被拔掉时，宁可回主屏居中，也不要把主窗口恢复到看不见的地方。
const MIN_VISIBLE_WINDOW_WIDTH = 80;
const MIN_VISIBLE_WINDOW_HEIGHT = 40;

export type DesktopWindowSize = NonNullable<AppSettings["desktopWindowSize"]>;

type WorkArea = Pick<Rectangle, "x" | "y" | "width" | "height">;

function clampDimension(value: number, minimum: number, available: number): number {
  const maximum = Math.max(minimum, Math.floor(available));
  return Math.min(Math.max(Math.floor(value), minimum), maximum);
}

function clampPosition(value: number, minimum: number, maximum: number): number {
  const upper = Math.max(Math.floor(minimum), Math.floor(maximum));
  return Math.min(Math.max(Math.floor(value), Math.floor(minimum)), upper);
}

function findWorkAreaForPosition(
  position: { x: number; y: number },
  workAreas: readonly WorkArea[],
): WorkArea | undefined {
  return workAreas.find(
    (workArea) =>
      position.x >= workArea.x &&
      position.x < workArea.x + workArea.width &&
      position.y >= workArea.y &&
      position.y < workArea.y + workArea.height,
  );
}

function findVisibleWorkArea(
  rect: WorkArea,
  workAreas: readonly WorkArea[],
): WorkArea | undefined {
  let best: { workArea: WorkArea; area: number } | undefined;
  for (const workArea of workAreas) {
    const overlapWidth =
      Math.min(rect.x + rect.width, workArea.x + workArea.width) - Math.max(rect.x, workArea.x);
    const overlapHeight =
      Math.min(rect.y + rect.height, workArea.y + workArea.height) - Math.max(rect.y, workArea.y);
    if (overlapWidth < MIN_VISIBLE_WINDOW_WIDTH || overlapHeight < MIN_VISIBLE_WINDOW_HEIGHT) {
      continue;
    }
    const area = overlapWidth * overlapHeight;
    if (!best || area > best.area) {
      best = { workArea, area };
    }
  }
  return best?.workArea;
}

export function resolveDesktopWindowSize(
  persisted: DesktopWindowSize | undefined,
  displays: {
    primaryWorkArea: WorkArea;
    workAreas: readonly WorkArea[];
  },
): DesktopWindowSize {
  const savedWidth = persisted?.width ?? DEFAULT_DESKTOP_WINDOW_WIDTH;
  const savedHeight = persisted?.height ?? DEFAULT_DESKTOP_WINDOW_HEIGHT;
  const savedPosition =
    typeof persisted?.x === "number" &&
    Number.isFinite(persisted.x) &&
    typeof persisted?.y === "number" &&
    Number.isFinite(persisted.y)
      ? { x: persisted.x, y: persisted.y }
      : null;
  const candidates = displays.workAreas.length > 0 ? displays.workAreas : [displays.primaryWorkArea];
  const savedRect = savedPosition
    ? { ...savedPosition, width: savedWidth, height: savedHeight }
    : null;
  // 先按窗口左上角落点选显示器（用户拖动时最直观的归属），再退回到“窗口仍有足够可见区域”
  // 的重叠判定；两者都失败才认为保存位置已经不在任何当前显示器上。
  const positionedWorkArea = savedPosition
    ? findWorkAreaForPosition(savedPosition, candidates)
    : undefined;
  const visibleWorkArea =
    positionedWorkArea ?? (savedRect ? findVisibleWorkArea(savedRect, candidates) : undefined);
  const targetWorkArea = visibleWorkArea ?? displays.primaryWorkArea;

  const width = clampDimension(savedWidth, MIN_DESKTOP_WINDOW_WIDTH, targetWorkArea.width);
  const height = clampDimension(savedHeight, MIN_DESKTOP_WINDOW_HEIGHT, targetWorkArea.height);
  const state: DesktopWindowSize = {
    width,
    height,
    maximized: persisted?.maximized ?? false,
  };

  if (savedPosition) {
    // 有历史位置时优先恢复并收敛到工作区；保存位置已经不在任何显示器上时回主屏居中。
    const targetX = visibleWorkArea
      ? savedPosition.x
      : targetWorkArea.x + Math.round((targetWorkArea.width - width) / 2);
    const targetY = visibleWorkArea
      ? savedPosition.y
      : targetWorkArea.y + Math.round((targetWorkArea.height - height) / 2);
    state.x = clampPosition(
      targetX,
      targetWorkArea.x,
      targetWorkArea.x + targetWorkArea.width - width,
    );
    state.y = clampPosition(
      targetY,
      targetWorkArea.y,
      targetWorkArea.y + targetWorkArea.height - height,
    );
  }

  return state;
}

type WindowSizePersistenceTarget = Pick<
  BrowserWindow,
  "getNormalBounds" | "isDestroyed" | "isMaximized" | "on"
>;

export function attachDesktopWindowSizePersistence(
  win: WindowSizePersistenceTarget,
  save: (state: DesktopWindowSize) => Promise<void>,
  onSaveError: (error: unknown) => void = () => undefined,
): void {
  let persistTimer: ReturnType<typeof setTimeout> | null = null;

  const persistCurrentState = (): void => {
    if (win.isDestroyed()) return;

    // 最大化窗口的当前 bounds 等于显示器工作区，直接持久化会覆盖用户最后一次
    // 手动调整的普通窗口尺寸与位置。始终读取 normal bounds，并把 maximized 作为独立状态保存。
    const bounds = win.getNormalBounds();
    const state: DesktopWindowSize = {
      x: Math.floor(bounds.x),
      y: Math.floor(bounds.y),
      width: Math.max(MIN_DESKTOP_WINDOW_WIDTH, Math.floor(bounds.width)),
      height: Math.max(MIN_DESKTOP_WINDOW_HEIGHT, Math.floor(bounds.height)),
      maximized: win.isMaximized(),
    };
    void save(state).catch(onSaveError);
  };

  const clearPersistTimer = () => {
    if (persistTimer === null) return;
    clearTimeout(persistTimer);
    persistTimer = null;
  };
  const schedulePersist = (): void => {
    // resize/move 在 Linux 和部分 Windows 窗口管理器中会随拖拽高频触发；只保存稳定后的
    // 尺寸与位置，避免把与渲染帧同量级的写入堆进 setting.json 原子写队列。
    clearPersistTimer();
    persistTimer = setTimeout(() => {
      persistTimer = null;
      void persistCurrentState();
    }, WINDOW_SIZE_PERSIST_DEBOUNCE_MS);
  };
  const persistImmediately = (): void => {
    clearPersistTimer();
    persistCurrentState();
  };

  win.on("resize", schedulePersist);
  win.on("move", schedulePersist);
  win.on("maximize", persistImmediately);
  win.on("unmaximize", persistImmediately);
  // 退出屏障结束后 Electron 会再次触发 close；这里若启动异步设置写入，
  // 随后的 app.exit 可能在 releaseLock 完成前终止 Main，遗留 setting.json.lock。
  // close 只取消尚未触发的防抖，不再启动新的设置写入。
  win.on("close", clearPersistTimer);
}

// ---------------------------------------------------------------------------
// 辅助窗口定位
// ---------------------------------------------------------------------------
//
// 历史行为：关于、资源管理器、更新提示等辅助窗口不传 x / y 时由 Electron 按
// 显示器居中，`win.center()` 也按窗口当前所在显示器居中。用户把主窗口拖到屏幕
// 角落后，弹窗仍出现在屏幕正中，和触发它的应用窗口脱节。这里统一改为以应用主
// 窗口为锚点居中，并收敛到锚点所在显示器的工作区。
// 规格见 docs/desktop/auxiliary-window-placement.md。

interface AuxiliaryWindowSize {
  width: number;
  height: number;
}

interface AuxiliaryWindowPosition {
  x: number;
  y: number;
}

/** 只有 createBrowserWindow 创建、承载 workspace 的窗口才是弹窗锚点。 */
const applicationWindows = new Set<BrowserWindow>();
/** 无焦点窗口时（原生菜单、托盘、更新事件）回退到最近一次聚焦的主窗口。 */
let lastFocusedApplicationWindow: BrowserWindow | null = null;

function isUsableApplicationWindow(
  candidate: BrowserWindow | null | undefined,
): candidate is BrowserWindow {
  return Boolean(candidate && !candidate.isDestroyed());
}

/**
 * 登记应用主窗口。由 desktopWindowLifecycle 在 createBrowserWindow 之后调用；
 * 注册表自身处理窗口关闭，调用方不需要额外注销。
 */
export function registerDesktopApplicationWindow(win: BrowserWindow): void {
  applicationWindows.add(win);
  lastFocusedApplicationWindow ??= win;
  win.on("focus", () => {
    lastFocusedApplicationWindow = win;
  });
  win.once("closed", () => {
    applicationWindows.delete(win);
    if (lastFocusedApplicationWindow === win) {
      lastFocusedApplicationWindow = null;
    }
  });
}

/**
 * 解析弹窗锚点。显式传入的调用窗口优先；否则依次回退到聚焦主窗口、
 * 最近聚焦主窗口、任一存活主窗口。返回 undefined 时调用方保留系统默认放置。
 */
export function resolveDesktopDialogAnchor(
  preferredWindow?: BrowserWindow | null,
): BrowserWindow | undefined {
  if (isUsableApplicationWindow(preferredWindow)) {
    return preferredWindow;
  }

  const focusedWindow = BrowserWindow.getFocusedWindow();
  if (isUsableApplicationWindow(focusedWindow)) {
    if (applicationWindows.has(focusedWindow)) {
      return focusedWindow;
    }
    // 聚焦窗口可能是辅助窗口；优先回到它所属的主窗口，而不是以辅助窗口为锚点。
    const ownerWindow = focusedWindow.getParentWindow();
    if (isUsableApplicationWindow(ownerWindow)) {
      return ownerWindow;
    }
  }

  if (isUsableApplicationWindow(lastFocusedApplicationWindow)) {
    return lastFocusedApplicationWindow;
  }

  for (const candidate of applicationWindows) {
    if (isUsableApplicationWindow(candidate)) {
      return candidate;
    }
  }

  return undefined;
}

/** 把窗口居中到锚点，并按锚点所在显示器的工作区收敛。 */
function resolveCenteredWindowPosition(
  windowSize: AuxiliaryWindowSize,
  anchorBounds: Rectangle,
  workArea: Rectangle,
): AuxiliaryWindowPosition {
  const centeredX = Math.round(anchorBounds.x + (anchorBounds.width - windowSize.width) / 2);
  const centeredY = Math.round(anchorBounds.y + (anchorBounds.height - windowSize.height) / 2);
  return {
    x: clampWithinWorkArea(centeredX, workArea.x, workArea.width, windowSize.width),
    y: clampWithinWorkArea(centeredY, workArea.y, workArea.height, windowSize.height),
  };
}

function clampWithinWorkArea(
  offset: number,
  workAreaOffset: number,
  workAreaSize: number,
  windowSize: number,
): number {
  // 辅助窗口比工作区还大时没有可用的居中区间，从工作区左上角开始放置。
  const maximumOffset = workAreaOffset + workAreaSize - windowSize;
  return Math.min(Math.max(offset, workAreaOffset), Math.max(workAreaOffset, maximumOffset));
}

/**
 * 计算辅助窗口的初始位置，供 `new BrowserWindow({ ...position })` 使用。
 * 没有可用锚点时返回 undefined，保持 Electron 默认的显示器居中。
 */
export function resolveAuxiliaryWindowPosition(
  windowSize: AuxiliaryWindowSize,
  preferredWindow?: BrowserWindow | null,
): AuxiliaryWindowPosition | undefined {
  const anchor = resolveDesktopDialogAnchor(preferredWindow);
  if (!anchor) {
    return undefined;
  }
  const anchorBounds = anchor.getBounds();
  const workArea = screen.getDisplayMatching(anchorBounds).workArea;
  return resolveCenteredWindowPosition(windowSize, anchorBounds, workArea);
}

/**
 * 已创建窗口（更新状态窗在 show 前、强制升级提示在改高度后）重新居中。
 * 返回 false 表示没有锚点或平台由系统管理位置，调用方可回退到 `win.center()`。
 */
export function centerAuxiliaryWindowOverApplicationWindow(
  win: BrowserWindow,
  preferredWindow?: BrowserWindow | null,
): boolean {
  if (!isUsableApplicationWindow(win)) {
    return false;
  }
  // macOS 的 modal 子窗口以 sheet 形式贴附在父窗口上，位置由系统管理。
  if (process.platform === "darwin" && win.isModal() && win.getParentWindow()) {
    return false;
  }
  const bounds = win.getBounds();
  const position = resolveAuxiliaryWindowPosition(
    { width: bounds.width, height: bounds.height },
    preferredWindow,
  );
  if (!position) {
    return false;
  }
  win.setPosition(position.x, position.y);
  return true;
}
