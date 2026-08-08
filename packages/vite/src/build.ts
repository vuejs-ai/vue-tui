import { isBuiltin } from "node:module";
import type { BuildEnvironmentOptions, Plugin, Rolldown } from "vite";

function applyOutputDefaults(output: Rolldown.OutputOptions): void {
  output.format ??= "esm";
  output.entryFileNames ??= "main.mjs";
  output.codeSplitting ??= false;
}

function applyBuildDefaults(build: BuildEnvironmentOptions): void {
  build.target ??= "node22";
  build.modulePreload ??= false;
  build.copyPublicDir ??= false;

  const rolldownOptions = (build.rolldownOptions ??= {});
  rolldownOptions.platform ??= "node";
  rolldownOptions.external ??= isBuiltin;

  if (rolldownOptions.output === undefined) {
    rolldownOptions.output = {};
  }
  const outputs = Array.isArray(rolldownOptions.output)
    ? rolldownOptions.output
    : [rolldownOptions.output];
  for (const output of outputs) applyOutputDefaults(output);
}

export function buildPlugin(): Plugin {
  return {
    name: "vue-tui:build",
    apply: "build",
    enforce: "post",
    configEnvironment: {
      order: "post",
      handler(name, config) {
        if (name === "client") applyBuildDefaults((config.build ??= {}));
      },
    },
  };
}
