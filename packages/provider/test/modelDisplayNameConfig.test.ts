import { describe, expect, it } from "vitest";
import {
  ModelConfig,
  ModelConfigRules,
  ModelPropertiesConfig,
  ModelOptionSpecsConfig,
  clearManualModelConfig,
  extractManualModelConfig,
  parsePersonalModelConfigRules,
  serializeRegistryModelConfig,
} from "../src/index.js";

// 模型显示名在 provider 层的语义（spec：docs/specs/model-display-name.md）：
// 它是展示叶子，可选、可覆盖、可清空；不参与请求构造，也不影响可执行性判定。

const completeProperties = new ModelPropertiesConfig({
  requiresMfjsToolSchema: false,
  contextWindow: 128000,
  inputFormat: {
    supportsText: true,
    supportsImage: false,
    supportsVideo: false,
    supportsAudio: false,
    supportsPdf: false,
  },
  outputFormat: { supportsText: true },
  supportsToolCall: true,
  supportsJsonSchemaOutput: false,
  supportsNativeWebSearch: false,
  supportsMidConversationSystem: false,
});
const completeOptionSpecs = new ModelOptionSpecsConfig({
  reasoningLevel: { values: ["disabled"], map: "{}" },
  maxOutputTokens: { max: 8192, map: '{"max_tokens":maxOutputTokens}' },
});

function resolveCompleteConfig(displayName: string | undefined) {
  return new ModelConfigRules([
    {
      type: "model",
      modelMatch: ".*",
      config: new ModelConfig({
        enabled: true,
        ...(displayName === undefined ? {} : { displayName }),
        properties: completeProperties,
        optionSpecs: completeOptionSpecs,
      }),
    },
  ]).resolve({ providerId: "p", modelId: "m" });
}

describe("ModelConfig displayName", () => {
  it("fromData/toJSON 往返保留显示名，overlay 时个人值覆盖内置值", () => {
    const builtin = ModelConfig.fromData({ displayName: "内置名", enabled: true });
    expect(builtin.toJSON().displayName).toBe("内置名");

    const personal = ModelConfig.fromData({ displayName: "我的主模型" });
    expect(builtin.overlay(personal).displayName).toBe("我的主模型");
    // 个人规则未携带显示名时不覆盖（overlayValue 的 undefined 语义）。
    expect(builtin.overlay(ModelConfig.fromData({ enabled: false })).displayName).toBe("内置名");
  });

  it("显示名可选：缺失不影响完整性校验（可执行性判定）", () => {
    expect(resolveCompleteConfig(undefined).validateComplete()).toEqual([]);
    expect(resolveCompleteConfig("DeepSeek V4 Pro").validateComplete()).toEqual([]);
  });

  it("解析：内置显示名保留，个人精确规则可覆盖，手动规则会先清掉内置名", () => {
    const builtinName = new ModelConfigRules([
      {
        type: "model",
        modelMatch: ".*",
        config: new ModelConfig({ displayName: "内置名" }),
      },
    ]);
    expect(builtinName.resolve({ providerId: "p", modelId: "m" }).displayName).toBe("内置名");

    const personalOverlay = ModelConfigRules.composeEffective(
      builtinName,
      new ModelConfigRules([
        {
          type: "provider-model",
          providerId: "p",
          modelId: "m",
          config: new ModelConfig({ displayName: "个人名" }),
        },
      ]),
    );
    expect(personalOverlay.resolve({ providerId: "p", modelId: "m" }).displayName).toBe("个人名");

    // 手动规则按白名单清空可编辑叶子：未自带显示名时，内置名不残留。
    const manualWithoutName = ModelConfigRules.composeEffective(
      builtinName,
      new ModelConfigRules([
        {
          type: "manual-provider-model",
          providerId: "p",
          modelId: "m",
          config: new ModelConfig({
            properties: new ModelPropertiesConfig({ contextWindow: 32000 }),
          }),
        },
      ]),
    );
    expect(
      manualWithoutName.resolve({ providerId: "p", modelId: "m" }).displayName,
    ).toBeUndefined();

    const manualWithName = ModelConfigRules.composeEffective(
      builtinName,
      new ModelConfigRules([
        {
          type: "manual-provider-model",
          providerId: "p",
          modelId: "m",
          config: new ModelConfig({ displayName: "手动名" }),
        },
      ]),
    );
    expect(manualWithName.resolve({ providerId: "p", modelId: "m" }).displayName).toBe("手动名");
  });

  it("手动配置白名单包含显示名；清空基线时会被剔除", () => {
    // extractManualModelConfig 面向「完整配置」提取（白名单叶子必须齐全），与编辑器同口径。
    expect(
      extractManualModelConfig({
        enabled: true,
        displayName: "我的手填名",
        properties: {
          contextWindow: 32000,
          supportsJsonSchemaOutput: false,
          supportsNativeWebSearch: false,
          supportsMidConversationSystem: false,
          inputFormat: { supportsImage: false, supportsVideo: false, supportsPdf: false },
        },
        optionSpecs: {
          reasoningLevel: { values: ["disabled"], map: "{}" },
          maxOutputTokens: { max: 4096 },
        },
      }).displayName,
    ).toBe("我的手填名");

    expect(clearManualModelConfig({ displayName: "内置名", enabled: true })).toEqual({
      enabled: true,
    });
  });

  it("Registry 序列化：有值才写入 displayName，避免 undefined 键流入下游", () => {
    const withName = serializeRegistryModelConfig(resolveCompleteConfig("GLM-5.3") as never);
    expect(withName.displayName).toBe("GLM-5.3");

    const withoutName = serializeRegistryModelConfig(resolveCompleteConfig(undefined) as never);
    expect("displayName" in withoutName).toBe(false);
  });

  it("个人规则序列化往返保留显示名（provider_config.json 的写入/读出边界）", () => {
    const rules = new ModelConfigRules([
      {
        type: "provider-model",
        providerId: "p",
        modelId: "m",
        config: new ModelConfig({ displayName: "我的主模型" }),
      },
      {
        type: "manual-provider-model",
        providerId: "p",
        modelId: "m2",
        config: new ModelConfig({
          displayName: "手动名",
          properties: new ModelPropertiesConfig({
            contextWindow: 32_000,
            supportsJsonSchemaOutput: false,
            supportsNativeWebSearch: false,
            supportsMidConversationSystem: false,
            inputFormat: { supportsImage: false, supportsVideo: false, supportsPdf: false },
          }),
          optionSpecs: new ModelOptionSpecsConfig({
            reasoningLevel: { values: ["disabled"], map: "{}" },
            maxOutputTokens: { max: 4096 },
          }),
        }),
      },
    ]);

    const json = rules.toPersonalJSON();
    expect(json.providerModelRules[0]?.config.displayName).toBe("我的主模型");
    expect(json.manualProviderModelRules[0]?.config.displayName).toBe("手动名");

    const reparsed = parsePersonalModelConfigRules(json);
    expect(reparsed.rules()[0]?.config.displayName).toBe("我的主模型");
    expect(reparsed.rules()[1]?.config.displayName).toBe("手动名");
  });
});
