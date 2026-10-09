import type { UsageEntitlementSnapshot } from "@zcode/shared";
import { Loader2Icon } from "lucide-react";
import type { useZCodeIntl } from "@/i18n/IntlProvider.js";
import {
  hasProviderBalanceContent,
  resolveProviderBalanceUnavailableMessageKey,
} from "@/lib/providerBalancePresentation.js";
import { ProviderBalanceRows } from "@/provider-balance/ProviderBalanceRows.js";

export interface ChatProviderBalanceConfig {
  providerName: string;
  snapshot: UsageEntitlementSnapshot | null;
  loading: boolean;
  /** hover 触发的本次刷新 promise 进行中；静默刷新不置 loading，spinner 需要跟随它。 */
  refreshing?: boolean;
  /** hover 打开 context 面板时的静默 access 刷新（与 Start Plan / Coding Plan 段语义一致）。 */
  onAccess?: () => Promise<void> | void;
}

export function hasChatProviderBalance(config: ChatProviderBalanceConfig | undefined): boolean {
  if (!config) {
    return false;
  }
  return (
    config.loading ||
    hasProviderBalanceContent(config.snapshot) ||
    // 与 GLM 段同样的兜底：首次无快照时也要保留触发器，
    // 否则用户没有 hover 入口发起第一次查询，这一段就永远不出现。
    Boolean(config.onAccess)
  );
}

/**
 * 输入框上下文面板里的「余量」段（DeepSeek / OpenCode Go）。
 *
 * 与 GLM 的 Start Plan / Coding Plan 段并列渲染、同一套排版（见 ProviderBalanceRows 的 panel 布局）。
 * 与 GLM 段的差别只有一处：查询失败时**显示原因**而不是整段消失——用户已经点开面板了，
 * 静默消失会让人以为这个 provider 不支持余量查询。
 */
export function ChatProviderBalancePanel({
  config,
  intl,
  locale,
  separated = false,
}: {
  config: ChatProviderBalanceConfig;
  intl: ReturnType<typeof useZCodeIntl>["intl"];
  locale: string;
  separated?: boolean;
}) {
  const hasContent = hasProviderBalanceContent(config.snapshot);
  const busy = config.loading || config.refreshing === true;

  if (!busy && !hasContent && !config.snapshot) {
    return null;
  }

  return (
    <div className={separated ? "border-t border-border pt-2" : undefined}>
      <div className="mb-2 flex min-w-0 items-center gap-3">
        <div className="flex min-w-0 flex-1 items-center gap-1.5">
          <span className="min-w-0 truncate text-ui-base font-medium text-foreground">
            {intl.formatMessage(
              { id: "settings.modelProvider.providerBalance.title" },
              { provider: config.providerName },
            )}
          </span>
          {busy ? (
            <Loader2Icon className="size-3.5 shrink-0 animate-spin text-foreground-subtle" />
          ) : null}
        </div>
      </div>
      {hasContent ? (
        <ProviderBalanceRows
          snapshot={config.snapshot}
          intl={intl}
          locale={locale}
          layout="panel"
        />
      ) : (
        <div className="text-ui-sm text-foreground-subtle">
          {intl.formatMessage({
            id: resolveProviderBalanceUnavailableMessageKey(
              config.snapshot?.unavailableReason ?? "unavailable",
            ),
          })}
        </div>
      )}
    </div>
  );
}
