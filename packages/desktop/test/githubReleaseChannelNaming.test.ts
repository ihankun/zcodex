import { describe, expect, it } from "vitest";

import {
  resolveElectronBuilderManifestFileName,
  resolveGitHubReleaseChannelFileStem,
  resolveGitHubReleaseManifestFileName,
  resolveUpdateManifestFileCandidates,
} from "../scripts/github-release-channel.mjs";

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

describe("electron-builder 旧清单名识别", () => {
  it("Windows 不分架构，两个架构都写 latest.yml", () => {
    expect(resolveElectronBuilderManifestFileName({ platform: "win32", arch: "x64" })).toBe(
      "latest.yml",
    );
    expect(resolveElectronBuilderManifestFileName({ platform: "win32", arch: "arm64" })).toBe(
      "latest.yml",
    );
  });

  it("macOS 写 latest-mac.yml，Linux 只有 arm64 带架构后缀", () => {
    expect(resolveElectronBuilderManifestFileName({ platform: "darwin", arch: "arm64" })).toBe(
      "latest-mac.yml",
    );
    expect(resolveElectronBuilderManifestFileName({ platform: "darwin", arch: "x64" })).toBe(
      "latest-mac.yml",
    );
    expect(resolveElectronBuilderManifestFileName({ platform: "linux", arch: "x64" })).toBe(
      "latest-linux.yml",
    );
    expect(resolveElectronBuilderManifestFileName({ platform: "linux", arch: "arm64" })).toBe(
      "latest-linux-arm64.yml",
    );
  });

  it("标准名就是在词干后补 .yml", () => {
    expect(
      resolveGitHubReleaseManifestFileName({
        channel: "stable",
        platform: "win32",
        arch: "x64",
      }),
    ).toBe("latest-win-x64.yml");
    expect(
      resolveGitHubReleaseManifestFileName({
        channel: "preview",
        platform: "darwin",
        arch: "arm64",
      }),
    ).toBe("preview-mac-arm64.yml");
  });
});

describe("发布脚本在 dist 中查找清单的候选顺序", () => {
  it("stable 优先标准名，再兼容 electron-builder 旧名", () => {
    expect(
      resolveUpdateManifestFileCandidates({ channel: "stable", platform: "win32", arch: "x64" }),
    ).toEqual(["latest-win-x64.yml", "latest.yml"]);
  });

  it("preview 先找 preview 标准名，再读打包写出的 latest 标准名，最后回退旧名", () => {
    expect(
      resolveUpdateManifestFileCandidates({ channel: "preview", platform: "win32", arch: "x64" }),
    ).toEqual(["preview-win-x64.yml", "latest-win-x64.yml", "latest.yml"]);
  });

  it("旧名与标准名相同时去重", () => {
    expect(
      resolveUpdateManifestFileCandidates({ channel: "stable", platform: "linux", arch: "arm64" }),
    ).toEqual(["latest-linux-arm64.yml"]);
  });
});
