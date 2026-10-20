import { useMemo } from "react";
import { providerSupportsBalanceQuery } from "@zcode/shared";
import { useUsageEntitlement } from "@/hooks/useUsageEntitlement.js";

export interface UseProviderBalanceOptions {
  providerId: string | null | undefined;
  /** 是否允许查询；供应商卡片用「点击才查」时为 true 但不开 refreshOnMount。 */
  enabled?: boolean;
  /** 进入即拉一次（composer 面板需要），供应商卡片保持 false 实现「点击再查」。 */
  refreshOnMount?: boolean;
}

/**
 * 第三方 provider（DeepSeek / OpenCode Go）的余量读取。
 *
 * 只做两件事：把 providerId 变成 `useUsageEntitlement` 的一次调用，并给出「这个 provider 是否支持」。
 * 缓存、跨组件 in-flight 合并、60s access 窗口、失败退避全部沿用 entitlement 既有策略——
 * 不新增第二份状态，也不在这里做任何请求节流。
 */
export function useProviderBalance(options: UseProviderBalanceOptions) {
  const providerId = options.providerId?.trim() ?? "";
  const supported = providerSupportsBalanceQuery(providerId);
  const enabled = supported && (options.enabled ?? true);

  const entitlement = useUsageEntitlement({
    enabled,
    preferredProviderId: supported ? providerId : undefined,
    // 余量查询用 provider 自己的 API Key，不依赖 ZCode 账号会话：
    // 上游登录门禁（requiresAccountSession 默认 true）不能作用到这条链路。
    requiresAccountSession: false,
    // 与 GLM 的 Coding Plan / Start Plan 分开缓存指纹：同一 provider 的余量快照独立缓存，
    // 切换 provider 时不会读到上一家的结果（hook 内部还会用 snapshot.provider.id 做归属校验）。
    cacheKey: supported ? `provider-balance:${providerId}` : undefined,
    refreshOnMount: options.refreshOnMount ?? false,
  });

  return useMemo(
    () => ({
      supported,
      snapshot: entitlement.snapshot,
      loading: entitlement.loading,
      error: entitlement.error,
      refresh: entitlement.refresh,
    }),
    [supported, entitlement.snapshot, entitlement.loading, entitlement.error, entitlement.refresh],
  );
}
