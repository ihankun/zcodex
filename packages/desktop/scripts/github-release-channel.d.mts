export type GitHubReleaseChannel = "stable" | "preview";

export declare const GITHUB_RELEASE_UPDATE_OWNER: string;
export declare const GITHUB_RELEASE_UPDATE_REPO: string;

export declare function buildGitHubReleaseUpdateFeedUrl(owner?: string, repo?: string): string;

export declare function resolveGitHubReleasePlatformTag(platform?: NodeJS.Platform): string;

export declare function buildGitHubReleaseTag(version: string): string;

export declare function buildGitHubPreviousReleaseFileUrl(
  feedUrl: string,
  version: string,
  fileName: string,
): string | null;

export declare function resolveGitHubReleaseChannelFileStem(options: {
  channel: GitHubReleaseChannel;
  platform?: NodeJS.Platform;
  arch?: string;
}): string;
