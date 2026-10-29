/**
 * StoreProvider —— 初始化 Zustand store 并通过 React Context 提供
 *
 * 在应用根部挂载，连接 broadcastService 实现跨窗口状态同步。
 */
import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useSyncExternalStore,
  type ReactNode,
} from "react";
import { useStore } from "zustand";
import type { IBroadcastService } from "@zcode/services";
import { createZCodeStore, type ZCodeStore, type ZCodeState } from "./index.js";
import { resolveTheme, type ResolvedTheme, type Theme } from "../useTheme.js";

// 导出 Context 供测试直接注入已构造的 store 实例（如跨窗口广播抑制用例）。
export const StoreContext = createContext<ZCodeStore | null>(null);

export function StoreProvider({
  broadcastService,
  initialIsRestoringOAuthSession = false,
  children,
}: {
  broadcastService: IBroadcastService;
  initialIsRestoringOAuthSession?: boolean;
  children: ReactNode;
}) {
  // 只在首次渲染时创建 store，避免 HMR 重复订阅
  const storeRef = useRef<ZCodeStore | null>(null);
  if (!storeRef.current) {
    storeRef.current = createZCodeStore(broadcastService, {
      initialIsRestoringOAuthSession,
    });
  }

  return <StoreContext.Provider value={storeRef.current}>{children}</StoreContext.Provider>;
}

/**
 * 消费 Zustand store 的 hook
 *
 * 用法：
 *   const theme = useZCodeStore(s => s.theme);
 *   const setTheme = useZCodeStore(s => s.setTheme);
 */
export function useZCodeStore<T>(selector: (state: ZCodeState) => T): T {
  const store = useContext(StoreContext);
  if (!store) {
    throw new Error("useZCodeStore 必须在 StoreProvider 内使用");
  }
  return useStore(store, selector);
}

/**
 * 带默认值的容错版 useZCodeStore（store 耦合剥离配套）。
 *
 * 使用场景：宿主组件（PermissionDialog / 各 markdown 弹窗等）负责从 store 取
 * theme / codePreviewSettings，再通过 props 注入纯展示组件。这些宿主在单测里常被
 * 无 Provider 直接 renderToStaticMarkup，此时返回 defaultValue 而不是抛错，
 * 与「展示组件不触 store」的约束保持一致；真实应用 Root 必挂 StoreProvider，走真实值。
 *
 * 注意：selector 返回值与 defaultValue 都必须引用稳定，否则会造成无限重渲染。
 */
export function useZCodeStoreWithDefault<T>(
  selector: (state: ZCodeState) => T,
  defaultValue: T,
): T {
  const store = useContext(StoreContext);
  const subscribe = useCallback(
    (onStoreChange: () => void) => (store ? store.subscribe(onStoreChange) : () => {}),
    [store],
  );
  const getSnapshot = () => (store ? selector(store.getState()) : defaultValue);
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}

function subscribeSystemTheme(onChange: () => void): () => void {
  if (typeof window === "undefined" || typeof window.matchMedia !== "function") {
    return () => {};
  }

  const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");
  // 与 store 的 system 监听保持一致：部分 Electron / Chromium 组合只支持旧版 listener API。
  if (typeof mediaQuery.addEventListener === "function") {
    mediaQuery.addEventListener("change", onChange);
    return () => mediaQuery.removeEventListener("change", onChange);
  }
  mediaQuery.addListener(onChange);
  return () => mediaQuery.removeListener(onChange);
}

function subscribeNothing(): () => void {
  return () => {};
}

/**
 * 解析后的深浅主题。
 *
 * system 模式必须额外订阅系统偏好：applyTheme 只更新 DOM class，store.theme 仍是
 * "system"，单纯读 store 的展示组件不会重渲染，主题资源（如 Provider logo）会停留在
 * 切换前的那一份。
 */
export function useResolvedTheme(): ResolvedTheme {
  const theme: Theme = useZCodeStoreWithDefault((state) => state.theme, "zai-dark");
  const getSnapshot = () => resolveTheme(theme);
  return useSyncExternalStore(
    theme === "system" ? subscribeSystemTheme : subscribeNothing,
    getSnapshot,
    getSnapshot,
  );
}
