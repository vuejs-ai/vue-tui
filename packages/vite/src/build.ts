import { isBuiltin } from "node:module";
import type { BuildEnvironmentOptions, Plugin, Rolldown } from "vite";

function applyOutputDefaults(output: Rolldown.OutputOptions): Rolldown.OutputOptions {
  return {
    ...output,
    format: output.format ?? "esm",
    entryFileNames: output.entryFileNames ?? "main.mjs",
    codeSplitting: output.codeSplitting ?? false,
  };
}

function applyBuildDefaults(build: BuildEnvironmentOptions): BuildEnvironmentOptions {
  const rolldownOptions = build.rolldownOptions ?? {};
  const output = rolldownOptions.output;

  return {
    ...build,
    target: build.target ?? "node22",
    modulePreload: build.modulePreload ?? false,
    copyPublicDir: build.copyPublicDir ?? false,
    rolldownOptions: {
      ...rolldownOptions,
      platform: rolldownOptions.platform ?? "node",
      external: rolldownOptions.external ?? isBuiltin,
      output: Array.isArray(output)
        ? output.map(applyOutputDefaults)
        : applyOutputDefaults(output ?? {}),
    },
  };
}

export function buildPlugin(): Plugin {
  return {
    name: "vue-tui:build",
    apply: "build",
    enforce: "post",
    configEnvironment: {
      order: "post",
      handler(name, config, { mode }) {
        if (name !== "client") return;
        config.keepProcessEnv ??= true;
        if (config.keepProcessEnv) {
          const nodeEnv = JSON.stringify(process.env.NODE_ENV || mode);
          const define = (config.define = { ...config.define });
          define["process.env.NODE_ENV"] ??= nodeEnv;
          define["global.process.env.NODE_ENV"] ??= nodeEnv;
          define["globalThis.process.env.NODE_ENV"] ??= nodeEnv;
        }
        config.build = applyBuildDefaults(config.build ?? {});
      },
    },
  };
}
