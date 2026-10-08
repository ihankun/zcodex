import assert from "node:assert/strict";
import test from "node:test";
import { BUILTIN_MODEL_PROVIDER_IDS } from "@zcode/shared";
import {
  resolveV4ModelTriggerDisplay,
  resolveV4ModelTriggerLabel,
} from "../src/v4/composer/modelTriggerDisplay.js";

// 两个供应商的菜单。本地定制的分工是：`fullLabel` 保留完整来源（tooltip / aria-label 用），
// `modelLabel` 是裸模型名（composer 触发器用，见 V4ComposerToolbar 的 triggerLabel），
// 且不再产出 providerPrefix。改前多供应商会得到 `{ providerPrefix: "OpenAI/" }`。
const modelGroups = [
  {
    key: "openai",
    label: "OpenAI",
    items: [{ key: "gpt-4o", value: "openai/gpt-4o", name: "gpt-4o" }],
  },
  {
    key: "anthropic",
    label: "Anthropic",
    items: [{ key: "claude-sonnet", value: "anthropic/claude-sonnet", name: "claude-sonnet" }],
  },
];

test("composer model trigger keeps the source in fullLabel only, never in a prefix", () => {
  assert.deepEqual(
    resolveV4ModelTriggerDisplay({
      modelGroups,
      normalizedValue: "openai/gpt-4o",
      fallbackLabel: "gpt-4o",
      providerId: "openai",
      providerName: "OpenAI",
    }),
    { fullLabel: "OpenAI/gpt-4o", modelLabel: "gpt-4o" },
  );
});

test("composer model trigger omits the source for built-in family providers", () => {
  // 上游规则：内置连接名拼进模型文案会重复展示套餐信息，所以 family 供应商连 fullLabel 也不带前缀。
  assert.deepEqual(
    resolveV4ModelTriggerDisplay({
      modelGroups,
      normalizedValue: "openai/gpt-4o",
      fallbackLabel: "gpt-4o",
      providerId: BUILTIN_MODEL_PROVIDER_IDS.zaiIndividualCodingPlan,
      providerName: "Z.ai",
    }),
    { fullLabel: "gpt-4o", modelLabel: "gpt-4o" },
  );
});

test("composer model trigger falls back when the value is absent from the menu", () => {
  assert.deepEqual(
    resolveV4ModelTriggerDisplay({
      modelGroups,
      normalizedValue: "ghost/model",
      fallbackLabel: "ghost",
      providerId: "openai",
      providerName: "OpenAI",
    }),
    { fullLabel: "ghost", modelLabel: "ghost" },
  );
});

test("model change history labels keep the provider prefix", () => {
  assert.equal(
    resolveV4ModelTriggerLabel({
      modelGroups,
      normalizedValue: "openai/gpt-4o",
      fallbackLabel: "gpt-4o",
      providerId: "openai",
      providerName: "OpenAI",
    }),
    "OpenAI/gpt-4o",
  );
});
