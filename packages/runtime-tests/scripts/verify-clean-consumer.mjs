import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const temporaryRoot = mkdtempSync(join(tmpdir(), "vue-tui-clean-consumer-"));
const tarballDirectory = join(temporaryRoot, "tarballs");
const consumerDirectory = join(temporaryRoot, "consumer");
mkdirSync(tarballDirectory);
mkdirSync(consumerDirectory);

function run(command, args, cwd = repositoryRoot) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, CI: "true" },
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const stdout = typeof error.stdout === "string" ? error.stdout : "";
    const stderr = typeof error.stderr === "string" ? error.stderr : "";
    throw new Error(`${command} ${args.join(" ")} failed in ${cwd}\n${stdout}${stderr}`, {
      cause: error,
    });
  }
}

function pack(packageDirectory) {
  const result = JSON.parse(
    run("pnpm", ["pack", "--pack-destination", tarballDirectory, "--json"], packageDirectory),
  );
  return result.filename;
}

function collectVueVersions(value, versions = new Set()) {
  if (!value || typeof value !== "object") return versions;
  for (const [key, nested] of Object.entries(value)) {
    if (
      key === "vue" &&
      nested &&
      typeof nested === "object" &&
      typeof nested.version === "string"
    ) {
      versions.add(nested.version);
    }
    collectVueVersions(nested, versions);
  }
  return versions;
}

try {
  run("vp", ["run", "@vue-tui/runtime#build"]);
  run("vp", ["run", "@vue-tui/testing#build"]);
  const runtimeTarball = pack(join(repositoryRoot, "packages/runtime"));
  const testingTarball = pack(join(repositoryRoot, "packages/testing"));

  writeFileSync(
    join(consumerDirectory, "package.json"),
    JSON.stringify(
      {
        private: true,
        type: "module",
        dependencies: {
          "@vue-tui/runtime": `file:${runtimeTarball}`,
          "@vue-tui/testing": `file:${testingTarball}`,
          vue: "3.4.38",
        },
        devDependencies: {
          "@types/node": "24.12.4",
          typescript: "6.0.3",
          "vue-tsc": "3.3.4",
        },
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(consumerDirectory, "tsconfig.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "NodeNext",
          moduleResolution: "NodeNext",
          strict: true,
          skipLibCheck: false,
          noEmit: true,
          types: ["node"],
        },
        include: ["consumer.ts"],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(consumerDirectory, "tsconfig.sfc.json"),
    JSON.stringify(
      {
        compilerOptions: {
          target: "ES2022",
          module: "ESNext",
          moduleResolution: "Bundler",
          strict: true,
          skipLibCheck: false,
          noEmit: true,
          types: ["node"],
        },
        include: ["App.vue"],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(consumerDirectory, "consumer.ts"),
    `import { useStdin, type MountOptions, type UseStdinReturn } from "@vue-tui/runtime";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;
type _ExactStdinSurface = Expect<
  Equal<UseStdinReturn, { readonly stdin: NodeJS.ReadStream }>
>;

useStdin().stdin;
// @ts-expect-error Raw-mode control is internal to semantic input routes.
useStdin().setRawMode(false);
// @ts-expect-error Raw-mode availability is not part of the public stdin escape hatch.
useStdin().isRawModeSupported;
// @ts-expect-error The removed mount option must not survive in packaged declarations.
const removedRawMode: MountOptions = { rawMode: "auto" };
void removedRawMode;
`,
  );
  writeFileSync(
    join(consumerDirectory, "App.vue"),
    `<script setup lang="ts">
import { Text, useStdin } from "@vue-tui/runtime";

const mountedStdin = useStdin();
mountedStdin.stdin;
// @ts-expect-error Raw-mode control is not exposed by useStdin().
mountedStdin.setRawMode(false);
</script>

<template>
  <Text>clean consumer</Text>
</template>
`,
  );
  writeFileSync(
    join(consumerDirectory, "runtime.mjs"),
    `import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import { createApp, Text, useInput, useStdin } from "@vue-tui/runtime";
import { render } from "@vue-tui/testing";
import { defineComponent, h } from "vue";

const stdin = new PassThrough();
const stdout = new PassThrough();
let observed;
const Probe = defineComponent(() => {
  observed = useStdin();
  return () => h(Text, null, () => "probe");
});
const live = createApp(Probe);
live.mount({ stdin, stdout, liveUpdates: false, patchConsole: false });
assert.equal(observed.stdin, stdin);
assert.deepEqual(Reflect.ownKeys(observed), ["stdin"]);
assert.equal("setRawMode" in observed, false);
assert.equal("isRawModeSupported" in observed, false);
live.unmount();

let stdoutRead = false;
const invalidOptions = { rawMode: "always" };
Object.defineProperty(invalidOptions, "stdout", {
  get() {
    stdoutRead = true;
    throw new Error("stdout getter must not run");
  },
});
const invalid = createApp(Probe);
assert.throws(
  () => invalid.mount(invalidOptions),
  /Mount option "rawMode" was removed/,
);
assert.equal(stdoutRead, false);

const NoInput = defineComponent(() => () => h(Text, null, () => "idle"));
const idle = await render(NoInput);
assert.equal(idle.terminal.rawMode.current, false);
assert.deepEqual(idle.terminal.rawMode.history, []);
idle.dispose();

const WithInput = defineComponent(() => {
  useInput(() => {});
  return () => h(Text, null, () => "active");
});
const active = await render(WithInput);
assert.equal(active.terminal.rawMode.current, true);
active.dispose();
assert.equal(active.terminal.rawMode.current, false);
`,
  );

  run("npm", ["install", "--no-audit", "--no-fund", "--package-lock=false"], consumerDirectory);
  run("npx", ["tsc", "-p", "tsconfig.json"], consumerDirectory);
  run("npx", ["vue-tsc", "-p", "tsconfig.sfc.json"], consumerDirectory);
  run(process.execPath, ["runtime.mjs"], consumerDirectory);

  const dependencyTree = JSON.parse(
    run("npm", ["ls", "vue", "--all", "--json"], consumerDirectory),
  );
  assert.deepEqual([...collectVueVersions(dependencyTree)], ["3.4.38"]);
  assert.equal(
    JSON.parse(readFileSync(join(consumerDirectory, "node_modules/vue/package.json"), "utf8"))
      .version,
    "3.4.38",
  );

  process.stdout.write("clean tarball consumer passed with Vue 3.4.38 and TypeScript 6.0.3\n");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
