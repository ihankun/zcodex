import {
  PROVIDER_USAGE_WINDOW_LIMIT_TYPE,
  type ProviderUsageWindowPeriod,
  type UsageEntitlementSnapshot,
  type UsageProviderMoneyBalance,
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

/**
 * 金额是否为 0。
 *
 * 按**字符串**判断而不是 `Number.parseFloat`：金额一律不做数值运算（见 `UsageProviderMoneyBalance`
 * 的注释），而且服务端给的是十进制字符串，转浮点再比 0 会引入不必要的误差面。
 * 判据：去掉小数点和千分位后，剩下的字符全是 `0`。空串或缺失视为 0（没有该分项）。
 */
export function isZeroProviderBalanceAmount(amount: string | null | undefined): boolean {
  const digits = amount?.replace(/[.,\s]/gu, "") ?? "";
  return digits.length === 0 || /^0+$/u.test(digits);
}

export interface ProviderBalanceMoneyRow {
  key: "total" | "granted" | "toppedUp";
  labelKey: string;
  value: string;
  /** 主行（余额）用更强排版，分项用次要样式。 */
  emphasis?: boolean;
}

/**
 * 金额余额要显示的行。
 *
 * 赠金为 0（或服务端没给赠金）时只显示「余额」一行：此时「赠金 / 充值」两个分项没有区分意义，
 * 两行 `0.00` 只会让读数变啰嗦。赠金非 0 才展开分项，充值缺失时只多一行赠金。
 */
export function resolveProviderBalanceMoneyRows(
  balance: UsageProviderMoneyBalance,
): ProviderBalanceMoneyRow[] {
  const rows: ProviderBalanceMoneyRow[] = [
    {
      key: "total",
      labelKey: "settings.modelProvider.providerBalance.total",
      value: formatProviderBalanceAmount(balance.currency, balance.total),
      emphasis: true,
    },
  ];

  if (isZeroProviderBalanceAmount(balance.granted)) {
    return rows;
  }

  const granted = balance.granted;
  if (!granted) {
    // isZeroProviderBalanceAmount 对缺失值返回 true，这里只是让类型收窄；逻辑上不可达。
    return rows;
  }

  rows.push({
    key: "granted",
    labelKey: "settings.modelProvider.providerBalance.granted",
    value: formatProviderBalanceAmount(balance.currency, granted),
  });
  if (balance.toppedUp) {
    rows.push({
      key: "toppedUp",
      labelKey: "settings.modelProvider.providerBalance.toppedUp",
      value: formatProviderBalanceAmount(balance.currency, balance.toppedUp),
    });
  }

  return rows;
}
