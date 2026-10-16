import { describe, expect, it } from "vitest";
import type { ProviderSettingsFormModel } from "@/lib/providerSettingsFormTypes.js";
import {
  createProviderModelDraftValues,
  resolveProviderModelDraftCommit,
} from "@/settings/model-provider-section/ProviderModelMetadata.js";

// 显示名的手动覆盖走个人配置持久化（spec：docs/specs/model-display-name.md）：
// 弹窗草稿 ↔ provider_config.json 的 personal model rule 字段 displayName。

function createModel(
  overrides: Partial<ProviderSettingsFormModel> = {},
): ProviderSettingsFormModel {
  const properties = {
    requiresMfjsToolSchema: false,
    contextWindow: 128_000,
    inputFormat: {
      supportsText: true,
      supportsImage: false,
      supportsVideo: false,
      supportsAudio: false,
      supportsPdf: false,
    },
    outputFormat: { supportsText: true },
    supportsToolCall: true,
    supportsJsonSchemaOutput: true,
    supportsNativeWebSearch: false,
    supportsMidConversationSystem: false,
  };
  const optionSpecs = {
    reasoningLevel: { values: ["low", "high"], map: "{'reasoning_effort': reasoningLevel}" },
    maxOutputTokens: { max: 32_000, map: "{'max_completion_tokens': maxOutputTokens}" },
  };
  return {
    kind: "candidate",
    modelId: "deepseek-v4-pro",
    builtin: true,
    inheritedConfig: { properties, optionSpecs },
    personalConfig: {},
    hasPersonalConfig: false,
    executable: true,
    selectable: true,
    config: { properties, optionSpecs },
    ...overrides,
  };
}

describe("model display name draft", () => {
  it("草稿读取个人配置里的显示名；未覆盖时为空串", () => {
    expect(createProviderModelDraftValues(createModel()).displayNameValue).toBe("");
    expect(
      createProviderModelDraftValues(createModel({ personalConfig: { displayName: "我的主模型" } }))
        .displayNameValue,
    ).toBe("我的主模型");
  });

  it("提交把显示名写进个人配置并立即生效；清空则移除覆盖", () => {
    const model = createModel();
    const draft = {
      ...createProviderModelDraftValues(model),
      displayNameValue: "  我的主模型  ",
    };
    const result = resolveProviderModelDraftCommit({ currentModel: model, draft });
    expect(result.status).toBe("commit");
    if (result.status !== "commit") return;
    expect(result.model.personalConfig.displayName).toBe("我的主模型");
    // 列表行等消费方读生效配置，保存后无需等视图刷新。
    expect(result.model.config.displayName).toBe("我的主模型");
    expect(result.model.hasPersonalConfig).toBe(true);

    const cleared = {
      ...createProviderModelDraftValues(result.model),
      displayNameValue: "   ",
    };
    const clearedResult = resolveProviderModelDraftCommit({
      currentModel: result.model,
      draft: cleared,
    });
    expect(clearedResult.status).toBe("commit");
    if (clearedResult.status !== "commit") return;
    expect("displayName" in clearedResult.model.personalConfig).toBe(false);
    expect("displayName" in clearedResult.model.config).toBe(false);
  });

  it("固定配置（手动模式）物化不会丢掉显示名", () => {
    const model = createModel();
    const draft = {
      ...createProviderModelDraftValues(model),
      displayNameValue: "我的手填名",
      useRecommendedConfigValue: false,
      // 固定配置模式没有继承基线，容量、上限与推理映射都必须显式填写。
      contextWindowValue: "128000",
      maxOutputTokensValue: "32000",
      reasoningLevelMapValue: "{'reasoning_effort': reasoningLevel}",
    };
    const result = resolveProviderModelDraftCommit({ currentModel: model, draft });
    expect(result.status).toBe("commit");
    if (result.status !== "commit") return;
    // 手动模式会把整份可编辑叶子物化进个人配置，显示名必须一起带上。
    expect(result.model.personalConfig.displayName).toBe("我的手填名");
  });
});
