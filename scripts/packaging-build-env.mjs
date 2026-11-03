/**
 * ZCodex fork 打包入口（`pnpm package:win` / `pnpm package:mac`）的构建期环境。
 *
 * - 身份固定 production：未显式设置 ZCODE_ENV 时 bundle 会 fail-safe 落到 Preview 身份，
 *   见 packages/desktop/scripts/desktop-product-identity.mjs。
 * - 自动更新默认开启：本 fork 没有内部仓库的私有默认配置，更新源是自身仓库的 GitHub
 *   Release（packages/desktop/src/main/githubReleaseUpdateFeed.ts）。不给显式默认值时
 *   `__ZCODE_AUTO_UPDATE_ENABLED__` 恒为 false，安装包点「检查更新」只会提示未启用。
 *
 * 开关解析仍归 scripts/build-time-config.mjs（环境变量 > 私有默认配置 > 关闭）：这里只补
 * 打包入口的默认值，显式传入的环境变量（包括空字符串表示关闭）优先。
 * 规则见 docs/desktop/build-time-optional-capabilities.md。
 */
export function resolvePackagingBuildEnv(env = process.env) {
  return {
    ...env,
    ZCODE_ENV: "production",
    ZCODE_AUTO_UPDATE: env.ZCODE_AUTO_UPDATE ?? "1",
  };
}
