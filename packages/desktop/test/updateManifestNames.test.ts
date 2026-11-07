import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, expect, it } from "vitest";
import { parse } from "yaml";
import { normalizeUpdateManifestName } from "../scripts/update-manifest-names.mjs";

const roots: string[] = [];
afterEach(async () => {
  await Promise.all(roots.splice(0).map((root) => rm(root, { recursive: true, force: true })));
});

function manifestFor(artifactName, version = "1.5.3") {
  return [
    `version: ${version}`,
    "files:",
    `  - url: ${artifactName}`,
    "    sha512: checksum",
    `path: ${artifactName}`,
    "",
  ].join("\n");
}

async function fixture(fileName, artifactName, version = "1.5.3") {
  const outputDir = await mkdtemp(join(tmpdir(), "zcode-update-manifest-name-"));
  roots.push(outputDir);
  await writeFile(join(outputDir, fileName), manifestFor(artifactName, version));
  return outputDir;
}

it("Windows 清单改成 latest-win-<架构>.yml，内容保持不变", async () => {
  const outputDir = await fixture("latest.yml", "ZCodex-1.5.3-win-x64.exe");

  const result = await normalizeUpdateManifestName({ outputDir, platform: "win", arch: "x64" });

  expect(result).toEqual({ fileName: "latest-win-x64.yml", renamed: true });
  expect(existsSync(join(outputDir, "latest.yml"))).toBe(false);
  expect(parse(await readFile(join(outputDir, "latest-win-x64.yml"), "utf8"))).toEqual({
    version: "1.5.3",
    files: [{ url: "ZCodex-1.5.3-win-x64.exe", sha512: "checksum" }],
    path: "ZCodex-1.5.3-win-x64.exe",
  });
});

it("macOS 清单按架构区分，避免同一 Release 的两个架构互相覆盖", async () => {
  const arm64Dir = await fixture("latest-mac.yml", "ZCodex-1.5.3-mac-arm64.zip");
  const x64Dir = await fixture("latest-mac.yml", "ZCodex-1.5.3-mac-x64.zip");

  await normalizeUpdateManifestName({ outputDir: arm64Dir, platform: "mac", arch: "arm64" });
  await normalizeUpdateManifestName({ outputDir: x64Dir, platform: "mac", arch: "x64" });

  expect(existsSync(join(arm64Dir, "latest-mac-arm64.yml"))).toBe(true);
  expect(existsSync(join(x64Dir, "latest-mac-x64.yml"))).toBe(true);
});

it("Linux x64 清单补上架构后缀，arm64 已经是标准名时不动文件", async () => {
  const x64Dir = await fixture("latest-linux.yml", "ZCodex-1.5.3-linux-x64.AppImage");
  const arm64Dir = await fixture("latest-linux-arm64.yml", "ZCodex-1.5.3-linux-arm64.AppImage");

  expect(
    await normalizeUpdateManifestName({ outputDir: x64Dir, platform: "linux", arch: "x64" }),
  ).toEqual({ fileName: "latest-linux-x64.yml", renamed: true });
  expect(
    await normalizeUpdateManifestName({ outputDir: arm64Dir, platform: "linux", arch: "arm64" }),
  ).toEqual({ fileName: "latest-linux-arm64.yml", renamed: false });
});

it("preview 通道也按标准名输出", async () => {
  const outputDir = await fixture("latest.yml", "ZCodex-1.5.3-win-x64.exe");

  const result = await normalizeUpdateManifestName({
    outputDir,
    platform: "win",
    arch: "x64",
    channel: "preview",
  });

  expect(result).toEqual({ fileName: "preview-win-x64.yml", renamed: true });
  expect(existsSync(join(outputDir, "preview-win-x64.yml"))).toBe(true);
});

it("覆盖上一次构建残留的同名清单", async () => {
  const outputDir = await fixture("latest.yml", "ZCodex-1.5.4-win-x64.exe", "1.5.4");
  await writeFile(join(outputDir, "latest-win-x64.yml"), manifestFor("ZCodex-1.5.3-win-x64.exe"));

  await normalizeUpdateManifestName({ outputDir, platform: "win", arch: "x64" });

  expect(parse(await readFile(join(outputDir, "latest-win-x64.yml"), "utf8")).version).toBe(
    "1.5.4",
  );
});

it("清单引用其他架构的安装包时拒绝改名", async () => {
  const outputDir = await fixture("latest.yml", "ZCodex-1.5.3-win-arm64.exe");

  await expect(
    normalizeUpdateManifestName({ outputDir, platform: "win", arch: "x64" }),
  ).rejects.toThrow(/未引用 win-x64 安装包/);
  // 失败时保留 electron-builder 的原文件，便于排查。
  expect(existsSync(join(outputDir, "latest.yml"))).toBe(true);
});

it("没有 electron-builder 清单时直接失败", async () => {
  const outputDir = await mkdtemp(join(tmpdir(), "zcode-update-manifest-name-"));
  roots.push(outputDir);

  await expect(
    normalizeUpdateManifestName({ outputDir, platform: "win", arch: "x64" }),
  ).rejects.toThrow(/未找到 electron-builder 生成的更新清单 latest\.yml/);
});
