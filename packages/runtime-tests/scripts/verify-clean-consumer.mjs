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
  run("vp", ["run", "@vue-tui/components#build"]);
  const runtimeTarball = pack(join(repositoryRoot, "packages/runtime"));
  const testingTarball = pack(join(repositoryRoot, "packages/testing"));
  const componentsTarball = pack(join(repositoryRoot, "packages/components"));

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
  useExternalInput,
  useElementGeometry,
  useFocus,
  useFocusedInput,
  useFocusManager,
  useFocusScope,
  useFocusScopeInput,
  useInput,
  useInputAvailability,
  useStdin,
  type ExternalInputHandler,
  type ExternalInputSource,
  type InputAvailability,
  type InputHandler,
  type InputHandlerResult,
  type InputRouteDecision,
  type ElementGeometry,
  type ElementTarget,
  type MountOptions,
  type TuiInputEvent,
  type UseFocusManagerReturn,
  type UseFocusOptions,
  type UseFocusReturn,
  type UseFocusScopeOptions,
  type UseFocusScopeReturn,
  type UseInputAvailabilityReturn,
  type UseInputOptions,
  type UseElementGeometryReturn,
  type UseStdinReturn,
} from "@vue-tui/runtime";
import type { ComponentPublicInstance, MaybeRef, MaybeRefOrGetter, Ref, ShallowRef } from "vue";

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
type _ExactFocusTarget = Expect<
  Equal<
    Parameters<typeof useFocus>[0],
    MaybeRefOrGetter<ComponentPublicInstance | null | undefined>
  >
>;
type _ExactFocusOptions = Expect<
  Equal<
    UseFocusOptions,
    {
      readonly scope?: UseFocusScopeReturn;
      readonly disabled?: MaybeRefOrGetter<boolean>;
      readonly tabIndex?: MaybeRefOrGetter<0 | -1>;
      readonly autoFocus?: MaybeRefOrGetter<boolean>;
    }
  >
>;
type _ExactFocusState = Expect<
  Equal<UseFocusReturn["isFocused"], Readonly<ShallowRef<boolean>>>
>;
type _ExactScopeOptions = Expect<
  Equal<
    UseFocusScopeOptions,
    {
      readonly isActive?: MaybeRefOrGetter<boolean>;
      readonly trapped?: MaybeRefOrGetter<boolean>;
    }
  >
>;
type _ExactFocusManager = Expect<
  Equal<
    UseFocusManagerReturn["focusedTarget"],
    Readonly<ShallowRef<UseFocusReturn | null>>
  >
>;
type _ExactExternalSource = Expect<
  Equal<
    ExternalInputSource,
    {
      readonly event: TuiInputEvent;
      readonly sequence: string;
      readonly fidelity: "normalized-utf8-sequence";
    }
  >
>;
type _ExactExternalHandler = Expect<
  Equal<ExternalInputHandler, (source: ExternalInputSource) => void>
>;
type _ExactElementTarget = Expect<
  Equal<ElementTarget, MaybeRefOrGetter<ComponentPublicInstance | null | undefined>>
>;
type _ExactElementGeometryReturn = Expect<
  Equal<
    UseElementGeometryReturn,
    { readonly geometry: Readonly<ShallowRef<ElementGeometry>> }
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

declare const focusHost: MaybeRefOrGetter<ComponentPublicInstance | null | undefined>;
const geometryResult = useElementGeometry(focusHost);
// @ts-expect-error Semantic geometry generations are readonly.
geometryResult.geometry.value = { status: "detached" };
// @ts-expect-error Sparse caret slots are private renderer data.
geometryResult.geometry.value.caretSlots;
const focusScope = useFocusScope({ trapped: true });
const focusTarget = useFocus(focusHost, { scope: focusScope, autoFocus: true });
const focusManager = useFocusManager();
useFocusedInput(focusTarget, handler);
useFocusScopeInput(focusScope, handler);
useExternalInput(focusTarget, (_source) => {});
const focusResult: boolean = focusTarget.focus();
const blurResult: boolean = focusTarget.blur();
const nextResult: boolean = focusManager.focusNext();
const previousResult: boolean = focusManager.focusPrevious();
const managerBlurResult: boolean = focusManager.blur();
void focusResult;
void blurResult;
void nextResult;
void previousResult;
void managerBlurResult;
// @ts-expect-error Focus IDs were replaced by opaque ref-bound handles.
useFocus(focusHost, { id: "legacy" });
// @ts-expect-error The manager exposes the exact focused handle, not an ID.
focusManager.focus("legacy");
// @ts-expect-error Global focus enable/disable was removed with the flat registry.
focusManager.disableFocus();

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
// @ts-expect-error Parent-only scalar metrics were replaced by semantic geometry.
type _RemovedUseBoxMetrics = typeof import("@vue-tui/runtime").useBoxMetrics;
// @ts-expect-error Imperative Yoga reads were removed.
type _RemovedMeasureElement = typeof import("@vue-tui/runtime").measureElement;
// @ts-expect-error The old scalar snapshot type was removed.
type _RemovedBoxMetrics = import("@vue-tui/runtime").BoxMetrics;
// @ts-expect-error The old composable return type was removed.
type _RemovedUseBoxMetricsReturn = import("@vue-tui/runtime").UseBoxMetricsReturn;
void removedRawMode;
void removedExitOnCtrlC;
`,
  );
  writeFileSync(
    join(consumerDirectory, "consumer.tsx"),
    `import { ScrollBox, Spinner, type ScrollBoxExpose } from "@vue-tui/components";
import { Box, Text, useElementGeometry, useExternalInput, useFocus, useFocusedInput, useFocusManager, useFocusScope, useFocusScopeInput, useInput, useInputAvailability } from "@vue-tui/runtime";
import { defineComponent, shallowRef, type ComponentPublicInstance } from "vue";

// @ts-expect-error Spinner is a leaf component and ignores child content.
const unsupportedSpinnerChildren = <Spinner children="ignored" />;
void unsupportedSpinnerChildren;

export const InputProbe = defineComponent(() => {
  const host = shallowRef<ComponentPublicInstance | null>(null);
  const scrollBox = shallowRef<ScrollBoxExpose | null>(null);
  const scope = useFocusScope({ trapped: true });
  const target = useFocus(host, { scope, autoFocus: true });
  const { geometry } = useElementGeometry(host);
  const manager = useFocusManager();
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
  useFocusedInput(target, () => "continue");
  useFocusScopeInput(scope, () => "continue");
  useExternalInput(target, () => {});
  scrollBox.value?.scrollByLines(1);
  scrollBox.value?.scrollToLine(2);
  scrollBox.value?.scrollToTop();
  scrollBox.value?.scrollToBottom();
  return () => <Box ref={host} height={2}><ScrollBox ref={scrollBox}><Text>{geometry.value.status}:{String(manager.focusedTarget.value === target)}</Text></ScrollBox></Box>;
});
`,
  );
  writeFileSync(
    join(consumerDirectory, "App.vue"),
    `<script setup lang="ts">
import { shallowRef, type ComponentPublicInstance } from "vue";
import { ScrollBox, type ScrollBoxExpose } from "@vue-tui/components";
import { Box, Text, useElementGeometry, useExternalInput, useFocus, useFocusedInput, useFocusManager, useFocusScope, useFocusScopeInput, useInput, useInputAvailability, useStdin } from "@vue-tui/runtime";

const host = shallowRef<ComponentPublicInstance | null>(null);
const scrollBox = shallowRef<ScrollBoxExpose | null>(null);
const scope = useFocusScope({ trapped: true });
const target = useFocus(host, { scope, autoFocus: true });
const { geometry } = useElementGeometry(host);
const manager = useFocusManager();
const mountedStdin = useStdin();
const { availability } = useInputAvailability();
useInput(
  (event) => {
    if (event.kind === "paste") event.text.toUpperCase();
    return "continue";
  },
  { isActive: () => availability.value.status === "available" },
);
useFocusedInput(target, () => "continue");
useFocusScopeInput(scope, () => "continue");
useExternalInput(target, () => {});
mountedStdin.stdin;
scrollBox.value?.scrollByLines(1);
scrollBox.value?.scrollToLine(2);
scrollBox.value?.scrollToTop();
scrollBox.value?.scrollToBottom();
// @ts-expect-error Raw-mode control is not exposed by useStdin().
mountedStdin.setRawMode(false);
</script>

<template>
  <Box ref="host" :height="2"><ScrollBox ref="scrollBox"><Text>{{ geometry.status }}:{{ manager.focusedTarget.value === target }}</Text></ScrollBox></Box>
</template>
`,
  );
  writeFileSync(
    join(consumerDirectory, "runtime.mjs"),
    `import assert from "node:assert/strict";
import { PassThrough } from "node:stream";
import * as runtime from "@vue-tui/runtime";
import { ScrollBox } from "@vue-tui/components";
import { render } from "@vue-tui/testing";
import { defineComponent, h, shallowRef } from "vue";

const { Box, createApp, Text, useElementGeometry, useExternalInput, useFocus, useFocusedInput, useFocusManager, useFocusScope, useFocusScopeInput, useInput, useInputAvailability, useStdin } = runtime;
assert.equal("usePaste" in runtime, false);
assert.equal("useBoxMetrics" in runtime, false);
assert.equal("measureElement" in runtime, false);
assert.equal(typeof useElementGeometry, "function");
assert.equal(typeof useFocusScope, "function");
assert.equal(typeof useFocusedInput, "function");
assert.equal(typeof useFocusScopeInput, "function");
assert.equal(typeof useExternalInput, "function");

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

let geometryProjection;
let scrollBoxHandle;
const GeometryProbe = defineComponent(() => {
  const host = shallowRef(null);
  scrollBoxHandle = shallowRef(null);
  geometryProjection = useElementGeometry(host);
  return () => h(Box, { ref: host, width: 8, height: 3 }, () =>
    h(ScrollBox, { ref: scrollBoxHandle }, { default: () => h(Text, null, () => "packed geometry") }),
  );
});
const geometryApp = await render(GeometryProbe, { columns: 20, rows: 5 });
assert.equal(geometryProjection.geometry.value.status, "visible");
assert.deepEqual(Reflect.ownKeys(geometryProjection.geometry.value), [
  "status",
  "parent",
  "surface",
  "fragments",
]);
assert.equal("caretSlots" in geometryProjection.geometry.value, false);
assert.equal(Object.isFrozen(geometryProjection), true);
assert.equal(Object.isFrozen(geometryProjection.geometry.value), true);
assert.equal(typeof scrollBoxHandle.value.scrollByLines, "function");
assert.equal(typeof scrollBoxHandle.value.scrollToLine, "function");
assert.equal(typeof scrollBoxHandle.value.scrollToTop, "function");
assert.equal(typeof scrollBoxHandle.value.scrollToBottom, "function");
assert.equal(geometryApp.lastFrame().includes("packed"), true);
assert.equal(geometryApp.lastFrame().includes("geometry"), true);
geometryApp.dispose();
assert.deepEqual(geometryProjection.geometry.value, { status: "detached" });

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

const focusCalls = [];
let firstTarget;
let secondTarget;
let focusScope;
let focusManager;
const FocusProbe = defineComponent(() => {
  const firstHost = shallowRef(null);
  const secondHost = shallowRef(null);
  focusScope = useFocusScope();
  firstTarget = useFocus(firstHost, { scope: focusScope, autoFocus: true });
  secondTarget = useFocus(secondHost, { scope: focusScope });
  focusManager = useFocusManager();
  useFocusedInput(firstTarget, (event) => {
    focusCalls.push("target:" + event.sequence);
    return "continue";
  });
  useFocusScopeInput(focusScope, (event) => {
    focusCalls.push("scope:" + event.sequence);
    return "continue";
  });
  useExternalInput(firstTarget, ({ sequence }) => focusCalls.push("external:" + sequence));
  return () => h(Box, null, () => [
    h(Box, { ref: firstHost }, () => h(Text, null, () => "first")),
    h(Box, { ref: secondHost }, () => h(Text, null, () => "second")),
  ]);
});
const focusApp = await render(FocusProbe);
assert.equal(firstTarget.isFocused.value, true);
assert.equal(focusScope.containsFocus.value, true);
assert.equal(focusManager.focusedTarget.value, firstTarget);
await focusApp.stdin.write("x");
assert.deepEqual(focusCalls, ["target:x", "scope:x", "external:x"]);
await focusApp.stdin.write("\t");
assert.equal(focusManager.focusedTarget.value, secondTarget);
await focusApp.stdin.write("\x1b");
assert.equal(focusManager.focusedTarget.value, secondTarget);
focusApp.dispose();
assert.equal(firstTarget.isFocused.value, false);
assert.equal(firstTarget.focus(), false);
assert.equal(firstTarget.blur(), false);
assert.equal(focusApp.terminal.rawMode.current, false);
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

  process.stdout.write(
    "clean runtime, testing, and components tarball consumer passed with Vue 3.4.38 and TypeScript 6.0.3\n",
  );
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
