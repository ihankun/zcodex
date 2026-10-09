/**
 * Coding Plan 额度相关的纯类型定义。
 *
 * 从 usage-stats.ts 拆出：MCP 额度接入后该文件超过 oxlint max-lines(400) 门禁，
 * 而额度是可以独立描述的一组类型（不依赖统计聚合结构），拆出后两边都在门禁内。
 * 这里只依赖自身，usage-stats.ts 单向导入并 re-export，不构成循环依赖。
 */

export interface UsageQuotaSnapshot {
  level: string | null;
  limits: UsageQuotaLimit[];
}

export interface UsageQuotaLimit {
  type: string;
  /** Start Plan 服务端额度桶及周期身份；周期时间为毫秒，供提醒去重。 */
  bucketId?: string;
  userPlanId?: string;
  periodStart?: number;
  periodEnd?: number;
  /** 所属 entitlement 的周期类型，如 daily / one_time。 */
  period?: string;
  meter?: string;
  unitType?: string;
  /** Start Plan bucket 所属套餐身份，仅用于设置页按 plan 分组展示。 */
  planId?: string;
  unit?: number;
  number?: number;
  usage?: number;
  currentValue?: number;
  remaining?: number;
  percentage?: number;
  nextResetTime?: number;
  usageDetails: UsageQuotaUsageDetail[];
}

export interface UsageQuotaUsageDetail {
  modelCode: string;
  displayName?: string;
  usage: number;
}

/**
 * `aggregate.type` 的合成值。
 *
 * 不复用 TOKENS_LIMIT / TIME_LIMIT：`isSameLimitCategory` 会把 TIME_LIMIT 判为工具额度同类，
 * 让 MCP 汇总额度被现有的 findCodingPlanQuotaLimit 查询误命中。
 */
export const MCP_USAGE_QUOTA_LIMIT_TYPE = "MCP_USAGE_LIMIT" as const;

/** MCP 额度所属的 Coding Plan 连接，供 UI 判断能否显示在当前 provider tab 下。 */
export type UsageMcpQuotaScope =
  | {
      providerFamily: "zai" | "bigmodel";
      targetType: "PERSONAL";
    }
  | {
      providerFamily: "zai" | "bigmodel";
      targetType: "TEAM";
      organizationId: string;
      projectId: string;
    };

export interface UsageMcpQuotaSnapshot {
  /** 服务端 server_time，毫秒（接口返回 Unix 秒）。 */
  serverTime: number;
  level: string | null;
  scope: UsageMcpQuotaScope;
  /**
   * 服务端 `total_usage`（总已用 / 总额度 / 总剩余）的等价表达，直接复用现有额度条 / 额度卡的
   * 展示逻辑。注意 percentage 沿用 quota 接口口径：**已使用占比**，展示端负责反转成剩余。
   */
  aggregate: UsageQuotaLimit;
}

/**
 * 第三方 provider（DeepSeek / OpenCode Go）按时间窗口下发的额度类型。
 *
 * 与 MCP 同样的理由不复用 TOKENS_LIMIT / TIME_LIMIT：那是 GLM 的额度分类，混用会被
 * `isSameLimitCategory` 与 `findCodingPlanQuotaLimit` 误命中。
 */
export const PROVIDER_USAGE_WINDOW_LIMIT_TYPE = "PROVIDER_USAGE_WINDOW_LIMIT" as const;

/** 窗口身份。展示端据此映射到「5h / 1w / 1m」文案，服务端返回的字段名见各 provider 实现。 */
export type ProviderUsageWindowPeriod = "rolling" | "weekly" | "monthly";

/**
 * 金额类余额（DeepSeek 等按充值金额计费的 provider）。
 *
 * 不塞进 `remaining` / `number` / `unit`：那套是 token / 次数语义，金额的**币种**与
 * 「赠金 / 充值」构成在里面无处安放。金额一律保留服务端原样字符串，展示端不做数值运算，
 * 避免浮点误差与币种混淆。
 */
export interface UsageProviderMoneyBalance {
  /** 服务端返回的币种代码，如 `CNY` / `USD`。 */
  currency: string;
  /** 可用总额（服务端原样字符串）。 */
  total: string;
  /** 赠金部分，服务端未提供时为 undefined。 */
  granted?: string;
  /** 充值部分，服务端未提供时为 undefined。 */
  toppedUp?: string;
  /** 服务端 `is_available`：false 表示账户当前不可用（余额仍可能返回）。 */
  isAvailable: boolean;
}
