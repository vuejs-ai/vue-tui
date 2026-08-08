import { expect, test } from "vite-plus/test";
import { resolveConfig, type EnvironmentOptions, type UserConfig } from "vite";
import { buildPlugin } from "../src/build.ts";

function applyBuildDefaults(config: UserConfig): UserConfig {
  const hook = buildPlugin().configEnvironment!;
  const handler = typeof hook === "function" ? hook : hook.handler;
  const environment: EnvironmentOptions = { build: config.build };
  Reflect.apply(handler, undefined, ["client", environment]);
  config.build = environment.build;
  return config;
}

test("provides a standalone Node bundle by default", () => {
  const config = applyBuildDefaults({});
  const build = config.build!;
  const rolldown = build.rolldownOptions!;
  const output = rolldown.output as NonNullable<typeof rolldown.output> & {
    format: string;
    entryFileNames: string;
    codeSplitting: boolean;
  };
  const external = rolldown.external as (id: string) => boolean;

  expect(build.target).toBe("node22");
  expect(build.modulePreload).toBe(false);
  expect(build.copyPublicDir).toBe(false);
  expect(rolldown.platform).toBe("node");
  expect(external("node:fs")).toBe(true);
  expect(external("fs")).toBe(true);
  expect(external("vue")).toBe(false);
  expect(config.resolve).toBeUndefined();
  expect(output).toMatchObject({
    format: "esm",
    entryFileNames: "main.mjs",
    codeSplitting: false,
  });
});

test("preserves explicit build options", () => {
  const external = () => false;
  const modulePreload = { polyfill: true };
  const output = {
    format: "cjs" as const,
    entryFileNames: "cli.cjs",
    codeSplitting: true,
  };
  const config = applyBuildDefaults({
    build: {
      target: false,
      modulePreload,
      copyPublicDir: true,
      rolldownOptions: {
        platform: "neutral",
        external,
        output,
      },
    },
  });

  expect(config.build).toMatchObject({
    target: false,
    modulePreload,
    copyPublicDir: true,
  });
  expect(config.build!.rolldownOptions).toMatchObject({
    platform: "neutral",
    external,
    output,
  });
});

test("fills missing fields in an explicit output", () => {
  const config = applyBuildDefaults({
    build: {
      rolldownOptions: {
        output: { entryFileNames: "cli.mjs", sourcemap: true },
      },
    },
  });

  expect(config.build!.rolldownOptions!.output).toMatchObject({
    format: "esm",
    entryFileNames: "cli.mjs",
    codeSplitting: false,
    sourcemap: true,
  });
});

test("fills each output without replacing explicit fields", () => {
  const config = applyBuildDefaults({
    build: {
      rolldownOptions: {
        output: [{ format: "cjs" }, { entryFileNames: "worker.mjs", codeSplitting: true }],
      },
    },
  });

  expect(config.build!.rolldownOptions!.output).toEqual([
    { format: "cjs", entryFileNames: "main.mjs", codeSplitting: false },
    { format: "esm", entryFileNames: "worker.mjs", codeSplitting: true },
  ]);
});

test("fills config from other plugins after Vite merges it", async () => {
  const external = ["virtual:external"];
  const config = await resolveConfig(
    {
      configFile: false,
      logLevel: "silent",
      plugins: [
        buildPlugin(),
        {
          name: "application-config",
          config() {
            return {
              build: {
                rolldownOptions: {
                  external,
                  output: [{ entryFileNames: "cli.mjs", codeSplitting: true }],
                },
              },
            };
          },
        },
      ],
    },
    "build",
  );

  const build = config.environments.client.build;
  expect(build.rolldownOptions.external).toEqual(external);
  expect(build.rolldownOptions.output).toEqual([
    { format: "esm", entryFileNames: "cli.mjs", codeSplitting: true },
  ]);
});

test("preserves client environment build options", async () => {
  const config = await resolveConfig(
    {
      configFile: false,
      logLevel: "silent",
      environments: {
        client: {
          build: {
            target: "node20",
            rolldownOptions: {
              platform: "neutral",
              external: [],
              output: [{ format: "cjs", entryFileNames: "env.cjs", codeSplitting: true }],
            },
          },
        },
      },
      plugins: [buildPlugin()],
    },
    "build",
  );

  const build = config.environments.client.build;
  expect(build.target).toBe("node20");
  expect(build.rolldownOptions.platform).toBe("neutral");
  expect(build.rolldownOptions.external).toEqual([]);
  expect(build.rolldownOptions.output).toEqual([
    { format: "cjs", entryFileNames: "env.cjs", codeSplitting: true },
  ]);
});

test("does not configure other environments", async () => {
  const config = await resolveConfig(
    {
      configFile: false,
      logLevel: "silent",
      environments: { worker: {} },
      plugins: [buildPlugin()],
    },
    "build",
  );

  expect(config.environments.worker.build.target).toEqual(expect.arrayContaining(["chrome111"]));
  expect(config.environments.worker.build.rolldownOptions.platform).toBe("node");
  expect(config.environments.worker.build.rolldownOptions.output).toBeUndefined();
});

test("only applies during builds", () => {
  const plugin = buildPlugin();
  expect(plugin.apply).toBe("build");
  expect(plugin.enforce).toBe("post");
  expect(plugin.configEnvironment).toMatchObject({ order: "post" });
});
