import type { ProviderConfigObject } from "@zcode/provider";
import { PackageIcon } from "lucide-react";
import { useState } from "react";
import { cn } from "@/components/lib/utils.js";
import { useResolvedTheme } from "@/store/StoreProvider.js";
import type { ResolvedTheme } from "@/useTheme.js";
import alibabaModelStudioLogo from "@/assets/provider-icons/model-provider-alibaba-cloud.png";
import anthropicLogo from "@/assets/provider-icons/model-provider-anthropic.png";
import bigModelLogo from "@/assets/provider-icons/logo-bigmodel.svg";
import deepSeekLogo from "@/assets/provider-icons/model-provider-deepseek.png";
import deepSeekLogoDark from "@/assets/provider-icons/model-provider-deepseek-dark.png";
import miniMaxLogo from "@/assets/provider-icons/model-provider-minimax.png";
import moonshotKimiLogo from "@/assets/provider-icons/model-provider-moonshot-kimi.png";
import openAiLogo from "@/assets/provider-icons/model-provider-openai.png";
import openAiLogoDark from "@/assets/provider-icons/model-provider-openai-dark.png";
import anthropicLogoDark from "@/assets/provider-icons/model-provider-anthropic-dark.png";
import xAiLogo from "@/assets/provider-icons/model-provider-xai.png";
import xiaomiMimoLogo from "@/assets/provider-icons/model-provider-xiaomi-mimo.png";
import startPlanLogo from "@/assets/provider-icons/model-provider-start-plan.png";
import zaiLogo from "@/assets/provider-icons/model-provider-zai-app.png";
import openrouterLight from "@/assets/provider-icons/model-provider-openrouter-light.svg";
import openrouterDark from "@/assets/provider-icons/model-provider-openrouter-dark.svg";
import opencodeLight from "@/assets/provider-icons/model-provider-opencode-light.svg";
import opencodeDark from "@/assets/provider-icons/model-provider-opencode-dark.svg";
import volcengineLogo from "@/assets/provider-icons/model-provider-volcengine.png";
import stepfunLogo from "@/assets/provider-icons/model-provider-stepfun.png";
import siliconflowLogo from "@/assets/provider-icons/model-provider-siliconflow.png";
import tencentCloudLogo from "@/assets/provider-icons/model-provider-tencent-cloud.png";

type ProviderLogoRef = NonNullable<ProviderConfigObject["logo"]>;

interface BuiltinProviderLogoAsset {
  readonly light: string;
  readonly dark?: string;
}

// 这里只负责把 Config 中的资源 key 解析为打包素材；禁止加入 Provider ID、名称或排序逻辑。
const BUILTIN_PROVIDER_LOGO_ASSETS: Readonly<Record<string, BuiltinProviderLogoAsset>> = {
  // 用户指定 Dock 应用图标；同名旧 SVG 带灰色描边，不能当作同一素材复用。
  zai: { light: zaiLogo },
  bigmodel: { light: bigModelLogo },
  "start-plan": { light: startPlanLogo },
  "moonshot-kimi": { light: moonshotKimiLogo },
  minimax: { light: miniMaxLogo },
  // 以下三家官方素材是浅色底位图；深色主题沿用同一图形但去掉浅色底/反白，
  // 避免在暗色界面上出现白色或米色方块（见 model-provider-logo-sources.json）。
  deepseek: { light: deepSeekLogo, dark: deepSeekLogoDark },
  "alibaba-model-studio": { light: alibabaModelStudioLogo },
  "xiaomi-mimo": { light: xiaomiMimoLogo },
  openai: { light: openAiLogo, dark: openAiLogoDark },
  anthropic: { light: anthropicLogo, dark: anthropicLogoDark },
  xai: { light: xAiLogo },
  openrouter: { light: openrouterLight, dark: openrouterDark },
  opencode: { light: opencodeLight, dark: opencodeDark },
  "tencent-cloud": { light: tencentCloudLogo },
  volcengine: { light: volcengineLogo },
  stepfun: { light: stepfunLogo },
  siliconflow: { light: siliconflowLogo },
};

export function resolveBuiltinProviderLogoAsset(
  logo: ProviderLogoRef | null | undefined,
  theme: ResolvedTheme,
): string | null {
  if (logo?.type !== "builtin") {
    return null;
  }
  const asset = BUILTIN_PROVIDER_LOGO_ASSETS[logo.key];
  return asset ? (theme === "dark" ? (asset.dark ?? asset.light) : asset.light) : null;
}

export function ProviderLogo({
  logo,
  className,
}: {
  logo?: ProviderLogoRef | null;
  className?: string;
}) {
  // 解析后的主题：system 模式跟随系统深浅色变化，不能只读 store.theme。
  const theme = useResolvedTheme();
  const src = resolveBuiltinProviderLogoAsset(logo, theme);
  const [failedSrc, setFailedSrc] = useState<string | null>(null);
  if (!src || failedSrc === src) {
    return <PackageIcon className={cn("shrink-0", className)} aria-hidden="true" />;
  }
  return (
    <img
      src={src}
      alt=""
      aria-hidden="true"
      className={cn("shrink-0 object-contain", className)}
      onError={() => setFailedSrc(src)}
    />
  );
}
