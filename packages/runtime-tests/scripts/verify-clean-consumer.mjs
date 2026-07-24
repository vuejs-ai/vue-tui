import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
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
          include: [
            "App.vue",
            "RejectedMouseListeners.vue",
            ...(supportsUseTemplateRef ? ["Vue35Focus.vue", "Vue35FocusTarget.vue"] : []),
          ],
        },
        null,
        2,
      ),
    );
    writeFileSync(
      join(consumerDirectory, "consumer.ts"),
      `import type { Readable, Writable } from "node:stream";
import { computed, defineComponent, shallowRef } from "vue";
import {
  Box,
  Text,
  createApp,
  useBoxMetrics,
  useFocus,
  useInput,
  useLayoutSize,
  useStdin,
  type BoxProps,
  type Color,
  type FocusTarget,
  type MountOptions,
  type RenderToStringOptions,
  type TuiInputEvent,
  type TuiKey,
  type TuiKeyName,
  type TuiApp,
  type TextProps,
  type UseBoxMetricsReturn,
  type UseFocusReturn,
  type UseLayoutSizeReturn,
  type UseStdinReturn,
} from "@vue-tui/runtime";
import { connectDevtools } from "@vue-tui/runtime/internal/devtools";
// Official tooling channel — unsupported public contract.
import {
  createTestHostBridge,
  type TestContentFrame,
  type TestHostBridge,
  type TestHostBridgeOptions,
} from "@vue-tui/runtime/internal/testing";
import type { RenderResult, TestHost } from "@vue-tui/testing";
import type { ComponentPublicInstance, MaybeRef, MaybeRefOrGetter, Ref } from "vue";

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
type _NoPrivateUid = Expect<Equal<"_uid" extends keyof TuiApp ? true : false, false>>;
type _VersionSpecificOnUnmount = Expect<
  Equal<"onUnmount" extends keyof TuiApp ? true : false, ${supportsUseTemplateRef}>
>;
declare const nodeReadable: Readable;
declare const nodeWritable: Writable;
const baseStreamMount: MountOptions = {
  stdin: nodeReadable,
  stdout: nodeWritable,
  stderr: nodeWritable,
};
declare const webReadable: ReadableStream;
declare const webWritable: WritableStream;
// @ts-expect-error Web streams require explicit outside adaptation.
const rejectedWebReadable: MountOptions = { stdin: webReadable };
// @ts-expect-error Web streams require explicit outside adaptation.
const rejectedWebWritable: MountOptions = { stdout: webWritable };
const PublicRoot = defineComponent(() => () => null);
const publicApp: TuiApp = createApp(PublicRoot, { answer: 42 });
const chainedPublicApp = publicApp.use({ install() {} });
type _ChainedNoPrivateContainer = Expect<
  Equal<"_container" extends keyof typeof chainedPublicApp ? true : false, false>
>;
publicApp.provide("answer", 42);
publicApp.config.errorHandler = () => {};
publicApp.component("PublicRoot", PublicRoot);
publicApp.directive("public", {});
publicApp.runWithContext(() => 42);
publicApp.unmount;
publicApp.version;
${supportsUseTemplateRef ? "publicApp.onUnmount(() => {});" : "// @ts-expect-error Vue 3.4 does not publish App.onUnmount().\npublicApp.onUnmount(() => {});"}
const publicRenderBarrier: Promise<void> = publicApp.waitUntilRenderFlush();
const publicExitBarrier: Promise<void> = publicApp.waitUntilExit();
const publicRootInstance: ComponentPublicInstance = publicApp.mount(baseStreamMount);
void publicRootInstance;
void publicRenderBarrier;
void publicExitBarrier;
void rejectedWebReadable;
void rejectedWebWritable;
type _ExactStdinSurface = Expect<
  Equal<
    UseStdinReturn,
    {
      readonly stdin: Readable;
      readonly isRawModeSupported: boolean;
      readonly setRawMode: (enabled: boolean) => void;
    }
  >
>;
type _ExactBoxProps = Expect<
  Equal<
    keyof BoxProps,
    | "flexDirection"
    | "flexWrap"
    | "flexGrow"
    | "flexShrink"
    | "flexBasis"
    | "alignItems"
    | "alignSelf"
    | "justifyContent"
    | "gap"
    | "rowGap"
    | "columnGap"
    | "width"
    | "height"
    | "minWidth"
    | "minHeight"
    | "maxWidth"
    | "maxHeight"
    | "position"
    | "top"
    | "right"
    | "bottom"
    | "left"
    | "margin"
    | "marginX"
    | "marginY"
    | "marginTop"
    | "marginRight"
    | "marginBottom"
    | "marginLeft"
    | "padding"
    | "paddingX"
    | "paddingY"
    | "paddingTop"
    | "paddingRight"
    | "paddingBottom"
    | "paddingLeft"
    | "borderStyle"
    | "borderTop"
    | "borderRight"
    | "borderBottom"
    | "borderLeft"
    | "borderColor"
    | "backgroundColor"
    | "overflow"
    | "overflowX"
    | "overflowY"
  >
>;
type _ExactTextProps = Expect<
  Equal<
    keyof TextProps,
    | "color"
    | "backgroundColor"
    | "dimColor"
    | "bold"
    | "italic"
    | "underline"
    | "strikethrough"
    | "inverse"
    | "wrap"
  >
>;
type _ExactBoxDirection = Expect<
  Equal<
    BoxProps["flexDirection"],
    "row" | "column" | "row-reverse" | "column-reverse" | undefined
  >
>;
type _ExactBoxPercentageInputs = Expect<
  Equal<BoxProps["width"] | BoxProps["flexBasis"], number | \`\${number}%\` | undefined>
>;
type _ExactBoxOffset = Expect<
  Equal<BoxProps["right"], number | \`\${number}%\` | undefined>
>;
type _ExactTextColors = Expect<
  Equal<TextProps["color"] | TextProps["backgroundColor"], Color | "default" | undefined>
>;
type _ExactTextWrap = Expect<
  Equal<
    TextProps["wrap"],
    "wrap" | "hard" | "truncate" | "truncate-middle" | "truncate-start" | undefined
  >
>;
type _ExactColor = Expect<
  Equal<
    Color,
    | "black"
    | "red"
    | "green"
    | "yellow"
    | "blue"
    | "magenta"
    | "cyan"
    | "white"
    | "gray"
    | "redBright"
    | "greenBright"
    | "yellowBright"
    | "blueBright"
    | "magentaBright"
    | "cyanBright"
    | "whiteBright"
    | \`#\${string}\`
  >
>;
type _ExactRenderToStringOptions = Expect<
  Equal<keyof RenderToStringOptions, "width" | "height">
>;
const readonlyStringRenderOptions: RenderToStringOptions = { width: 80, height: 24 };
// @ts-expect-error String-render layout input is readonly after construction.
readonlyStringRenderOptions.width = 40;
type _ExactKeyName = Expect<
  Equal<
    TuiKeyName,
    | "backspace"
    | "tab"
    | "enter"
    | "escape"
    | "insert"
    | "delete"
    | "up"
    | "down"
    | "left"
    | "right"
    | "home"
    | "end"
    | "page-up"
    | "page-down"
    | "f1"
    | "f2"
    | "f3"
    | "f4"
    | "f5"
    | "f6"
    | "f7"
    | "f8"
    | "f9"
    | "f10"
    | "f11"
    | "f12"
    | (string & {})
  >
>;
type ExpectedTuiKey = {
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly meta: boolean;
  readonly super: boolean;
  readonly hyper: boolean;
} & (
  | {
      readonly name: TuiKeyName;
      readonly character?: never;
    }
  | {
      readonly character: string;
      readonly name?: never;
    }
);
type _ExactTuiKey = Expect<Equal<TuiKey, ExpectedTuiKey>>;
type ExpectedTuiInputEvent =
  | {
      readonly type: "text";
      readonly text: string;
      readonly key?: TuiKey;
    }
  | {
      readonly type: "key";
      readonly key: TuiKey;
      readonly text?: never;
    }
  | {
      readonly type: "paste";
      readonly text: string;
      readonly key?: never;
    };
type _ExactTuiInputEvent = Expect<Equal<TuiInputEvent, ExpectedTuiInputEvent>>;
const completeNamedKey: TuiKey = {
  name: "enter",
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
  super: false,
  hyper: false,
};
const plainTextEvent: TuiInputEvent = { type: "text", text: "a" };
const enhancedTextEvent: TuiInputEvent = {
  type: "text",
  text: "A",
  key: {
    character: "a",
    shift: true,
    alt: false,
    ctrl: false,
    meta: false,
    super: false,
    hyper: false,
  },
};
const keyOnlyEvent: TuiInputEvent = { type: "key", key: completeNamedKey };
const emptyPasteEvent: TuiInputEvent = { type: "paste", text: "" };
void plainTextEvent;
void enhancedTextEvent;
void keyOnlyEvent;
void emptyPasteEvent;
// @ts-expect-error Key events require one complete nested key.
const incompleteKeyEvent: TuiInputEvent = { type: "key", key: { name: "enter" } };
// @ts-expect-error Paste cannot carry key evidence.
const keyOnPasteEvent: TuiInputEvent = { type: "paste", text: "", key: completeNamedKey };
void incompleteKeyEvent;
void keyOnPasteEvent;
type InputHandler = (event: TuiInputEvent) => void;
type _ExactHandlerInput = Expect<
  Equal<Parameters<typeof useInput>[0], MaybeRef<InputHandler>>
>;
type _ExactInputOptions = Expect<
  Equal<
    Parameters<typeof useInput>[1],
    { readonly isActive?: MaybeRefOrGetter<boolean> } | undefined
  >
>;
type _ExactBoxMetrics = Expect<
  Equal<
    UseBoxMetricsReturn,
    {
      readonly width: Readonly<Ref<number>>;
      readonly height: Readonly<Ref<number>>;
      readonly left: Readonly<Ref<number>>;
      readonly top: Readonly<Ref<number>>;
      readonly hasMeasured: Readonly<Ref<boolean>>;
    }
  >
>;
type _ExactFocusTarget = Expect<
  Equal<FocusTarget, Readonly<Ref<ComponentPublicInstance | null | undefined>>>
>;
type _ExactFocusReturn = Expect<
  Equal<
    UseFocusReturn,
    {
      readonly isFocused: Readonly<Ref<boolean>>;
      focus(): void;
      blur(): void;
    }
  >
>;
type _ExactTargetedFocusParameter = Expect<Equal<Parameters<typeof useFocus>, [target: FocusTarget]>>;
type _ExactLayoutSize = Expect<
  Equal<ReturnType<typeof useLayoutSize>, UseLayoutSizeReturn>
>;
type _ExactBoxMetricsReturn = Expect<
  Equal<ReturnType<typeof useBoxMetrics>, UseBoxMetricsReturn>
>;
type _ExactTestingBridge = Expect<
  Equal<ReturnType<typeof createTestHostBridge>, TestHostBridge>
>;
type _ExactTestHost = Expect<
  Equal<keyof TestHost, "mode" | "stdin" | "stdout" | "patchConsole" | "exitOnCtrlC">
>;
const exitOnCtrlCTestHost: TestHost = { exitOnCtrlC: true };
const observedTestFrame = (frame: TestContentFrame): void => {
  frame.dynamic;
  frame.staticOutput;
};
const testBridgeOptions: TestHostBridgeOptions = { onFrame: observedTestFrame };
createTestHostBridge(testBridgeOptions);
connectDevtools({
  on(_event, _callback) {},
  send(_event, _data) {},
});
const active = shallowRef(true);
const screen = shallowRef<"editor" | "confirm">("editor");
const handler: InputHandler = (event) => {
  if ((event.type === "text" || event.type === "paste") && screen.value === "editor") {
    event.text;
    return;
  }
  if (event.type === "key" && event.key.name === "enter") {
    screen.value = screen.value === "editor" ? "confirm" : "editor";
  }
  if (event.type === "key" && event.key.character === "c" && event.key.ctrl) {
    return;
  }
};
useInput(handler, { isActive: () => active.value });
const liveHandler = shallowRef(handler);
useInput(liveHandler);
const futureKeyName: TuiKeyName = "media-fast-forward";
void futureKeyName;
// @ts-expect-error Parser packet metadata is not part of the public event.
declare const removedSequence: TuiInputEvent["sequence"];
// @ts-expect-error The public event discriminator is type, not kind.
declare const removedKind: TuiInputEvent["kind"];
// @ts-expect-error Paste is a tagged member rather than a second boolean.
declare const removedIsPaste: TuiInputEvent["isPaste"];
// @ts-expect-error Parser protocol is not part of logical key identity.
declare const removedProtocol: TuiKey["protocol"];
// @ts-expect-error Parser tokens are not public key names.
declare const removedParserName: TuiKey["parserName"];
// @ts-expect-error Codepoints remain private parser evidence.
declare const removedCodepoint: TuiKey["codepoint"];
// @ts-expect-error Base-layout identity remains private physical-layout evidence.
declare const removedBaseLayout: TuiKey["baseLayout"];
// @ts-expect-error Lock state is not a public command modifier.
declare const removedCapsLock: TuiKey["capsLock"];
// @ts-expect-error Releases are suppressed rather than exposed as a public phase.
declare const removedPhase: TuiKey["phase"];

const layoutSize: UseLayoutSizeReturn = useLayoutSize();
const { width: layoutWidth, height: viewportHeight } = layoutSize;
// @ts-expect-error Runtime-owned layout width is readonly.
layoutWidth.value = 40;
// @ts-expect-error Runtime-owned layout height is readonly.
viewportHeight.value = 24;
const boxHost = shallowRef<InstanceType<typeof Box> | null>(null);
const boxMetrics: UseBoxMetricsReturn = useBoxMetrics(boxHost);
// @ts-expect-error Accepted Box metrics width is readonly.
boxMetrics.width.value = 1;
// @ts-expect-error Accepted Box metrics height is readonly.
boxMetrics.height.value = 1;
// @ts-expect-error Accepted Box metrics left is readonly.
boxMetrics.left.value = 1;
// @ts-expect-error Accepted Box metrics top is readonly.
boxMetrics.top.value = 1;
// @ts-expect-error Accepted Box metrics hasMeasured is readonly.
boxMetrics.hasMeasured.value = true;
const textHost = shallowRef<InstanceType<typeof Text> | null>(null);
// @ts-expect-error Text layout has different semantics and is not a Box target.
useBoxMetrics(textHost);
const arbitraryHost = shallowRef<ComponentPublicInstance | null>(null);
// @ts-expect-error An arbitrary component ref does not identify one measurable Box.
useBoxMetrics(arbitraryHost);
declare const rawBoxHost: InstanceType<typeof Box>;
// @ts-expect-error A raw component value cannot represent target attachment and detachment.
useBoxMetrics(rawBoxHost);
// @ts-expect-error Callers can wrap a derived target in computed(); Runtime accepts refs only.
useBoxMetrics(() => boxHost.value);
const logicalFocus = useFocus();
const boxFocus = useFocus(boxHost);
const textFocus = useFocus(textHost);
const arbitraryFocus = useFocus(arbitraryHost);
const computedFocus = useFocus(computed(() => arbitraryHost.value));
const storedFocus: UseFocusReturn = boxFocus;
const logicalFocusResult: void = logicalFocus.focus();
const logicalBlurResult: void = logicalFocus.blur();
const boxFocusResult: void = boxFocus.focus();
const boxBlurResult: void = boxFocus.blur();
textFocus.focus();
arbitraryFocus.focus();
computedFocus.focus();
storedFocus.isFocused.value;
// @ts-expect-error Runtime-owned focus state is readonly.
storedFocus.isFocused.value = false;
// @ts-expect-error A raw component cannot represent target attachment and detachment.
useFocus(rawBoxHost);
// @ts-expect-error Callers can wrap a derived target in computed(); focus accepts refs only.
useFocus(() => arbitraryHost.value);
// @ts-expect-error A target ref must resolve to component public instances.
useFocus(shallowRef(42));
// @ts-expect-error The public surface has two explicit overloads, not an explicit undefined target.
useFocus(undefined);
// @ts-expect-error Runtime focus has no options object.
useFocus(boxHost, { autoFocus: true });
void logicalFocusResult;
void logicalBlurResult;
void boxFocusResult;
void boxBlurResult;
useStdin().stdin;
useStdin().setRawMode(false);
useStdin().isRawModeSupported;
// @ts-expect-error The removed mount option must not survive in packaged declarations.
const removedRawMode: MountOptions = { rawMode: "auto" };
const acceptedExitOnCtrlC: MountOptions = { exitOnCtrlC: true };
// @ts-expect-error Runtime privately negotiates the keyboard protocol.
const removedKittyKeyboard: MountOptions = { kittyKeyboard: { mode: "enabled" } };
// @ts-expect-error Clipboard transport injection is application policy.
const removedClipboardMount: MountOptions = { clipboard: { kind: "osc52" } };
// @ts-expect-error Runtime has no presentation selector, including an explicit undefined value.
const removedPresentationMount: MountOptions = { presentation: undefined };
// @ts-expect-error The modeled test host does not restore the removed Runtime selector.
const removedTestPresentation: TestHost = { presentation: undefined };
const packedColor: Color = "gray";
const packedRgbColor: Color = "#12abEF";
const mutableBoxProps: BoxProps = {};
mutableBoxProps.paddingX = 1;
mutableBoxProps.right = "-5%";
const mutableTextProps: TextProps = {};
mutableTextProps.bold = false;
mutableTextProps.backgroundColor = "default";
// @ts-expect-error Runtime has one canonical gray spelling.
const removedGreyColor: Color = "grey";
// @ts-expect-error Text's terminal-default escape is not a member of shared Color.
const removedDefaultColor: Color = "default";
useInput((_event) => {});
// Handler results are ignored rather than controlling propagation or defaults.
useInput((_event) => 42);
useInput(shallowRef(handler));
// @ts-expect-error Activation must resolve to a boolean.
useInput(handler, { isActive: "yes" });
useInput(async (_event) => undefined);
useInput((_event) => ({ arbitrary: true }));
// @ts-expect-error Parser-shaped handler aliases are not public.
type _RemovedInputHandler = import("@vue-tui/runtime").InputHandler;
// @ts-expect-error Route-result aliases are not public.
type _RemovedInputHandlerResult = import("@vue-tui/runtime").InputHandlerResult;
// @ts-expect-error Runtime input results do not expose routing policy.
type _RemovedInputRouteDecision = import("@vue-tui/runtime").InputRouteDecision;
// @ts-expect-error The inline options shape needs no supporting public type.
type _RemovedUseInputOptions = import("@vue-tui/runtime").UseInputOptions;
// @ts-expect-error Parser phase is not an application fact.
type _RemovedTuiInputPhase = import("@vue-tui/runtime").TuiInputPhase;
// @ts-expect-error Parser source and fidelity are not application facts.
type _RemovedTuiInputSource = import("@vue-tui/runtime").TuiInputSource;
// @ts-expect-error Key modifiers live on the complete nested TuiKey.
type _RemovedTuiInputModifiers = import("@vue-tui/runtime").TuiInputModifiers;
// @ts-expect-error Availability is established by activating a subscription.
type _RemovedUseInputAvailability = typeof import("@vue-tui/runtime").useInputAvailability;
// @ts-expect-error Availability supporting types were removed with the hook.
type _RemovedInputAvailability = import("@vue-tui/runtime").InputAvailability;
// @ts-expect-error General rendered presence is not a public Runtime primitive.
type _RemovedUseBoxPresence = typeof import("@vue-tui/runtime").useBoxPresence;
// @ts-expect-error Scope policy is composed above Runtime.
type _RemovedUseFocusScope = typeof import("@vue-tui/runtime").useFocusScope;
// @ts-expect-error Focused routing is composed above one public subscription.
type _RemovedUseFocusedInput = typeof import("@vue-tui/runtime").useFocusedInput;
// @ts-expect-error Scope routing is composed above one public subscription.
type _RemovedUseFocusScopeInput = typeof import("@vue-tui/runtime").useFocusScopeInput;
// @ts-expect-error Runtime does not publish a global focus manager.
type _RemovedUseFocusManager = typeof import("@vue-tui/runtime").useFocusManager;
// @ts-expect-error Runtime focus has no public options object.
type _RemovedUseFocusOptions = import("@vue-tui/runtime").UseFocusOptions;
// @ts-expect-error Runtime does not publish manager observation or traversal types.
type _RemovedUseFocusManagerReturn = import("@vue-tui/runtime").UseFocusManagerReturn;
// @ts-expect-error Normalized external forwarding was not lossless transport.
type _RemovedUseExternalInput = typeof import("@vue-tui/runtime").useExternalInput;
// @ts-expect-error Focus scope supporting types were removed with the policy API.
type _RemovedUseFocusScopeReturn = import("@vue-tui/runtime").UseFocusScopeReturn;
// @ts-expect-error External forwarding supporting types were removed.
type _RemovedExternalInputSource = import("@vue-tui/runtime").ExternalInputSource;
// @ts-expect-error Renderer nodes are private and are not focus targets.
type _RemovedTuiNode = import("@vue-tui/runtime").TuiNode;
// @ts-expect-error Vue VNodes are not part of the Runtime focus target contract.
type _RemovedVNode = import("@vue-tui/runtime").VNode;
// @ts-expect-error Kitty negotiation options are private Runtime machinery.
type _RemovedKittyKeyboardOptions = import("@vue-tui/runtime").KittyKeyboardOptions;
// @ts-expect-error Kitty flag names are private Runtime machinery.
type _RemovedKittyFlagName = import("@vue-tui/runtime").KittyFlagName;
// @ts-expect-error Kitty flag values are private Runtime machinery.
type _RemovedKittyFlags = typeof import("@vue-tui/runtime").kittyFlags;
// @ts-expect-error Kitty modifier values are private Runtime machinery.
type _RemovedKittyModifiers = typeof import("@vue-tui/runtime").kittyModifiers;
// @ts-expect-error Key was replaced by TuiInputEvent.
type _RemovedKey = import("@vue-tui/runtime").Key;
// @ts-expect-error Runtime does not publish a second raw-input composable.
type _RemovedUseRawInput = typeof import("@vue-tui/runtime").useRawInput;
// @ts-expect-error Paste is a TuiInputEvent member, not a separate composable.
type _RemovedUsePaste = typeof import("@vue-tui/runtime").usePaste;
// @ts-expect-error The separate paste options were removed with usePaste().
type _RemovedUsePasteOptions = import("@vue-tui/runtime").UsePasteOptions;
// @ts-expect-error Experimental layout width was replaced by useLayoutSize().
type _RemovedUseLayoutWidth = typeof import("@vue-tui/runtime").useLayoutWidth;
// @ts-expect-error Experimental viewport height was replaced by useLayoutSize().
type _RemovedUseViewportHeight = typeof import("@vue-tui/runtime").useViewportHeight;
// @ts-expect-error The considered finite-only viewport alias was never accepted.
type _RemovedUseViewportSize = typeof import("@vue-tui/runtime").useViewportSize;
// @ts-expect-error The broad render-session hook is private Runtime machinery.
type _RemovedUseRenderSession = typeof import("@vue-tui/runtime").useRenderSession;
// @ts-expect-error The broad render-session graph is private Runtime machinery.
type _RemovedRenderSession = import("@vue-tui/runtime").RenderSession;
// @ts-expect-error Requested/effective mode resolution is private Runtime machinery.
type _RemovedRenderModeResolution = import("@vue-tui/runtime").RenderModeResolution;
// @ts-expect-error Mount mode is available through MountOptions rather than a separate root type.
type _RemovedRenderMode = import("@vue-tui/runtime").RenderMode;
// @ts-expect-error Runtime has no presentation type.
type _RemovedRenderPresentation = import("@vue-tui/runtime").RenderPresentation;
// @ts-expect-error Runtime has no ARIA role vocabulary.
type _RemovedAriaRole = import("@vue-tui/runtime").AriaRole;
// @ts-expect-error Runtime has no ARIA state vocabulary.
type _RemovedAriaState = import("@vue-tui/runtime").AriaState;
// @ts-expect-error Box does not accept screen-reader-only props.
type _RemovedBoxAriaLabel = BoxProps["ariaLabel"];
// @ts-expect-error Text does not accept screen-reader-only props.
type _RemovedTextAriaLabel = TextProps["ariaLabel"];
// @ts-expect-error Output writer strategy is private Runtime machinery.
type _RemovedRenderOutput = import("@vue-tui/runtime").RenderOutput;
// @ts-expect-error Physical terminal dimensions are not a public Runtime contract.
type _RemovedRenderSize = import("@vue-tui/runtime").RenderSize;
// @ts-expect-error The old combined layout snapshot is not a public Runtime contract.
type _RemovedRenderLayoutSize = import("@vue-tui/runtime").RenderLayoutSize;
// @ts-expect-error Rich accepted-paint geometry is private Runtime machinery.
type _RemovedUseElementGeometry = typeof import("@vue-tui/runtime").useElementGeometry;
// @ts-expect-error The broad geometry wrapper was removed with its hook.
type _RemovedUseElementGeometryReturn = import("@vue-tui/runtime").UseElementGeometryReturn;
// @ts-expect-error Rich geometry states and fragments are private Runtime machinery.
type _RemovedElementGeometry = import("@vue-tui/runtime").ElementGeometry;
// @ts-expect-error Paint rectangles are private Runtime machinery.
type _RemovedCellRect = import("@vue-tui/runtime").CellRect;
// @ts-expect-error Paint fragments are private Runtime machinery.
type _RemovedElementGeometryFragment = import("@vue-tui/runtime").ElementGeometryFragment;
// @ts-expect-error The test package no longer aliases Runtime's broad session graph.
type _RemovedTestRenderSession = import("@vue-tui/testing").TestRenderSession;
// @ts-expect-error The test result does not republish Runtime session internals.
type _RemovedRenderResultSession = RenderResult["session"];
// @ts-expect-error Vue visibility replaces the removed Yoga display prop.
type _RemovedBoxDisplay = BoxProps["display"];
// @ts-expect-error Multi-line cross-axis distribution is outside the minimum Box surface.
type _RemovedBoxAlignContent = BoxProps["alignContent"];
// @ts-expect-error Text has no browser-style class surface.
type _RemovedTextClass = TextProps["class"];
// @ts-expect-error Newline is ordinary Text composition.
type _RemovedNewline = typeof import("@vue-tui/runtime").Newline;
// @ts-expect-error Spacer is ordinary Box composition.
type _RemovedSpacer = typeof import("@vue-tui/runtime").Spacer;
// @ts-expect-error Transform is private renderer material.
type _RemovedTransform = typeof import("@vue-tui/runtime").Transform;
// @ts-expect-error Animation policy is not a Runtime primitive.
type _RemovedUseAnimation = typeof import("@vue-tui/runtime").useAnimation;
// @ts-expect-error Broad Yoga style vocabulary is not a public named type.
type _RemovedBoxStyle = import("@vue-tui/runtime").BoxStyle;
// @ts-expect-error Broad Yoga layout vocabulary is not a public named type.
type _RemovedBoxLayoutStyle = import("@vue-tui/runtime").BoxLayoutStyle;
// @ts-expect-error Newline has no public prop type after value removal.
type _RemovedNewlineProps = import("@vue-tui/runtime").NewlineProps;
// @ts-expect-error Spacer has no public prop type after value removal.
type _RemovedSpacerProps = import("@vue-tui/runtime").SpacerProps;
// @ts-expect-error Transform has no public prop type while private.
type _RemovedTransformProps = import("@vue-tui/runtime").TransformProps;
// @ts-expect-error Removed timer policy has no public options type.
type _RemovedUseAnimationOptions = import("@vue-tui/runtime").UseAnimationOptions;
// @ts-expect-error Removed timer policy has no public return type.
type _RemovedUseAnimationReturn = import("@vue-tui/runtime").UseAnimationReturn;
// @ts-expect-error Experimental useBoxSize was replaced by useBoxMetrics().
type _RemovedUseBoxSize = typeof import("@vue-tui/runtime").useBoxSize;
// @ts-expect-error Imperative Yoga reads were removed.
type _RemovedMeasureElement = typeof import("@vue-tui/runtime").measureElement;
// @ts-expect-error The old frozen size snapshot type was removed.
type _RemovedBoxSize = import("@vue-tui/runtime").BoxSize;
// @ts-expect-error Targetless terminal cursor ownership was removed.
type _RemovedUseCursor = typeof import("@vue-tui/runtime").useCursor;
// @ts-expect-error The old focus-bound, cell-coordinate caret was withdrawn.
type _RemovedUseCaret = typeof import("@vue-tui/runtime").useCaret;
// @ts-expect-error Output-origin cursor coordinates were removed with useCursor().
type _RemovedCursorPosition = import("@vue-tui/runtime").CursorPosition;
// @ts-expect-error The terminal-wide v1 mouse hook was removed from the root.
type _RemovedUseMouseInput = typeof import("@vue-tui/runtime").useMouseInput;
// @ts-expect-error The v1 drag helper was removed from the root.
type _RemovedUseDraggable = typeof import("@vue-tui/runtime").useDraggable;
// @ts-expect-error Targeted mouse policy is outside the Runtime foundation.
type _RemovedUseMouseEvent = typeof import("@vue-tui/runtime").useMouseEvent;
// @ts-expect-error Drag policy is outside the Runtime foundation.
type _RemovedUseMouseDrag = typeof import("@vue-tui/runtime").useMouseDrag;
// @ts-expect-error Selection policy is outside the Runtime foundation.
type _RemovedUseTextSelection = typeof import("@vue-tui/runtime").useTextSelection;
// @ts-expect-error Clipboard policy is outside the Runtime foundation.
type _RemovedUseClipboard = typeof import("@vue-tui/runtime").useClipboard;
// @ts-expect-error Cell coordinates are not a public Runtime contract.
type _RemovedCellPoint = import("@vue-tui/runtime").CellPoint;
// @ts-expect-error Component target wiring is not a public Runtime contract.
type _RemovedElementTarget = import("@vue-tui/runtime").ElementTarget;
// @ts-expect-error Static is available only from the Inline history subpath.
type _RootStatic = typeof import("@vue-tui/runtime").Static;
// @ts-expect-error The removed Static collection types are not exported from the root.
type _RemovedRootStaticChildren = import("@vue-tui/runtime").StaticChildren;
// @ts-expect-error The removed Static collection types are not exported from the root.
type _RemovedRootStaticProps = import("@vue-tui/runtime").StaticProps;
// @ts-expect-error The removed Static collection types are not exported from the root.
type _RemovedRootStaticSlot = import("@vue-tui/runtime").StaticSlot;
// @ts-expect-error The removed Static collection types are not exported from the root.
type _RemovedRootStaticSlotProps = import("@vue-tui/runtime").StaticSlotProps;
// @ts-expect-error The removed Static collection types are not exported from the root.
type _RemovedRootStaticStyle = import("@vue-tui/runtime").StaticStyle;
// @ts-expect-error The no-prop Static component has no named author type exports.
type _RemovedInlineStaticChildren = import("@vue-tui/runtime/inline").StaticChildren;
// @ts-expect-error The no-prop Static component has no named author type exports.
type _RemovedInlineStaticProps = import("@vue-tui/runtime/inline").StaticProps;
// @ts-expect-error The no-prop Static component has no named author type exports.
type _RemovedInlineStaticSlot = import("@vue-tui/runtime/inline").StaticSlot;
// @ts-expect-error The no-prop Static component has no named author type exports.
type _RemovedInlineStaticSlotProps = import("@vue-tui/runtime/inline").StaticSlotProps;
// @ts-expect-error The no-prop Static component has no named author type exports.
type _RemovedInlineStaticStyle = import("@vue-tui/runtime/inline").StaticStyle;
// @ts-expect-error Common component types are not duplicated on the Inline subpath.
type _InlineBoxProps = import("@vue-tui/runtime/inline").BoxProps;
// @ts-expect-error Percentage notation remains a prop value category, not a named export.
type _RemovedPercentage = import("@vue-tui/runtime").Percentage;
// @ts-expect-error Offsets remain a prop value category, not a named export.
type _RemovedOffset = import("@vue-tui/runtime").Offset;
// @ts-expect-error Color publishes one complete authoring type, not its internal named subset.
type _RemovedNamedColor = import("@vue-tui/runtime").NamedColor;
// @ts-expect-error Wrap modes are derived from TextProps rather than separately exported.
type _RemovedWrapMode = import("@vue-tui/runtime").WrapMode;
// @ts-expect-error Mouse protocol types are not public Runtime contracts.
type _RemovedRootMouseButton = import("@vue-tui/runtime").MouseButton;
// @ts-expect-error The terminal-wide v1 mouse event was removed.
type _RemovedMouseInputEvent = import("@vue-tui/runtime").MouseInputEvent;
// @ts-expect-error The mutable v1 mouse target was removed.
type _RemovedMouseTarget = import("@vue-tui/runtime").MouseTarget;
// @ts-expect-error The mutable v1 event was removed.
type _RemovedTuiMouseEvent = import("@vue-tui/runtime").TuiMouseEvent;
void removedRawMode;
void acceptedExitOnCtrlC;
void exitOnCtrlCTestHost;
void removedKittyKeyboard;
void removedClipboardMount;
void packedColor;
void packedRgbColor;
void removedGreyColor;
void removedDefaultColor;
`,
    );
    writeFileSync(
      join(consumerDirectory, "consumer.tsx"),
      `import { ScrollBox, Spinner, type ScrollBoxExpose } from "@vue-tui/components";
import { Box, Text, useBoxMetrics, useFocus, useInput, useLayoutSize } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { defineComponent, onMounted, shallowRef } from "vue";

// @ts-expect-error Spinner is a leaf component and ignores child content.
const unsupportedSpinnerChildren = <Spinner children="ignored" />;
void unsupportedSpinnerChildren;

const keyedStaticChildren = [1, 2].map((item) => (
  <Static key={item}>
    <Text>{item}</Text>
  </Static>
));
void keyedStaticChildren;

// @ts-expect-error Static does not own application collection items.
const unsupportedStaticItems = <Static items={[1]}><Text>x</Text></Static>;
// @ts-expect-error Layout is composed inside Static's ordinary slot.
const unsupportedStaticStyle = <Static style={{ flexDirection: "row" }}><Text>x</Text></Static>;
const completeBoxAndText = (
  <Box
    flexDirection="row-reverse"
    flexWrap="wrap-reverse"
    flexGrow={1.5}
    flexShrink={0.5}
    flexBasis="25%"
    alignItems="stretch"
    alignSelf="auto"
    justifyContent="space-evenly"
    gap={1}
    rowGap={2}
    columnGap={3}
    width="75%"
    height={10}
    minWidth={1}
    minHeight={2}
    maxWidth={80}
    maxHeight={20}
    position="absolute"
    top="-10%"
    right="5%"
    bottom={-1}
    left={2}
    margin={1}
    marginX={2}
    marginY={3}
    marginTop={4}
    marginRight={5}
    marginBottom={6}
    marginLeft={7}
    padding={1}
    paddingX={2}
    paddingY={3}
    paddingTop={4}
    paddingRight={5}
    paddingBottom={6}
    paddingLeft={7}
    borderStyle="round"
    borderTop
    borderRight={false}
    borderBottom
    borderLeft={false}
    borderColor="gray"
    backgroundColor="#123abc"
    overflow="hidden"
    overflowX="visible"
    overflowY="hidden"
  >
    <Text
      color="default"
      backgroundColor="default"
      dimColor={false}
      bold
      italic
      underline
      strikethrough
      inverse
      wrap="truncate"
    >
      complete public authoring surface
    </Text>
  </Box>
);
// @ts-expect-error Vue visibility directives replace the removed public display prop.
const unsupportedBoxDisplay = <Box display="none"><Text>x</Text></Box>;
// @ts-expect-error Multi-line cross-axis distribution is outside the public Box surface.
const unsupportedBoxAlignContent = <Box alignContent="center"><Text>x</Text></Box>;
// @ts-expect-error The canonical end-truncation spelling is \`truncate\`.
const unsupportedTextTruncateEnd = <Text wrap="truncate-end">x</Text>;
// @ts-expect-error Terminal-default resets use \`default\`.
const unsupportedTextRevert = <Text color="revert">x</Text>;
void unsupportedStaticItems;
void unsupportedStaticStyle;
void completeBoxAndText;
void unsupportedBoxDisplay;
void unsupportedBoxAlignContent;
void unsupportedTextTruncateEnd;
void unsupportedTextRevert;

export const InputProbe = defineComponent(() => {
  const host = shallowRef<InstanceType<typeof Box> | null>(null);
  const scrollBox = shallowRef<ScrollBoxExpose | null>(null);
  const metrics = useBoxMetrics(host);
  const focus = useFocus(host);
  const { width: layoutWidth, height: viewportHeight } = useLayoutSize();
  onMounted(() => focus.focus());
  useInput(
    (event) => {
      if (event.type === "key" && event.key.name === "enter") {
        event.key.name.toUpperCase();
      }
      if (event.type === "key" && event.key.character === "c" && event.key.ctrl) {
        event.key.character.toUpperCase();
      }
    },
    { isActive: focus.isFocused },
  );
  if (scrollBox.value) {
    const movementResults: readonly boolean[] = [
      scrollBox.value.scrollByLines(1),
      scrollBox.value.scrollToLine(2),
      scrollBox.value.scrollToTop(),
      scrollBox.value.scrollToBottom(),
    ];
    // @ts-expect-error The private sticky-following control is not public.
    scrollBox.value.scrollToLine(2, true);
    void movementResults;
  }
  return () => <Box ref={host} height={2}><ScrollBox ref={scrollBox}><Text>{metrics.hasMeasured.value ? metrics.width.value : "pending"}:{layoutWidth.value}:{viewportHeight.value}:{String(focus.isFocused.value)}</Text></ScrollBox></Box>;
});
`,
    );
    writeFileSync(
      join(consumerDirectory, "App.vue"),
      `<script setup lang="ts">
import { onMounted, shallowRef } from "vue";
import { ScrollBox, type ScrollBoxExpose } from "@vue-tui/components";
import { Box, Text, useBoxMetrics, useFocus, useInput, useLayoutSize, useStdin } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";

const host = shallowRef<InstanceType<typeof Box> | null>(null);
const vShowVisible = shallowRef(true);
const screen = shallowRef<"editor" | "confirm">("editor");
const scrollBox = shallowRef<ScrollBoxExpose | null>(null);
const metrics = useBoxMetrics(host);
const focus = useFocus(host);
const isFocused = focus.isFocused;
const { width: layoutWidth, height: viewportHeight } = useLayoutSize();
const mountedStdin = useStdin();
onMounted(() => focus.focus());
useInput(
  (event) => {
    if ((event.type === "text" || event.type === "paste") && screen.value === "editor") {
      event.text.toUpperCase();
    } else if (event.type === "key" && event.key.name === "enter") {
      screen.value = screen.value === "editor" ? "confirm" : "editor";
    }
  },
  { isActive: isFocused },
);
mountedStdin.stdin;
mountedStdin.isRawModeSupported;
mountedStdin.setRawMode(false);
if (scrollBox.value) {
  const movementResults: readonly boolean[] = [
    scrollBox.value.scrollByLines(1),
    scrollBox.value.scrollToLine(2),
    scrollBox.value.scrollToTop(),
    scrollBox.value.scrollToBottom(),
  ];
  // @ts-expect-error The private sticky-following control is not public.
  scrollBox.value.scrollToLine(2, true);
  void movementResults;
}
</script>

<template>
  <Box ref="host" :height="2">
    <Static v-for="(item, index) in [1, 2]" :key="item">
      <Text>{{ item.toFixed(0) }}:{{ index.toFixed(0) }}</Text>
    </Static>
    <Box v-show="vShowVisible">
      <ScrollBox ref="scrollBox"><Text>{{ metrics.hasMeasured ? metrics.width : "pending" }}:{{ layoutWidth }}:{{ viewportHeight }}:{{ isFocused }}</Text></ScrollBox>
    </Box>
  </Box>
</template>
`,
    );
    if (supportsUseTemplateRef) {
      writeFileSync(
        join(consumerDirectory, "Vue35FocusTarget.vue"),
        `<script setup lang="ts">
import { Box, Text } from "@vue-tui/runtime";
</script>

<template>
  <Box><Text>custom focus target</Text></Box>
</template>
`,
      );
      writeFileSync(
        join(consumerDirectory, "Vue35Focus.vue"),
        `<script setup lang="ts">
import { onMounted, useTemplateRef } from "vue";
import { useFocus, type FocusTarget, type UseFocusReturn } from "@vue-tui/runtime";
import Vue35FocusTarget from "./Vue35FocusTarget.vue";

const target = useTemplateRef("customFocusTarget");
const acceptedTarget: FocusTarget = target;
const focus: UseFocusReturn = useFocus(target);
onMounted(() => focus.focus());
void acceptedTarget;
</script>

<template>
  <Vue35FocusTarget ref="customFocusTarget" />
</template>
`,
      );
    }
    writeFileSync(
      join(consumerDirectory, "RejectedMouseListeners.vue"),
      `<script setup lang="ts">
import { ScrollBox } from "@vue-tui/components";
import { Text } from "@vue-tui/runtime";

const listener = () => {};
</script>

<template>
  <!-- Vue templates accept undeclared listeners as fallthrough attributes. Box and Text
       therefore diagnose these removed listeners at render time; runtime.mjs verifies
       the packed-package behavior. ScrollBox still declares negative listener props. -->
  <!-- @vue-expect-error ScrollBox rejects the removed mousedown listener. -->
  <ScrollBox @mousedown="listener"><Text>scroll</Text></ScrollBox>
  <!-- @vue-expect-error ScrollBox rejects the removed mouseup listener. -->
  <ScrollBox @mouseup="listener"><Text>scroll</Text></ScrollBox>
  <!-- @vue-expect-error ScrollBox rejects the removed click listener. -->
  <ScrollBox @click="listener"><Text>scroll</Text></ScrollBox>
  <!-- @vue-expect-error ScrollBox rejects the removed wheel listener. -->
  <ScrollBox @wheel="listener"><Text>scroll</Text></ScrollBox>
</template>
`,
    );
    writeFileSync(
      join(consumerDirectory, "runtime.mjs"),
      `import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { PassThrough } from "node:stream";
import * as runtime from "@vue-tui/runtime";
import * as internalDevtools from "@vue-tui/runtime/internal/devtools";
import * as internalRuntimeTesting from "@vue-tui/runtime/internal/testing";
import * as inline from "@vue-tui/runtime/inline";
import { ScrollBox } from "@vue-tui/components";
import { render } from "@vue-tui/testing";
import { defineComponent, h, isReadonly, nextTick, onErrorCaptured, onMounted, onScopeDispose, onUnmounted, ref, shallowRef, vShow, watch, withDirectives } from "vue";

const require = createRequire(import.meta.url);
const runtimeManifestPath = require.resolve("@vue-tui/runtime/package.json");
const runtimeManifest = JSON.parse(readFileSync(runtimeManifestPath, "utf8"));
assert.equal(runtimeManifest.name, "@vue-tui/runtime");
const visualGuidePath = join(
  dirname(runtimeManifestPath),
  "docs/visual-development-feedback-loops.md",
);
assert.match(readFileSync(visualGuidePath, "utf8"), /Visual development feedback loop/);

const { Box, createApp, Text, useBoxMetrics, useFocus, useInput, useLayoutSize, useStdin } = runtime;
assert.deepEqual(Object.keys(inline).sort(), ["Static"]);
assert.deepEqual(Object.keys(internalDevtools).sort(), [
  "connectDevtools",
  "disconnectDevtools",
  "getDevtoolsSessionId",
  "isDevConnected",
]);
assert.deepEqual(Object.keys(internalRuntimeTesting).sort(), ["createTestHostBridge"]);
for (const unsupportedSubpath of ["devtools", "testing", "fullscreen"]) {
  await assert.rejects(import("@vue-tui/runtime/" + unsupportedSubpath), (error) => {
    assert.equal(error?.code, "ERR_PACKAGE_PATH_NOT_EXPORTED");
    return true;
  });
}
assert.equal("Static" in runtime, false);
assert.equal("usePaste" in runtime, false);
assert.equal("useRawInput" in runtime, false);
assert.equal("useCursor" in runtime, false);
assert.equal("useBoxMetrics" in runtime, true);
assert.equal("measureElement" in runtime, false);
assert.equal("useMouseInput" in runtime, false);
assert.equal("useDraggable" in runtime, false);
assert.equal("useMouseEvent" in runtime, false);
assert.equal("useMouseDrag" in runtime, false);
assert.equal("useTextSelection" in runtime, false);
assert.equal("useClipboard" in runtime, false);
assert.equal("Newline" in runtime, false);
assert.equal("Spacer" in runtime, false);
assert.equal("Transform" in runtime, false);
assert.equal("useAnimation" in runtime, false);
assert.equal("useLayoutSize" in runtime, true);
assert.equal("useRenderSession" in runtime, false);
assert.equal("useElementGeometry" in runtime, false);
assert.equal("useCaret" in runtime, false);
assert.equal("useInputAvailability" in runtime, false);
assert.equal("useExternalInput" in runtime, false);
assert.equal("useBoxPresence" in runtime, false);
assert.equal("useFocusedInput" in runtime, false);
assert.equal("useFocusManager" in runtime, false);
assert.equal("useFocusScope" in runtime, false);
assert.equal("useFocusScopeInput" in runtime, false);
assert.equal("kittyFlags" in runtime, false);
assert.equal("kittyModifiers" in runtime, false);
assert.equal(typeof useLayoutSize, "function");
assert.equal(typeof useBoxMetrics, "function");
assert.equal(typeof useFocus, "function");
assert.equal(typeof useInput, "function");

for (const [componentName, component] of [["Box", Box], ["Text", Text]]) {
  for (const listenerName of ["onMousedown", "onMouseDown", "onMouseup", "onMouseUp", "onClick", "onWheel"]) {
    const RemovedListener = defineComponent(() => () =>
      h(component, { [listenerName]: () => {} }, () => h(Text, null, () => "content")),
    );
    assert.throws(
      () => runtime.renderToString(RemovedListener),
      {
        name: "Error",
        message:
          "<" + componentName + '> does not accept the undeclared attribute "' +
          listenerName +
          '". Use a declared <' +
          componentName +
          "> prop.",
      },
    );
  }
}

for (const [componentName, component, attribute] of [
  ["Box", Box, "display"],
  ["Box", Box, "alignContent"],
  ["Box", Box, "aspectRatio"],
  ["Box", Box, "padddingLeft"],
  ["Box", Box, "class"],
  ["Text", Text, "colour"],
]) {
  const UnsupportedAttribute = defineComponent(() => () =>
    h(component, { [attribute]: 1 }, () => h(Text, null, () => "content")),
  );
  assert.throws(
    () => runtime.renderToString(UnsupportedAttribute),
    {
      name: "Error",
      message:
        "<" + componentName + '> does not accept the undeclared attribute "' + attribute + '". Use a declared <' + componentName + "> prop.",
    },
  );
}

const PackedPublicProps = defineComponent(() => () =>
  h(Box, { borderStyle: "single", borderColor: "gray", backgroundColor: "#12abEF", width: "100%" }, () =>
    h(Text, { color: "gray", backgroundColor: "#12abEF" }, () => "packed-colors"),
  ),
);
assert.equal(runtime.renderToString(PackedPublicProps, { width: 65_535 }).includes("packed-colors"), true);
const CompleteBoxAndText = defineComponent(() => () =>
  h(
    Box,
    {
      flexDirection: "row-reverse",
      flexWrap: "wrap-reverse",
      flexGrow: 0.5,
      flexShrink: 0.5,
      flexBasis: "100%",
      alignItems: "stretch",
      alignSelf: "auto",
      justifyContent: "space-evenly",
      gap: 0,
      rowGap: 0,
      columnGap: 0,
      width: "100%",
      height: 4,
      minWidth: 1,
      minHeight: 1,
      maxWidth: 80,
      maxHeight: 4,
      position: "static",
      top: "-0%",
      right: "0%",
      bottom: 0,
      left: 0,
      margin: 0,
      marginX: 0,
      marginY: 0,
      marginTop: 0,
      marginRight: 0,
      marginBottom: 0,
      marginLeft: 0,
      padding: 0,
      paddingX: 0,
      paddingY: 0,
      paddingTop: 0,
      paddingRight: 0,
      paddingBottom: 0,
      paddingLeft: 0,
      borderStyle: "round",
      borderTop: true,
      borderRight: true,
      borderBottom: true,
      borderLeft: true,
      borderColor: "gray",
      backgroundColor: "#123abc",
      overflow: "visible",
      overflowX: "visible",
      overflowY: "hidden",
    },
    () =>
      h(
        Text,
        {
          color: "default",
          backgroundColor: "default",
          dimColor: true,
          bold: true,
          italic: true,
          underline: true,
          strikethrough: true,
          inverse: true,
          wrap: "truncate",
        },
        () => "complete-public-surface",
      ),
  ),
);
assert.equal(
  runtime
    .renderToString(CompleteBoxAndText, { width: 80, height: Infinity })
    .replace(/\\x1b\\[[0-9;]*m/g, "")
    .includes("complete-public-surface"),
  true,
);
for (const color of ["grey", "#fff"]) {
  const InvalidColor = defineComponent(() => () => h(Text, { color }, () => "invalid"));
  assert.throws(() => runtime.renderToString(InvalidColor), /<Text> prop "color"/);
}
const InvalidPercentage = defineComponent(() => () =>
  h(Box, { width: "100.00000000000000000001%" }, () => h(Text, null, () => "invalid")),
);
assert.throws(() => runtime.renderToString(InvalidPercentage), /<Box> prop "width"/);
const InvalidDimension = defineComponent(() => () =>
  h(Box, { width: 65_536 }, () => h(Text, null, () => "invalid")),
);
assert.throws(() => runtime.renderToString(InvalidDimension), /<Box> prop "width"/);
assert.throws(
  () => runtime.renderToString(PackedPublicProps, { width: 65_536 }),
  /option "width" must be an integer between 1 and 65535/,
);
assert.equal(
  runtime.renderToString(PackedPublicProps, {
    width: 80,
    debug: true,
    mode: "fullscreen",
    rows: 24,
    [Symbol("presentation")]: true,
  }).includes("packed-colors"),
  true,
);
const OversizedDocument = defineComponent(() => () =>
  h(Box, { width: 1_024, height: 1_025, flexShrink: 0 }, () => h(Text, null, () => "large")),
);
assert.throws(
  () => runtime.renderToString(OversizedDocument, { width: 1_024, height: Infinity }),
  /Paint surface 1024x1025 exceeds the 1048576-cell resource limit/,
);

const inlineHistory = await render(
  defineComponent(() => () =>
    h(Box, null, () => [
      h(inline.Static, null, () => h(Text, null, () => "packed-history")),
      h(Text, null, () => "packed-live"),
    ]),
  ),
);
assert.equal(inlineHistory.frames.map((frame) => frame.staticOutput).join(""), "packed-history\\n");
assert.equal(inlineHistory.lastFrame(), "packed-live");
inlineHistory.dispose();

const packedStaticCleanupFailure = new Error("packed Static cleanup failed");
const packedStaticCleanupErrors = [];
const packedStaticEntries = shallowRef([
  { id: "first", text: "first" },
  { id: "second", text: "second" },
]);
const PackedStaticCleanupItem = defineComponent({
  props: { id: { type: String, required: true }, text: { type: String, required: true } },
  setup(props) {
    onScopeDispose(() => {
      if (props.id === "second") throw packedStaticCleanupFailure;
    });
    return () => h(Text, null, () => props.text);
  },
});
const packedStaticCleanup = await render(
  defineComponent(() => {
    onErrorCaptured((error) => {
      packedStaticCleanupErrors.push(error);
      return false;
    });
    return () => h(Box, null, () => [
      ...packedStaticEntries.value.map((entry) =>
        h(inline.Static, { key: entry.id }, () =>
          h(PackedStaticCleanupItem, { id: entry.id, text: entry.text }),
        ),
      ),
      h(Text, null, () => "packed-cleanup-live"),
    ]);
  }),
);
assert.deepEqual(packedStaticCleanupErrors, [packedStaticCleanupFailure]);
packedStaticEntries.value = [...packedStaticEntries.value].reverse();
await nextTick();
await packedStaticCleanup.waitUntilRenderFlush();
packedStaticEntries.value = [];
await nextTick();
await packedStaticCleanup.waitUntilRenderFlush();
assert.deepEqual(packedStaticCleanupErrors, [packedStaticCleanupFailure]);
assert.equal(packedStaticCleanup.lastFrame(), "packed-cleanup-live");
packedStaticCleanup.dispose();

const packedVShowVisible = shallowRef(false);
const packedVShowRevision = shallowRef(0);
let packedVShowMounts = 0;
let packedVShowUnmounts = 0;
const PackedVShowTarget = defineComponent(() => {
  const localRevision = ref(packedVShowRevision.value);
  watch(packedVShowRevision, (revision) => {
    localRevision.value = revision;
  }, { flush: "sync" });
  onMounted(() => packedVShowMounts++);
  onUnmounted(() => packedVShowUnmounts++);
  return () => withDirectives(
    h(Box, null, () => h(Text, null, () => "packed-v-show:" + localRevision.value)),
    [[vShow, packedVShowVisible.value]],
  );
});
const packedVShow = await render(
  defineComponent(() => () => h(Box, { flexDirection: "column" }, () => [
    h(PackedVShowTarget),
    h(Text, null, () => "packed-v-show-tail"),
  ])),
);
assert.equal(packedVShow.lastFrame(), "packed-v-show-tail");
assert.equal(packedVShowMounts, 1);
packedVShowRevision.value = 2;
await nextTick();
await packedVShow.waitUntilRenderFlush();
assert.equal(packedVShow.lastFrame(), "packed-v-show-tail");
packedVShowVisible.value = true;
await nextTick();
await packedVShow.waitUntilRenderFlush();
assert.equal(packedVShow.lastFrame(), "packed-v-show:2\\npacked-v-show-tail");
packedVShowVisible.value = false;
await nextTick();
await packedVShow.waitUntilRenderFlush();
assert.equal(packedVShow.lastFrame(), "packed-v-show-tail");
assert.equal(packedVShowMounts, 1);
packedVShow.dispose();
assert.equal(packedVShowUnmounts, 1);

function packedForegroundCharacters(value) {
  const result = [];
  const sgr = /\\x1b\\[([0-9;]*)m/g;
  let foreground = "default";
  let cursor = 0;
  const append = (text) => {
    for (const character of text) {
      if (character !== "\\n") result.push([character, foreground]);
    }
  };
  for (let match = sgr.exec(value); match; match = sgr.exec(value)) {
    append(value.slice(cursor, match.index));
    for (const parameter of (match[1] || "0").split(";").map(Number)) {
      if (parameter === 0 || parameter === 39) foreground = "default";
      else if (parameter === 31) foreground = "red";
      else if (parameter === 32) foreground = "green";
      else if (parameter === 34) foreground = "blue";
      else if ((parameter >= 30 && parameter <= 37) || parameter === 38) foreground = "other";
    }
    cursor = match.index + match[0].length;
  }
  append(value.slice(cursor));
  return result;
}

function packedStyledCharacters(value) {
  const result = [];
  const sgr = /\\x1b\\[([0-9;]*)m/g;
  const state = {
    foreground: "default",
    background: "default",
    dimColor: false,
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false,
    inverse: false,
  };
  const reset = () => {
    state.foreground = "default";
    state.background = "default";
    state.dimColor = false;
    state.bold = false;
    state.italic = false;
    state.underline = false;
    state.strikethrough = false;
    state.inverse = false;
  };
  const append = (text) => {
    for (const character of text) {
      if (character !== "\\n") result.push({ character, ...state });
    }
  };
  let cursor = 0;
  for (let match = sgr.exec(value); match; match = sgr.exec(value)) {
    append(value.slice(cursor, match.index));
    for (const parameter of (match[1] || "0").split(";").map(Number)) {
      if (parameter === 0) reset();
      else if (parameter === 1) state.bold = true;
      else if (parameter === 2) state.dimColor = true;
      else if (parameter === 3) state.italic = true;
      else if (parameter === 4) state.underline = true;
      else if (parameter === 7) state.inverse = true;
      else if (parameter === 9) state.strikethrough = true;
      else if (parameter === 22) {
        state.bold = false;
        state.dimColor = false;
      } else if (parameter === 23) state.italic = false;
      else if (parameter === 24) state.underline = false;
      else if (parameter === 27) state.inverse = false;
      else if (parameter === 29) state.strikethrough = false;
      else if (parameter === 31) state.foreground = "red";
      else if (parameter === 39) state.foreground = "default";
      else if (parameter === 44) state.background = "blue";
      else if (parameter === 49) state.background = "default";
    }
    cursor = match.index + match[0].length;
  }
  append(value.slice(cursor));
  return result;
}

const packedReset = await render(
  defineComponent(() => () => h(Text, null, () => [
    h(Text, { color: "red" }, () => [
      "AA",
      h(Text, { color: "default" }, () => "BBB"),
      "CC",
    ]),
    h(Text, { color: "blue" }, () => "Z"),
  ])),
  { columns: 4 },
);
const packedResetFrame = packedReset.lastFrame({ trimLines: true });
assert.equal(packedResetFrame.replace(/\\x1b\\[[0-9;]*m/g, ""), "AABB\\nBCCZ");
assert.deepEqual(packedForegroundCharacters(packedResetFrame), [
  ["A", "red"], ["A", "red"],
  ["B", "default"], ["B", "default"], ["B", "default"],
  ["C", "red"], ["C", "red"],
  ["Z", "blue"],
]);
packedReset.dispose();

const packedPrivateUse = "\\uE000\\uE001";
const packedNestedReset = await render(
  defineComponent(() => () => h(Text, { color: "red" }, () => [
    "A" + packedPrivateUse,
    h(Text, { color: "default" }, () => [
      "B",
      h(Text, { color: "green" }, () => "C"),
      h(Text, { color: "default" }, () => "D"),
      "E",
    ]),
    "F",
  ])),
);
const packedNestedFrame = packedNestedReset.lastFrame();
assert.equal(
  packedNestedFrame.replace(/\\x1b\\[[0-9;]*m/g, ""),
  "A" + packedPrivateUse + "BCDEF",
);
assert.deepEqual(packedForegroundCharacters(packedNestedFrame), [
  ["A", "red"], ["\\uE000", "red"], ["\\uE001", "red"],
  ["B", "default"], ["C", "green"], ["D", "default"], ["E", "default"],
  ["F", "red"],
]);
packedNestedReset.dispose();

const packedCascade = await render(
  defineComponent(() => () =>
    h(
      Text,
      { color: "red", backgroundColor: "blue", bold: true, dimColor: true, underline: true },
      () => [
        "A",
        h(Text, { bold: false }, () => "B"),
        h(Text, { dimColor: false }, () => "C"),
        h(
          Text,
          {
            color: "default",
            backgroundColor: "default",
            italic: true,
            strikethrough: true,
            inverse: true,
          },
          () => "D",
        ),
        "E",
      ],
    ),
  ),
);
assert.deepEqual(packedStyledCharacters(packedCascade.lastFrame()), [
  {
    character: "A",
    foreground: "red",
    background: "blue",
    dimColor: true,
    bold: true,
    italic: false,
    underline: true,
    strikethrough: false,
    inverse: false,
  },
  {
    character: "B",
    foreground: "red",
    background: "blue",
    dimColor: true,
    bold: false,
    italic: false,
    underline: true,
    strikethrough: false,
    inverse: false,
  },
  {
    character: "C",
    foreground: "red",
    background: "blue",
    dimColor: false,
    bold: true,
    italic: false,
    underline: true,
    strikethrough: false,
    inverse: false,
  },
  {
    character: "D",
    foreground: "default",
    background: "default",
    dimColor: true,
    bold: true,
    italic: true,
    underline: true,
    strikethrough: true,
    inverse: true,
  },
  {
    character: "E",
    foreground: "red",
    background: "blue",
    dimColor: true,
    bold: true,
    italic: false,
    underline: true,
    strikethrough: false,
    inverse: false,
  },
]);
packedCascade.dispose();

const stdin = new PassThrough();
const stdout = new PassThrough();
let observedStdin;
const Probe = defineComponent(() => {
  observedStdin = useStdin();
  return () => h(Text, null, () => "probe");
});
const live = createApp(Probe);
await live.waitUntilRenderFlush();
live.mount({ stdin, stdout, patchConsole: false, exitOnCtrlC: false });
await live.waitUntilRenderFlush();
assert.equal(observedStdin.stdin, stdin);
assert.deepEqual(Reflect.ownKeys(observedStdin), [
  "stdin",
  "isRawModeSupported",
  "setRawMode",
]);
assert.equal(observedStdin.isRawModeSupported, false);
assert.equal(typeof observedStdin.setRawMode, "function");
observedStdin.setRawMode(false);
const liveExit = live.waitUntilExit();
live.unmount();
await liveExit;
await live.waitUntilRenderFlush();

const initialFailure = new Error("packed partial mount failed");
const secondaryCleanupFailure = new Error("packed cleanup failed");
const disposedScopes = [];
const AllocatedBeforeFailure = defineComponent(() => {
  onScopeDispose(() => {
    disposedScopes.push("allocated");
  });
  return () => h(Text, null, () => "allocated");
});
const ThrowingDuringSetup = defineComponent(() => {
  onScopeDispose(() => {
    disposedScopes.push("throwing");
  });
  throw initialFailure;
});
const PartialFailureTree = defineComponent(() => {
  onScopeDispose(() => {
    disposedScopes.push("root");
    throw secondaryCleanupFailure;
  });
  return () =>
    h(Box, null, () => [h(AllocatedBeforeFailure), h(ThrowingDuringSetup)]);
});
const PartialFailureRoot = () => h(PartialFailureTree);
const partialFailure = createApp(PartialFailureRoot);
partialFailure.config.warnHandler = () => {};
const originalConsoleError = console.error;
let partialThrown;
console.error = () => {};
try {
  partialFailure.mount({
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    patchConsole: false,
  });
} catch (error) {
  partialThrown = error;
} finally {
  console.error = originalConsoleError;
}
if (partialThrown === undefined) partialFailure.unmount();
assert.equal(partialThrown, initialFailure);
await assert.rejects(partialFailure.waitUntilExit(), (error) => error === initialFailure);
assert.deepEqual(disposedScopes.sort(), ["allocated", "root", "throwing"]);

let functionalRootScope;
let functionalRootHookCalls = 0;
const FunctionalHostFailure = () => h("unsupported-vue-tui-host");
const functionalHostFailure = createApp(FunctionalHostFailure, {
  onVnodeBeforeMount(vnode) {
    functionalRootHookCalls += 1;
    functionalRootScope = vnode.component?.scope;
  },
});
let functionalThrown;
console.error = () => {};
try {
  functionalHostFailure.mount({
    stdin: new PassThrough(),
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    patchConsole: false,
  });
} catch (error) {
  functionalThrown = error;
} finally {
  console.error = originalConsoleError;
}
if (functionalThrown === undefined) functionalHostFailure.unmount();
assert.equal(functionalThrown?.message, "Unknown vue-tui element type: unsupported-vue-tui-host");
await assert.rejects(functionalHostFailure.waitUntilExit(), (error) => error === functionalThrown);
assert.equal(functionalRootHookCalls, 1);
assert.equal(functionalRootScope?.active, false);

let repeatedCleanupCalls = 0;
const repeatedCleanup = () => {
  repeatedCleanupCalls += 1;
};
const RepeatedCleanupRoot = defineComponent(() => {
  onScopeDispose(repeatedCleanup);
  onScopeDispose(repeatedCleanup);
  return () => h(Text, null, () => "repeated cleanup");
});
const repeatedCleanupApp = createApp(RepeatedCleanupRoot);
repeatedCleanupApp.mount({
  stdin: new PassThrough(),
  stdout: new PassThrough(),
  stderr: new PassThrough(),
  patchConsole: false,
});
repeatedCleanupApp.unmount();
await repeatedCleanupApp.waitUntilExit();
assert.equal(repeatedCleanupCalls, 2);

function assertUnknownMountOption(name, value) {
  let stdoutRead = false;
  const invalidOptions = { [name]: value };
  Object.defineProperty(invalidOptions, "stdout", {
    get() {
      stdoutRead = true;
      throw new Error("stdout getter must not run");
    },
  });
  const invalid = createApp(Probe);
  assert.throws(
    () => invalid.mount(invalidOptions),
    new RegExp("Unknown mount option " + JSON.stringify(name)),
  );
  assert.equal(stdoutRead, false);
}

for (const name of [
  "liveUpdates",
  "onRender",
  "maxFps",
  "incrementalRendering",
  "clipboard",
  "fullscreen",
  "alternateScreen",
  "interactive",
  "debug",
  "rawMode",
  "kittyKeyboard",
]) {
  assertUnknownMountOption(name, undefined);
}

const bridgeBoundaryApp = createApp(Probe);
const bridgeBoundaryMount = bridgeBoundaryApp.mount;
let interceptedBridgeMountOptions;
bridgeBoundaryApp.mount = (options) => {
  interceptedBridgeMountOptions = options;
  return bridgeBoundaryMount(options);
};
const bridgeBoundary = internalRuntimeTesting.createTestHostBridge();
bridgeBoundary.mount(bridgeBoundaryApp, {
  stdin: new PassThrough(),
  stdout: new PassThrough(),
  stderr: new PassThrough(),
  patchConsole: false,
});
assert.equal(interceptedBridgeMountOptions, undefined);
bridgeBoundaryApp.unmount();
await bridgeBoundaryApp.waitUntilExit();

const NoInput = defineComponent(() => () => h(Text, null, () => "idle"));
const idle = await render(NoInput);
assert.equal(idle.terminal.rawMode.current, false);
assert.deepEqual(idle.terminal.rawMode.history, []);
idle.dispose();

let logicalFocusHandle;
let targetedFocusHandle;
let unavailableFocusHandle;
let setupObservedLogicalFocus = false;
const FocusProbe = defineComponent(() => {
  const target = shallowRef(null);
  const unavailableTarget = shallowRef(null);
  logicalFocusHandle = useFocus();
  targetedFocusHandle = useFocus(target);
  unavailableFocusHandle = useFocus(unavailableTarget);
  assert.equal(logicalFocusHandle.focus(), undefined);
  setupObservedLogicalFocus = logicalFocusHandle.isFocused.value;
  assert.equal(unavailableFocusHandle.focus(), undefined);
  assert.equal(logicalFocusHandle.isFocused.value, true);
  onMounted(() => targetedFocusHandle.focus());
  return () => h(Box, { ref: target }, () => h(Text, null, () => "focused"));
});
const focusApp = await render(FocusProbe);
assert.equal(setupObservedLogicalFocus, true);
assert.equal(logicalFocusHandle.isFocused.value, false);
assert.equal(targetedFocusHandle.isFocused.value, true);
assert.equal(unavailableFocusHandle.isFocused.value, false);
assert.equal(unavailableFocusHandle.focus(), undefined);
assert.equal(targetedFocusHandle.isFocused.value, true);
assert.equal(isReadonly(targetedFocusHandle.isFocused), true);
assert.equal(Object.isFrozen(targetedFocusHandle), true);
assert.deepEqual(Reflect.ownKeys(targetedFocusHandle), ["isFocused", "focus", "blur"]);
assert.equal(targetedFocusHandle.blur(), undefined);
assert.equal(targetedFocusHandle.isFocused.value, false);
assert.equal(logicalFocusHandle.focus(), undefined);
assert.equal(logicalFocusHandle.isFocused.value, true);
focusApp.unmount();
await focusApp.waitUntilExit();
assert.equal(logicalFocusHandle.isFocused.value, false);
assert.equal(logicalFocusHandle.focus(), undefined);
assert.equal(logicalFocusHandle.blur(), undefined);
assert.equal(logicalFocusHandle.isFocused.value, false);
focusApp.dispose();

let stringLogicalFocus;
let stringTargetedFocus;
const StringFocusProbe = defineComponent(() => {
  const target = shallowRef(null);
  stringLogicalFocus = useFocus();
  stringTargetedFocus = useFocus(target);
  stringLogicalFocus.focus();
  onMounted(() => stringTargetedFocus.focus());
  return () => h(Box, { ref: target }, () => h(Text, null, () => "string focus"));
});
assert.equal(runtime.renderToString(StringFocusProbe), "string focus");
assert.equal(stringLogicalFocus.isFocused.value, false);
assert.equal(stringTargetedFocus.isFocused.value, false);
assert.equal(stringLogicalFocus.focus(), undefined);
assert.equal(stringTargetedFocus.blur(), undefined);

let layoutWidthProjection;
let viewportHeightProjection;
let boxMetricsProjection;
let scrollBoxHandle;
const LayoutProbe = defineComponent(() => {
  const host = shallowRef(null);
  scrollBoxHandle = shallowRef(null);
  const layoutProjection = useLayoutSize();
  layoutWidthProjection = layoutProjection.width;
  viewportHeightProjection = layoutProjection.height;
  boxMetricsProjection = useBoxMetrics(host);
  return () => h(Box, { ref: host, width: 8, height: 3 }, () =>
    h(ScrollBox, { ref: scrollBoxHandle }, { default: () => h(Text, null, () => "packed size") }),
  );
});
const layoutApp = await render(LayoutProbe, { columns: 20, rows: 5 });
assert.equal(layoutWidthProjection.value, 20);
assert.equal(viewportHeightProjection.value, 5);
assert.equal(boxMetricsProjection.width.value, 8);
assert.equal(boxMetricsProjection.height.value, 3);
assert.equal(boxMetricsProjection.hasMeasured.value, true);
assert.equal(typeof boxMetricsProjection.left.value, "number");
assert.equal(typeof boxMetricsProjection.top.value, "number");
assert.equal(isReadonly(layoutWidthProjection), true);
assert.equal(isReadonly(viewportHeightProjection), true);
assert.equal(isReadonly(boxMetricsProjection.width), true);
assert.equal(isReadonly(boxMetricsProjection.hasMeasured), true);
assert.equal(typeof scrollBoxHandle.value.scrollByLines, "function");
assert.equal(typeof scrollBoxHandle.value.scrollToLine, "function");
assert.equal(typeof scrollBoxHandle.value.scrollToTop, "function");
assert.equal(typeof scrollBoxHandle.value.scrollToBottom, "function");
assert.equal(layoutApp.lastFrame().includes("packed"), true);
assert.equal(layoutApp.lastFrame().includes("size"), true);
assert.equal("session" in layoutApp, false);
const acceptedBoxWidth = boxMetricsProjection.width.value;
const acceptedBoxHeight = boxMetricsProjection.height.value;
await layoutApp.terminal.resize(24, 6);
assert.equal(layoutWidthProjection.value, 24);
assert.equal(viewportHeightProjection.value, 6);
assert.equal(boxMetricsProjection.width.value, acceptedBoxWidth);
assert.equal(boxMetricsProjection.height.value, acceptedBoxHeight);
layoutApp.dispose();
assert.equal(layoutWidthProjection.value, 24);
assert.equal(viewportHeightProjection.value, 6);
assert.equal(boxMetricsProjection.hasMeasured.value, false);
assert.equal(boxMetricsProjection.width.value, 0);

let streamLayoutWidth;
let streamViewportHeight;
const DocumentHostLayoutProbe = defineComponent(() => {
  const streamLayout = useLayoutSize();
  streamLayoutWidth = streamLayout.width;
  streamViewportHeight = streamLayout.height;
  return () => h(Text, null, () =>
    String(streamLayoutWidth.value) + "x" + String(streamViewportHeight.value),
  );
});
const documentHostLayoutApp = await render(DocumentHostLayoutProbe, {
  columns: 30,
  rows: 8,
  host: { stdout: "stream" },
});
assert.equal(streamLayoutWidth.value, 80);
assert.equal(streamViewportHeight.value, 24);
assert.equal(documentHostLayoutApp.lastFrame(), "80x24");
assert.equal("session" in documentHostLayoutApp, false);
documentHostLayoutApp.dispose();

let movementHandle;
const MovementProbe = defineComponent(() => {
  movementHandle = shallowRef(null);
  return () => h(Box, { width: 10, height: 2 }, () =>
    h(ScrollBox, { ref: movementHandle }, {
      default: () => Array.from({ length: 5 }, (_, index) =>
        h(Text, { key: index }, () => \`line \${index}\`),
      ),
    }),
  );
});
const movementApp = await render(MovementProbe, { columns: 20, rows: 5 });
assert.equal(movementHandle.value.scrollByLines(-1), true);
assert.equal(movementHandle.value.scrollToTop(), true);
assert.equal(movementHandle.value.scrollToTop(), false);
assert.equal(movementHandle.value.scrollToLine(1.9), true);
assert.equal(movementHandle.value.scrollToLine(1.1), false);
assert.equal(movementHandle.value.scrollToBottom(), true);
assert.equal(movementHandle.value.scrollToBottom(), false);
assert.throws(
  () => movementHandle.value.scrollToLine(Number.NaN),
  /scrollToLine\\(\\) line must be a finite number/,
);
assert.throws(
  () => movementHandle.value.scrollByLines(Infinity),
  /scrollByLines\\(\\) lines must be a finite number/,
);
assert.equal(movementHandle.value.scrollByLines(-1), true);
movementApp.dispose();

const events = [];
const inputScreen = shallowRef("editor");
let inputFocus;
const WithInput = defineComponent(() => {
  const host = shallowRef(null);
  inputFocus = useFocus(host);
  onMounted(() => inputFocus.focus());
  useInput(
    (event) => {
      events.push(event);
      if (inputScreen.value === "editor" && event.type === "text") {
        inputScreen.value = "confirm";
      } else if (
        inputScreen.value === "confirm" &&
        event.type === "key" &&
        event.key.name === "enter"
      ) {
        inputScreen.value = "editor";
      }
    },
    { isActive: inputFocus.isFocused },
  );
  return () => h(Box, { ref: host }, () => h(Text, null, () => "active"));
});
const active = await render(WithInput);
assert.equal(inputFocus.isFocused.value, true);
assert.equal(active.terminal.rawMode.current, true);
await active.stdin.write("a");
await active.stdin.write("\\r");
await active.stdin.write("\\x03");
assert.equal(events.length, 3);
assert.deepEqual(events[0], {
  type: "text",
  text: "a",
});
assert.deepEqual(events[1], {
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
});
assert.deepEqual(events[2], {
  type: "key",
  key: {
    character: "c",
    shift: false,
    alt: false,
    ctrl: true,
    meta: false,
    super: false,
    hyper: false,
  },
});
assert.equal(events.every(Object.isFrozen), true);
assert.equal(events.slice(1).every((event) => Object.isFrozen(event.key)), true);
assert.equal(inputScreen.value, "editor");
active.dispose();
assert.equal(inputFocus.isFocused.value, false);
assert.equal(active.terminal.rawMode.current, false);

let ignoredResultDeliveries = 0;
const IgnoredResult = defineComponent(() => {
  useInput(() => {
    ignoredResultDeliveries += 1;
    return 42;
  });
  return () => h(Text, null, () => "ignored");
});
const ignoredResult = await render(IgnoredResult);
await ignoredResult.stdin.write("x");
assert.equal(ignoredResultDeliveries, 1);
ignoredResult.dispose();
`,
    );

    run("npm", ["install", "--no-audit", "--no-fund", "--package-lock=false"], consumerDirectory);
    run("npx", ["tsc", "-p", "tsconfig.json"], consumerDirectory);
    run("npx", ["vue-tsc", "-p", "tsconfig.sfc.json"], consumerDirectory);
    run(process.execPath, ["runtime.mjs"], consumerDirectory, { FORCE_COLOR: "3" });

    const dependencyTree = JSON.parse(
      run("npm", ["ls", "vue", "--all", "--json"], consumerDirectory),
    );
    assert.deepEqual([...collectVueVersions(dependencyTree)], [vueVersion]);
    assert.equal(
      JSON.parse(readFileSync(join(consumerDirectory, "node_modules/vue/package.json"), "utf8"))
        .version,
      vueVersion,
    );

    process.stdout.write(
      `clean runtime, testing, and components tarball consumer passed with Vue ${vueVersion} and TypeScript 6.0.3\n`,
    );
  }
} finally {
  rmSync(temporaryRoot, { recursive: true, force: true });
}
