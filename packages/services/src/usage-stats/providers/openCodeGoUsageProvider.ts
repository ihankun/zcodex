import {
  PROVIDER_USAGE_WINDOW_LIMIT_TYPE,
  type ApiClient,
  type ProviderUsageWindowPeriod,
  type UsageQuotaLimit,
} from "@zcode/shared";
import { readApiJson } from "../../providers/api/apiJson.js";
import {
  asRecord,
  PROVIDER_BALANCE_TIMEOUT_MS,
  readFiniteNumber,
  readIsoTimestampMs,
} from "./providerBalanceSupport.js";

/** OpenCode Go 的三种 API 形态（chat / messages / responses）共用同一个用量端点。 */
const OPENCODE_GO_USAGE_URL = "https://opencode.ai/zen/go/v1/usage";

/** 服务端窗口字段 → 契约里的窗口身份。顺序即展示顺序（5h → 1w → 1m）。 */
const OPENCODE_GO_WINDOW_FIELDS: ReadonlyArray<{
  field: string;
  period: ProviderUsageWindowPeriod;
}> = [
  { field: "rolling", period: "rolling" },
  { field: "weekly", period: "weekly" },
  { field: "monthly", period: "monthly" },
];

/**
 * OpenCode Go `GET /zen/go/v1/usage` → 三个窗口的额度。
 *
 * 服务端的 `percent` 是**已使用**百分比（0-100），与 `UsageQuotaLimit.percentage` 的既有口径
 * 一致（quota 接口的 percentage 表示已使用，展示端反转成剩余），因此直接落进去，
 * 让 GLM 那套「剩余百分比 + 重置时间 + 额度条」的渲染器可以原样复用。
 *
 * 额度总量编码为 100 个单位：这类窗口只有百分比、没有绝对额度，用 100/100-percent 表达后
 * 现有渲染器算出的剩余比例与真实剩余完全一致。
 */
export function normalizeOpenCodeGoUsage(payload: unknown): UsageQuotaLimit[] {
  const usage = asRecord(asRecord(payload)?.usage);
  if (!usage) {
    return [];
  }

  const limits: UsageQuotaLimit[] = [];
  for (const { field, period } of OPENCODE_GO_WINDOW_FIELDS) {
    const window = asRecord(usage[field]);
    if (!window) {
      continue;
    }

    const percent = readFiniteNumber(window.percent);
    if (percent === undefined) {
      // 单个窗口缺失/异常只跳过它，不让另外两个窗口一起消失。
      continue;
    }

    const used = Math.max(0, Math.min(100, percent));
    const nextResetTime = readIsoTimestampMs(window.resetsAt);

    limits.push({
      type: PROVIDER_USAGE_WINDOW_LIMIT_TYPE,
      period,
      number: 100,
      remaining: 100 - used,
      percentage: used,
      ...(nextResetTime !== undefined ? { nextResetTime } : {}),
      // 窗口维度没有模型明细；窗口文案由 period 映射到 i18n，不走 usageDetails。
      usageDetails: [],
    });
  }

  return limits;
}

export async function fetchOpenCodeGoUsage(input: {
  apiClient: ApiClient;
  apiKey: string;
}): Promise<UsageQuotaLimit[]> {
  const payload = await readApiJson<unknown>(input.apiClient, OPENCODE_GO_USAGE_URL, {
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      // 官方客户端会同时带 x-api-key；服务端只读 Authorization，这里保持一致以兼容两套网关。
      "x-api-key": input.apiKey,
      Accept: "application/json",
    },
    timeoutMs: PROVIDER_BALANCE_TIMEOUT_MS,
    redirect: "manual",
  });
  return normalizeOpenCodeGoUsage(payload);
}
