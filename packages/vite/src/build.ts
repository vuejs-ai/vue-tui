import { isBuiltin } from "node:module";
import {
  defaultServerConditions,
  defaultServerMainFields,
  type BuildEnvironmentOptions,
  type Plugin,
  type Rolldown,
} from "vite";

function defaultEntryFileName(
  format: Rolldown.OutputOptions["format"],
  reservedNames: Set<string>,
): string {
  const extension = format === "cjs" || format === "commonjs" ? "cjs" : "mjs";
  let sequence = 1;
  let name = `main.${extension}`;
  while (reservedNames.has(name)) {
    sequence += 1;
    name = `main-${sequence}.${extension}`;
  }
  reservedNames.add(name);
  return name;
}

function applyOutputDefaults(
  output: Rolldown.OutputOptions,
  reservedNames: Set<string>,
): Rolldown.OutputOptions {
  const format = output.format ?? "esm";
  return {
    ...output,
    format,
    entryFileNames: output.entryFileNames ?? defaultEntryFileName(format, reservedNames),
    codeSplitting: output.codeSplitting ?? false,
  };
}

function applyOutputListDefaults(outputs: Rolldown.OutputOptions[]): Rolldown.OutputOptions[] {
  const reservedNames = new Set(
    outputs.flatMap((output) =>
      typeof output.entryFileNames === "string" ? [output.entryFileNames] : [],
    ),
  );
  return outputs.map((output) => applyOutputDefaults(output, reservedNames));
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
        ? applyOutputListDefaults(output)
        : applyOutputDefaults(output ?? {}, new Set()),
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
        config.resolve = {
          ...config.resolve,
          conditions: config.resolve?.conditions ?? [...defaultServerConditions],
          mainFields: config.resolve?.mainFields ?? [...defaultServerMainFields],
        };
        config.build = applyBuildDefaults(config.build ?? {});
      },
    },
  };
}
