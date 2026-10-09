import { useCallback, useState } from "react";
import { Loader2Icon, RefreshCwIcon } from "lucide-react";
import { Button } from "@/components/ui/button.js";
import { useProviderBalance } from "@/hooks/useProviderBalance.js";
import { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  hasProviderBalanceContent,
  resolveProviderBalanceUnavailableMessageKey,
} from "@/lib/providerBalancePresentation.js";
import { ProviderBalanceRows } from "@/provider-balance/ProviderBalanceRows.js";

/**
 * 模型设置 → 供应商详情里的「余量」区块。
 *
 * 交互是**点击才查**：打开供应商详情不发请求（翻供应商列表时连续请求既浪费也打扰），
 * 用户点「查询」才发。已有缓存快照时先把上次结果画出来，避免每次进来都像没查过。
 *
 * 样式对齐 `StartPlanBalanceCard`（`bg-card` 容器 + `bg-surface` 数值小卡），
 * 与 GLM 的套餐/余额卡放在一起时看不出是两套东西。
 */
export function ProviderBalanceSection({
  providerId,
  providerName,
}: {
  providerId: string;
  providerName: string | null | undefined;
}) {
  const { intl, locale } = useZCodeIntl();
  const { supported, snapshot, loading, refresh } = useProviderBalance({ providerId });
  const [querying, setQuerying] = useState(false);

  const handleQuery = useCallback(() => {
    setQuerying(true);
    void Promise.resolve(refresh({ force: true, reason: "manual" })).finally(() => {
      setQuerying(false);
    });
  }, [refresh]);

  if (!supported) {
    return null;
  }

  // 供应商可能还没起名（模板刚创建）；标题退回到 providerId，不留空标题。
  const displayName = providerName?.trim() || providerId;

  const busy = loading || querying;
  const hasContent = hasProviderBalanceContent(snapshot);
  const unavailableReason =
    snapshot && !hasContent ? (snapshot.unavailableReason ?? "unavailable") : undefined;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1">
        <div className="flex min-w-0 items-center gap-2">
          <h4 className="min-w-0 truncate text-ui-base font-medium text-foreground">
            {intl.formatMessage(
              { id: "settings.modelProvider.providerBalance.title" },
              { provider: displayName },
            )}
          </h4>
          {busy ? (
            <Loader2Icon className="size-3.5 shrink-0 animate-spin text-foreground-subtle" />
          ) : null}
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="shrink-0 gap-1"
          disabled={busy}
          onClick={handleQuery}
        >
          <RefreshCwIcon className="size-3" />
          {intl.formatMessage({ id: "settings.modelProvider.providerBalance.query" })}
        </Button>
      </div>

      <div className="mt-3">
        {hasContent ? (
          <ProviderBalanceRows snapshot={snapshot} intl={intl} locale={locale} layout="card" />
        ) : (
          <div className="text-ui-sm text-foreground-subtle">
            {intl.formatMessage({
              id: unavailableReason
                ? resolveProviderBalanceUnavailableMessageKey(unavailableReason)
                : "settings.modelProvider.providerBalance.idle",
            })}
          </div>
        )}
      </div>
    </section>
  );
}
