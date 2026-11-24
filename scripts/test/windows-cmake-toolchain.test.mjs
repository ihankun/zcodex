import assert from "node:assert/strict";
import { test } from "node:test";
import {
  DEFAULT_WINDOWS_CMAKE_GENERATOR,
  resolveWindowsCmakeExecutable,
  resolveWindowsCmakeGenerator,
} from "../windows-cmake-toolchain.mjs";

test("generator follows the installed Visual Studio major version", () => {
  const install = (versionMajor) => ({ installPath: "C:/VS", versionMajor });
  assert.equal(
    resolveWindowsCmakeGenerator({ env: {}, visualStudio: install(18) }),
    "Visual Studio 18 2026",
  );
  assert.equal(
    resolveWindowsCmakeGenerator({ env: {}, visualStudio: install(17) }),
    "Visual Studio 17 2022",
  );
  assert.equal(
    resolveWindowsCmakeGenerator({ env: {}, visualStudio: install(16) }),
    "Visual Studio 16 2019",
  );
  assert.equal(
    resolveWindowsCmakeGenerator({ env: {}, visualStudio: null }),
    DEFAULT_WINDOWS_CMAKE_GENERATOR,
  );
});

test("explicit generator override wins over detection", () => {
  assert.equal(
    resolveWindowsCmakeGenerator({
      env: { ZCODE_WINDOWS_CMAKE_GENERATOR: " Visual Studio 18 2026 " },
      visualStudio: { installPath: "C:/VS", versionMajor: 17 },
    }),
    "Visual Studio 18 2026",
  );
});

test("bare CMAKE command names are kept without filesystem probing", () => {
  assert.equal(
    resolveWindowsCmakeExecutable({
      env: { CMAKE: "cmake" },
      visualStudio: { installPath: "C:/VS", versionMajor: 18 },
    }),
    "cmake",
  );
});
