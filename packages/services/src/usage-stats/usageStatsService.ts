import type {
  ApiClient,
  AppUsageRequest,
  AppUsageSnapshot,
  CodingPlanUsageRequest,
  CodingPlanUsageSnapshot,
  CodingPlanResetOpportunityRequest,
  CodingPlanResetOpportunityResult,
  CodingPlanResetScopeRequest,
  CodingPlanResetStatusSnapshot,
  CodingPlanResetUseRequest,
  CodingPlanResetUseResult,
  UsageEntitlementRequest,
  UsageEntitlementSnapshot,
  UsageStatsRequest,
  UsageStatsSnapshot,
} from "@zcode/shared";
import { isCodingPlanModelProviderId, providerSupportsBalanceQuery } from "@zcode/shared";
import type { ICredentialService } from "../credential/credential.js";
import type { IAccountRequestAuthService } from "../model-provider/accountRequestAuthService.js";
import type { IProviderSettingsService } from "../model-provider/providerFacadeServices.js";
import type { IZCodeAgentService } from "../zcode-agent/zcodeAgent.js";
import type { IUsageStatsService } from "./usageStats.js";
import {
  BigModelUsageQuotaProvider,
  type UsageApiAuthorizationRequest,
  type UsageApiAuthorization,
} from "./providers/bigmodelUsageQuotaProvider.js";
import { queryProviderBalance } from "./providers/providerBalanceRegistry.js";
import { buildProviderBalanceSnapshot } from "./providers/providerBalanceSupport.js";
import type { OfficialMcpCredentialSource } from "./providers/zcodeMcpQuotaProvider.js";

interface UsageStatsServiceDependencies {
  apiClient: ApiClient;
  accountRequestAuthService: Pick<
    IAccountRequestAuthService,
    "resolveAccessCurrent" | "resolveCurrent" | "assertCurrent"
  >;
  resolveApiAuthorization?: (
    request: UsageApiAuthorizationRequest,
  ) => Promise<UsageApiAuthorization | null>;
  credentialService?: Pick<ICredentialService, "load">;
  env?: NodeJS.ProcessEnv;
  /** App Usage 经 ZCode Protocol 读取 agent 数据库真实统计。 */
  zcodeAgentService: Pick<IZCodeAgentService, "getAppUsageStats">;
  /**
   * 官方 Server MCP 额度的凭证来源（与 server MCP 调用同一套 5 个身份头）。
   * 缺省时 entitlement 快照不含 MCP 额度。
   */
  officialMcpCredentialSource?: OfficialMcpCredentialSource;
  /**
   * 第三方 provider（DeepSeek / OpenCode Go）余量查询需要读该 provider 配置里的 API Key。
   * 缺省时这些 provider 一律回「未配置」，既有装配（含单测）行为不变。
   */
  providerSettingsService?: Pick<IProviderSettingsService, "getView">;
}

function isCodingPlanProviderId(providerId: string | undefined): boolean {
  return Boolean(providerId && isCodingPlanModelProviderId(providerId));
}

/**
 * 读取第三方 provider 余量查询所需的凭据与展示名。
 *
 * 只认普通 `api-key`：`zhipu-account` / `zhipu-coding-plan-api-key` 属于 GLM 账号体系，
 * 拿它们的凭据去请求第三方余额接口既语义错误，也会把账号 token 发给别的 host。
 * 读设置视图失败时用 `lookupFailed` 区分「确实没配」与「暂时读不到」——两者的用户文案不同。
 */
async function resolveProviderBalanceCredentials(
  providerSettingsService: Pick<IProviderSettingsService, "getView"> | undefined,
  providerId: string,
): Promise<{ apiKey: string | null; providerName: string | null; lookupFailed: boolean }> {
  if (!providerSettingsService) {
    return { apiKey: null, providerName: null, lookupFailed: true };
  }

  try {
    const view = await providerSettingsService.getView();
    const provider = view.providers.find((candidate) => candidate.providerId === providerId);
    if (!provider) {
      return { apiKey: null, providerName: null, lookupFailed: false };
    }
    const access = provider.effectiveConfig.access;
    const apiKey = access?.type === "api-key" ? (access.apiKey ?? null) : null;
    return { apiKey, providerName: provider.providerName ?? null, lookupFailed: false };
  } catch {
    return { apiKey: null, providerName: null, lookupFailed: true };
  }
}

export function createUsageStatsService(
  dependencies: UsageStatsServiceDependencies,
): IUsageStatsService {
  const quotaProvider = new BigModelUsageQuotaProvider({
    apiClient: dependencies.apiClient,
    accountRequestAuthService: dependencies.accountRequestAuthService,
    resolveApiAuthorization: dependencies.resolveApiAuthorization,
    credentialService: dependencies.credentialService,
    env: dependencies.env,
    ...(dependencies.officialMcpCredentialSource
      ? { officialMcpCredentialSource: dependencies.officialMcpCredentialSource }
      : {}),
  });

  return {
    async getAppUsageSnapshot(request: AppUsageRequest): Promise<AppUsageSnapshot> {
      // App Usage 现读取 agent 数据库真实统计（model_usage/turn_usage/tool_usage），
      // 经 ZCode Protocol usage/stats 取回。不再读本地 session JSON 估算。
      return dependencies.zcodeAgentService.getAppUsageStats({
        range: request.range,
        timeZone: request.timeZone,
      });
    },
    async getCodingPlanUsageSnapshot(
      request: CodingPlanUsageRequest,
    ): Promise<CodingPlanUsageSnapshot> {
      if (!isCodingPlanProviderId(request.preferredProviderId)) {
        // Coding Plan 页面只允许预置的 Z.AI/BigModel Coding Plan 账号。
        // 普通 provider id 不能进入 monitor 链路，避免误读 API Key 或环境变量。
        throw new Error("no_bigmodel_api_key");
      }
      return quotaProvider.getCodingPlanUsageSnapshot(request);
    },
    async getCodingPlanResetStatus(
      request: CodingPlanResetScopeRequest,
    ): Promise<CodingPlanResetStatusSnapshot> {
      if (!isCodingPlanProviderId(request.preferredProviderId)) {
        throw new Error("no_bigmodel_api_key");
      }
      return quotaProvider.getCodingPlanResetStatus(request);
    },
    async requestCodingPlanResetOpportunity(
      request: CodingPlanResetOpportunityRequest,
    ): Promise<CodingPlanResetOpportunityResult> {
      if (!isCodingPlanProviderId(request.preferredProviderId)) {
        throw new Error("no_bigmodel_api_key");
      }
      return quotaProvider.requestCodingPlanResetOpportunity(request);
    },
    async useCodingPlanReset(
      request: CodingPlanResetUseRequest,
    ): Promise<CodingPlanResetUseResult> {
      if (!isCodingPlanProviderId(request.preferredProviderId)) {
        throw new Error("no_bigmodel_api_key");
      }
      return quotaProvider.useCodingPlanReset(request);
    },
    async markCodingPlanResetHistoryRead(request: CodingPlanResetScopeRequest): Promise<void> {
      if (!isCodingPlanProviderId(request.preferredProviderId)) {
        throw new Error("no_bigmodel_api_key");
      }
      await quotaProvider.markCodingPlanResetHistoryRead(request);
    },
    async getSnapshot(request: UsageStatsRequest): Promise<UsageStatsSnapshot> {
      // App Usage 已迁移到 getAppUsageSnapshot（agent 数据库）。getSnapshot 仅服务 Coding Plan monitor 链路。
      // 任何 monitor 失败都不能回退本地数据，保持数据源隔离。
      return quotaProvider.getUsageStatsSnapshot(request);
    },
    async getEntitlementSnapshot(
      request: UsageEntitlementRequest = {},
    ): Promise<UsageEntitlementSnapshot> {
      const preferredProviderId = request.preferredProviderId?.trim();
      // 第三方 provider（DeepSeek / OpenCode Go）走独立的派发表：它们的鉴权是配置里的普通
      // API Key，与 GLM 的账号体系不共用；名单只有一份真相（shared 的 PROVIDER_BALANCE_SOURCES）。
      if (preferredProviderId && providerSupportsBalanceQuery(preferredProviderId)) {
        const credentials = await resolveProviderBalanceCredentials(
          dependencies.providerSettingsService,
          preferredProviderId,
        );
        if (credentials.lookupFailed) {
          return buildProviderBalanceSnapshot({
            providerId: preferredProviderId,
            providerName: credentials.providerName,
            authenticated: false,
            unavailableReason: "unavailable",
          });
        }
        return queryProviderBalance({
          apiClient: dependencies.apiClient,
          providerId: preferredProviderId,
          providerName: credentials.providerName,
          apiKey: credentials.apiKey,
        });
      }

      return quotaProvider.getSnapshotForRequest(request);
    },
  };
}
