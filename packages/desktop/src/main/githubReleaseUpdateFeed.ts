import type { ElectronReleaseChannel } from "@zcode/shared";
import type { AppUpdater, ResolvedUpdateFileInfo, UpdateInfo } from "electron-updater";
import {
  Provider,
  parseUpdateInfo,
  resolveFiles,
  type ProviderRuntimeOptions,
} from "electron-updater/out/providers/Provider.js";
import { newUrlFromBase } from "electron-updater/out/util.js";
import {
  buildGitHubPreviousReleaseFileUrl,
  buildGitHubReleaseUpdateFeedUrl,
  resolveGitHubReleaseChannelFileStem,
} from "../../scripts/github-release-channel.mjs";
import type { ManualUpdateInstallerTarget } from "./manualUpdateInstaller.js";

interface GitHubReleaseUpdateFeedOptions {
  /** 更新源基址；缺省用 GitHub Release 固定入口，开发态可被更新源覆盖替换。 */
  url?: string;
  channel?: ElectronReleaseChannel;
  resolveReleaseChannel?: () => ElectronReleaseChannel | Promise<ElectronReleaseChannel>;
  releasePlatform?: NodeJS.Platform;
  releaseArch?: string;
}

/** 交给 `autoUpdater.setFeedURL` 的 provider 配置；字段与 electron-updater 的 CustomPublishOptions 对齐。 */
interface GitHubReleaseUpdateFeedConfig extends GitHubReleaseUpdateFeedOptions {
  provider: "custom";
  updateProvider: typeof GitHubReleaseUpdateProvider;
}

/** 清单里没有「本次请求走的是哪个通道」，由 provider 回填，供 main 进程识别过期结果。 */
interface ZCodeUpdateInfo extends UpdateInfo {
  zcodeReleaseChannel?: ElectronReleaseChannel;
}

/**
 * 更新清单与安装包都取自 GitHub Release：按 `<通道>-<平台>-<架构>.yml` 拉清单，
 * 安装包地址由清单里的相对文件名按 feed 基址解析。
 *
 * 这里直接实现 Provider 而不是继承 electron-updater 的 GenericProvider：清单文件名要按
 * 平台/架构与 preview 通道决定，而 GenericProvider 只认同步的 channel getter，装不下这个规则。
 */
export class GitHubReleaseUpdateProvider extends Provider<UpdateInfo> {
  private readonly feedOptions: GitHubReleaseUpdateFeedOptions;
  private readonly baseUrl: URL;

  constructor(
    options: GitHubReleaseUpdateFeedOptions,
    _updater: AppUpdater,
    runtimeOptions: ProviderRuntimeOptions,
  ) {
    super(runtimeOptions);
    this.feedOptions = options;
    this.baseUrl = resolveFeedBaseUrl(options.url);
  }

  // 上游 CDN 对多 Range 请求返回的 Content-Type 不是 multipart/byteranges，当时就显式关掉了多 Range 合并。
  // GitHub 的 Release 资源只保证单 Range（实测 206），这里继续关闭，差分按单 Range 顺序拉取。
  override get isUseMultipleRangeRequest(): boolean {
    return false;
  }

  override async getLatestVersion(): Promise<UpdateInfo> {
    const channel =
      (await this.feedOptions.resolveReleaseChannel?.()) ?? this.feedOptions.channel ?? "stable";
    const channelFile = `${this.buildChannelFileStem(channel)}.yml`;
    // 清单地址固定，Chromium 网络栈会按启发式规则缓存，这里按上游 GenericProvider 的做法
    // 加一次性查询参数，保证每次「检查更新」都拿到当前 Release 的清单。
    const channelFileUrl = newUrlFromBase(channelFile, this.baseUrl, true);
    const raw = await this.httpRequest(channelFileUrl);
    // 用户切换「接收 preview 版本」时，旧通道的请求可能晚于新请求返回；把本次请求通道带回去，
    // main 进程据此丢弃过期结果（读取见 autoUpdater 的 readUpdateInfoReleaseChannel）。
    const updateInfo: ZCodeUpdateInfo = {
      ...parseUpdateInfo(raw, channelFile, channelFileUrl),
      zcodeReleaseChannel: channel,
    };
    return updateInfo;
  }

  override resolveFiles(updateInfo: UpdateInfo): ResolvedUpdateFileInfo[] {
    return resolveFiles(updateInfo, this.baseUrl);
  }

  /**
   * 差分下载要从「上一个版本」的 Release 取旧 blockmap，而新文件地址在
   * `releases/latest/download/` 下——它只会解析最新 Release 的资源，旧版本的 blockmap 永远取不到。
   * 这里按发布约定（tag = `v<版本>`）把旧 blockmap 改到 `releases/download/v<旧版本>/` 下；
   * 取不到时 electron-updater 会退化成全量下载，不会让更新失败。
   */
  override async getBlockMapFiles(
    baseUrl: URL,
    oldVersion: string,
    newVersion: string,
    oldBlockMapFileBaseUrl: string | null = null,
  ): Promise<URL[]> {
    const blockMapUrls = await super.getBlockMapFiles(
      baseUrl,
      oldVersion,
      newVersion,
      oldBlockMapFileBaseUrl,
    );
    if (oldBlockMapFileBaseUrl) {
      return blockMapUrls;
    }

    const [oldBlockMapUrl, newBlockMapUrl] = blockMapUrls;
    const oldBlockMapFileName = oldBlockMapUrl?.pathname.split("/").pop();
    const previousReleaseFileUrl = oldBlockMapFileName
      ? buildGitHubPreviousReleaseFileUrl(this.baseUrl.href, oldVersion, oldBlockMapFileName)
      : null;
    return previousReleaseFileUrl && newBlockMapUrl
      ? [new URL(previousReleaseFileUrl), newBlockMapUrl]
      : blockMapUrls;
  }

  private buildChannelFileStem(channel: ElectronReleaseChannel): string {
    return resolveGitHubReleaseChannelFileStem({
      channel: channel === "preview" ? "preview" : "stable",
      platform: this.feedOptions.releasePlatform,
      arch: this.feedOptions.releaseArch,
    });
  }
}

/**
 * 清单与安装包地址都用 `new URL(relative, base)` 解析，基址必须以 `/` 结尾，
 * 否则最后一段路径会被相对文件名替换掉（`.../latest/download` -> `.../latest/latest-mac-arm64.yml`）。
 */
function toFeedBaseUrl(value: string): URL {
  const url = new URL(value);
  if (!url.pathname.endsWith("/")) {
    url.pathname += "/";
  }
  return url;
}

function resolveFeedBaseUrl(feedSourceUrl?: string): URL {
  return toFeedBaseUrl(feedSourceUrl?.trim() || buildGitHubReleaseUpdateFeedUrl());
}

/** macOS 取 DMG、Windows 取安装器、Linux 取 AppImage：手动安装要的是用户能双击安装的产物。 */
function resolveInstallerExtension(platform: NodeJS.Platform): string {
  switch (platform) {
    case "darwin":
      return ".dmg";
    case "win32":
      return ".exe";
    default:
      return ".appimage";
  }
}

/**
 * 手动安装模式下要下载的安装包：按平台挑产物，并优先选与当前架构匹配的那一份。
 *
 * 不复用 electron-updater 的 findFile：它在没有匹配扩展名时会退回第一个文件，
 * 会把 mac 的 zip（Squirrel 专用、用户无法直接安装）当成 DMG 交给手动安装链路。
 */
export function resolveManualUpdateInstallerTarget(
  updateInfo: UpdateInfo,
  options: { feedSourceUrl?: string; platform?: NodeJS.Platform; arch?: string } = {},
): ManualUpdateInstallerTarget | null {
  const extension = resolveInstallerExtension(options.platform ?? process.platform);
  const arch = options.arch ?? process.arch;
  const files = resolveFiles(updateInfo, resolveFeedBaseUrl(options.feedSourceUrl));
  const candidates = files.filter((file) => file.url.pathname.toLowerCase().endsWith(extension));
  const installer = candidates.find((file) => file.url.pathname.includes(arch)) ?? candidates[0];
  const sha512 = installer?.info.sha512;
  const size = installer?.info.size;
  if (!installer || typeof sha512 !== "string" || typeof size !== "number" || size <= 0) {
    // 手动安装必须能校验完整性；缺校验信息的清单不允许走到"下载后交给用户安装"。
    return null;
  }
  return {
    url: installer.url.href,
    fileName: decodeURIComponent(installer.url.pathname.split("/").pop() ?? ""),
    sha512,
    size,
  };
}

export function createGitHubReleaseUpdateFeedConfig(options: {
  /** 开发态更新源覆盖（`ZCODE_UPDATE_FEED_URL` / `--zcode-update-feed-url`）。 */
  feedSourceUrl?: string;
  resolveReleaseChannel: () => ElectronReleaseChannel | Promise<ElectronReleaseChannel>;
}): GitHubReleaseUpdateFeedConfig {
  const feedSourceUrl = options.feedSourceUrl?.trim();
  return {
    provider: "custom",
    updateProvider: GitHubReleaseUpdateProvider,
    ...(feedSourceUrl ? { url: feedSourceUrl } : {}),
    resolveReleaseChannel: options.resolveReleaseChannel,
  };
}
