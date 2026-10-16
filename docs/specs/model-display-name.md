# 模型显示名（对照名字 + 手动覆盖）

本 fork 新增：模型列表与模型选择器显示「厂商风格显示名」（如 `DeepSeek V4 Pro`），
并支持用户手动覆盖、持久化。

## 一、背景

设置页「模型列表」与聊天输入框的模型选择器一律渲染 raw `modelId`（`deepseek-v4-pro`）。
上游没有模型级显示名：`modelConfigDataSchema` 是 strict 且只有 `enabled/properties/optionSpecs`；
i18n 里的 `settings.modelProvider.modelDisplayName` 是遗留死键；v1 配置曾有
`modelDisplayNames: Record<string,string>`，迁移时被丢弃。

对照名字的来源（评估结论）：供应商 API 大多不返回名字（DeepSeek 官方 `GET /models` 只有
`id/object/owned_by`；实测 dsh 的录制夹具同样以 id 兜底），因此名字只能来自
「随应用提供的数据 + 本地推导」，再由用户手动覆盖纠偏。

## 二、产品规则

### 范围

- 显示位（本阶段）：设置页模型列表行、聊天输入框的模型选择器（registry 分组）。
- 不做（本阶段）：CLI / Agent 侧的模型名（`Model.displayName` 保持休眠，协议 label 语义不变）；
  自动发现新模型（单独阶段，见「非目标」）。

### 名字解析优先级（唯一解析入口）

1. **手动覆盖**：模型个人配置的 `displayName`（非空即采用）。
2. **内置对照表**：fork 维护的 `modelId → 名字` 表，含别名（`deepseek-flash` → `DeepSeek V4.1 Flash`）。
3. **规则推导**：按品牌表做大小写与分隔符美化（`deepseek-v4-pro` → `DeepSeek V4 Pro`；
   `v4.1` 保留版本形态、`glm` 全大写、纯数字段保留）。
   - 聚合供应商的命名空间前缀不进入显示名：只取最后一个 `/` 之后的段
     （`deepseek/deepseek-v4-flash` → `DeepSeek V4 Flash`，`upstream/family/vision-preview` → `Vision Preview`）；
     供应商名由分组标签与卡片承担。查表前的归一化同样先剥命名空间。
4. **兜底**：原始 `modelId`。

解析是纯函数、只读；不缓存、不落库、不发起网络请求。

### 展示规则

- 解析结果与 `modelId` 相同 → 行内只显示 id（保持现状单行）。
- 不同 → 双行：主行显示名，副行 `modelId`（等宽、次要色），保证真实 id 始终可见。
- 选择器条目显示名 = 解析结果（含手动覆盖）。

### 手动覆盖的编辑与清理

- 模型编辑弹窗新增「显示名称」输入框，可留空。
- 留空 = 不覆盖（删除个人配置里的该字段，回落自动解析）；填写 = 覆盖。
- 与 `contextWindow` 等叶子同等对待：手动模式（固定配置）下随整份可编辑叶子一起物化，
  不会因切换编辑模式而丢失。

### 非目标

- 不做运行时拉取供应商模型名、也不在本阶段接 models.dev（后续独立阶段，需先实测端点）。
- 不改协议 / CLI 的 label 字段语义。

## 三、状态所有者与事件顺序

- **所有者**：覆盖值属于「provider 个人配置」——`~/.zcodex/v2/provider_config.json` 的
  personal model rule 字段 `displayName`。唯一写入路径：编辑弹窗提交 →
  `savePersonalModelDraft` → `ProviderConfigService` → personal repository（文件锁 + 原子写）。
- **读取**：registry 解析（内置规则 → 个人 overlay，个人覆盖内置）→ 视图投影
  （`serializeRegistryModelConfig` 与 facades 视图）→ UI 解析层 `resolveModelDisplayName`。
- **事件顺序**：弹窗保存 → 服务写文件并刷新视图 → 列表与选择器按新视图重渲染；
  UI 不持有覆盖值的第二份状态，解析结果是可随时重算的派生值。

```text
弹窗提交 → personal model rule(displayName) → provider_config.json
                                              ↓ 读取
                             registry 解析(内置 → 个人 overlay)
                                              ↓ 投影
              view.effectiveConfig.displayName ──→ resolveModelDisplayName(覆盖 → 表 → 推导 → id)
```

## 四、接口

### 契约（`packages/shared`）

- `packages/shared/src/model-config.ts`：`completeModelConfigDataSchema` 增加
  `displayName: z.string().min(1).optional()`；稀疏 schema 由 `sparseShape` 自动派生。
  可选字段 ⇒ **无需迁移**（`provider_config.json` 的 `CURRENT_SCHEMA_VERSION` 不动）。
- 语义：显示名是展示叶子，不参与请求构造；`validateComplete`（可执行性判定）不因缺失而失败。

### provider 层

- `packages/provider/src/config/model-config.ts`：`ModelConfig` 增加 `displayName`
  （构造 / `fromData` / `overlay` / `toJSON`）。
- `packages/provider/src/config/manual-model-config.ts`：可编辑白名单加入 `displayName`——
  手动模式的物化走 `extractManualModelConfig`，不在白名单里会被 strict 校验剔掉。
- `packages/provider/src/resolver.ts`：`serializeRegistryModelConfig` 仅在有值时输出
  `displayName`，避免给下游断言引入 `undefined` 键。

### UI 层

- 新文件 `packages/ui/src/lib/modelDisplayName.ts`：`resolveModelDisplayNameForModelId({ modelId, configuredDisplayName })`、
  品牌大小写表、fork 对照表（合并时保留，见合并笔记）。
  覆盖值的作用域由「调用方传入哪份模型配置」隐式决定（需要 providerId/providerName 的场景由调用方自行组织），
  因此解析函数不接收 provider 参数。
- `packages/ui/src/settings/model-provider-section/ProviderModelMetadata.ts`：
  草稿字段 `displayNameValue`，提交时写入/删除个人配置的 `displayName`。
- `ProviderModelMetadataDialog.tsx`：模型 ID 下方新增「显示名称」输入
  （复用 `settings.modelProvider.modelDisplayName`，新增 `settings.modelProvider.modelDisplayNameHint`；
  placeholder 直接展示自动解析结果）。
- `ProviderFormControls.tsx`（列表行）、`lib/modelSelectionGroups.ts`（选择器）：按解析结果渲染；
  列表行在「解析结果 ≠ id」时改双行（名字主、id 副），否则保持单行原样。

## 五、验收场景

1. 未做任何配置时，`deepseek-v4-pro` 显示为 `DeepSeek V4 Pro`，副行仍可见原 id。
2. 手动填「我的主模型」并保存 → 列表与选择器均显示「我的主模型」，重启应用后仍生效。
3. 手动清空并保存 → 回落到自动解析结果，不显示空白。
4. 对照表与推导都未命中的 id（如 `hy4-preview`）→ 显示推导结果，不显示空。
5. 手动模式（固定配置）下保存模型配置，不会丢掉已填的显示名。
6. 同一模型挂在两个供应商下显示同一对照名；手动覆盖按供应商作用域生效（互不影响）。
7. `pnpm typecheck` / `pnpm lint` / provider 与 ui 相关测试 / `pnpm i18n:check` 全过。

## 六、风险

- 对照表或推导给出错误名字 → 手动覆盖是权威纠正手段；表内条目必须有依据，不臆造版本号
  （例：`deepseek-flash` → `DeepSeek V4.1 Flash` 有 dsh 目录佐证）。
- 上游合并：新增 1 个 UI 文件 + 6 处上游文件接线，已登记 `docs/upstream-merge-notes.md`。
- 若上游未来自带模型显示名概念，与本字段对齐时按合并笔记裁决（本字段是 fork 独有语义）。
