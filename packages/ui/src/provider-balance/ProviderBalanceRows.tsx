import type {
  ProviderUsageWindowPeriod,
  UsageEntitlementSnapshot,
  UsageProviderMoneyBalance,
  UsageQuotaLimit,
} from "@zcode/shared";
import { getContextQuotaMeterGridClass } from "@/chat-input-toolbar/contextQuotaMeterGrid.js";
import { cn } from "@/components/lib/utils.js";
import type { IntlInstance } from "@/i18n/IntlProvider.js";
import {
  formatQuotaRemainingPercentage,
  formatStartPlanBucketResetTime,
} from "@/lib/codingPlanQuotaPresentation.js";
import {
  formatProviderBalanceAmount,
  readProviderBalanceWindowLimits,
  resolveProviderBalanceWindowLabelKey,
} from "@/lib/providerBalancePresentation.js";

/**
 * 第三方 provider 余量的内容区，两个展示位共用。
 *
 * `layout` 不是风格偏好，而是**对齐各自展示位现有的 GLM 样式**：
 * - `panel`（composer 上下文浮层）：照 `ChatStartPlanBalanceMeter`——次要色标签行 + 等宽数值行 + 细额度条。
 * - `card`（模型设置供应商卡片）：照 `StartPlanBalanceCard` 的额度小卡——`bg-surface` 容器 + 大号数值 + 额度条。
 *
 * 两处都复用 GLM 的颜色与排版 token，用户切换供应商时看到的应当是同一套语言。
 */
export type ProviderBalanceLayout = "panel" | "card";

type IntlLike = Pick<IntlInstance, "formatMessage">;

function resolveRemainingRatio(limit: UsageQuotaLimit, locale: string): number {
  const remainingPercentage = formatQuotaRemainingPercentage(locale, limit);
  const parsed = Number.parseFloat(remainingPercentage);
  return Math.max(0, Math.min(1, (Number.isFinite(parsed) ? parsed : 0) / 100));
}

function ProviderBalanceWindowMeter({
  limit,
  intl,
  locale,
  layout,
}: {
  limit: UsageQuotaLimit;
  intl: IntlLike;
  locale: string;
  layout: ProviderBalanceLayout;
}) {
  const label = intl.formatMessage({
    id: resolveProviderBalanceWindowLabelKey(limit.period as ProviderUsageWindowPeriod),
  });
  const remainingPercentage = formatQuotaRemainingPercentage(locale, limit);
  const renewTime = formatStartPlanBucketResetTime(locale, limit.nextResetTime);
  const remainingRatio = resolveRemainingRatio(limit, locale);
  const bar = (
    <div
      className={cn(
        "overflow-hidden rounded-full",
        layout === "card" ? "mt-2 h-1.5 bg-secondary" : "h-1.5 bg-surface-hover",
      )}
    >
      <div
        className="h-full rounded-full bg-success transition-[width] duration-500 ease-out motion-reduce:transition-none"
        style={{ width: `${remainingRatio * 100}%` }}
      />
    </div>
  );

  if (layout === "card") {
    return (
      <div className="min-w-0 flex-1 rounded-lg bg-surface p-3">
        <div className="truncate text-ui-base font-medium text-foreground">{label}</div>
        <div className="mt-2 flex min-w-0 items-baseline justify-between gap-3">
          <span className="shrink-0 text-ui-lg font-semibold leading-none text-foreground">
            {remainingPercentage}
          </span>
          {renewTime ? (
            <span className="min-w-0 truncate text-right text-ui-xs text-foreground-subtle">
              {renewTime}
            </span>
          ) : null}
        </div>
        {bar}
      </div>
    );
  }

  return (
    <div className="min-w-0 space-y-1.5">
      <div className="min-w-0 space-y-0.5 text-ui-sm">
        <div className="min-w-0 truncate text-foreground-subtle">{label}</div>
        <div className="min-w-0 text-ui-sm tabular-nums">
          <span className="font-mono text-foreground">{remainingPercentage}</span>
          {renewTime ? <span className="text-foreground-subtle"> · {renewTime}</span> : null}
        </div>
      </div>
      {bar}
    </div>
  );
}

/**
 * 金额余额：标签 + 数值，赠金/充值作为次要明细列出。
 *
 * 金额**不画额度条**——没有「总额度」可言，画条会误导成「快用完了」。
 */
function ProviderBalanceMoneyRows({
  balance,
  intl,
  layout,
}: {
  balance: UsageProviderMoneyBalance;
  intl: IntlLike;
  layout: ProviderBalanceLayout;
}) {
  const rows: Array<{ key: string; labelKey: string; value: string; emphasis?: boolean }> = [
    {
      key: "total",
      labelKey: "settings.modelProvider.providerBalance.total",
      value: formatProviderBalanceAmount(balance.currency, balance.total),
      emphasis: true,
    },
  ];
  if (balance.granted) {
    rows.push({
      key: "granted",
      labelKey: "settings.modelProvider.providerBalance.granted",
      value: formatProviderBalanceAmount(balance.currency, balance.granted),
    });
  }
  if (balance.toppedUp) {
    rows.push({
      key: "toppedUp",
      labelKey: "settings.modelProvider.providerBalance.toppedUp",
      value: formatProviderBalanceAmount(balance.currency, balance.toppedUp),
    });
  }

  // 每项一行：标签在左、金额在右。金额是这里唯一的读数，拆成上下两行会让
  // 「余额 / 赠金 / 充值」三行变成六行，也让金额与它的标签在视觉上脱开。
  const rowLines = rows.map((row) => (
    <div key={row.key} className="flex min-w-0 items-baseline justify-between gap-3">
      <span
        className={cn(
          "shrink-0 text-foreground-subtle",
          row.emphasis ? "text-ui-sm" : "text-ui-xs",
        )}
      >
        {intl.formatMessage({ id: row.labelKey })}
      </span>
      <span
        className={cn(
          "min-w-0 truncate text-right font-mono tabular-nums",
          row.emphasis
            ? "text-ui-base font-semibold text-foreground"
            : "text-ui-xs text-foreground-subtle",
        )}
      >
        {row.value}
      </span>
    </div>
  ));

  const unavailableNote = balance.isAvailable ? null : (
    <div className="text-ui-xs text-warning">
      {intl.formatMessage({ id: "settings.modelProvider.providerBalance.accountUnavailable" })}
    </div>
  );

  const body = (
    <div className="min-w-0 space-y-1">
      {rowLines}
      {unavailableNote}
    </div>
  );

  if (layout === "card") {
    return <div className="min-w-0 flex-1 rounded-lg bg-surface p-3">{body}</div>;
  }

  return body;
}

export function ProviderBalanceRows({
  snapshot,
  intl,
  locale,
  layout,
}: {
  snapshot: UsageEntitlementSnapshot | null;
  intl: IntlLike;
  locale: string;
  layout: ProviderBalanceLayout;
}) {
  const windowLimits = readProviderBalanceWindowLimits(snapshot);
  if (windowLimits.length > 0) {
    if (layout === "card") {
      return (
        <div className="flex min-w-0 flex-wrap gap-2">
          {windowLimits.map((limit) => (
            <ProviderBalanceWindowMeter
              key={`${limit.type}:${limit.period ?? ""}`}
              limit={limit}
              intl={intl}
              locale={locale}
              layout={layout}
            />
          ))}
        </div>
      );
    }

    return (
      <div className={cn("grid gap-2", getContextQuotaMeterGridClass(windowLimits.length))}>
        {windowLimits.map((limit) => (
          <ProviderBalanceWindowMeter
            key={`${limit.type}:${limit.period ?? ""}`}
            limit={limit}
            intl={intl}
            locale={locale}
            layout={layout}
          />
        ))}
      </div>
    );
  }

  if (snapshot?.balance) {
    return <ProviderBalanceMoneyRows balance={snapshot.balance} intl={intl} layout={layout} />;
  }

  return null;
}
