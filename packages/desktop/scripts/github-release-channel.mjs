/**
 * ZCodex fork 的更新分发约定：更新清单与安装包都挂在 GitHub Release 上。
 *
 * main 进程决定「请求哪个清单」，发布脚本决定「上传哪个清单」，两边必须用同一套命名，
 * 否则更新会静默 404，所以规则集中在这里，由两边共同导入。
 */

export const GITHUB_RELEASE_UPDATE_OWNER = "ihankun";
export const GITHUB_RELEASE_UPDATE_REPO = "zcodex";

/**
 * `releases/latest/download/<file>` 是 GitHub 提供的固定入口，会重定向到最新 Release 的资源。
 * 走它不需要 GitHub API，因此不受未认证 60 次/小时 限流影响，也不需要把 token 打进安装包。
 */
export function buildGitHubReleaseUpdateFeedUrl(
  owner = GITHUB_RELEASE_UPDATE_OWNER,
  repo = GITHUB_RELEASE_UPDATE_REPO,
) {
  return `https://github.com/${owner}/${repo}/releases/latest/download`;
}

export function resolveGitHubReleasePlatformTag(platform = process.platform) {
  switch (platform) {
    case "darwin":
      return "mac";
    case "win32":
      return "win";
    case "linux":
      return "linux";
    default:
      return platform;
  }
}

/** 发布约定：Release tag 为 `v<版本>`，与 package.json 的版本一一对应。 */
export function buildGitHubReleaseTag(version) {
  return `v${version}`;
}

/**
 * 历史版本文件的地址：`releases/download/v<版本>/<文件名>`。
 *
 * 差分下载要从上一个版本的 Release 取旧 blockmap，而 `releases/latest/download/` 只会解析最新
 * Release 的资源，永远取不到旧文件。feed 基址不是 GitHub Release 入口（开发态更新源覆盖）时返回
 * null，由调用方回退到全量下载。
 */
export function buildGitHubPreviousReleaseFileUrl(feedUrl, version, fileName) {
  const latestMarker = "/releases/latest/download/";
  const markerIndex = feedUrl.indexOf(latestMarker);
  if (markerIndex < 0) {
    return null;
  }
  return `${feedUrl.slice(0, markerIndex)}/releases/download/${buildGitHubReleaseTag(version)}/${fileName}`;
}

/**
 * 清单文件词干（实际文件名是 `${词干}.yml`）。
 *
 * electron-builder 生成的清单名不带架构（`latest-mac.yml` / `latest.yml`），
 * 同一个 Release 里放不下第二个架构的同名清单——后上传的会覆盖先上传的，
 * 于是另一架构的用户会下载到不匹配的安装包。这里统一改成
 * `<通道>-<平台>-<架构>.yml`，发布脚本按同一规则改名后再上传。
 */
export function resolveGitHubReleaseChannelFileStem(options) {
  const channelStem = options.channel === "preview" ? "preview" : "latest";
  const platformTag = resolveGitHubReleasePlatformTag(options.platform ?? process.platform);
  return `${channelStem}-${platformTag}-${options.arch ?? process.arch}`;
}
