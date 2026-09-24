import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

import { withPinnedNodePath } from "./mise-toolchain-env.mjs";
import { quoteArgsForWindowsShell } from "./spawn-command.mjs";

// 正式版打包固定 production 身份：未显式设置 ZCODE_ENV 时 bundle 会按 fail-safe
// 落到 Preview 身份并附加 _TEST 产物后缀（见 packages/desktop/scripts/desktop-product-identity.mjs）。
const targetOs = process.argv[2]?.trim().toLowerCase();
if (targetOs !== "mac" && targetOs !== "win" && targetOs !== "linux") {
  console.error("Usage: node scripts/bundle-desktop-env.mjs <mac|win|linux> [arch]");
  process.exit(1);
}
const targetArch = process.argv[3]?.trim().toLowerCase();

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const pnpmCommand = process.platform === "win32" ? "pnpm.cmd" : "pnpm";

const bundleArgs = ["bundle:desktop", "--", "--os", targetOs];
if (targetArch) {
  bundleArgs.push("--arch", targetArch);
}
const spawnArgs = process.platform === "win32" ? quoteArgsForWindowsShell(bundleArgs) : bundleArgs;

const child = spawn(pnpmCommand, spawnArgs, {
  cwd: repoRoot,
  env: withPinnedNodePath({ ...process.env, ZCODE_ENV: "production" }, process.execPath),
  stdio: "inherit",
  // Windows .cmd/.bat executables (pnpm.cmd, npm.cmd, etc.) require shell: true
  shell: process.platform === "win32",
});

child.on("error", (error) => {
  console.error(error);
  process.exit(1);
});
child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 1));
});
