import assert from "node:assert/strict";
import { test } from "vitest";
import { ApiError, PROVIDER_USAGE_WINDOW_LIMIT_TYPE } from "@zcode/shared";
import { normalizeDeepSeekBalance } from "../src/usage-stats/providers/deepseekBalanceProvider.js";
import { normalizeOpenCodeGoUsage } from "../src/usage-stats/providers/openCodeGoUsageProvider.js";
import { resolveProviderBalanceFailureReason } from "../src/usage-stats/providers/providerBalanceSupport.js";

test("DeepSeek balance keeps the server amount string and the granted/topped-up split", () => {
  assert.deepEqual(
    normalizeDeepSeekBalance({
      is_available: true,
      balance_infos: [
        {
          currency: "cny",
          total_balance: "110.00",
          granted_balance: "10.00",
          topped_up_balance: "100.00",
        },
      ],
    }),
    {
      currency: "CNY",
      total: "110.00",
      granted: "10.00",
      toppedUp: "100.00",
      isAvailable: true,
    },
  );
});

test("DeepSeek balance takes the primary currency and drops absent optional parts", () => {
  assert.deepEqual(
    normalizeDeepSeekBalance({
      balance_infos: [
        { currency: "USD", total_balance: "7.5" },
        { currency: "CNY", total_balance: "50" },
      ],
    }),
    { currency: "USD", total: "7.5", isAvailable: true },
  );
});

test("DeepSeek balance reports unavailable accounts and rejects unusable payloads", () => {
  assert.equal(
    normalizeDeepSeekBalance({
      is_available: false,
      balance_infos: [{ currency: "CNY", total_balance: "0" }],
    })?.isAvailable,
    false,
  );
  // 缺总额或币种、或结构完全不同时返回 null，由调用方报「不可用」而不是编一个 0。
  assert.equal(normalizeDeepSeekBalance({ balance_infos: [{ currency: "CNY" }] }), null);
  assert.equal(normalizeDeepSeekBalance({ balance_infos: [] }), null);
  assert.equal(normalizeDeepSeekBalance({}), null);
  assert.equal(normalizeDeepSeekBalance(null), null);
});

test("OpenCode Go usage maps the three windows to quota limits with used-percentage semantics", () => {
  const limits = normalizeOpenCodeGoUsage({
    usage: {
      rolling: { status: "ok", percent: 12, resetsAt: "2026-08-14T12:00:00.000Z" },
      weekly: { status: "ok", percent: 36, resetsAt: "2026-08-16T00:00:00.000Z" },
      monthly: { status: "rate-limited", percent: 64, resetsAt: "2026-09-01T00:00:00.000Z" },
    },
  });

  assert.deepEqual(
    limits.map((limit) => [limit.type, limit.period, limit.percentage, limit.remaining]),
    [
      [PROVIDER_USAGE_WINDOW_LIMIT_TYPE, "rolling", 12, 88],
      [PROVIDER_USAGE_WINDOW_LIMIT_TYPE, "weekly", 36, 64],
      [PROVIDER_USAGE_WINDOW_LIMIT_TYPE, "monthly", 64, 36],
    ],
  );
  // percentage 是「已使用占比」，展示端反转成剩余；总额度编码为 100 个单位。
  assert.equal(limits[0]?.number, 100);
  assert.equal(limits[0]?.nextResetTime, Date.parse("2026-08-14T12:00:00.000Z"));
  assert.deepEqual(limits[0]?.usageDetails, []);
});

test("OpenCode Go usage clamps out-of-range percentages and skips broken windows", () => {
  const limits = normalizeOpenCodeGoUsage({
    usage: {
      rolling: { percent: 120, resetsAt: "not-a-date" },
      weekly: { percent: -5 },
      monthly: { percent: "abc" },
    },
  });

  assert.equal(limits.length, 2);
  assert.deepEqual(
    limits.map((limit) => [limit.period, limit.percentage, limit.remaining]),
    [
      ["rolling", 100, 0],
      ["weekly", 0, 100],
    ],
  );
  // 非法 resetsAt 不猜时间：整行省略重置时间，而不是显示 Invalid Date。
  assert.equal(limits[0]?.nextResetTime, undefined);
  assert.equal(normalizeOpenCodeGoUsage({}).length, 0);
  assert.equal(normalizeOpenCodeGoUsage({ usage: {} }).length, 0);
});

test("provider balance failures map to user-facing reasons without leaking server text", () => {
  const apiError = (status: number) =>
    new ApiError({ message: "server said something", url: "https://example.test", status });

  assert.equal(resolveProviderBalanceFailureReason(apiError(401)), "not_authenticated");
  assert.equal(resolveProviderBalanceFailureReason(apiError(403)), "no_plan");
  assert.equal(resolveProviderBalanceFailureReason(apiError(500)), "unavailable");
  assert.equal(resolveProviderBalanceFailureReason(new Error("network down")), "unavailable");
});
