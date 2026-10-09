import {
  PROVIDER_USAGE_WINDOW_LIMIT_TYPE,
  type ProviderUsageWindowPeriod,
  type UsageEntitlementSnapshot,
  type UsageQuotaLimit,
} from "@zcode/shared";

/**
 * 窗口 → 文案 key。
 *
 * 复用 GLM plan card 已有的 5h / 1w 文案，保证「同一件事在两处说法一致」；
 * 1 月是本次新增的 key（GLM 侧只有 5h/1w 两个窗口）。
 */
const WINDOW_LABEL_KEYS: Record<ProviderUsageWindowPeriod, string> = {
  rolling: "settings.modelProvider.planCard.usage.fiveHour",
  weekly: "settings.modelProvider.planCard.usage.week",
  monthly: "settings.modelProvider.planCard.usage.month",
};

const WINDOW_PERIODS: readonly ProviderUsageWindowPeriod[] = ["rolling", "weekly", "monthly"];

function isProviderUsageWindowPeriod(value: unknown): value is ProviderUsageWindowPeriod {
  return typeof value === "string" && (WINDOW_PERIODS as readonly string[]).includes(value);
}

export function resolveProviderBalanceWindowLabelKey(period: ProviderUsageWindowPeriod): string {
  return WINDOW_LABEL_KEYS[period];
}

/**
 * 取出窗口型余量条目。
 *
 * 只认 `PROVIDER_USAGE_WINDOW_LIMIT_TYPE`：GLM 的 TOKENS/TIME 额度也在同一个 limits 数组里，
 * 按类型过滤可以避免把别家的额度画进这一段。
 */
export function readProviderBalanceWindowLimits(
  snapshot: UsageEntitlementSnapshot | null | undefined,
): UsageQuotaLimit[] {
  return (snapshot?.quota?.limits ?? []).filter(
    (limit) =>
      limit.type === PROVIDER_USAGE_WINDOW_LIMIT_TYPE && isProviderUsageWindowPeriod(limit.period),
  );
}

export function hasProviderBalanceContent(
  snapshot: UsageEntitlementSnapshot | null | undefined,
): boolean {
  return Boolean(snapshot?.balance) || readProviderBalanceWindowLimits(snapshot).length > 0;
}

/**
 * 金额展示：只映射已知币种符号，未知币种回退 `CODE 金额`。
 * 金额是服务端原样字符串，这里不做任何数值运算。
 */
export function formatProviderBalanceAmount(currency: string, amount: string): string {
  const code = currency.trim().toUpperCase();
  const symbol = code === "CNY" ? "¥" : code === "USD" ? "$" : undefined;
  return symbol ? `${symbol}${amount}` : `${code} ${amount}`;
}

/**
 * 不可用原因 → 文案 key。固定文案而不是回显服务端原文：既让措辞可控，
 * 也避免把可能含凭据的响应正文带到界面上。
 */
export function resolveProviderBalanceUnavailableMessageKey(reason: string | undefined): string {
  switch (reason) {
    case "not_configured":
      return "settings.modelProvider.providerBalance.unavailable.notConfigured";
    case "not_authenticated":
      return "settings.modelProvider.providerBalance.unavailable.notAuthenticated";
    case "no_plan":
      return "settings.modelProvider.providerBalance.unavailable.noPlan";
    default:
      return "settings.modelProvider.providerBalance.unavailable.generic";
  }
}
