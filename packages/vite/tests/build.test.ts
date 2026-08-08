import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { expect, test } from "vite-plus/test";
import {
  build,
  defaultServerConditions,
  defaultServerMainFields,
  resolveConfig,
  type EnvironmentOptions,
  type InlineConfig,
  type UserConfig,
} from "vite";
import { buildPlugin } from "../src/build.ts";

function applyBuildDefaults(config: UserConfig): UserConfig {
  const hook = buildPlugin().configEnvironment!;
  const handler = typeof hook === "function" ? hook : hook.handler;
  const environment: EnvironmentOptions = { build: config.build, resolve: config.resolve };
  Reflect.apply(handler, undefined, [
    "client",
    environment,
    { command: "build", mode: "production" },
  ]);
  config.build = environment.build;
  config.resolve = environment.resolve;
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
  expect(config.resolve).toMatchObject({
    conditions: defaultServerConditions,
    mainFields: defaultServerMainFields,
  });
  expect(output).toMatchObject({
    format: "esm",
    entryFileNames: "main.mjs",
    codeSplitting: false,
  });
});

test("fills missing resolver fields without replacing explicit fields", () => {
  const conditions = ["custom-condition"];
  const mainFields = ["custom-main"];
  const conditionsConfig = applyBuildDefaults({ resolve: { conditions } });
  const mainFieldsConfig = applyBuildDefaults({ resolve: { mainFields } });

  expect(conditionsConfig.resolve).toMatchObject({
    conditions,
    mainFields: defaultServerMainFields,
  });
  expect(mainFieldsConfig.resolve).toMatchObject({
    conditions: defaultServerConditions,
    mainFields,
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
    { format: "cjs", entryFileNames: "main.cjs", codeSplitting: false },
    { format: "esm", entryFileNames: "worker.mjs", codeSplitting: true },
  ]);
});

test("gives missing output names compatible extensions without collisions", () => {
  const config = applyBuildDefaults({
    build: {
      rolldownOptions: {
        output: [{}, {}, { format: "cjs" }, { format: "commonjs" }],
      },
    },
  });

  expect(config.build!.rolldownOptions!.output).toEqual([
    { format: "esm", entryFileNames: "main.mjs", codeSplitting: false },
    { format: "esm", entryFileNames: "main-2.mjs", codeSplitting: false },
    { format: "cjs", entryFileNames: "main.cjs", codeSplitting: false },
    { format: "commonjs", entryFileNames: "main-2.cjs", codeSplitting: false },
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

  const client = config.environments.client;
  const build = client.build;
  expect(client.keepProcessEnv).toBe(true);
  expect(client.resolve.conditions).toEqual(defaultServerConditions);
  expect(client.resolve.mainFields).toEqual(defaultServerMainFields);
  expect(build.rolldownOptions.external).toEqual(external);
  expect(build.rolldownOptions.output).toEqual([
    { format: "esm", entryFileNames: "cli.mjs", codeSplitting: true },
  ]);
});

test("resolves conditional exports for Node during production builds", async () => {
  const root = mkdtempSync(path.join(tmpdir(), "vue-tui-vite-node-conditions-"));
  const packageRoot = path.join(root, "node_modules", "conditional-runtime");
  mkdirSync(packageRoot, { recursive: true });
  writeFileSync(
    path.join(packageRoot, "package.json"),
    JSON.stringify({
      name: "conditional-runtime",
      type: "module",
      exports: {
        ".": {
          browser: "./browser.js",
          node: "./node.js",
          default: "./default.js",
        },
      },
    }),
  );
  writeFileSync(path.join(packageRoot, "browser.js"), 'export default "browser-runtime";');
  writeFileSync(path.join(packageRoot, "node.js"), 'export default "node-runtime";');
  writeFileSync(path.join(packageRoot, "default.js"), 'export default "default-runtime";');
  writeFileSync(
    path.join(root, "entry.js"),
    'import runtime from "conditional-runtime"; console.log(runtime);',
  );

  let outputCode: string | undefined;
  try {
    await build({
      root,
      configFile: false,
      logLevel: "silent",
      input: "entry.js",
      build: { minify: false, write: false },
      plugins: [
        buildPlugin(),
        {
          name: "capture-output",
          generateBundle(_options, bundle) {
            const chunk = Object.values(bundle).find((output) => output.type === "chunk");
            outputCode = chunk?.code;
          },
        },
      ],
    });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }

  expect(outputCode).toContain("node-runtime");
  expect(outputCode).not.toContain("browser-runtime");
});

test("keeps runtime environment values without keeping NODE_ENV", async () => {
  let outputCode: string | undefined;

  await build({
    configFile: false,
    logLevel: "silent",
    input: "virtual:environment-entry",
    build: { minify: false, write: false },
    plugins: [
      {
        name: "virtual-environment-entry",
        resolveId(id) {
          if (id === "virtual:environment-entry") return id;
        },
        load(id) {
          if (id === "virtual:environment-entry") {
            return 'console.log(process.env["RUNTIME_VALUE"], process.env.NODE_ENV, global.process.env.NODE_ENV, globalThis.process.env.NODE_ENV);';
          }
        },
      },
      buildPlugin(),
      {
        name: "capture-output",
        generateBundle(_options, bundle) {
          const chunk = Object.values(bundle).find((output) => output.type === "chunk");
          outputCode = chunk?.code;
        },
      },
    ],
  });

  expect(outputCode).toMatch(/process\.env(?:\.RUNTIME_VALUE|\["RUNTIME_VALUE"\])/);
  expect(outputCode).not.toContain("NODE_ENV");
  expect(outputCode).toContain(JSON.stringify(process.env.NODE_ENV || "production"));
});

test("preserves explicit NODE_ENV definitions", async () => {
  const definitions = {
    "process.env.NODE_ENV": '"process-value"',
    "global.process.env.NODE_ENV": '"global-value"',
    "globalThis.process.env.NODE_ENV": '"global-this-value"',
  };
  const config = await resolveConfig(
    {
      configFile: false,
      logLevel: "silent",
      environments: { client: { keepProcessEnv: true, define: definitions } },
      plugins: [buildPlugin()],
    },
    "build",
  );

  expect(config.environments.client.define).toEqual(definitions);
});

test("adds NODE_ENV definitions only to the client environment", async () => {
  const rootDefine = { CUSTOM: "true" };
  const expectedRootDefine = { ...rootDefine };
  const config = await resolveConfig(
    {
      configFile: false,
      logLevel: "silent",
      define: rootDefine,
      environments: { worker: {} },
      plugins: [buildPlugin()],
    },
    "build",
  );

  expect(rootDefine).toEqual(expectedRootDefine);
  expect(config.define).toEqual(expectedRootDefine);
  expect(config.environments.worker.define).toEqual(expectedRootDefine);
  expect(config.environments.client.define).toMatchObject({
    ...expectedRootDefine,
    "process.env.NODE_ENV": expect.any(String),
    "global.process.env.NODE_ENV": expect.any(String),
    "globalThis.process.env.NODE_ENV": expect.any(String),
  });
  expect(config.environments.client.define).not.toBe(rootDefine);
});

test("adds build defaults only to the client environment", async () => {
  const rootOutput = { entryFileNames: "root.mjs" };
  const rootBuild = { rolldownOptions: { output: rootOutput } };
  const workerConditions = ["worker-condition"];
  const workerMainFields = ["worker-main"];
  const userConfig: InlineConfig = {
    configFile: false,
    logLevel: "silent",
    build: rootBuild,
    environments: {
      worker: { resolve: { conditions: workerConditions, mainFields: workerMainFields } },
    },
    plugins: [buildPlugin()],
  };
  const config = await resolveConfig(userConfig, "build");

  expect(rootBuild).not.toHaveProperty("target");
  expect(rootOutput).toEqual({ entryFileNames: "root.mjs" });
  // Vite exposes the resolved client resolver through the root compatibility config.
  expect(config.resolve.conditions).toEqual(defaultServerConditions);
  expect(config.resolve.mainFields).toEqual(defaultServerMainFields);
  expect(config.build.target).not.toBe("node22");
  expect(config.environments.worker.resolve.conditions).toEqual(workerConditions);
  expect(config.environments.worker.resolve.mainFields).toEqual(workerMainFields);
  expect(config.environments.worker.build.target).not.toBe("node22");
  expect(config.environments.client.resolve.conditions).toEqual(defaultServerConditions);
  expect(config.environments.client.resolve.mainFields).toEqual(defaultServerMainFields);
  expect(config.environments.client.build).toMatchObject({
    target: "node22",
    rolldownOptions: {
      output: { format: "esm", entryFileNames: "root.mjs", codeSplitting: false },
    },
  });
});

test("preserves client environment build options", async () => {
  const config = await resolveConfig(
    {
      configFile: false,
      logLevel: "silent",
      environments: {
        client: {
          keepProcessEnv: false,
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

  const client = config.environments.client;
  const build = client.build;
  expect(client.keepProcessEnv).toBe(false);
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
