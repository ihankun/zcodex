import assert from "node:assert/strict";
import { test } from "vitest";
import { PROVIDER_USAGE_WINDOW_LIMIT_TYPE, type UsageEntitlementSnapshot } from "@zcode/shared";
import {
  formatProviderBalanceAmount,
  hasProviderBalanceContent,
  isZeroProviderBalanceAmount,
  readProviderBalanceWindowLimits,
  resolveProviderBalanceMoneyRows,
  resolveProviderBalanceUnavailableMessageKey,
  resolveProviderBalanceWindowLabelKey,
} from "../src/lib/providerBalancePresentation.js";

function snapshotWithLimits(limits: UsageEntitlementSnapshot["quota"]): UsageEntitlementSnapshot {
  return {
    generatedAt: 0,
    authenticated: true,
    provider: { id: "opencode-go-chat", name: "OpenCode Go" },
    remaining: null,
    subscription: null,
    quota: limits,
    balance: null,
  };
}

test("provider balance amounts use the known currency symbol and fall back to the code", () => {
  assert.equal(formatProviderBalanceAmount("CNY", "110.00"), "¥110.00");
  assert.equal(formatProviderBalanceAmount("usd", "7.50"), "$7.50");
  // 未知币种不猜符号，回退成 `CODE 金额`。
  assert.equal(formatProviderBalanceAmount("JPY", "1200"), "JPY 1200");
});

test("provider balance window labels reuse the GLM 5h/1w copy and add 1m", () => {
  assert.equal(
    resolveProviderBalanceWindowLabelKey("rolling"),
    "settings.modelProvider.planCard.usage.fiveHour",
  );
  assert.equal(
    resolveProviderBalanceWindowLabelKey("weekly"),
    "settings.modelProvider.planCard.usage.week",
  );
  assert.equal(
    resolveProviderBalanceWindowLabelKey("monthly"),
    "settings.modelProvider.planCard.usage.month",
  );
});

test("provider balance windows are read by type so GLM limits never leak into the section", () => {
  const snapshot = snapshotWithLimits({
    level: null,
    limits: [
      { type: "TOKENS_LIMIT", number: 100, remaining: 40, usageDetails: [] },
      {
        type: PROVIDER_USAGE_WINDOW_LIMIT_TYPE,
        period: "rolling",
        number: 100,
        remaining: 88,
        percentage: 12,
        usageDetails: [],
      },
      // 类型对但 period 不是窗口身份：同样不认，避免把别家的额度画成 5h。
      { type: PROVIDER_USAGE_WINDOW_LIMIT_TYPE, period: "custom", usageDetails: [] },
    ],
  });

  assert.deepEqual(
    readProviderBalanceWindowLimits(snapshot).map((limit) => limit.period),
    ["rolling"],
  );
});

test("provider balance content requires a money balance or window limits", () => {
  assert.equal(hasProviderBalanceContent(null), false);
  assert.equal(hasProviderBalanceContent(snapshotWithLimits(null)), false);
  assert.equal(hasProviderBalanceContent(snapshotWithLimits({ level: null, limits: [] })), false);
  assert.equal(
    hasProviderBalanceContent(
      snapshotWithLimits({ level: null, limits: [{ type: "TOKENS_LIMIT", usageDetails: [] }] }),
    ),
    false,
  );
  assert.equal(
    hasProviderBalanceContent(
      snapshotWithLimits({
        level: null,
        limits: [{ type: PROVIDER_USAGE_WINDOW_LIMIT_TYPE, period: "weekly", usageDetails: [] }],
      }),
    ),
    true,
  );
  assert.equal(
    hasProviderBalanceContent({
      ...snapshotWithLimits(null),
      balance: { currency: "CNY", total: "1", isAvailable: true },
    }),
    true,
  );
});

test("provider balance unavailable reasons map to fixed copy", () => {
  assert.equal(
    resolveProviderBalanceUnavailableMessageKey("not_configured"),
    "settings.modelProvider.providerBalance.unavailable.notConfigured",
  );
  assert.equal(
    resolveProviderBalanceUnavailableMessageKey("not_authenticated"),
    "settings.modelProvider.providerBalance.unavailable.notAuthenticated",
  );
  assert.equal(
    resolveProviderBalanceUnavailableMessageKey("no_plan"),
    "settings.modelProvider.providerBalance.unavailable.noPlan",
  );
  assert.equal(
    resolveProviderBalanceUnavailableMessageKey(undefined),
    "settings.modelProvider.providerBalance.unavailable.generic",
  );
});

test("zero grant amounts are detected by string form, without float parsing", () => {
  // 缺失/空串按 0 处理（服务端没给这个分项）。
  assert.equal(isZeroProviderBalanceAmount(undefined), true);
  assert.equal(isZeroProviderBalanceAmount(null), true);
  assert.equal(isZeroProviderBalanceAmount(""), true);
  // 各种 0 的写法都算 0；带千分位也要认出来。
  assert.equal(isZeroProviderBalanceAmount("0"), true);
  assert.equal(isZeroProviderBalanceAmount("0.00"), true);
  assert.equal(isZeroProviderBalanceAmount("0.000"), true);
  assert.equal(isZeroProviderBalanceAmount("0,000.00"), true);
  // 非 0 不误判。
  assert.equal(isZeroProviderBalanceAmount("0.01"), false);
  assert.equal(isZeroProviderBalanceAmount("10.00"), false);
  assert.equal(isZeroProviderBalanceAmount("100"), false);
});

test("money rows collapse to the balance line when the grant is zero", () => {
  assert.deepEqual(
    resolveProviderBalanceMoneyRows({
      currency: "CNY",
      total: "110.00",
      granted: "0.00",
      toppedUp: "110.00",
      isAvailable: true,
    }).map((row) => row.key),
    ["total"],
  );
  // 服务端没给赠金时同理：没有赠金就没有「赠金 / 充值」的区分意义。
  assert.deepEqual(
    resolveProviderBalanceMoneyRows({
      currency: "CNY",
      total: "110.00",
      toppedUp: "110.00",
      isAvailable: true,
    }).map((row) => row.key),
    ["total"],
  );
});

test("money rows expand the grant/top-up breakdown only when the grant is non-zero", () => {
  const rows = resolveProviderBalanceMoneyRows({
    currency: "CNY",
    total: "110.00",
    granted: "10.00",
    toppedUp: "100.00",
    isAvailable: true,
  });
  assert.deepEqual(
    rows.map((row) => [row.key, row.value, row.emphasis === true]),
    [
      ["total", "¥110.00", true],
      ["granted", "¥10.00", false],
      ["toppedUp", "¥100.00", false],
    ],
  );

  // 赠金非 0 但充值缺失：只多一行赠金，不显示空的充值行。
  assert.deepEqual(
    resolveProviderBalanceMoneyRows({
      currency: "USD",
      total: "12.00",
      granted: "2.00",
      isAvailable: true,
    }).map((row) => [row.key, row.value]),
    [
      ["total", "$12.00"],
      ["granted", "$2.00"],
    ],
  );
});
