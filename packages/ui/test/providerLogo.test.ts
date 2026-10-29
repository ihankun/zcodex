// @vitest-environment jsdom

import { createElement, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { act, fireEvent, render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import {
  ProviderLogo,
  resolveBuiltinProviderLogoAsset,
} from "@/settings/model-provider-section/ProviderLogo.js";
import { StoreContext } from "@/store/StoreProvider.js";
import type { ZCodeState, ZCodeStore } from "@/store/index.js";

function createThemeStore(initialTheme: ZCodeState["theme"]) {
  let state = { theme: initialTheme } as ZCodeState;
  const listeners = new Set<() => void>();
  const store = {
    getState: () => state,
    subscribe: (listener: () => void) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setState: (patch: Partial<ZCodeState>) => {
      state = { ...state, ...patch };
      for (const listener of listeners) listener();
    },
  } as unknown as ZCodeStore;
  return {
    store,
    setTheme: (theme: ZCodeState["theme"]) =>
      (store as unknown as { setState: (patch: Partial<ZCodeState>) => void }).setState({ theme }),
  };
}

function renderWithThemeStore(store: ZCodeStore, children: ReactNode) {
  return render(createElement(StoreContext.Provider, { value: store }, children));
}

describe("ProviderLogo", () => {
  it("解析已知资源，并让未知或缺失 key 回退通用图标", () => {
    expect(resolveBuiltinProviderLogoAsset({ type: "builtin", key: "deepseek" }, "light")).not.toBe(
      resolveBuiltinProviderLogoAsset({ type: "builtin", key: "deepseek" }, "dark"),
    );
    expect(resolveBuiltinProviderLogoAsset({ type: "builtin", key: "future-brand" }, "light")).toBe(
      null,
    );
    expect(resolveBuiltinProviderLogoAsset(undefined, "light")).toBe(null);

    const known = renderToStaticMarkup(
      createElement(ProviderLogo, {
        logo: { type: "builtin", key: "deepseek" },
        className: "size-5",
      }),
    );
    const unknown = renderToStaticMarkup(
      createElement(ProviderLogo, {
        logo: { type: "builtin", key: "future-brand" },
        className: "size-5",
      }),
    );
    expect(known).toContain("<img");
    expect(known).toContain('alt=""');
    expect(unknown).toContain("lucide-package");
  });

  it("打包资源加载失败时回退通用图标", () => {
    const { container } = render(
      createElement(ProviderLogo, {
        logo: { type: "builtin", key: "deepseek" },
        className: "size-5",
      }),
    );
    const image = container.querySelector("img");
    expect(image).not.toBeNull();

    fireEvent.error(image!);

    expect(container.querySelector(".lucide-package")).not.toBeNull();
  });

  it("store 主题切换后重新解析深浅资源", () => {
    const { store, setTheme } = createThemeStore("zai-dark");
    const { container } = renderWithThemeStore(
      store,
      createElement(ProviderLogo, {
        logo: { type: "builtin", key: "openrouter" },
        className: "size-4",
      }),
    );
    const darkSrc = container.querySelector("img")?.getAttribute("src");
    expect(darkSrc).not.toBeNull();

    act(() => setTheme("zai-light"));

    expect(container.querySelector("img")?.getAttribute("src")).not.toBe(darkSrc);
  });

  it("跟随系统时响应系统深浅主题变化", () => {
    let dark = true;
    const listeners = new Set<() => void>();
    const originalMatchMedia = window.matchMedia;
    window.matchMedia = ((query: string) => ({
      matches: query.includes("prefers-color-scheme: dark") ? dark : false,
      media: query,
      onchange: null,
      addEventListener: (_: string, listener: () => void) => listeners.add(listener),
      removeEventListener: (_: string, listener: () => void) => listeners.delete(listener),
      addListener: (listener: () => void) => listeners.add(listener),
      removeListener: (listener: () => void) => listeners.delete(listener),
      dispatchEvent: () => false,
    })) as unknown as typeof window.matchMedia;

    try {
      const { store } = createThemeStore("system");
      const { container } = renderWithThemeStore(
        store,
        createElement(ProviderLogo, {
          logo: { type: "builtin", key: "openrouter" },
          className: "size-4",
        }),
      );
      const darkSrc = container.querySelector("img")?.getAttribute("src");
      expect(darkSrc).not.toBeNull();

      act(() => {
        dark = false;
        for (const listener of listeners) listener();
      });

      expect(container.querySelector("img")?.getAttribute("src")).not.toBe(darkSrc);
    } finally {
      window.matchMedia = originalMatchMedia;
    }
  });
});
