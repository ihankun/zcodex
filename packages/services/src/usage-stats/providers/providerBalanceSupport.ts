import { ApiError, type UsageEntitlementSnapshot, type UsageQuotaSnapshot } from "@zcode/shared";
import type { UsageProviderMoneyBalance } from "@zcode/shared";

/**
 * 第三方余量查询的超时。与 GLM 侧 billing 请求同量级：设置页卡片与 composer 浮层都不能
 * 被一次慢请求拖住，宁可报「暂时无法查询余量」。
 */
export const PROVIDER_BALANCE_TIMEOUT_MS = 7_000;

export type ProviderBalanceUnavailableReason =
  | "not_authenticated"
  | "not_configured"
  | "no_plan"
  | "unavailable";

/**
 * 组装第三方 provider 的 entitlement 快照。
 *
 * 只填与余量有关的字段：`remaining` / `subscription` 是 GLM 套餐语义，这里恒为 null，
 * 避免展示端把两种口径混起来。`provider.id` 必须等于请求的 providerId——UI 用它做归属校验，
 * 防止切换 provider 后把上一家的余量画到新 provider 名下。
 */
export function buildProviderBalanceSnapshot(input: {
  providerId: string;
  providerName: string | null;
  authenticated: boolean;
  unavailableReason?: ProviderBalanceUnavailableReason;
  quota?: UsageQuotaSnapshot | null;
  balance?: UsageProviderMoneyBalance | null;
}): UsageEntitlementSnapshot {
  return {
    generatedAt: Date.now(),
    authenticated: input.authenticated,
    ...(input.unavailableReason ? { unavailableReason: input.unavailableReason } : {}),
    provider: {
      id: input.providerId,
      name: input.providerName?.trim() || input.providerId,
    },
    remaining: null,
    subscription: null,
    quota: input.quota ?? null,
    balance: input.balance ?? null,
  };
}

/**
 * HTTP 失败 → 展示用原因。
 *
 * 只回原因、不回服务端原文：UI 按原因映射固定文案（见 spec 的错误表），
 * 既避免把可能含凭据的响应正文带到界面上，也让文案可控。
 */
export function resolveProviderBalanceFailureReason(
  error: unknown,
): ProviderBalanceUnavailableReason {
  if (error instanceof ApiError) {
    if (error.status === 401) {
      return "not_authenticated";
    }
    if (error.status === 403) {
      return "no_plan";
    }
  }
  return "unavailable";
}

export function asRecord(value: unknown): Record<string, unknown> | null {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** 服务端数值/字符串统一读成去空白的字符串；金额一律保留原样，不做数值运算。 */
export function readTrimmedString(value: unknown): string | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return String(value);
  }
  if (typeof value !== "string") {
    return undefined;
  }
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

export function readFiniteNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) {
    return value;
  }
  if (typeof value === "string") {
    const parsed = Number(value.trim());
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

/** ISO 时间串 → 毫秒；非法或缺失一律 undefined（展示端据此省略重置时间，不猜时间）。 */
export function readIsoTimestampMs(value: unknown): number | undefined {
  const text = readTrimmedString(value);
  if (!text) {
    return undefined;
  }
  const parsed = Date.parse(text);
  return Number.isFinite(parsed) ? parsed : undefined;
}
