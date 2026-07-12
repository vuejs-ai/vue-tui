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
        include: ["App.vue"],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(consumerDirectory, "consumer.ts"),
    `import { shallowRef } from "vue";
import {
  useInput,
  useInputAvailability,
  useStdin,
  type InputAvailability,
  type InputHandler,
  type InputHandlerResult,
  type InputRouteDecision,
  type MountOptions,
  type TuiInputEvent,
  type UseInputAvailabilityReturn,
  type UseInputOptions,
  type UseStdinReturn,
} from "@vue-tui/runtime";
import type { MaybeRef, MaybeRefOrGetter, Ref } from "vue";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;
type _ExactStdinSurface = Expect<
  Equal<UseStdinReturn, { readonly stdin: NodeJS.ReadStream }>
>;
type _ExactDecision = Expect<
  Equal<
    InputRouteDecision,
    {
      readonly action: "none" | "performed";
      readonly routing: "continue" | "stop";
      readonly defaultAction: "allow" | "prevent";
      readonly external: "allow" | "block";
    }
  >
>;
type _ExactResult = Expect<
  Equal<InputHandlerResult, "continue" | "consume" | InputRouteDecision>
>;
type _ExactHandler = Expect<
  Equal<InputHandler, (event: TuiInputEvent) => InputHandlerResult>
>;
type _ExactHandlerInput = Expect<
  Equal<Parameters<typeof useInput>[0], MaybeRef<InputHandler>>
>;
type _ExactInputOptions = Expect<
  Equal<UseInputOptions, { readonly isActive?: MaybeRefOrGetter<boolean> }>
>;
type _ExactAvailability = Expect<
  Equal<
    InputAvailability,
    | { readonly status: "available" }
    | {
        readonly status: "unavailable";
        readonly reason: "string-host" | "stdin-not-tty" | "stdin-not-controllable";
      }
  >
>;
type _ExactAvailabilityReturn = Expect<
  Equal<
    UseInputAvailabilityReturn,
    { readonly availability: Readonly<Ref<InputAvailability>> }
  >
>;

const active = shallowRef(true);
const handler = shallowRef<InputHandler>((event) => {
  if (event.kind === "key") {
    const name: string | null = event.key.name;
    const reportedText: string | null = event.key.reportedText;
    void name;
    void reportedText;
  } else if (event.kind === "text") {
    const origin: "reported" | null = event.textOrigin;
    void origin;
  } else if (event.kind === "paste") {
    event.text;
  }
  return "continue";
});
useInput(handler, { isActive: () => active.value });

const inputAvailability = useInputAvailability();
if (inputAvailability.availability.value.status === "unavailable") {
  inputAvailability.availability.value.reason;
}
// @ts-expect-error Availability is a runtime-readonly ref.
inputAvailability.availability.value = { status: "available" };

useStdin().stdin;
// @ts-expect-error Raw-mode control is internal to semantic input routes.
useStdin().setRawMode(false);
// @ts-expect-error Raw-mode availability is not part of the public stdin escape hatch.
useStdin().isRawModeSupported;
// @ts-expect-error The removed mount option must not survive in packaged declarations.
const removedRawMode: MountOptions = { rawMode: "auto" };
// @ts-expect-error Ctrl+C policy is expressed by an input result, not a mount option.
const removedExitOnCtrlC: MountOptions = { exitOnCtrlC: false };
// @ts-expect-error A void handler does not make an input routing decision.
useInput((_event) => {});
// @ts-expect-error Input routing is synchronous.
useInput(async (_event) => "continue");
// @ts-expect-error Structured decisions require every field.
useInput((_event) => ({ action: "none", routing: "continue", defaultAction: "allow" }));
// @ts-expect-error Key was replaced by TuiInputEvent.
type _RemovedKey = import("@vue-tui/runtime").Key;
// @ts-expect-error Paste is a TuiInputEvent member, not a separate composable.
type _RemovedUsePaste = typeof import("@vue-tui/runtime").usePaste;
// @ts-expect-error The separate paste options were removed with usePaste().
type _RemovedUsePasteOptions = import("@vue-tui/runtime").UsePasteOptions;
void removedRawMode;
void removedExitOnCtrlC;
`,
  );
  writeFileSync(
    join(consumerDirectory, "consumer.tsx"),
    `import { Text, useInput, useInputAvailability } from "@vue-tui/runtime";
import { defineComponent } from "vue";

export const InputProbe = defineComponent(() => {
  const { availability } = useInputAvailability();
  useInput(
    (event) => {
      if (event.kind === "key" && event.key.name !== null) {
        event.key.name.toUpperCase();
      }
      return "continue";
    },
    { isActive: () => availability.value.status === "available" },
  );
  return () => <Text>normalized input</Text>;
});
`,
  );
  writeFileSync(
    join(consumerDirectory, "App.vue"),
    `<script setup lang="ts">
import { Text, useInput, useInputAvailability, useStdin } from "@vue-tui/runtime";

const mountedStdin = useStdin();
const { availability } = useInputAvailability();
useInput(
  (event) => {
    if (event.kind === "paste") event.text.toUpperCase();
    return "continue";
  },
  { isActive: () => availability.value.status === "available" },
);
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
import * as runtime from "@vue-tui/runtime";
import { render } from "@vue-tui/testing";
import { defineComponent, h } from "vue";

const { createApp, Text, useInput, useInputAvailability, useStdin } = runtime;
assert.equal("usePaste" in runtime, false);

const stdin = new PassThrough();
const stdout = new PassThrough();
let observedStdin;
let observedAvailability;
const Probe = defineComponent(() => {
  observedStdin = useStdin();
  const firstAvailability = useInputAvailability();
  const secondAvailability = useInputAvailability();
  assert.equal(firstAvailability.availability, secondAvailability.availability);
  observedAvailability = firstAvailability;
  return () => h(Text, null, () => "probe");
});
const live = createApp(Probe);
live.mount({ stdin, stdout, liveUpdates: false, patchConsole: false });
assert.equal(observedStdin.stdin, stdin);
assert.deepEqual(Reflect.ownKeys(observedStdin), ["stdin"]);
assert.equal("setRawMode" in observedStdin, false);
assert.equal("isRawModeSupported" in observedStdin, false);
assert.deepEqual(observedAvailability.availability.value, {
  status: "unavailable",
  reason: "stdin-not-tty",
});
live.unmount();

function assertRemovedMountOption(name, value, message) {
  let stdoutRead = false;
  const invalidOptions = { [name]: value };
  Object.defineProperty(invalidOptions, "stdout", {
    get() {
      stdoutRead = true;
      throw new Error("stdout getter must not run");
    },
  });
  const invalid = createApp(Probe);
  assert.throws(() => invalid.mount(invalidOptions), message);
  assert.equal(stdoutRead, false);
}

assertRemovedMountOption("rawMode", "always", /Mount option "rawMode" was removed/);
assertRemovedMountOption("exitOnCtrlC", false, /Mount option "exitOnCtrlC" was removed/);

const NoInput = defineComponent(() => () => h(Text, null, () => "idle"));
const idle = await render(NoInput);
assert.equal(idle.terminal.rawMode.current, false);
assert.deepEqual(idle.terminal.rawMode.history, []);
idle.dispose();

const events = [];
let activeAvailability;
const WithInput = defineComponent(() => {
  activeAvailability = useInputAvailability();
  useInput((event) => {
    events.push(event);
    return {
      action: "performed",
      routing: "stop",
      defaultAction: "prevent",
      external: "block",
    };
  });
  return () => h(Text, null, () => "active");
});
const active = await render(WithInput);
assert.deepEqual(activeAvailability.availability.value, { status: "available" });
assert.equal(active.terminal.rawMode.current, true);
await active.stdin.write("a");
assert.equal(events.length, 1);
assert.deepEqual(events[0], {
  kind: "text",
  sequence: "a",
  fidelity: "normalized-utf8-sequence",
  text: "a",
  protocol: "plain",
  phase: null,
  primaryCodepoint: null,
  textOrigin: null,
});
assert.equal(Object.isFrozen(events[0]), true);
active.dispose();
assert.equal(active.terminal.rawMode.current, false);

const InvalidResult = defineComponent(() => {
  useInput(() => undefined);
  return () => h(Text, null, () => "invalid");
});
const invalidResult = await render(InvalidResult);
await assert.rejects(
  invalidResult.stdin.write("x"),
  /handlers must synchronously return "continue", "consume", or a complete InputRouteDecision/,
);
invalidResult.dispose();
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
