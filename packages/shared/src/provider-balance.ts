/**
 * 支持「余量查询」的 provider 名单——单一真相源。
 *
 * services 侧的 quota provider 派发与 UI 侧的门控都读这里，避免两处各写一份名单后不同步。
 * 新增一个 provider 只需要改这里（外加对应的 provider 实现）。
 *
 * 注意 providerId 是配置里的 id：模板创建的 provider 沿用 templateId
 * （例如内置模板 `deepseek` / `opencode-go-chat`）。
 */

export type ProviderBalanceKind =
  /** 金额余额（币种 + 总额，可能有赠金/充值分项）。 */
  | "money"
  /** 按时间窗口的用量百分比（5 小时 / 1 周 / 1 月）。 */
  | "usage-windows";

export interface ProviderBalanceSource {
  readonly providerId: string;
  readonly kind: ProviderBalanceKind;
}

/**
 * OpenCode Go 的三种 API 形态（chat / messages / responses）是同一个服务的不同协议，
 * 共用同一个用量端点，因此都算支持。
 *
 * OpenCode Zen（`opencode-zen-*`）**不在名单内**：其用量端点未经验证，宁可不显示余量段，
 * 也不要显示一个必然失败的错误。
 */
const OPENCODE_GO_PROVIDER_IDS = [
  "opencode-go-chat",
  "opencode-go-messages",
  "opencode-go-responses",
] as const;

export const PROVIDER_BALANCE_SOURCES: readonly ProviderBalanceSource[] = [
  { providerId: "deepseek", kind: "money" },
  ...OPENCODE_GO_PROVIDER_IDS.map((providerId) => ({
    providerId,
    kind: "usage-windows" as const,
  })),
];

export function resolveProviderBalanceSource(
  providerId: string | null | undefined,
): ProviderBalanceSource | undefined {
  const normalized = providerId?.trim();
  if (!normalized) {
    return undefined;
  }
  return PROVIDER_BALANCE_SOURCES.find((source) => source.providerId === normalized);
}

export function providerSupportsBalanceQuery(providerId: string | null | undefined): boolean {
  return resolveProviderBalanceSource(providerId) !== undefined;
}
