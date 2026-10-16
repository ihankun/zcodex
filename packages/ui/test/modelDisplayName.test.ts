import assert from "node:assert/strict";
import { test } from "vitest";
import {
  formatModelIdAsDisplayName,
  normalizeModelIdForLookup,
  resolveModelDisplayNameForModelId,
} from "../src/lib/modelDisplayName.js";

// 显示名的解析链（spec：docs/specs/model-display-name.md）：
// 手动覆盖 → 对照表 → 规则推导 → 原始 modelId。任何输入都必须得到非空结果。

test("手动覆盖优先于对照表与推导，且忽略首尾空白", () => {
  assert.equal(
    resolveModelDisplayNameForModelId({
      modelId: "deepseek-v4-pro",
      configuredDisplayName: "  我的主模型 ",
    }),
    "我的主模型",
  );
});

test("覆盖值为空白时视为未覆盖，回落对照表而不是渲染空白", () => {
  assert.equal(
    resolveModelDisplayNameForModelId({ modelId: "deepseek-v4-pro", configuredDisplayName: "   " }),
    "DeepSeek V4 Pro",
  );
  assert.equal(
    resolveModelDisplayNameForModelId({ modelId: "deepseek-v4-pro", configuredDisplayName: null }),
    "DeepSeek V4 Pro",
  );
});

test("对照表命中厂商风格名字，别名能补出 id 里没有的版本信息", () => {
  assert.equal(
    resolveModelDisplayNameForModelId({ modelId: "deepseek-v4-pro" }),
    "DeepSeek V4 Pro",
  );
  // 别名：id 里没有 V4.1，只能靠对照表（依据 DeepSeek harness 的模型目录）。
  assert.equal(
    resolveModelDisplayNameForModelId({ modelId: "deepseek-flash" }),
    "DeepSeek V4.1 Flash",
  );
  // GLM 家族保留官方连字符写法。
  assert.equal(resolveModelDisplayNameForModelId({ modelId: "glm-5.3-flash" }), "GLM-5.3-Flash");
});

test("对照表查表前统一归一化大小写与分隔符", () => {
  assert.equal(normalizeModelIdForLookup("DeepSeek_V4_PRO"), "deepseek-v4-pro");
  assert.equal(
    resolveModelDisplayNameForModelId({ modelId: "DeepSeek V4 Pro" }),
    "DeepSeek V4 Pro",
  );
  assert.equal(
    resolveModelDisplayNameForModelId({ modelId: "DEEPSEEK_FLASH" }),
    "DeepSeek V4.1 Flash",
  );
});

test("未命中对照表时按品牌表与版本段推导", () => {
  assert.equal(resolveModelDisplayNameForModelId({ modelId: "glm-9-turbo" }), "GLM 9 Turbo");
  assert.equal(resolveModelDisplayNameForModelId({ modelId: "claude-5-opus" }), "Claude 5 Opus");
  assert.equal(
    resolveModelDisplayNameForModelId({ modelId: "acme-v4.1-mini-preview" }),
    "Acme V4.1 Mini Preview",
  );
  assert.equal(formatModelIdAsDisplayName("kimi-k2.7-code"), "Kimi K2.7 Code");
});

test("聚合供应商的命名空间前缀不进入显示名", () => {
  assert.equal(
    resolveModelDisplayNameForModelId({ modelId: "deepseek/deepseek-v4-flash" }),
    "DeepSeek V4 Flash",
  );
  assert.equal(
    resolveModelDisplayNameForModelId({ modelId: "upstream/family/vision-preview" }),
    "Vision Preview",
  );
  assert.equal(normalizeModelIdForLookup("deepseek/DeepSeek_V4_Flash"), "deepseek-v4-flash");
});

test("无法推导时保留 id 的原始形态，不产出空字符串", () => {
  assert.equal(resolveModelDisplayNameForModelId({ modelId: "unknown-model" }), "Unknown Model");
  assert.equal(resolveModelDisplayNameForModelId({ modelId: "   " }), "   ");
  assert.equal(formatModelIdAsDisplayName(""), "");
});
