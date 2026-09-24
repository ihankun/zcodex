/**
 * 把 electron-builder 的打包产物整理成 GitHub Release 可直接上传的文件。
 *
 * 客户端按 `https://github.com/<owner>/<repo>/releases/latest/download/<通道>-<平台>-<架构>.yml`
 * 取更新清单，所以这里要做三件事：
 *   1. 把打包生成的清单（`latest-mac.yml` / `latest.yml` / `latest-linux.yml`）按客户端规则改名；
 *   2. 校验清单里的版本、文件大小与 sha512 与实际产物一致——清单错了，用户端更新会直接失败；
 *   3. 把更新说明注入清单（electron-builder 不写这个字段），并给出上传命令。
 *
 * 用法：
 *   node packages/desktop/scripts/publish-github-release.mjs --platform mac --arch arm64 \
 *     --notes-file release-notes.md [--notes-file-en release-notes-en.md] [--upload]
 *
 * 上传约定：
 *   - Release tag 必须是 `v<版本>`（差分更新按这个约定到 `releases/download/v<旧版本>/` 取旧 blockmap）；
 *   - 该 Release 不能是 pre-release，否则 `releases/latest` 会指向别的 Release；
 *   - 同时发布 preview 与 stable 时，两个通道的清单与安装包都要放进同一个最新 Release。
 */
import { spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  createReadStream,
  existsSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { basename, resolve } from "node:path";
import process from "node:process";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";
import {
  GITHUB_RELEASE_UPDATE_OWNER,
  GITHUB_RELEASE_UPDATE_REPO,
  buildGitHubReleaseTag,
  buildGitHubReleaseUpdateFeedUrl,
  resolveGitHubReleaseChannelFileStem,
  resolveGitHubReleasePlatformTag,
} from "./github-release-channel.mjs";
import { getTargetPlatform } from "./target-platform.mjs";

const desktopPackageRoot = resolve(import.meta.dirname, "..");
const workspaceRoot = resolve(desktopPackageRoot, "../..");
const githubRepo = `${GITHUB_RELEASE_UPDATE_OWNER}/${GITHUB_RELEASE_UPDATE_REPO}`;

function fail(message) {
  process.stderr.write(`[publish-github-release] ${message}\n`);
  process.exit(1);
}

function info(message) {
  process.stdout.write(`[publish-github-release] ${message}\n`);
}

const OPTION_KEYS = new Map([
  ["--platform", "platform"],
  ["--arch", "arch"],
  ["--channel", "channel"],
  ["--dist-dir", "distDir"],
  ["--out-dir", "outDir"],
  ["--channel-file", "channelFile"],
  ["--notes-file", "notesFile"],
  ["--notes-file-en", "notesFileEn"],
  ["--release-name", "releaseName"],
  ["--tag", "tag"],
]);

function parseArgs(argv) {
  const options = {
    platform: null,
    arch: null,
    channel: "stable",
    distDir: process.env.ZCODE_DESKTOP_DIST_DIR || resolve(desktopPackageRoot, "dist"),
    outDir: null,
    channelFile: null,
    notesFile: null,
    notesFileEn: null,
    releaseName: null,
    tag: null,
    upload: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--upload") {
      options.upload = true;
      continue;
    }
    const key = OPTION_KEYS.get(arg);
    if (!key) {
      fail(`未知参数：${arg}`);
    }
    const value = argv[index + 1];
    if (!value || value.startsWith("--")) {
      fail(`${arg} 缺少取值`);
    }
    options[key] = value;
    index += 1;
  }

  if (options.channel !== "stable" && options.channel !== "preview") {
    fail(`--channel 只支持 stable / preview，收到：${options.channel}`);
  }
  return options;
}

function normalizePlatform(rawPlatform) {
  switch ((rawPlatform ?? "").toLowerCase()) {
    case "mac":
    case "macos":
    case "darwin":
      return "darwin";
    case "win":
    case "windows":
    case "win32":
      return "win32";
    case "linux":
      return "linux";
    default:
      fail(`不支持的平台：${rawPlatform}（支持 mac / win / linux）`);
  }
}

function normalizeArch(rawArch) {
  switch ((rawArch ?? "").toLowerCase()) {
    case "x64":
    case "amd64":
    case "x86_64":
      return "x64";
    case "arm64":
    case "aarch64":
      return "arm64";
    default:
      fail(`不支持的架构：${rawArch}（支持 x64 / arm64）`);
  }
}

/** electron-builder 写出的清单名：win 无平台后缀，linux 只在非 x64 时带架构后缀。 */
function resolveBuilderChannelFileName(platform, channelWord, arch) {
  const osSuffix = platform === "win32" ? "" : `-${resolveGitHubReleasePlatformTag(platform)}`;
  const archSuffix = platform === "linux" && arch !== "x64" ? `-${arch}` : "";
  return `${channelWord}${osSuffix}${archSuffix}.yml`;
}

function sha512Of(filePath) {
  return new Promise((resolveHash, rejectHash) => {
    const hash = createHash("sha512");
    createReadStream(filePath)
      .on("error", rejectHash)
      .on("data", (chunk) => hash.update(chunk))
      .on("end", () => resolveHash(hash.digest("base64")));
  });
}

async function verifyManifestFiles(yml, distDir) {
  const files = Array.isArray(yml.files) ? yml.files : [];
  if (files.length === 0) {
    fail("清单里没有 files 列表，无法确定要上传的安装包");
  }

  for (const file of files) {
    const fileName = basename(String(file.url ?? ""));
    if (!fileName) {
      fail(`清单条目缺少 url：${JSON.stringify(file)}`);
    }
    const filePath = resolve(distDir, fileName);
    if (!existsSync(filePath)) {
      fail(`清单引用的文件不存在：${fileName}`);
    }

    const size = statSync(filePath).size;
    if (typeof file.size === "number" && file.size !== size) {
      fail(`文件大小与清单不一致：${fileName}（清单 ${file.size}，实际 ${size}）`);
    }

    const sha512 = await sha512Of(filePath);
    if (typeof file.sha512 === "string" && file.sha512 !== sha512) {
      fail(`sha512 与清单不一致：${fileName}，请重新打包，不要手工改清单`);
    }
  }
}

function readNotesFile(filePath, label) {
  if (!filePath) {
    return null;
  }
  const absolutePath = resolve(filePath);
  if (!existsSync(absolutePath)) {
    fail(`${label} 不存在：${absolutePath}`);
  }
  const markdown = readFileSync(absolutePath, "utf-8").trim();
  if (!markdown) {
    fail(`${label} 内容为空：${absolutePath}`);
  }
  return { absolutePath, markdown };
}

/** 更新包同名前缀下的产物（安装包本体与其 blockmap）由 electron-builder 一次生成，一起上传。 */
function resolveUploadFiles(distDir, updateFileName) {
  const prefix = updateFileName.replace(/\.[^.]+$/, "");
  return readdirSync(distDir)
    .filter((entry) => entry.startsWith(`${prefix}.`) || entry.startsWith(`${prefix}-`))
    .map((entry) => resolve(distDir, entry))
    .sort();
}

function runGh(args, hint = "") {
  const result = spawnSync("gh", args, { stdio: "inherit", cwd: workspaceRoot });
  if (result.error) {
    fail(`调用 gh 失败，请先安装并登录 GitHub CLI：${result.error.message}${hint}`);
  }
  if (result.status !== 0) {
    fail(`gh 执行失败（exit ${result.status}）：gh ${args.join(" ")}${hint}`);
  }
}

function ghReleaseExists(tag) {
  const result = spawnSync("gh", ["release", "view", tag, "--repo", githubRepo], {
    stdio: "ignore",
    cwd: workspaceRoot,
  });
  return result.status === 0;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  const targetPlatform = getTargetPlatform();
  const platform = options.platform ? normalizePlatform(options.platform) : targetPlatform.os;
  const arch = options.arch ? normalizeArch(options.arch) : targetPlatform.arch;
  const channelWord = options.channel === "preview" ? "preview" : "latest";

  const version = JSON.parse(readFileSync(resolve(workspaceRoot, "package.json"), "utf-8")).version;
  const tag = options.tag ?? buildGitHubReleaseTag(version);
  const releaseName = options.releaseName ?? `ZCodex ${tag}`;
  const distDir = resolve(options.distDir);
  const outDir = resolve(options.outDir ?? resolve(distDir, "github-release"));

  const builderChannelFile =
    options.channelFile ?? resolveBuilderChannelFileName(platform, channelWord, arch);
  const sourceYmlPath = resolve(distDir, builderChannelFile);
  if (!existsSync(sourceYmlPath)) {
    const candidates = existsSync(distDir)
      ? readdirSync(distDir).filter((entry) => entry.endsWith(".yml"))
      : [];
    fail(
      `未找到清单 ${builderChannelFile}（目录 ${distDir}）` +
        (candidates.length > 0
          ? `；现有清单：${candidates.join(", ")}，可用 --channel-file 指定`
          : ""),
    );
  }

  const yml = parseYaml(readFileSync(sourceYmlPath, "utf-8"));
  if (yml.version !== version) {
    fail(`清单版本 ${yml.version} 与 package.json 版本 ${version} 不一致，请重新打包`);
  }
  await verifyManifestFiles(yml, distDir);

  const updateFileName = basename(String(yml.path ?? ""));
  if (!updateFileName) {
    fail("清单缺少 path 字段，无法确定更新包文件名");
  }

  const notesZh = readNotesFile(options.notesFile, "--notes-file");
  const notesEn = readNotesFile(options.notesFileEn, "--notes-file-en");
  const defaultNotes = notesZh ?? notesEn;
  const outputYml = {
    ...yml,
    releaseName,
    ...(defaultNotes
      ? {
          // 字符串字段供只认 releaseNotes 的消费方兜底；应用内按语言取 releaseNotesByLocale。
          releaseNotes: defaultNotes.markdown,
          releaseNotesByLocale: {
            ...(notesZh ? { "zh-CN": { markdown: notesZh.markdown } } : {}),
            ...(notesEn ? { "en-US": { markdown: notesEn.markdown } } : {}),
          },
        }
      : {}),
  };

  const outputYmlPath = resolve(
    outDir,
    `${resolveGitHubReleaseChannelFileStem({ channel: options.channel, platform, arch })}.yml`,
  );
  mkdirSync(outDir, { recursive: true });
  writeFileSync(outputYmlPath, stringifyYaml(outputYml), "utf-8");

  const uploadFiles = [...resolveUploadFiles(distDir, updateFileName), outputYmlPath];
  const feedUrl = buildGitHubReleaseUpdateFeedUrl();
  const releaseExists = ghReleaseExists(tag);
  const createCommand = [
    "gh",
    "release",
    "create",
    tag,
    "--repo",
    githubRepo,
    "--title",
    releaseName,
    "--latest",
    ...(defaultNotes ? ["--notes-file", defaultNotes.absolutePath] : ["--generate-notes"]),
  ];
  const uploadCommand = [
    "gh",
    "release",
    "upload",
    tag,
    "--repo",
    githubRepo,
    "--clobber",
    ...uploadFiles,
  ];

  info(`版本 ${version}，通道 ${options.channel}，目标 ${platform}-${arch}`);
  info(`客户端将请求：${feedUrl}/${basename(outputYmlPath)}`);
  info(`改名后的清单：${outputYmlPath}`);
  info(defaultNotes ? "已注入更新说明" : "未提供 --notes-file，应用内更新说明为空");
  info(`待上传文件（${uploadFiles.length} 个）：`);
  for (const file of uploadFiles) {
    process.stdout.write(`  ${basename(file)}\n`);
  }
  if (options.channel === "preview") {
    info(
      "注意：preview 清单同样经 releases/latest 访问，该 Release 不能是 pre-release，" +
        "且需要同时包含 stable 通道的清单与安装包，否则 stable 用户取不到文件。",
    );
  }

  if (!options.upload) {
    info("未传 --upload，下面是需要手工执行的命令：");
    process.stdout.write(
      [
        releaseExists
          ? `# ${tag} 已存在 Release，只需上传资源`
          : createCommand.map(quoteCommandArg).join(" "),
        uploadCommand.map(quoteCommandArg).join(" "),
        "",
      ].join("\n"),
    );
    return;
  }

  if (!releaseExists) {
    runGh(createCommand.slice(1));
  }
  runGh(uploadCommand.slice(1), releaseExists ? `（${tag} 已有 Release，资源覆盖上传）` : "");
  info(`已发布到 ${githubRepo} ${tag}`);
}

function quoteCommandArg(arg) {
  return /[\s"]/.test(arg) ? `"${arg.replaceAll('"', '\\"')}"` : arg;
}

await main();
