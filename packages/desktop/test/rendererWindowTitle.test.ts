import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { formatZCodeRendererProcessName } from "@zcode/shared";

// 主窗口标题（renderer/index.html 的 `<title>`）与 process-names 的默认值分支是一对耦合：
// 只改标题、不改 formatZCodeRendererProcessName，渲染进程名会从 `zcode-renderer-main`
// 退化成 `zcode-renderer-<slug>`，在资源管理器的进程列表里直接可见。
function readRendererWindowTitle(): string {
  const html = readFileSync(new URL("../src/renderer/index.html", import.meta.url), "utf8");
  const match = html.match(/<title>([^<]*)<\/title>/u);
  assert.ok(match, "renderer/index.html 应当有 <title>");
  return match[1].trim();
}

test("desktop renderer window title maps to the default renderer process name", () => {
  assert.equal(formatZCodeRendererProcessName(readRendererWindowTitle()), "zcode-renderer-main");
});

test("untitled windows and the resource manager keep their dedicated process names", () => {
  assert.equal(formatZCodeRendererProcessName(undefined), "zcode-renderer-main");
  assert.equal(
    formatZCodeRendererProcessName("Resource Manager"),
    "zcode-renderer-resource-manager",
  );
});

test("a real window title is slugged into the process name", () => {
  assert.equal(formatZCodeRendererProcessName("My Workspace"), "zcode-renderer-my-workspace");
});
