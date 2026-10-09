import {
  resolveProviderBalanceSource,
  type ApiClient,
  type UsageEntitlementSnapshot,
} from "@zcode/shared";
import { fetchDeepSeekBalance } from "./deepseekBalanceProvider.js";
import { fetchOpenCodeGoUsage } from "./openCodeGoUsageProvider.js";
import {
  buildProviderBalanceSnapshot,
  resolveProviderBalanceFailureReason,
} from "./providerBalanceSupport.js";

export interface ProviderBalanceQueryInput {
  apiClient: ApiClient;
  providerId: string;
  providerName: string | null;
  /** 该 provider 配置里的 API Key；null 表示未配置——此时**不发请求**，直接回未配置。 */
  apiKey: string | null;
}

/**
 * 第三方余量查询的派发表：按 shared 的 `PROVIDER_BALANCE_SOURCES` 选实现。
 *
 * 用 kind 分派而不是给每个 provider 建一个类：两家只有「一次 GET + 归一化」这一种形态，
 * 没有需要共享的生命周期或缓存（缓存/去重/节流都在 entitlement 层），
 * 多一层类只会把调用链拉长。新增 provider 时在这里补一个 case，并在 shared 名单里登记。
 */
export async function queryProviderBalance(
  input: ProviderBalanceQueryInput,
): Promise<UsageEntitlementSnapshot> {
  const source = resolveProviderBalanceSource(input.providerId);
  const base = { providerId: input.providerId, providerName: input.providerName };

  if (!source) {
    // 调用方应先查名单；走到这里说明名单与派发表不一致，报不可用而不是猜一个实现。
    return buildProviderBalanceSnapshot({
      ...base,
      authenticated: false,
      unavailableReason: "unavailable",
    });
  }

  if (!input.apiKey) {
    return buildProviderBalanceSnapshot({
      ...base,
      authenticated: false,
      unavailableReason: "not_configured",
    });
  }

  try {
    switch (source.kind) {
      case "money": {
        const balance = await fetchDeepSeekBalance({
          apiClient: input.apiClient,
          apiKey: input.apiKey,
        });
        if (!balance) {
          return buildProviderBalanceSnapshot({
            ...base,
            authenticated: true,
            unavailableReason: "unavailable",
          });
        }
        return buildProviderBalanceSnapshot({ ...base, authenticated: true, balance });
      }
      case "usage-windows": {
        const limits = await fetchOpenCodeGoUsage({
          apiClient: input.apiClient,
          apiKey: input.apiKey,
        });
        if (limits.length === 0) {
          // 一个窗口都没解析出来说明响应结构变了；显示不可用，而不是显示三个 0%。
          return buildProviderBalanceSnapshot({
            ...base,
            authenticated: true,
            unavailableReason: "unavailable",
          });
        }
        return buildProviderBalanceSnapshot({
          ...base,
          authenticated: true,
          quota: { level: null, limits },
        });
      }
      default:
        return buildProviderBalanceSnapshot({
          ...base,
          authenticated: true,
          unavailableReason: "unavailable",
        });
    }
  } catch (error) {
    const reason = resolveProviderBalanceFailureReason(error);
    return buildProviderBalanceSnapshot({
      ...base,
      // 凭据无效时不再声称已认证，避免展示端把 401 当成「有额度但读不到」。
      authenticated: reason !== "not_authenticated" && reason !== "not_configured",
      unavailableReason: reason,
    });
  }
}
