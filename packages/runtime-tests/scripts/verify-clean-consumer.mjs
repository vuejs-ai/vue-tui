/**
 * Package-boundary smoke for a clean consumer install of packed tarballs.
 *
 * Keeps: packed install, Vue 3.4/3.5 declaration compatibility, SFC/TSX compile,
 * one consumer Vue instance, small Runtime smoke, Vue-aligned failed-mount
 * behavior on each supported Vue minor, and official `@vue-tui/testing`
 * resolving its privileged dependency.
 *
 * Omits: large removed-API inventories, duplicated integration behavior, and
 * third-party stability contracts on `/internal/*`.
 */
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
const temporaryRoot = mkdtempSync(join(tmpdir(), "vue-tui-clean-consumer-"));
const tarballDirectory = join(temporaryRoot, "tarballs");
mkdirSync(tarballDirectory);

function run(command, args, cwd = repositoryRoot, environment = {}) {
  try {
    return execFileSync(command, args, {
      cwd,
      encoding: "utf8",
      env: { ...process.env, CI: "true", ...environment },
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
  run("vp", ["run", "@vue-tui/components#build"]);
  const runtimeTarball = pack(join(repositoryRoot, "packages/runtime"));
  const testingTarball = pack(join(repositoryRoot, "packages/testing"));
  const componentsTarball = pack(join(repositoryRoot, "packages/components"));

  const consumerVariants = [
    { directoryName: "vue-3.4", vueVersion: "3.4.38", supportsUseTemplateRef: false },
    { directoryName: "vue-3.5", vueVersion: "3.5.34", supportsUseTemplateRef: true },
  ];

  for (const { directoryName, vueVersion, supportsUseTemplateRef } of consumerVariants) {
    const consumerDirectory = join(temporaryRoot, directoryName);
    mkdirSync(consumerDirectory);

    writeFileSync(
      join(consumerDirectory, "package.json"),
      JSON.stringify(
        {
          private: true,
          type: "module",
          dependencies: {
            "@vue-tui/runtime": `file:${runtimeTarball}`,
            "@vue-tui/testing": `file:${testingTarball}`,
            "@vue-tui/components": `file:${componentsTarball}`,
            vue: vueVersion,
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
            jsx: "preserve",
            types: ["node"],
          },
          include: ["consumer.ts", "consumer.tsx"],
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
          include: ["App.vue", ...(supportsUseTemplateRef ? ["Vue35Focus.vue"] : [])],
        },
        null,
        2,
      ),
    );

    writeFileSync(
      join(consumerDirectory, "consumer.ts"),
      `import type { Readable, Writable } from "node:stream";
import { defineComponent } from "vue";
import {
  Box,
  Text,
  createApp,
  renderToString,
  useApp,
  useBoxMetrics,
  useFocus,
  useInput,
  useLayoutSize,
  useStdin,
  type MountOptions,
  type TuiApp,
  type TuiInputEvent,
} from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { render } from "@vue-tui/testing";
import type { ComponentPublicInstance } from "vue";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;
type _ExactMountOptions = Expect<
  Equal<
    keyof MountOptions,
    "stdout" | "stdin" | "stderr" | "mode" | "patchConsole" | "exitOnCtrlC"
  >
>;
type _NoPrivateContainer = Expect<Equal<"_container" extends keyof TuiApp ? true : false, false>>;

declare const nodeReadable: Readable;
declare const nodeWritable: Writable;
const baseStreamMount: MountOptions = {
  stdin: nodeReadable,
  stdout: nodeWritable,
  stderr: nodeWritable,
};

const PublicRoot = defineComponent(() => () => null);
const publicApp: TuiApp = createApp(PublicRoot);
const publicRootInstance: ComponentPublicInstance = publicApp.mount(baseStreamMount);
void publicRootInstance;
void publicApp.waitUntilRenderFlush();
void publicApp.waitUntilExit();
void renderToString(PublicRoot);
void useApp;
void useStdin;
void useInput;
void useFocus;
void useLayoutSize;
void useBoxMetrics;
void Box;
void Text;
void Static;
void render;

const sampleKey: TuiInputEvent = {
  type: "key",
  key: {
    name: "enter",
    shift: false,
    alt: false,
    ctrl: false,
    meta: false,
    super: false,
    hyper: false,
  },
};
void sampleKey;

// @ts-expect-error Transform is not a public Runtime export.
type _RemovedTransform = typeof import("@vue-tui/runtime").Transform;
// @ts-expect-error useRenderSession is not public.
type _RemovedUseRenderSession = typeof import("@vue-tui/runtime").useRenderSession;
// @ts-expect-error Former public /devtools path is not a package export.
type _RemovedPublicDevtools = typeof import("@vue-tui/runtime/devtools");
`,
    );

    writeFileSync(
      join(consumerDirectory, "consumer.tsx"),
      `import { defineComponent } from "vue";
import { Box, Text, useFocus, useInput, useLayoutSize } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { ScrollBox } from "@vue-tui/components";

export const Smoke = defineComponent(() => {
  const focus = useFocus();
  const { width } = useLayoutSize();
  useInput(
    (event) => {
      if (event.type === "key" && event.key.name === "enter") {
        event.key.name.toUpperCase();
      }
    },
    { isActive: focus.isFocused },
  );
  return () => (
    <Box>
      <Static>
        <Text>history</Text>
      </Static>
      <ScrollBox>
        <Text>{String(width.value)}</Text>
      </ScrollBox>
    </Box>
  );
});
`,
    );

    writeFileSync(
      join(consumerDirectory, "App.vue"),
      `<script setup lang="ts">
import { onMounted, shallowRef } from "vue";
import { Box, Text, useFocus, useInput, useLayoutSize, useStdin } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";

const host = shallowRef<InstanceType<typeof Box> | null>(null);
const focus = useFocus(host);
const { width } = useLayoutSize();
const stdin = useStdin();
onMounted(() => focus.focus());
useInput(
  (event) => {
    if (event.type === "text") event.text.toUpperCase();
  },
  { isActive: focus.isFocused },
);
stdin.setRawMode(false);
</script>

<template>
  <Box ref="host">
    <Static>
      <Text>static</Text>
    </Static>
    <Text>{{ width }}:{{ focus.isFocused }}</Text>
  </Box>
</template>
`,
    );

    if (supportsUseTemplateRef) {
      writeFileSync(
        join(consumerDirectory, "Vue35Focus.vue"),
        `<script setup lang="ts">
import { onMounted, useTemplateRef } from "vue";
import { Box, Text, useFocus, type FocusTarget } from "@vue-tui/runtime";

const target = useTemplateRef("host");
const accepted: FocusTarget = target;
const focus = useFocus(target);
onMounted(() => focus.focus());
void accepted;
</script>

<template>
  <Box ref="host"><Text>focus</Text></Box>
</template>
`,
      );
    }

    writeFileSync(
      join(consumerDirectory, "runtime.mjs"),
      `import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import * as runtime from "@vue-tui/runtime";
import * as inline from "@vue-tui/runtime/inline";
import { render } from "@vue-tui/testing";
import { defineComponent, h, onScopeDispose } from "vue";

const {
  Box,
  Text,
  createApp,
  renderToString,
  useApp,
  useBoxMetrics,
  useFocus,
  useInput,
  useLayoutSize,
  useStdin,
} = runtime;
for (const [name, value] of Object.entries({
  createApp,
  renderToString,
  useApp,
  useFocus,
  useInput,
  useStdin,
  useLayoutSize,
  useBoxMetrics,
})) {
  assert.equal(typeof value, "function", name);
}
assert.equal(typeof Box, "object");
assert.equal(typeof Text, "object");
assert.deepEqual(Object.keys(inline).sort(), ["Static"]);
assert.equal("Transform" in runtime, false);
assert.equal("useRenderSession" in runtime, false);
assert.equal("kittyFlags" in runtime, false);

for (const subpath of ["devtools", "testing", "fullscreen"]) {
  await assert.rejects(import("@vue-tui/runtime/" + subpath), (error) => {
    assert.equal(error?.code, "ERR_PACKAGE_PATH_NOT_EXPORTED");
    return true;
  });
}

const document = defineComponent(() => () =>
  h(Box, null, () => h(Text, null, () => "clean-consumer-ok")),
);
const painted = renderToString(document, { width: 40 });
assert.match(painted.replace(/\\x1b\\[[0-9;]*m/g, ""), /clean-consumer-ok/);

const App = defineComponent(() => {
  const { width } = useLayoutSize();
  useStdin();
  return () => h(Text, null, () => "w=" + String(width.value));
});
const result = await render(App);
assert.match(result.lastFrame().replace(/\\x1b\\[[0-9;]*m/g, ""), /w=/);
result.dispose();

// Failed-mount behavior, through the packed tarball, on this consumer's Vue.
// Runtime aligns with Vue instead of exceeding it: Vue takes container ownership
// only after a successful patch, so a mount that throws leaves Vue nothing to
// unmount and it runs no component cleanup. Runtime matches that rather than
// writing Vue-private state, and still rethrows the original value, rejects
// waitUntilExit() with it, and releases what it owns. Proven on every supported
// Vue minor because that alignment is version-sensitive.
function mountStreams() {
  const stdout = new PassThrough();
  const stderr = new PassThrough();
  stdout.resume();
  stderr.resume();
  return { stdout, stderr, stdin: new PassThrough(), patchConsole: false };
}

async function assertFailedMountMatchesVue(label, makeRoot) {
  const failure = new Error(label);
  const disposed = [];
  const Allocated = defineComponent(() => {
    onScopeDispose(() => disposed.push("allocated"));
    return () => h(Text, null, () => "allocated");
  });
  const Throwing = defineComponent(() => {
    onScopeDispose(() => disposed.push("throwing"));
    throw failure;
  });
  const app = createApp(makeRoot(Allocated, Throwing, disposed));
  app.config.warnHandler = () => {};
  const originalConsoleError = console.error;
  console.error = () => {};
  let thrown;
  try {
    app.mount(mountStreams());
  } catch (error) {
    thrown = error;
  } finally {
    console.error = originalConsoleError;
  }
  if (thrown === undefined) app.unmount();
  assert.equal(thrown, failure, label + ": mount must rethrow the original value");
  await assert.rejects(app.waitUntilExit(), (error) => error === failure);
  assert.deepEqual(disposed, [], label + ": Vue runs no cleanup, so neither does Runtime");
}

await assertFailedMountMatchesVue("stateful partial root", (Allocated, Throwing, disposed) =>
  defineComponent(() => {
    onScopeDispose(() => disposed.push("root"));
    return () => h(Box, null, () => [h(Allocated), h(Throwing)]);
  }),
);

await assertFailedMountMatchesVue(
  "functional partial root",
  (Allocated, Throwing) => () => h(Box, null, () => [h(Allocated), h(Throwing)]),
);

// Stdout ownership was released, so an ordinary app still mounts afterwards.
const afterFailure = createApp(defineComponent(() => () => h(Text, null, () => "after-failure")));
afterFailure.mount(mountStreams());
afterFailure.unmount();
await afterFailure.waitUntilExit();
`,
    );

    writeFileSync(
      join(consumerDirectory, "testing-bridge.mjs"),
      `import assert from "node:assert/strict";
import { render } from "@vue-tui/testing";
import { defineComponent, h } from "vue";
import { Text } from "@vue-tui/runtime";

// Official @vue-tui/testing works through its privileged Runtime bridge. Running
// the official package is sufficient proof of its wiring; an external consumer
// must not resolve or inventory Runtime-internal paths itself.
const App = defineComponent(() => () => h(Text, null, () => "bridge-ok"));
const result = await render(App);
assert.match(result.lastFrame().replace(/\\x1b\\[[0-9;]*m/g, ""), /bridge-ok/);
result.dispose();
`,
    );

    run("npm", ["install", "--no-package-lock", "--ignore-scripts"], consumerDirectory);
    run("npx", ["vue-tsc", "--noEmit", "-p", "tsconfig.json"], consumerDirectory);
    run("npx", ["vue-tsc", "--noEmit", "-p", "tsconfig.sfc.json"], consumerDirectory);
    run("node", ["runtime.mjs"], consumerDirectory);
    run("node", ["testing-bridge.mjs"], consumerDirectory);

    const ls = JSON.parse(run("npm", ["ls", "vue", "--all", "--json"], consumerDirectory));
    const versions = collectVueVersions(ls);
    assert.equal(
      versions.size,
      1,
      `${directoryName}: expected one Vue version, got ${[...versions].join(", ")}`,
    );
  }

  console.log("verify-clean-consumer: ok");
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
