import { describe, expect, it } from "vitest";
import { join } from "node:path";

import { resolvePackagingBuildEnv } from "../../../scripts/packaging-build-env.mjs";
import { resolveBuildTimeConfig } from "../../../scripts/build-time-config.mjs";

describe("packaging build env", () => {
  it("打包入口默认固定 production 身份并开启自动更新", () => {
    expect(resolvePackagingBuildEnv({})).toMatchObject({
      ZCODE_ENV: "production",
      ZCODE_AUTO_UPDATE: "1",
    });
  });

  it("显式关闭自动更新优先于默认值", () => {
    // 空字符串在 build-time-config 里表示关闭，不能被默认值覆盖。
    expect(resolvePackagingBuildEnv({ ZCODE_AUTO_UPDATE: "" }).ZCODE_AUTO_UPDATE).toBe("");
    expect(resolvePackagingBuildEnv({ ZCODE_AUTO_UPDATE: "0" }).ZCODE_AUTO_UPDATE).toBe("0");
  });

  it("打包入口不接受 ZCODE_ENV 覆盖，也不修改入参", () => {
    const env = { ZCODE_ENV: "test", SOME_OTHER_FLAG: "kept" };
    const resolved = resolvePackagingBuildEnv(env);

    expect(resolved.ZCODE_ENV).toBe("production");
    expect(resolved.SOME_OTHER_FLAG).toBe("kept");
    expect(env.ZCODE_ENV).toBe("test");
  });

  it("默认值经 build-time-config 解析后确实启用自动更新", async () => {
    const config = await resolveBuildTimeConfig(resolvePackagingBuildEnv({}), {
      defaultsPath: join(import.meta.dirname, "missing-build-defaults.json"),
    });

    expect(config.autoUpdateEnabled).toBe(true);
  });
});
