#!/usr/bin/env node
// i18n key 覆盖检查 —— 代码引用的 message id 是否都能在 locale 里找到，以及
// fork 独有的 key 在合并上游后是否还在。
//
// 背景：packages/ui/src/i18n/locales/{zh-CN,en-US}.ts 是平铺的 `Record<string, string>`，
// 编译器不做 key 校验；intl 找不到 key 时把 id 原样渲染到界面上。2026-10-13 的 v3.15.1
// 合并按「纯字面量改名 → 取上游版本」处理这两个文件，fork 新增的 31 条 key 静默消失，
// 表现为模型设置里的余量面板直接显示 `settings.modelProvider.providerBalance.title`
// 这类字样——lint / 架构检查 / 单测全绿，所以必须显式查（详见 docs/upstream-merge-notes.md
// 第三节与第六节 ⑥）。
//
// 判定：
//   ① 代码里 `id: "xxx.yyy"` 形式引用的 message id，必须在两个 locale 里都存在；只在一个
//      文件里有也按缺失处理。有效 key 空间 = locale 文件 ∪ request-security-edition 的兜底表
//      （该表按语言分两块导出、由 locale 末尾 spread 进来，两块内容并不对称，必须分开算），
//      上游自己存在 zh/en 不齐的 key 收在 KNOWN_UPSTREAM_GAPS 里，见该常量注释。
//   ② 传 --baseline <rev> 时，额外比对 locale 的 key 集合：基线里有、现在没有的 key
//      会逐条列出。合并上游后必跑——fork 新增的 key 被整取上游删掉就是在这里暴露的；
//      上游自己删除的 key 属正常，需人工确认（默认只告警，加 --fail-on-lost 才失败）。
//
// 用法：
//   node scripts/check-i18n-locale-keys.mjs
//   node scripts/check-i18n-locale-keys.mjs --baseline b3484690            # 合并前的 dev tip
//   node scripts/check-i18n-locale-keys.mjs --baseline b3484690 --fail-on-lost

import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { dirname, extname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOCALES = ["zh-CN", "en-US"].map((locale) => ({
  locale,
  path: `packages/ui/src/i18n/locales/${locale}.ts`,
}));
const SECURITY_MESSAGES_PATH = "packages/ui/src/request-security-edition/messages.ts";

// 上游自身就 zh/en 不齐的 key：不属于本 fork 的缺口，不阻塞检查（新增前先确认它在上游
// 两个 locale 里同样缺，别把本地回归藏进来）。
const KNOWN_UPSTREAM_GAPS = new Set(["browser.permission.denyThisTime"]);

const args = process.argv.slice(2);
const baselineIndex = args.indexOf("--baseline");
const baselineRev = baselineIndex >= 0 ? args[baselineIndex + 1] : undefined;
const failOnLost = args.includes("--fail-on-lost");
if (baselineIndex >= 0 && !baselineRev) {
  console.error("[i18n] --baseline 需要一个 git rev");
  process.exit(2);
}

/** 行首 `"key":` 形式的平铺表；多行值不影响 key 的提取 */
function readFlatKeys(text) {
  const keys = new Set();
  for (const match of text.matchAll(/^\s*"([^"]+)":/gm)) {
    keys.add(match[1]);
  }
  return keys;
}

function readKeysFromFile(relativePath) {
  return readFlatKeys(readFileSync(join(repoRoot, relativePath), "utf8"));
}

function readKeysFromGit(rev, relativePath) {
  return readFlatKeys(
    execFileSync("git", ["show", `${rev}:${relativePath}`], {
      cwd: repoRoot,
      encoding: "utf8",
      maxBuffer: 1 << 30,
    }),
  );
}

/** 兜底表的 key 空间（按语言分块；两块内容不对称，不能合并成一个集合） */
function readSecurityKeysByLocale() {
  const text = readFileSync(join(repoRoot, SECURITY_MESSAGES_PATH), "utf8");
  const zhStart = text.indexOf("requestSecurityMessagesZhCN");
  return new Map([
    ["zh-CN", readFlatKeys(zhStart >= 0 ? text.slice(zhStart) : "")],
    ["en-US", readFlatKeys(text.slice(text.indexOf("requestSecurityMessagesEnUS"), zhStart))],
  ]);
}

function collectSourceFiles() {
  const files = [];
  const walk = (absoluteDir) => {
    for (const entry of readdirSync(absoluteDir)) {
      if (["node_modules", "dist", "out", "build", ".git"].includes(entry)) {
        continue;
      }
      const absolutePath = join(absoluteDir, entry);
      if (statSync(absolutePath).isDirectory()) {
        walk(absolutePath);
        continue;
      }
      const relativePath = relative(repoRoot, absolutePath);
      if (![".ts", ".tsx"].includes(extname(entry))) continue;
      if (relativePath.includes("/i18n/locales/")) continue;
      if (relativePath.includes("/request-security-edition/")) continue;
      if (/\.test\.tsx?$/.test(relativePath)) continue;
      files.push({ absolutePath, relativePath });
    }
  };
  for (const workspace of ["packages", "apps"]) {
    walk(join(repoRoot, workspace));
  }
  return files;
}

/** `id: "a.b"` 调用点（formatMessage / defineMessages / defineMessage 的惯例写法） */
function collectReferencedIds(files) {
  const referenced = new Map();
  for (const file of files) {
    const text = readFileSync(file.absolutePath, "utf8");
    for (const match of text.matchAll(/\bid:\s*"([A-Za-z][A-Za-z0-9]*(?:\.[A-Za-z0-9_]+)+)"/g)) {
      const id = match[1];
      if (!referenced.has(id)) {
        referenced.set(id, new Set());
      }
      referenced.get(id).add(file.relativePath);
    }
  }
  return referenced;
}

let failed = false;

// ① 代码引用覆盖
const localeKeys = new Map(LOCALES.map(({ locale, path }) => [locale, readKeysFromFile(path)]));
const securityKeys = readSecurityKeysByLocale();
const effectiveKeys = new Map(
  LOCALES.map(({ locale }) => [
    locale,
    new Set([...localeKeys.get(locale), ...(securityKeys.get(locale) ?? [])]),
  ]),
);
const referencedIds = collectReferencedIds(collectSourceFiles());
const missing = [];
for (const [id, files] of referencedIds) {
  const missingIn = LOCALES.filter(({ locale }) => !effectiveKeys.get(locale).has(id)).map(
    ({ locale }) => locale,
  );
  if (missingIn.length === 0) continue;
  if (missingIn.length < LOCALES.length && KNOWN_UPSTREAM_GAPS.has(id)) continue;
  missing.push({ id, missingIn, files: [...files].slice(0, 3) });
}
const securityCounts = LOCALES.map(
  ({ locale }) => `${locale} ${(securityKeys.get(locale) ?? new Set()).size}`,
).join(" / ");
console.log(
  `[i18n] ① 代码引用 ${referencedIds.size} 个 id（有效 key 空间含 security-edition 兜底表：${securityCounts}）`,
);
if (missing.length) {
  failed = true;
  for (const { id, missingIn, files } of missing) {
    console.error(`  缺失 ${missingIn.join("/")}：${id}  <- ${files.join(", ")}`);
  }
} else {
  console.log("  全部可解析：无缺失");
}

// ② 与基线比对 locale key 集合（合并上游后必跑）
if (baselineRev) {
  for (const { locale, path } of LOCALES) {
    const baselineKeys = readKeysFromGit(baselineRev, path);
    const currentKeys = localeKeys.get(locale);
    const lost = [...baselineKeys].filter((key) => !currentKeys.has(key)).sort();
    console.log(
      `[i18n] ② ${locale}：基线 ${baselineRev} 有 ${baselineKeys.size} 个 key，现在 ${currentKeys.size} 个`,
    );
    if (!lost.length) {
      console.log("  无 key 丢失");
      continue;
    }
    console.error(`  基线里有、现在没有（${lost.length} 条，逐条判断 fork 新增还是上游删除）：`);
    for (const key of lost) {
      console.error(`    ${key}`);
    }
    if (failOnLost) {
      failed = true;
    }
  }
}

process.exit(failed ? 1 : 0);
