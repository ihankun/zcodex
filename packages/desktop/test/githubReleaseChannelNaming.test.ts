import { describe, expect, it } from "vitest";

import { resolveGitHubReleaseChannelFileStem } from "../scripts/github-release-channel.mjs";

describe("github release update manifest naming", () => {
  it("stable 沿用上游 latest 通道名，并带平台与架构", () => {
    expect(
      resolveGitHubReleaseChannelFileStem({ channel: "stable", platform: "win32", arch: "x64" }),
    ).toBe("latest-win-x64");
    expect(
      resolveGitHubReleaseChannelFileStem({ channel: "stable", platform: "darwin", arch: "arm64" }),
    ).toBe("latest-mac-arm64");
    expect(
      resolveGitHubReleaseChannelFileStem({ channel: "stable", platform: "linux", arch: "x64" }),
    ).toBe("latest-linux-x64");
  });

  it("preview 清单带 preview 前缀", () => {
    expect(
      resolveGitHubReleaseChannelFileStem({ channel: "preview", platform: "win32", arch: "x64" }),
    ).toBe("preview-win-x64");
  });

  it("同一平台架构下 stable 与 preview 不撞名", () => {
    const stable = resolveGitHubReleaseChannelFileStem({
      channel: "stable",
      platform: "win32",
      arch: "arm64",
    });
    const preview = resolveGitHubReleaseChannelFileStem({
      channel: "preview",
      platform: "win32",
      arch: "arm64",
    });

    expect(stable).not.toBe(preview);
  });

  it("架构留在文件名里，同平台两个架构不互相覆盖", () => {
    const x64 = resolveGitHubReleaseChannelFileStem({
      channel: "stable",
      platform: "win32",
      arch: "x64",
    });
    const arm64 = resolveGitHubReleaseChannelFileStem({
      channel: "stable",
      platform: "win32",
      arch: "arm64",
    });

    expect(x64).toBe("latest-win-x64");
    expect(arm64).toBe("latest-win-arm64");
  });
});
