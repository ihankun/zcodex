# 供应商余量查询（DeepSeek / OpenCode Go）

> 状态：已评审，待实施。范围：第一期只做 DeepSeek 与 OpenCode Go，且只在这两处展示：
> 【模型设置 → 供应商卡片】与【输入框上下文用量面板】。

## 一、背景

当前 `UsageEntitlementSnapshot` 这条链路虽然契约是通用的，但实现只支持 GLM：服务层
`createUsageStatsService` 只实例化一个 `BigModelUsageQuotaProvider`，UI 侧的候选 provider 也写死为
`account:zai-*` / `account:bigmodel-*`。用户已配置的 `deepseek`、`opencode-go-chat` 两个 API-key
provider 在这两处看不到任何余量信息。

本期把「按 provider 选择余量来源」抽出来，先接两家。

## 二、产品规则

### 范围

| provider    | providerId                                                          | 形态                                 | 数据源                                      |
| ----------- | ------------------------------------------------------------------- | ------------------------------------ | ------------------------------------------- |
| DeepSeek    | `deepseek`                                                          | 金额余额（含赠金/充值分项）          | `GET https://api.deepseek.com/user/balance` |
| OpenCode Go | `opencode-go-chat`、`opencode-go-messages`、`opencode-go-responses` | 5 小时 / 1 周 / 1 月三窗口（百分比） | `GET https://opencode.ai/zen/go/v1/usage`   |

- **OpenCode Zen 不在本期范围**：`opencode-zen-*` 的余量端点未经验证，本期对它不显示余量段（不是显示错误）。
- providerId 等于 `templateId`（模板创建的 provider 直接沿用模板 id，已在用户配置里核实：
  `providerOrder: ["deepseek","opencode-go-chat"]`）。

### 展示位与交互

两处，视觉必须与现有 GLM 一致（复用同一套排版与颜色 token，不引入新样式语言）：

1. **模型设置 → 该 provider 的详情**：新增「余量」区块。**点击才查询**（区块内一个查询按钮），
   不随打开详情自动发请求——避免用户翻供应商列表时连续发请求。查询过一次后结果保留，
   再次点击重新查询。
2. **输入框上下文用量面板**：在现有 Start Plan「今日余额」段与 Coding Plan 余量段之后新增一段，
   只显示**当前模型所属 provider** 的余量。沿用 hover 静默刷新（60s access 窗口 + in-flight 合并 +
   失败退避），不新增轮询。

### 空态与错误（文案必须明确，不显示 0% 或 NaN）

| 情况                       | 展示                             |
| -------------------------- | -------------------------------- |
| 未配置 API Key             | 「未配置 API Key」且**不发请求** |
| 401 / key 无效             | 「API Key 无效」                 |
| 403（OpenCode 无 Go 订阅） | 「需要 OpenCode Go 订阅」        |
| 超时 / 网络失败            | 「暂时无法查询余量」             |
| 响应结构不认识             | 同上（不可用），不猜数值         |

### 非目标

- 不做 OpenCode Zen、不做其它第三方 provider（Kimi / MiniMax / OpenRouter 等留待第二期）。
- 不在侧栏常驻展示；不轮询；不把余量写进 store。
- 不改动 GLM（zai/bigmodel）现有行为与文案。

## 三、状态所有者与事件顺序

```
[用户点击供应商卡片「查询」 / hover 打开上下文面板]
        │
        ▼
useUsageEntitlement({ preferredProviderId })  ── 读本地缓存（cacheKey 含 providerId）──► 新鲜则直接渲染
        │ 未命中 / 过期 / 显式查询
        ▼
IUsageStatsService.getEntitlementSnapshot({ preferredProviderId })     ← 复用现有 RPC 通道，不新增
        ▼
usageStatsService: resolveQuotaProvider(providerId)                   ← 本期新增的派发表
        ├─ account:zai-* / account:bigmodel-* → BigModelUsageQuotaProvider（一行不动）
        ├─ deepseek                          → DeepSeekBalanceProvider
        └─ opencode-go-*                     → OpenCodeGoUsageProvider
        ▼
UsageEntitlementSnapshot（同一形状，新增可选 balance 段）
        ▼
两处展示位只做只读投影，各自不再发请求
```

**所有者与边界**

- **远端事实**归 `IUsageStatsService.getEntitlementSnapshot` 唯一产出。
- **UI 缓存 / 去重 / 刷新节流**归 `useUsageEntitlement`（已有，不新增第二份状态）。
- **provider 名单只有一份真相**：`packages/shared` 的 `PROVIDER_BALANCE_SOURCES`；
  services 的派发表与 UI 的门控都读它，避免两处各写一份名单。
- **幂等边界**：同一 provider 的查询可重复执行且结果等价；快照里的 `provider.id` 必须等于请求的
  `preferredProviderId`，UI 侧用 `snapshot.provider?.id === providerId` 做归属校验（沿用现有做法）。

## 四、接口

### 契约新增（`packages/shared`）

```ts
// usage-quota.ts
export const PROVIDER_USAGE_WINDOW_LIMIT_TYPE = "PROVIDER_USAGE_WINDOW_LIMIT" as const;
export type ProviderUsageWindowPeriod = "rolling" | "weekly" | "monthly";

// usage-stats.ts
export interface UsageProviderMoneyBalance {
  currency: string;   // CNY / USD
  total: string;      // 服务端原样字符串，避免浮点误差
  granted?: string;   // 赠金
  toppedUp?: string;  // 充值
  isAvailable: boolean;
}
// UsageEntitlementSnapshot 增加：
balance?: UsageProviderMoneyBalance | null;
```

- **OpenCode 三窗口**复用 `UsageQuotaSnapshot.limits[]`，一个窗口一条 `UsageQuotaLimit`：
  `type: PROVIDER_USAGE_WINDOW_LIMIT_TYPE`、`period: rolling|weekly|monthly`、
  `percentage: <已用 0-100>`（沿用既有「percentage = 已使用占比，展示端反转」的约定）、
  `nextResetTime: Date.parse(resetsAt)`（毫秒）、`number: 100`、`remaining: 100 - percent`。
  不用 `usageDetails`（无模型维度），窗口文案由 `period` 映射到 i18n。
- **DeepSeek 金额**用新的 `balance` 段承载，不塞进 `remaining`（那是 token/次数语义）。

### 服务层（实施落点）

- `providers/providerBalanceRegistry.ts`：`queryProviderBalance()` 按 shared 名单的 `kind` 分派。
  用 kind 分派而不是给每家建一个类：两家只有「一次 GET + 归一化」这一种形态，
  没有需要共享的生命周期（缓存/去重/节流都在 entitlement 层），多一层类只会拉长调用链。
  未命中名单时返回不可用快照，**不再抛 `no_bigmodel_api_key`**。
- `providers/deepseekBalanceProvider.ts`（`normalizeDeepSeekBalance` + `fetchDeepSeekBalance`）
  与 `providers/openCodeGoUsageProvider.ts`（`normalizeOpenCodeGoUsage` + `fetchOpenCodeGoUsage`）：
  归一化是导出的纯函数，单测直接覆盖，不需要网络。
- `providers/providerBalanceSupport.ts`：快照组装（`buildProviderBalanceSnapshot`，保证
  `provider.id` 等于请求的 providerId）、HTTP 失败 → 展示原因（`resolveProviderBalanceFailureReason`）、
  以及 `asRecord` / `readTrimmedString` / `readFiniteNumber` / `readIsoTimestampMs` 读取助手。
- 鉴权：`usageStatsService` 从 `IProviderSettingsService.getView()` 取该 provider 的
  `effectiveConfig.access.apiKey`，且**只认 `access.type === "api-key"`**——`zhipu-account` /
  `zhipu-coding-plan-api-key` 属于 GLM 账号体系，拿它们的凭据请求第三方接口既语义错误、
  也会把账号 token 发到别的 host。缺 key 时不发请求，直接 `not_configured`；
  读设置视图失败时回 `unavailable`（与「确实没配」区分开）。**不读环境变量**。
- 请求：`readApiJson` + `timeoutMs: 7_000` + `redirect: "manual"`（余额接口不该重定向，
  跟随会把带凭据的请求交给别的 host）。错误只回原因、不回服务端原文，因此无需再做脱敏。
- GLM 相关方法（`getCodingPlanUsageSnapshot` 等）与 `BigModelUsageQuotaProvider` 一行不动。
- 装配：`node.ts` 传 `providerRuntime.providerSettings`，`remoteWorkspaceServiceCollection.ts`
  传 `params.connectionServices.providerSettingsService`（后者已先注册 `IProviderSettingsService`）。

### UI（实施落点）

- 门控：`resolveProviderBalanceSource(providerId)`（读 shared 名单）决定两处是否渲染。
- `hooks/useProviderBalance.ts`：把 providerId 变成一次 `useUsageEntitlement` 调用，
  缓存指纹为 `provider-balance:<providerId>`；`refreshOnMount` 决定「进入即查」还是「点击才查」。
- `provider-balance/ProviderBalanceRows.tsx`：内容区，两个展示位共用，带 `layout` 变体——
  `panel` 照 composer 的 `ChatStartPlanBalanceMeter`（两行式 + 细额度条），
  `card` 照设置页 `StartPlanBalanceCard` 的额度小卡（`bg-surface` + 大号数值 + 额度条）。
  **两处样式各自对齐 GLM 在该展示位的样式**，而不是把一种版式硬套到两处。
- 供应商卡片：`settings/model-provider-section/ProviderBalanceSection.tsx`，渲染在 `Detail.tsx`
  的通用 provider 分支（`InlineEditableProviderCard` 之后）；`refreshOnMount: false` +
  按钮触发 `refresh({ force: true, reason: "manual" })` 实现「点击才查」。
- 上下文面板：`chat-input-toolbar/ProviderBalancePanel.tsx`，在 `contextUsage.tsx` 里与
  `ChatStartPlanBalancePanel` **并列**渲染（不改 `V4ContextPlanConnection` 那个 GLM 封闭联合），
  数据由 `V4ComposerToolbar.tsx` 新增的 `contextProviderBalance` 传入；hover 走 `onAccess`
  的 60s access 窗口。与 GLM 段唯一差别：查询失败时显示原因而不是整段消失。
- i18n（zh-CN / en-US 各 13 条）：`providerBalance.title`（`{provider}` 占位）、`query`、`idle`、
  `total`、`granted`、`toppedUp`、`accountUnavailable`、`unavailable.{notConfigured,notAuthenticated,noPlan,generic}`，
  以及新增的窗口文案 `planCard.usage.month`（5h / 1w 复用既有 key）。
- 视觉复用（不新增样式语言）：`getContextQuotaMeterGridClass` 的网格、
  `formatQuotaRemainingPercentage`（把「已用占比」反转成剩余并统一格式化）、
  `formatStartPlanBucketResetTime` 的重置时间格式化，以及 `bg-success` / `bg-secondary` /
  `bg-surface` / `bg-surface-hover` / `text-foreground-subtle` / `text-warning` 等既有 token。
  - 窗口行：标签 = 5h/1w/1m 文案，数值 = 剩余百分比，右侧 = 重置时间，带额度条。
  - 金额行：**每项一行**（标签在左、金额在右，等宽数字）——余额一行（强调），赠金/充值各一行（次要样式）；
    **赠金为 0（或服务端未给赠金）时只显示「余额」一行**，不展开没有区分意义的分项（两行 `0.00` 只会让读数变啰嗦）；
    **不画额度条**（金额没有「总额度」可言，画条会误导成「快用完了」）。
    零值判断按**字符串**做（`isZeroProviderBalanceAmount`：去掉小数点与千分位后全是 0 即算 0），
    不做浮点运算——金额一律保留服务端原样字符串。

## 五、验收场景

1. DeepSeek 已配 key：供应商卡片点击「查询」→ 显示币种+总额+赠金+充值分项；上下文面板显示同一份数据，两处一致。
2. DeepSeek 未配 key：显示「未配置 API Key」，**断言未发出网络请求**。
3. OpenCode Go：三窗口按 5h / 1w / 1m 显示剩余百分比与重置时间；`percent=100` → 剩余 0%，不出现负数；
   `resetsAt` 缺失时该行不显示重置时间。
4. OpenCode Go 403（无订阅）→「需要 OpenCode Go 订阅」。
5. 401 →「API Key 无效」，且不影响其它 provider 的快照。
6. 切换模型/provider 后，上下文面板显示新 provider 的余量，无旧值残留。
7. 反复 hover 上下文面板：1 分钟内只发一次请求（60s 窗口 + in-flight 合并生效）。
8. 供应商卡片：打开详情**不**发请求；点「查询」才发。
9. **GLM 回归**：zai/bigmodel 的 Start Plan 段与 Coding Plan 段渲染与文案逐字节不变。
10. 响应结构异常（缺 `usage`、`percent` 非数字）→ 显示不可用，而不是 0% / NaN。
11. 无 services 上下文（Web/SSR 降级路径）：不崩、不请求。

## 六、风险

- **契约扩张**：`UsageEntitlementSnapshot` 新增 `balance` 段是加法式演进（同 `mcpQuota` 的先例），
  对现有消费者零影响；但 `PROVIDER_USAGE_WINDOW_LIMIT_TYPE` 需要避免被 `isSameLimitCategory`
  判成 TOKENS/TIME 同类（与 MCP 额度当初的处理一致）。
- **Zen 端点未验证**：本期不做，UI 对 Zen 不显示余量段。
- **provider 名单双份真相**：用 shared 单一常量表规避。
- **金额语义**：`total_balance` 是字符串，展示时不做数值运算，避免浮点误差与币种混淆。
