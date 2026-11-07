import { existsSync } from "node:fs";
import { readFile, rename, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { parse } from "yaml";
import {
  resolveElectronBuilderManifestFileName,
  resolveGitHubReleaseManifestFileName,
  resolveGitHubReleasePlatformTag,
} from "./github-release-channel.mjs";

/**
 * 打包收尾：把 electron-builder 写出的 `latest*.yml` 改成客户端检索的标准名。
 *
 * electron-builder 的清单名由上游写死（Windows 恒为 `latest.yml`），无法通过配置带上
 * 平台和架构；此前只能等 `publish:github` 再改名，dist 产物与客户端约定不一致，
 * 手工部署或直接取 dist 文件时会 404。这里在 electron-builder 结束后统一改名，
 * 让 dist 直接就是 `<通道>-<平台>-<架构>.yml`。
 */
export async function normalizeUpdateManifestName({
  outputDir,
  platform,
  arch,
  channel = "stable",
}) {
  const sourceName = resolveElectronBuilderManifestFileName({ platform, arch });
  const targetName = resolveGitHubReleaseManifestFileName({ channel, platform, arch });
  const sourcePath = join(outputDir, sourceName);
  const targetPath = join(outputDir, targetName);

  if (!existsSync(sourcePath)) {
    throw new Error(`未找到 electron-builder 生成的更新清单 ${sourceName}（目录 ${outputDir}）`);
  }
  await assertManifestReferencesTargetArtifact(sourcePath, { platform, arch });

  if (sourceName === targetName) {
    return { fileName: targetName, renamed: false };
  }

  // 先删掉上次构建留下的同名清单，避免 dist 里同时存在两个版本的清单。
  await rm(targetPath, { force: true });
  await rename(sourcePath, targetPath);
  return { fileName: targetName, renamed: true };
}

async function assertManifestReferencesTargetArtifact(filePath, { platform, arch }) {
  const manifest = parse(await readFile(filePath, "utf8"));
  const referencedFiles = [
    manifest?.path,
    ...(Array.isArray(manifest?.files) ? manifest.files.map((file) => file?.url) : []),
  ]
    .filter((value) => typeof value === "string" && value.length > 0)
    .map((value) => basename(value));
  const targetToken = `-${resolveGitHubReleasePlatformTag(platform)}-${arch}`;
  if (!referencedFiles.some((fileName) => fileName.includes(targetToken))) {
    // 复用 dist 目录、跨架构连续打包时，旧清单可能残留并引用另一架构的安装包；
    // 改名后客户端会拿到不匹配的文件，必须在这里失败。
    throw new Error(
      `更新清单 ${basename(filePath)} 未引用 ${targetToken.slice(1)} 安装包（实际引用：${
        referencedFiles.join(", ") || "无"
      }）`,
    );
  }
}
