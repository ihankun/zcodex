import type { ModelConfigObject } from "@zcode/provider";

/**
 * 模型显示名解析（spec：docs/specs/model-display-name.md）。
 *
 * 优先级：手动覆盖（个人配置的 displayName）→ 对照表（本文件的别名与规范写法）
 * → 规则推导（品牌大小写 + 分隔符美化）→ 原始 modelId。
 *
 * 纯函数、只读、无网络：名字必须来自随应用提供的数据或本地推导，
 * 供应商 API 不提供（DeepSeek 官方 GET /models 只返回 id/object/owned_by）。
 */

/**
 * 对照表：模型 id → 厂商风格名字。
 *
 * 只收录两类条目，避免臆造信息：
 * - 别名：id 本身不含版本信息，只能靠记录（`deepseek-flash` 实际是 V4.1 Flash，
 *   依据 DeepSeek harness 的 `DEFAULT_MODELS` 目录）；
 * - 规范写法：id 已含全部信息，只是大小写/连字符需要固定（如 GLM 家族）。
 *
 * 键统一按 normalizeModelIdForLookup 归一（小写、`_`/空格 → `-`）。
 */
const MODEL_DISPLAY_NAME_TABLE: Readonly<Record<string, string>> = {
  // DeepSeek：ZCode 模板用短别名，dsh 目录记录别名对应的真实版本。
  "deepseek-flash": "DeepSeek V4.1 Flash",
  "deepseek-v4.1-flash": "DeepSeek V4.1 Flash",
  "deepseek-v4-pro": "DeepSeek V4 Pro",
  "deepseek-v4-flash": "DeepSeek V4 Flash",
  "deepseek-v4-flash-vision-exp": "DeepSeek V4 Flash Vision (Exp)",
  "deepseek-chat": "DeepSeek Chat",
  "deepseek-reasoner": "DeepSeek Reasoner",
  // GLM 家族：官方写法保留连字符。
  "glm-5.3": "GLM-5.3",
  "glm-5.3-flash": "GLM-5.3-Flash",
  "glm-5.2": "GLM-5.2",
  "glm-5.1": "GLM-5.1",
  "glm-5": "GLM-5",
  "glm-4.6": "GLM-4.6",
  "glm-4.5": "GLM-4.5",
  // 其它常见模型：固定品牌大小写与紧凑写法。
  "kimi-k3": "Kimi K3",
  "kimi-k2.7-code": "Kimi K2.7 Code",
  "kimi-k2.6": "Kimi K2.6",
  "mimo-v2.5": "MiMo V2.5",
  "mimo-v2.5-pro": "MiMo V2.5 Pro",
  "hy4-preview": "HY4 Preview",
  hy3: "HY3",
};

/** 首段品牌名：大小写由表决定，不做首字母大写的机械推导。 */
const MODEL_BRAND_LABELS: Readonly<Record<string, string>> = {
  deepseek: "DeepSeek",
  glm: "GLM",
  kimi: "Kimi",
  moonshot: "Moonshot",
  mimo: "MiMo",
  minimax: "MiniMax",
  abab: "ABAB",
  qwen: "Qwen",
  gpt: "GPT",
  o: "O",
  claude: "Claude",
  gemini: "Gemini",
  grok: "Grok",
  llama: "Llama",
  mistral: "Mistral",
  yi: "Yi",
  hy: "HY",
  ernie: "ERNIE",
  doubao: "Doubao",
  step: "Step",
  seed: "Seed",
  openrouter: "OpenRouter",
  auto: "Auto",
};

/** 常见后缀/档位词的规范写法；表外词走首字母大写。 */
const MODEL_TOKEN_LABELS: Readonly<Record<string, string>> = {
  flash: "Flash",
  pro: "Pro",
  mini: "Mini",
  nano: "Nano",
  turbo: "Turbo",
  plus: "Plus",
  lite: "Lite",
  max: "Max",
  ultra: "Ultra",
  preview: "Preview",
  exp: "Exp",
  experimental: "Experimental",
  vision: "Vision",
  code: "Code",
  chat: "Chat",
  instruct: "Instruct",
  thinking: "Thinking",
  reasoner: "Reasoner",
  latest: "Latest",
  beta: "Beta",
  air: "Air",
  free: "Free",
};

export function normalizeModelIdForLookup(modelId: string): string {
  return stripModelNamespace(modelId)
    .toLowerCase()
    .replace(/[_\s]+/g, "-");
}

/**
 * 聚合供应商的 id 常带命名空间（`vendor/model`，如 OpenRouter 的 `deepseek/deepseek-v4-flash`）。
 * 供应商名由分组标签与卡片承担，这里只取最后一段：既避免把 `upstream/family/vision-preview`
 * 美化成带斜杠的怪名字，也让 `deepseek/deepseek-v4-flash` 能命中对照表。
 */
function stripModelNamespace(modelId: string): string {
  const trimmed = modelId.trim();
  const separator = trimmed.lastIndexOf("/");
  return separator === -1 ? trimmed : trimmed.slice(separator + 1);
}

/** 把 id 美化成厂商风格名字（不保证含版本信息；别名由对照表补）。 */
export function formatModelIdAsDisplayName(modelId: string): string {
  const tokens = stripModelNamespace(modelId)
    .split(/[-_\s]+/)
    .filter(Boolean);
  if (tokens.length === 0) {
    return modelId;
  }
  return tokens.map((token, index) => formatModelIdToken(token, index === 0)).join(" ");
}

function formatModelIdToken(token: string, isFirstToken: boolean): string {
  if (isFirstToken) {
    const brand = MODEL_BRAND_LABELS[token.toLowerCase()];
    if (brand) {
      return brand;
    }
  }
  const lowered = token.toLowerCase();
  const label = MODEL_TOKEN_LABELS[lowered];
  if (label) {
    return label;
  }
  // 版本段：v4 / v4.1 → V4 / V4.1；纯数字段原样保留。
  if (/^v\d/.test(lowered)) {
    return `V${token.slice(1)}`;
  }
  if (/^\d+(\.\d+)*$/.test(token)) {
    return token;
  }
  // 表外词：只修正首字母，其余保持原样（大小写混排的版本号如 k2.7 不被破坏）。
  return token.charAt(0).toUpperCase() + token.slice(1);
}

export interface ResolveModelDisplayNameInput {
  readonly modelId: string;
  /** 个人配置里的手动覆盖；空串/null/undefined 表示未覆盖。 */
  readonly configuredDisplayName?: ModelConfigObject["displayName"];
}

/**
 * 解析模型显示名。configuredDisplayName 为空时回落「对照表 → 推导 → modelId」，
 * 因此任何 modelId 都能得到非空结果。
 */
export function resolveModelDisplayNameForModelId(input: ResolveModelDisplayNameInput): string {
  const configured = input.configuredDisplayName?.trim();
  if (configured) {
    return configured;
  }
  const table = MODEL_DISPLAY_NAME_TABLE[normalizeModelIdForLookup(input.modelId)];
  if (table) {
    return table;
  }
  return formatModelIdAsDisplayName(input.modelId) || input.modelId;
}
