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
        include: ["App.vue", "RejectedMouseListeners.vue"],
      },
      null,
      2,
    ),
  );
  writeFileSync(
    join(consumerDirectory, "consumer.ts"),
    `import { shallowRef } from "vue";
import {
  Box,
  Text,
  useBoxPresence,
  useBoxSize,
  useClipboard,
  useInput,
  useLayoutWidth,
  useStdin,
  useViewportHeight,
  type BoxSize,
  type BoxProps,
  type Color,
  type CellPoint,
  type ClipboardAvailability,
  type ClipboardTransport,
  type ClipboardWriteResult,
  type ElementTarget,
  type MountOptions,
  type RenderToStringOptions,
  type TuiInputEvent,
  type TextProps,
  type UseClipboardReturn,
  type UseStdinReturn,
} from "@vue-tui/runtime";
import {
  useMouseDrag,
  useMouseEvent,
  useTextSelection,
  type CellDelta,
  type MouseButton,
  type MouseDragHandler,
  type MouseEventHandler,
  type MouseHandlerResult,
  type MouseModifiers,
  type TuiMouseClickEvent,
  type TuiMouseDragEvent,
  type TuiMouseEventMap,
  type TuiMouseWheelEvent,
  type TextSelectionCommands,
  type TextSelectionState,
  type UseMouseDragOptions,
  type UseMouseDragReturn,
  type UseMouseEventOptions,
  type UseTextSelectionOptions,
} from "@vue-tui/runtime/fullscreen";
import type { RenderResult, TestClipboardBehavior, TestMouse } from "@vue-tui/testing";
import type { ComponentPublicInstance, MaybeRefOrGetter, Ref, ShallowRef } from "vue";

type Equal<A, B> = (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2
  ? true
  : false;
type Expect<T extends true> = T;
type _ExactStdinSurface = Expect<
  Equal<UseStdinReturn, { readonly stdin: NodeJS.ReadStream }>
>;
type _ExactBoxProps = Expect<
  Equal<
    keyof BoxProps,
    | "flexDirection"
    | "flexGrow"
    | "flexShrink"
    | "flexBasis"
    | "alignItems"
    | "justifyContent"
    | "gap"
    | "width"
    | "height"
    | "minWidth"
    | "minHeight"
    | "position"
    | "top"
    | "left"
    | "marginTop"
    | "paddingTop"
    | "paddingBottom"
    | "paddingLeft"
    | "paddingRight"
    | "borderStyle"
    | "borderColor"
    | "backgroundColor"
    | "overflowY"
    | "display"
    | "ariaLabel"
    | "ariaHidden"
    | "ariaRole"
    | "ariaState"
  >
>;
type _ExactTextProps = Expect<
  Equal<
    keyof TextProps,
    | "color"
    | "backgroundColor"
    | "dimColor"
    | "bold"
    | "inverse"
    | "wrap"
    | "ariaLabel"
    | "ariaHidden"
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
type _ExactRenderToStringOptions = Expect<Equal<keyof RenderToStringOptions, "columns">>;
type _ExactHandlerInput = Expect<
  Equal<
    Parameters<typeof useInput>[0],
    (event: TuiInputEvent) => void | { readonly preventDefault: true }
  >
>;
type _ExactInputOptions = Expect<
  Equal<
    Parameters<typeof useInput>[1],
    { readonly isActive?: MaybeRefOrGetter<boolean> } | undefined
  >
>;
type _ExactElementTarget = Expect<
  Equal<ElementTarget, MaybeRefOrGetter<ComponentPublicInstance | null | undefined>>
>;
type _ExactBoxSize = Expect<
  Equal<BoxSize, { readonly width: number; readonly height: number }>
>;
type _ExactBoxPresence = Expect<
  Equal<ReturnType<typeof useBoxPresence>, Readonly<Ref<boolean>>>
>;
type _ExactLayoutWidth = Expect<
  Equal<ReturnType<typeof useLayoutWidth>, Readonly<Ref<number>>>
>;
type _ExactViewportHeight = Expect<
  Equal<ReturnType<typeof useViewportHeight>, Readonly<Ref<number>> | null>
>;
type _ExactMouseButton = Expect<Equal<MouseButton, "left" | "middle" | "right">>;
type _ExactMouseHandlerResult = Expect<Equal<MouseHandlerResult, "continue" | "consume">>;
type _ExactCellDelta = Expect<Equal<CellDelta, { readonly x: number; readonly y: number }>>;
type _ExactMouseModifiers = Expect<
  Equal<
    MouseModifiers,
    { readonly shift: boolean; readonly alt: boolean; readonly ctrl: boolean }
  >
>;
type _ExactClickEvent = Expect<
  Equal<
    Pick<TuiMouseClickEvent, "type" | "delivery" | "surface" | "local" | "button">,
    {
      readonly type: "click";
      readonly delivery: "target" | "bubble";
      readonly surface: CellPoint;
      readonly local: CellPoint;
      readonly button: MouseButton;
    }
  >
>;
type _ExactWheelEvent = Expect<
  Equal<
    Pick<TuiMouseWheelEvent, "type" | "delivery" | "surface" | "local" | "delta">,
    {
      readonly type: "wheel";
      readonly delivery: "target" | "bubble";
      readonly surface: CellPoint;
      readonly local: CellPoint;
      readonly delta: CellDelta;
    }
  >
>;
type _ExactMouseEventMap = Expect<
  Equal<
    TuiMouseEventMap,
    { readonly click: TuiMouseClickEvent; readonly wheel: TuiMouseWheelEvent }
  >
>;
type _ExactMouseEventHandler = Expect<
  Equal<MouseEventHandler<"click">, (event: TuiMouseClickEvent) => MouseHandlerResult>
>;
type _ExactMouseDragHandler = Expect<
  Equal<MouseDragHandler, (event: TuiMouseDragEvent) => void>
>;
type _ExactMouseDragMovement = Expect<
  Equal<Exclude<TuiMouseDragEvent, { phase: "cancel" }>["movement"], CellDelta>
>;
type _ExactMouseDragCancelReason = Expect<
  Equal<
    Extract<TuiMouseDragEvent, { phase: "cancel" }>["reason"],
    "deactivated" | "target-lost" | "suspended"
  >
>;
type _ExactMouseEventOptions = Expect<
  Equal<UseMouseEventOptions, { readonly isActive?: MaybeRefOrGetter<boolean> }>
>;
type _ExactMouseDragOptions = Expect<
  Equal<UseMouseDragOptions, { readonly isActive?: MaybeRefOrGetter<boolean> }>
>;
type _ExactMouseDragReturn = Expect<
  Equal<UseMouseDragReturn, { readonly isDragging: Readonly<ShallowRef<boolean>> }>
>;
type _ExactPackagedTestMouse = Expect<Equal<RenderResult["mouse"], TestMouse>>;
type _ExactClipboardTransport = Expect<
  Equal<
    ClipboardTransport,
    | {
        readonly kind: "custom";
        readonly writeText: (
          text: string,
        ) => import("@vue-tui/runtime").ClipboardTransportResult | PromiseLike<import("@vue-tui/runtime").ClipboardTransportResult>;
      }
    | { readonly kind: "osc52" }
  >
>;
type _ExactClipboardReturn = Expect<
  Equal<
    UseClipboardReturn,
    {
      readonly availability: Readonly<ShallowRef<ClipboardAvailability>>;
      readonly writeText: (text: string) => Promise<ClipboardWriteResult>;
    }
  >
>;
type _ExactTestingClipboard = Expect<
  Equal<TestClipboardBehavior, "copied" | "requested" | "unavailable" | "rejected">
>;
type _ExactTestingClipboardRequests = Expect<
  Equal<RenderResult["clipboard"]["requests"], readonly string[]>
>;
type _ExactSelectionOptions = Expect<
  Equal<
    UseTextSelectionOptions,
    {
      readonly isActive?: MaybeRefOrGetter<boolean>;
      readonly pointer?: MaybeRefOrGetter<boolean>;
    }
  >
>;
type _ExactSelectionCommands = Expect<
  Equal<
    TextSelectionCommands,
    {
      readonly state: Readonly<ShallowRef<TextSelectionState>>;
      move(
        direction: import("@vue-tui/runtime/fullscreen").TextSelectionMove,
        options?: { readonly extend?: boolean },
      ): boolean;
      selectAll(): boolean;
      clear(): boolean;
      copy(): Promise<import("@vue-tui/runtime/fullscreen").TextSelectionCopyResult>;
    }
  >
>;

const active = shallowRef(true);
const screen = shallowRef<"editor" | "confirm">("editor");
const handler = (event: TuiInputEvent): void | { readonly preventDefault: true } => {
  if ((event.kind === "text" || event.kind === "paste") && screen.value === "editor") {
    event.text;
    return;
  }
  if (event.kind === "key" && event.name === "enter") {
    screen.value = screen.value === "editor" ? "confirm" : "editor";
  }
  if (event.kind === "key" && event.character === "c" && event.ctrl) {
    return { preventDefault: true };
  }
};
useInput(handler, { isActive: () => active.value });
// @ts-expect-error Parser packet metadata is not part of the public event.
declare const removedSequence: TuiInputEvent["sequence"];

declare const elementHost: MaybeRefOrGetter<ComponentPublicInstance | null | undefined>;
const layoutWidth = useLayoutWidth();
const viewportHeight = useViewportHeight();
// @ts-expect-error Runtime-owned layout width is readonly.
layoutWidth.value = 40;
if (viewportHeight) {
  // @ts-expect-error Runtime-owned viewport height is readonly.
  viewportHeight.value = 24;
}
const boxHost = shallowRef<InstanceType<typeof Box> | null>(null);
const boxSize = useBoxSize(boxHost);
const boxPresence = useBoxPresence(boxHost);
const measuredSize: BoxSize | null = boxSize.value;
// @ts-expect-error Accepted Box size is readonly.
boxSize.value = { width: 1, height: 1 };
// @ts-expect-error Accepted Box presence is readonly.
boxPresence.value = false;
if (measuredSize) {
  // @ts-expect-error Accepted Box size fields are readonly.
  measuredSize.width = 2;
}
const textHost = shallowRef<InstanceType<typeof Text> | null>(null);
// @ts-expect-error Text layout has different semantics and is not a Box target.
useBoxSize(textHost);
// @ts-expect-error Text is not a direct Box-presence target.
useBoxPresence(textHost);
const arbitraryHost = shallowRef<ComponentPublicInstance | null>(null);
// @ts-expect-error An arbitrary component ref does not identify one measurable Box.
useBoxSize(arbitraryHost);
// @ts-expect-error An arbitrary component ref does not identify one direct Box.
useBoxPresence(arbitraryHost);
declare const rawBoxHost: InstanceType<typeof Box>;
// @ts-expect-error A raw component value cannot represent target attachment and detachment.
useBoxSize(rawBoxHost);
// @ts-expect-error A raw component value cannot represent target attachment and detachment.
useBoxPresence(rawBoxHost);
// @ts-expect-error Callers can wrap a derived target in computed(); Runtime accepts refs only.
useBoxSize(() => boxHost.value);
// @ts-expect-error Callers can wrap a derived target in computed(); Runtime accepts refs only.
useBoxPresence(() => boxHost.value);
const clickHandler = shallowRef<MouseEventHandler<"click">>(() => "continue");
useMouseEvent(elementHost, "click", clickHandler);
useMouseEvent(elementHost, "wheel", (_event: TuiMouseWheelEvent) => "consume");
const drag = useMouseDrag(elementHost, (_event: TuiMouseDragEvent) => {});
drag.isDragging.value;
const clipboard = useClipboard();
clipboard.availability.value.status;
clipboard.writeText("exact");
const selection = useTextSelection(elementHost, { isActive: active, pointer: () => true });
selection.move("forward", { extend: true });
selection.copy();

useStdin().stdin;
// @ts-expect-error Raw-mode control is internal to semantic input routes.
useStdin().setRawMode(false);
// @ts-expect-error Raw-mode availability is not part of the public stdin escape hatch.
useStdin().isRawModeSupported;
// @ts-expect-error The removed mount option must not survive in packaged declarations.
const removedRawMode: MountOptions = { rawMode: "auto" };
// @ts-expect-error Ctrl+C policy is expressed by an input result, not a mount option.
const removedExitOnCtrlC: MountOptions = { exitOnCtrlC: false };
// @ts-expect-error Runtime privately negotiates the keyboard protocol.
const removedKittyKeyboard: MountOptions = { kittyKeyboard: { mode: "enabled" } };
const customClipboardMount: MountOptions = {
  clipboard: { kind: "custom", writeText: () => ({ status: "copied" }) },
};
const osc52ClipboardMount: MountOptions = { clipboard: { kind: "osc52" } };
// @ts-expect-error A custom clipboard transport requires writeText.
const invalidClipboardMount: MountOptions = { clipboard: { kind: "custom" } };
const packedColor: Color = "gray";
const packedRgbColor: Color = "#12abEF";
// @ts-expect-error Runtime has one canonical gray spelling.
const removedGreyColor: Color = "grey";
useInput((_event) => {});
useInput((_event) => ({ preventDefault: true }));
// @ts-expect-error Handler refs are unnecessary; close over reactive state instead.
useInput(shallowRef(handler));
// @ts-expect-error Activation must resolve to a boolean.
useInput(handler, { isActive: "yes" });
// @ts-expect-error Input decisions are synchronous.
useInput(async (_event) => undefined);
// @ts-expect-error "continue" was removed; ordinary handlers return undefined.
useInput((_event) => "continue");
// @ts-expect-error "consume" bundled unrelated routing policy and was removed.
useInput((_event) => "consume");
// @ts-expect-error Runtime does not publish higher-level routing decisions.
useInput((_event) => ({ action: "none", routing: "continue", defaultAction: "allow" }));
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
// @ts-expect-error Key modifiers live directly on the finite key event.
type _RemovedTuiInputModifiers = import("@vue-tui/runtime").TuiInputModifiers;
// @ts-expect-error Availability is established by activating a subscription.
type _RemovedUseInputAvailability = typeof import("@vue-tui/runtime").useInputAvailability;
// @ts-expect-error Availability supporting types were removed with the hook.
type _RemovedInputAvailability = import("@vue-tui/runtime").InputAvailability;
// @ts-expect-error Focus policy is composed above Runtime.
type _RemovedUseFocus = typeof import("@vue-tui/runtime").useFocus;
// @ts-expect-error Scope policy is composed above Runtime.
type _RemovedUseFocusScope = typeof import("@vue-tui/runtime").useFocusScope;
// @ts-expect-error Focused routing is composed above one public subscription.
type _RemovedUseFocusedInput = typeof import("@vue-tui/runtime").useFocusedInput;
// @ts-expect-error Scope routing is composed above one public subscription.
type _RemovedUseFocusScopeInput = typeof import("@vue-tui/runtime").useFocusScopeInput;
// @ts-expect-error Runtime does not publish a global focus manager.
type _RemovedUseFocusManager = typeof import("@vue-tui/runtime").useFocusManager;
// @ts-expect-error Normalized external forwarding was not lossless transport.
type _RemovedUseExternalInput = typeof import("@vue-tui/runtime").useExternalInput;
// @ts-expect-error Focus supporting types were removed with the policy API.
type _RemovedUseFocusReturn = import("@vue-tui/runtime").UseFocusReturn;
// @ts-expect-error Focus scope supporting types were removed with the policy API.
type _RemovedUseFocusScopeReturn = import("@vue-tui/runtime").UseFocusScopeReturn;
// @ts-expect-error External forwarding supporting types were removed.
type _RemovedExternalInputSource = import("@vue-tui/runtime").ExternalInputSource;
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
// @ts-expect-error Paste is a TuiInputEvent member, not a separate composable.
type _RemovedUsePaste = typeof import("@vue-tui/runtime").usePaste;
// @ts-expect-error The separate paste options were removed with usePaste().
type _RemovedUsePasteOptions = import("@vue-tui/runtime").UsePasteOptions;
// @ts-expect-error The combined layout hook was replaced by separate width and height primitives.
type _RemovedUseLayoutSize = typeof import("@vue-tui/runtime").useLayoutSize;
// @ts-expect-error The old combined layout wrapper was removed with its hook.
type _RemovedUseLayoutSizeReturn = import("@vue-tui/runtime").UseLayoutSizeReturn;
// @ts-expect-error The broad render-session hook is private Runtime machinery.
type _RemovedUseRenderSession = typeof import("@vue-tui/runtime").useRenderSession;
// @ts-expect-error The broad render-session graph is private Runtime machinery.
type _RemovedRenderSession = import("@vue-tui/runtime").RenderSession;
// @ts-expect-error Requested/effective mode resolution is private Runtime machinery.
type _RemovedRenderModeResolution = import("@vue-tui/runtime").RenderModeResolution;
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
// @ts-expect-error Removed Box props are absent rather than never tombstones.
type _RemovedBoxMarginLeft = BoxProps["marginLeft"];
// @ts-expect-error Removed spacing shorthands are absent rather than never tombstones.
type _RemovedBoxPaddingX = BoxProps["paddingX"];
// @ts-expect-error Removed Text decoration is not a public prop.
type _RemovedTextUnderline = TextProps["underline"];
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
// @ts-expect-error Parent-only scalar metrics were replaced by semantic geometry.
type _RemovedUseBoxMetrics = typeof import("@vue-tui/runtime").useBoxMetrics;
// @ts-expect-error Imperative Yoga reads were removed.
type _RemovedMeasureElement = typeof import("@vue-tui/runtime").measureElement;
// @ts-expect-error The old scalar snapshot type was removed.
type _RemovedBoxMetrics = import("@vue-tui/runtime").BoxMetrics;
// @ts-expect-error The old composable return type was removed.
type _RemovedUseBoxMetricsReturn = import("@vue-tui/runtime").UseBoxMetricsReturn;
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
// @ts-expect-error Fullscreen mouse values are available only from the subpath.
type _RootUseMouseEvent = typeof import("@vue-tui/runtime").useMouseEvent;
// @ts-expect-error Fullscreen mouse values are available only from the subpath.
type _RootUseMouseDrag = typeof import("@vue-tui/runtime").useMouseDrag;
// @ts-expect-error Fullscreen selection is available only from the subpath.
type _RootUseTextSelection = typeof import("@vue-tui/runtime").useTextSelection;
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
// @ts-expect-error Common clipboard transport is not duplicated on the Fullscreen subpath.
type _FullscreenUseClipboard = typeof import("@vue-tui/runtime/fullscreen").useClipboard;
// @ts-expect-error MouseButton moved to the Fullscreen subpath.
type _RemovedRootMouseButton = import("@vue-tui/runtime").MouseButton;
// @ts-expect-error The terminal-wide v1 mouse event was removed.
type _RemovedMouseInputEvent = import("@vue-tui/runtime").MouseInputEvent;
// @ts-expect-error The mutable v1 mouse target was removed.
type _RemovedMouseTarget = import("@vue-tui/runtime").MouseTarget;
// @ts-expect-error The mutable v1 event was removed.
type _RemovedTuiMouseEvent = import("@vue-tui/runtime").TuiMouseEvent;
void removedRawMode;
void removedExitOnCtrlC;
void removedKittyKeyboard;
void customClipboardMount;
void osc52ClipboardMount;
void invalidClipboardMount;
void packedColor;
void packedRgbColor;
void removedGreyColor;
`,
  );
  writeFileSync(
    join(consumerDirectory, "consumer.tsx"),
    `import { ScrollBox, Spinner, type ScrollBoxExpose } from "@vue-tui/components";
import { Box, Text, useBoxPresence, useBoxSize, useClipboard, useInput, useLayoutWidth, useViewportHeight } from "@vue-tui/runtime";
import { useTextSelection } from "@vue-tui/runtime/fullscreen";
import { Static } from "@vue-tui/runtime/inline";
import { defineComponent, shallowRef, type ComponentPublicInstance } from "vue";

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
// @ts-expect-error Horizontal margin is not in the minimum Box vocabulary.
const unsupportedBoxMarginLeft = <Box marginLeft={1}><Text>x</Text></Box>;
// @ts-expect-error Spacing shorthands are application composition.
const unsupportedBoxPaddingX = <Box paddingX={1}><Text>x</Text></Box>;
// @ts-expect-error Unevidenced text decoration is not a Runtime primitive.
const unsupportedTextUnderline = <Text underline>x</Text>;
void unsupportedStaticItems;
void unsupportedStaticStyle;
void unsupportedBoxMarginLeft;
void unsupportedBoxPaddingX;
void unsupportedTextUnderline;

export const InputProbe = defineComponent(() => {
  const host = shallowRef<InstanceType<typeof Box> | null>(null);
  const selectableText = shallowRef<ComponentPublicInstance | null>(null);
  const scrollBox = shallowRef<ScrollBoxExpose | null>(null);
  const size = useBoxSize(host);
  const presence = useBoxPresence(host);
  const layoutWidth = useLayoutWidth();
  const viewportHeight = useViewportHeight();
  const clipboard = useClipboard();
  const selection = useTextSelection(selectableText, { pointer: false });
  clipboard.availability.value.status;
  selection.move("document-start");
  useInput(
    (event) => {
      if (event.kind === "key" && event.name === "enter") {
        event.name.toUpperCase();
      }
      if (event.kind === "key" && event.character === "c" && event.ctrl) {
        return { preventDefault: true };
      }
    },
    { isActive: presence },
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
  return () => <Box ref={host} height={2}><ScrollBox ref={scrollBox}><Text ref={selectableText}>{size.value?.width ?? "pending"}:{layoutWidth.value}:{viewportHeight?.value ?? "unbounded"}:{String(presence.value)}</Text></ScrollBox></Box>;
});
`,
  );
  writeFileSync(
    join(consumerDirectory, "App.vue"),
    `<script setup lang="ts">
import { shallowRef, type ComponentPublicInstance } from "vue";
import { ScrollBox, type ScrollBoxExpose } from "@vue-tui/components";
import { Box, Text, useBoxPresence, useBoxSize, useClipboard, useInput, useLayoutWidth, useStdin, useViewportHeight } from "@vue-tui/runtime";
import { useTextSelection } from "@vue-tui/runtime/fullscreen";
import { Static } from "@vue-tui/runtime/inline";

const host = shallowRef<InstanceType<typeof Box> | null>(null);
const vShowVisible = shallowRef(true);
const screen = shallowRef<"editor" | "confirm">("editor");
const selectableText = shallowRef<ComponentPublicInstance | null>(null);
const scrollBox = shallowRef<ScrollBoxExpose | null>(null);
const size = useBoxSize(host);
const presence = useBoxPresence(host);
const layoutWidth = useLayoutWidth();
const viewportHeight = useViewportHeight();
const mountedStdin = useStdin();
const clipboard = useClipboard();
const selection = useTextSelection(selectableText, { pointer: false });
clipboard.availability.value.status;
selection.move("document-start");
useInput(
  (event) => {
    if ((event.kind === "text" || event.kind === "paste") && screen.value === "editor") {
      event.text.toUpperCase();
    } else if (event.kind === "key" && event.name === "enter") {
      screen.value = screen.value === "editor" ? "confirm" : "editor";
    }
  },
  { isActive: presence },
);
mountedStdin.stdin;
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
// @ts-expect-error Raw-mode control is not exposed by useStdin().
mountedStdin.setRawMode(false);
</script>

<template>
  <Box ref="host" :height="2">
    <Static v-for="(item, index) in [1, 2]" :key="item">
      <Text>{{ item.toFixed(0) }}:{{ index.toFixed(0) }}</Text>
    </Static>
    <Box v-show="vShowVisible">
      <ScrollBox ref="scrollBox"><Text ref="selectableText">{{ size?.width ?? "pending" }}:{{ layoutWidth }}:{{ viewportHeight ?? "unbounded" }}:{{ presence }}</Text></ScrollBox>
    </Box>
  </Box>
</template>
`,
  );
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
import { PassThrough } from "node:stream";
import * as runtime from "@vue-tui/runtime";
import * as fullscreen from "@vue-tui/runtime/fullscreen";
import * as inline from "@vue-tui/runtime/inline";
import { ScrollBox } from "@vue-tui/components";
import { render } from "@vue-tui/testing";
import { defineComponent, h, isReadonly, nextTick, onMounted, onUnmounted, ref, shallowRef, vShow, watch, withDirectives } from "vue";

const { Box, createApp, Text, useBoxPresence, useBoxSize, useClipboard, useInput, useLayoutWidth, useStdin, useViewportHeight } = runtime;
const { useMouseDrag, useMouseEvent, useTextSelection } = fullscreen;
assert.deepEqual(Object.keys(fullscreen).sort(), ["useMouseDrag", "useMouseEvent", "useTextSelection"]);
assert.deepEqual(Object.keys(inline).sort(), ["Static"]);
assert.equal("Static" in runtime, false);
assert.equal("usePaste" in runtime, false);
assert.equal("useCursor" in runtime, false);
assert.equal("useBoxMetrics" in runtime, false);
assert.equal("measureElement" in runtime, false);
assert.equal("useMouseInput" in runtime, false);
assert.equal("useDraggable" in runtime, false);
assert.equal("useMouseEvent" in runtime, false);
assert.equal("useMouseDrag" in runtime, false);
assert.equal("useTextSelection" in runtime, false);
assert.equal("useClipboard" in fullscreen, false);
assert.equal("Newline" in runtime, false);
assert.equal("Spacer" in runtime, false);
assert.equal("Transform" in runtime, false);
assert.equal("useAnimation" in runtime, false);
assert.equal("useLayoutSize" in runtime, false);
assert.equal("useRenderSession" in runtime, false);
assert.equal("useElementGeometry" in runtime, false);
assert.equal("useCaret" in runtime, false);
assert.equal("useInputAvailability" in runtime, false);
assert.equal("useExternalInput" in runtime, false);
assert.equal("useFocus" in runtime, false);
assert.equal("useFocusedInput" in runtime, false);
assert.equal("useFocusManager" in runtime, false);
assert.equal("useFocusScope" in runtime, false);
assert.equal("useFocusScopeInput" in runtime, false);
assert.equal("kittyFlags" in runtime, false);
assert.equal("kittyModifiers" in runtime, false);
assert.equal(typeof useLayoutWidth, "function");
assert.equal(typeof useViewportHeight, "function");
assert.equal(typeof useBoxSize, "function");
assert.equal(typeof useBoxPresence, "function");
assert.equal(typeof useInput, "function");
assert.equal(typeof useClipboard, "function");
assert.equal(typeof useTextSelection, "function");

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
          "<" + componentName + '> does not accept the removed mouse listener "' +
          listenerName +
          '". Use the mouse composables from "@vue-tui/runtime/fullscreen".',
      },
    );
  }
}

for (const [componentName, component, attribute] of [
  ["Box", Box, "paddingX"],
  ["Box", Box, "marginLeft"],
  ["Box", Box, "padddingLeft"],
  ["Box", Box, "class"],
  ["Text", Text, "underline"],
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
assert.equal(runtime.renderToString(PackedPublicProps, { columns: 65_535 }).includes("packed-colors"), true);
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
  () => runtime.renderToString(PackedPublicProps, { columns: 65_536 }),
  /option "columns" must be an integer between 1 and 65535/,
);
assert.throws(
  () => runtime.renderToString(PackedPublicProps, { debug: true }),
  /received an unknown option "debug"/,
);
const OversizedDocument = defineComponent(() => () =>
  h(Box, { width: 1_024, height: 1_025, flexShrink: 0 }, () => h(Text, null, () => "large")),
);
assert.throws(
  () => runtime.renderToString(OversizedDocument, { columns: 1_024 }),
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

for (const resetColor of ["revert", "initial"]) {
  const packedReset = await render(
    defineComponent(() => () => h(Text, null, () => [
      h(Text, { color: "red" }, () => [
        "AA",
        h(Text, { color: resetColor }, () => "BBB"),
        "CC",
      ]),
      h(Text, { color: "blue" }, () => "Z"),
    ])),
    { columns: 4 },
  );
  const frame = packedReset.lastFrame({ trimLines: true });
  assert.equal(frame.replace(/\\x1b\\[[0-9;]*m/g, ""), "AABB\\nBCCZ");
  assert.deepEqual(packedForegroundCharacters(frame), [
    ["A", "red"], ["A", "red"],
    ["B", "default"], ["B", "default"], ["B", "default"],
    ["C", "red"], ["C", "red"],
    ["Z", "blue"],
  ]);
  packedReset.dispose();
}

const packedPrivateUse = "\\uE000\\uE001";
const packedNestedReset = await render(
  defineComponent(() => () => h(Text, { color: "red" }, () => [
    "A" + packedPrivateUse,
    h(Text, { color: "revert" }, () => [
      "B",
      h(Text, { color: "green" }, () => "C"),
      h(Text, { color: "initial" }, () => "D"),
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

const stdin = new PassThrough();
const stdout = new PassThrough();
let observedStdin;
const Probe = defineComponent(() => {
  observedStdin = useStdin();
  return () => h(Text, null, () => "probe");
});
const live = createApp(Probe);
live.mount({ stdin, stdout, liveUpdates: false, patchConsole: false });
assert.equal(observedStdin.stdin, stdin);
assert.deepEqual(Reflect.ownKeys(observedStdin), ["stdin"]);
assert.equal("setRawMode" in observedStdin, false);
assert.equal("isRawModeSupported" in observedStdin, false);
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
assertRemovedMountOption(
  "kittyKeyboard",
  { mode: "enabled" },
  /Mount option "kittyKeyboard" was removed/,
);

const NoInput = defineComponent(() => () => h(Text, null, () => "idle"));
const idle = await render(NoInput);
assert.equal(idle.terminal.rawMode.current, false);
assert.deepEqual(idle.terminal.rawMode.history, []);
idle.dispose();

let layoutWidthProjection;
let viewportHeightProjection;
let boxSizeProjection;
let boxPresenceProjection;
let scrollBoxHandle;
const LayoutProbe = defineComponent(() => {
  const host = shallowRef(null);
  scrollBoxHandle = shallowRef(null);
  layoutWidthProjection = useLayoutWidth();
  viewportHeightProjection = useViewportHeight();
  boxSizeProjection = useBoxSize(host);
  boxPresenceProjection = useBoxPresence(host);
  return () => h(Box, { ref: host, width: 8, height: 3 }, () =>
    h(ScrollBox, { ref: scrollBoxHandle }, { default: () => h(Text, null, () => "packed size") }),
  );
});
const layoutApp = await render(LayoutProbe, { columns: 20, rows: 5 });
assert.equal(layoutWidthProjection.value, 20);
assert.equal(viewportHeightProjection.value, 5);
assert.deepEqual(boxSizeProjection.value, { width: 8, height: 3 });
assert.equal(boxPresenceProjection.value, true);
assert.deepEqual(Reflect.ownKeys(boxSizeProjection.value), ["width", "height"]);
assert.equal(isReadonly(layoutWidthProjection), true);
assert.equal(isReadonly(viewportHeightProjection), true);
assert.equal(isReadonly(boxSizeProjection), true);
assert.equal(Object.isFrozen(boxSizeProjection.value), true);
assert.equal(typeof scrollBoxHandle.value.scrollByLines, "function");
assert.equal(typeof scrollBoxHandle.value.scrollToLine, "function");
assert.equal(typeof scrollBoxHandle.value.scrollToTop, "function");
assert.equal(typeof scrollBoxHandle.value.scrollToBottom, "function");
assert.equal(layoutApp.lastFrame().includes("packed"), true);
assert.equal(layoutApp.lastFrame().includes("size"), true);
assert.equal("session" in layoutApp, false);
const acceptedBoxSize = boxSizeProjection.value;
await layoutApp.terminal.resize(24, 6);
assert.equal(layoutWidthProjection.value, 24);
assert.equal(viewportHeightProjection.value, 6);
assert.equal(boxSizeProjection.value, acceptedBoxSize);
layoutApp.dispose();
assert.equal(layoutWidthProjection.value, 24);
assert.equal(viewportHeightProjection.value, 6);
assert.equal(boxSizeProjection.value, null);

let streamLayoutWidth;
let streamViewportHeight;
const UnboundedLayoutProbe = defineComponent(() => {
  streamLayoutWidth = useLayoutWidth();
  streamViewportHeight = useViewportHeight();
  return () => h(Text, null, () =>
    String(streamLayoutWidth.value) + "x" + (streamViewportHeight?.value ?? "unbounded"),
  );
});
const unboundedLayoutApp = await render(UnboundedLayoutProbe, {
  columns: 30,
  rows: 8,
  host: { stdout: "stream" },
});
assert.equal(streamLayoutWidth.value, 30);
assert.equal(streamViewportHeight, null);
assert.equal(unboundedLayoutApp.lastFrame(), "30xunbounded");
assert.equal("session" in unboundedLayoutApp, false);
unboundedLayoutApp.dispose();

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

const clickEvents = [];
const wheelEvents = [];
const dragEvents = [];
let mouseDrag;
const MouseProbe = defineComponent(() => {
  const host = shallowRef(null);
  useMouseEvent(host, "click", (event) => {
    clickEvents.push(event);
    return "consume";
  });
  useMouseEvent(host, "wheel", (event) => {
    wheelEvents.push(event);
    return "consume";
  });
  mouseDrag = useMouseDrag(host, (event) => dragEvents.push(event));
  return () => h(Box, { ref: host, width: 8, height: 2, flexShrink: 0 }, () =>
    h(Text, null, () => "mouse target"),
  );
});
const mouseApp = await render(MouseProbe, {
  columns: 20,
  rows: 6,
  host: { mode: "fullscreen" },
});
assert.equal(mouseApp.mouse.reporting.current, "button-motion");
assert.deepEqual([...mouseApp.mouse.reporting.history], ["button-motion"]);
await mouseApp.mouse.down({ x: 1, y: 0 }, { button: "right", alt: true });
await mouseApp.mouse.up({ x: 1, y: 0 }, { button: "right", alt: true });
assert.equal(clickEvents.length, 1);
assert.deepEqual(clickEvents[0], {
  type: "click",
  delivery: "target",
  surface: { x: 1, y: 0 },
  local: { x: 1, y: 0 },
  modifiers: { shift: false, alt: true, ctrl: false },
  button: "right",
});
await mouseApp.mouse.wheel({ x: 1, y: 0 }, "left", { ctrl: true });
assert.equal(wheelEvents.length, 1);
assert.deepEqual(wheelEvents[0], {
  type: "wheel",
  delivery: "target",
  surface: { x: 1, y: 0 },
  local: { x: 1, y: 0 },
  modifiers: { shift: false, alt: false, ctrl: true },
  delta: { x: -1, y: 0 },
});
await mouseApp.mouse.down({ x: 1, y: 0 });
assert.equal(mouseDrag.isDragging.value, false);
await mouseApp.mouse.move({ x: 3, y: 1 }, { shift: true });
assert.equal(mouseDrag.isDragging.value, true);
await mouseApp.mouse.up({ x: 3, y: 1 });
assert.equal(mouseDrag.isDragging.value, false);
assert.deepEqual(dragEvents.map((event) => event.phase), ["start", "end"]);
mouseApp.dispose();
assert.equal(mouseApp.mouse.reporting.current, "none");
assert.deepEqual([...mouseApp.mouse.reporting.history], ["button-motion", "none"]);

let packedSelection;
let packedClipboard;
const SelectionProbe = defineComponent(() => {
  const target = shallowRef(null);
  packedSelection = useTextSelection(target, { pointer: false });
  packedClipboard = useClipboard();
  return () => h(Text, { ref: target }, () => "packed\\n你🙂 selection");
});
const selectionApp = await render(SelectionProbe, {
  columns: 12,
  rows: 4,
  host: { mode: "fullscreen", clipboard: "copied" },
});
assert.deepEqual(packedClipboard.availability.value, {
  status: "available",
  transport: "custom",
});
assert.equal(packedSelection.selectAll(), true);
await selectionApp.waitUntilRenderFlush();
assert.equal(packedSelection.state.value.selectedText, "packed\\n你🙂 selection");
assert.deepEqual(await packedSelection.copy(), {
  status: "copied",
  text: "packed\\n你🙂 selection",
});
assert.deepEqual([...selectionApp.clipboard.requests], ["packed\\n你🙂 selection"]);
assert.equal(selectionApp.lastFrame({ raw: true }).includes("\\u001b[7m"), true);
selectionApp.dispose();
assert.deepEqual(packedClipboard.availability.value, {
  status: "unavailable",
  reason: "disposed",
});

const events = [];
const inputScreen = shallowRef("editor");
let inputPresence;
const WithInput = defineComponent(() => {
  const host = shallowRef(null);
  inputPresence = useBoxPresence(host);
  useInput(
    (event) => {
      events.push(event);
      if (inputScreen.value === "editor" && event.kind === "text") {
        inputScreen.value = "confirm";
      } else if (inputScreen.value === "confirm" && event.kind === "key" && event.name === "enter") {
        inputScreen.value = "editor";
      }
      if (event.kind === "key" && event.character === "c" && event.ctrl) {
        return { preventDefault: true };
      }
    },
    { isActive: inputPresence },
  );
  return () => h(Box, { ref: host }, () => h(Text, null, () => "active"));
});
const active = await render(WithInput);
assert.equal(inputPresence.value, true);
assert.equal(active.terminal.rawMode.current, true);
await active.stdin.write("a");
await active.stdin.write("\\r");
await active.stdin.write("\\x03");
assert.equal(events.length, 3);
assert.deepEqual(events[0], {
  kind: "text",
  text: "a",
});
assert.deepEqual(events[1], {
  kind: "key",
  name: "enter",
  shift: false,
  alt: false,
  ctrl: false,
});
assert.deepEqual(events[2], {
  kind: "key",
  character: "c",
  shift: false,
  alt: false,
  ctrl: true,
});
assert.equal(events.every(Object.isFrozen), true);
assert.equal(inputScreen.value, "editor");
active.dispose();
assert.equal(active.terminal.rawMode.current, false);

const InvalidResult = defineComponent(() => {
  useInput(() => "consume");
  return () => h(Text, null, () => "invalid");
});
const invalidResult = await render(InvalidResult);
await assert.rejects(
  invalidResult.stdin.write("x"),
  /handlers must synchronously return undefined or the exact object { preventDefault: true }/,
);
invalidResult.dispose();
`,
  );

  run("npm", ["install", "--no-audit", "--no-fund", "--package-lock=false"], consumerDirectory);
  run("npx", ["tsc", "-p", "tsconfig.json"], consumerDirectory);
  run("npx", ["vue-tsc", "-p", "tsconfig.sfc.json"], consumerDirectory);
  run(process.execPath, ["runtime.mjs"], consumerDirectory, { FORCE_COLOR: "3" });

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
