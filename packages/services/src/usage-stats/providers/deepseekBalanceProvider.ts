import type { ApiClient, UsageProviderMoneyBalance } from "@zcode/shared";
import { readApiJson } from "../../providers/api/apiJson.js";
import {
  asRecord,
  PROVIDER_BALANCE_TIMEOUT_MS,
  readTrimmedString,
} from "./providerBalanceSupport.js";

const DEEPSEEK_BALANCE_URL = "https://api.deepseek.com/user/balance";

/**
 * DeepSeek `GET /user/balance` → 归一化。
 *
 * 服务端可能同时下发多个币种（国际账号会带 USD），本产品只展示账户主币种（数组第一项）。
 * 金额一律按服务端原样字符串保留：`total_balance` 是十进制字符串，转 Number 再格式化会引入
 * 浮点误差，而这是钱。
 */
export function normalizeDeepSeekBalance(payload: unknown): UsageProviderMoneyBalance | null {
  const record = asRecord(payload);
  if (!record) {
    return null;
  }

  const infos = Array.isArray(record.balance_infos) ? record.balance_infos : [];
  const primary = infos.map(asRecord).find((info) => info !== null);
  if (!primary) {
    return null;
  }

  const total = readTrimmedString(primary.total_balance);
  const currency = readTrimmedString(primary.currency);
  if (!total || !currency) {
    // 缺总额或币种就没有可展示的余额；不拿赠金/充值拼一个近似值。
    return null;
  }

  const granted = readTrimmedString(primary.granted_balance);
  const toppedUp = readTrimmedString(primary.topped_up_balance);

  return {
    currency: currency.toUpperCase(),
    total,
    ...(granted ? { granted } : {}),
    ...(toppedUp ? { toppedUp } : {}),
    // 服务端只在明确不可用时下发 false；缺字段按可用处理。
    isAvailable: record.is_available !== false,
  };
}

export async function fetchDeepSeekBalance(input: {
  apiClient: ApiClient;
  apiKey: string;
}): Promise<UsageProviderMoneyBalance | null> {
  const payload = await readApiJson<unknown>(input.apiClient, DEEPSEEK_BALANCE_URL, {
    headers: {
      Authorization: `Bearer ${input.apiKey}`,
      Accept: "application/json",
    },
    timeoutMs: PROVIDER_BALANCE_TIMEOUT_MS,
    // 余额接口不应重定向；跟随重定向会把带凭据的请求交给别的 host。
    redirect: "manual",
  });
  return normalizeDeepSeekBalance(payload);
}
