// Type-level guarantees for the public *named* type surface.
//
// Component props and framework-neutral cursor data retain the stable names that
// vue-tui shares with Ink. The render-session types below are vue-tui's own truthful
// host/surface contract. This test guards both groups without treating the session
// design as Ink parity.
//
// These assertions are erased at runtime; the real gate is `tsc --noEmit` (the package's
// `check:type` script). This file is named `*.test-d.ts` on purpose so vitest does NOT
// pick it up as a runtime test (its include is `*.test.ts`), while tsc still checks it.
import { expectTypeOf } from "vite-plus/test";
import {
  shallowRef,
  type ComponentPublicInstance,
  type MaybeRef,
  type MaybeRefOrGetter,
  type Ref,
  type ShallowRef,
} from "vue";
import {
  Box,
  useApp,
  useDraggable,
  useExternalInput,
  useFocus,
  useFocusedInput,
  useFocusManager,
  useFocusScope,
  useFocusScopeInput,
  useInput,
  useInputAvailability,
  useLayoutSize,
  useMouseInput,
  useRenderSession,
  useStdin,
  useStdout,
  useStderr,
} from "@vue-tui/runtime";
import type {
  BoxProps,
  BoxLayoutStyle,
  ExternalInputHandler,
  ExternalInputSource,
  InputAvailability,
  InputHandler,
  InputHandlerResult,
  InputRouteDecision,
  TextProps,
  StaticChildren,
  StaticProps,
  StaticSlot,
  StaticSlotProps,
  StaticStyle,
  TransformProps,
  NewlineProps,
  SpacerProps,
  MouseButton,
  MouseHandlerProps,
  MouseInputEvent,
  MouseTarget,
  MouseTargetRect,
  MountOptions,
  TuiInputEvent,
  TuiInputModifiers,
  TuiInputPhase,
  TuiInputSource,
  TuiMouseEvent,
  TuiMouseEventType,
  TuiWheelEvent,
  UseDraggableAxis,
  UseDraggableOptions,
  UseDraggablePosition,
  UseDraggableReturn,
  UseDraggableTarget,
  UseFocusManagerReturn,
  UseFocusOptions,
  UseFocusReturn,
  UseFocusScopeOptions,
  UseFocusScopeReturn,
  RenderLayoutSize,
  RenderMode,
  RenderModeResolution,
  RenderOutput,
  RenderSession,
  RenderSize,
  UseLayoutSizeReturn,
  UseInputAvailabilityReturn,
  UseInputOptions,
  CursorPosition,
  UseAppReturn,
  UseStdinReturn,
  UseStdoutReturn,
  UseStderrReturn,
} from "@vue-tui/runtime";

const defaultMountOptions: MountOptions = {};
const inlineMountOptions: MountOptions = { mode: "inline", liveUpdates: false };
const fullscreenMountOptions: MountOptions = { mode: "fullscreen", liveUpdates: true };
expectTypeOf(defaultMountOptions).toMatchTypeOf<MountOptions>();
expectTypeOf(inlineMountOptions).toMatchTypeOf<MountOptions>();
expectTypeOf(fullscreenMountOptions).toMatchTypeOf<MountOptions>();

// @ts-expect-error Removed clean-slate option; use mode: "fullscreen".
const removedFullscreenOption: MountOptions = { fullscreen: true };
// @ts-expect-error Removed clean-slate option; use mode: "fullscreen".
const removedAlternateScreenOption: MountOptions = { alternateScreen: true };
// @ts-expect-error Output policy is named liveUpdates, not broad interactivity.
const removedInteractiveOption: MountOptions = { interactive: true };
// @ts-expect-error Deterministic observation belongs to @vue-tui/testing, not live mounts.
const removedDebugOption: MountOptions = { debug: true };
// @ts-expect-error Semantic input routes own raw mode; there is no mount policy.
const removedRawModeOption: MountOptions = { rawMode: "auto" };
// @ts-expect-error Ctrl+C is an input default that handlers prevent per event, not a mount policy.
const removedExitOnCtrlCOption: MountOptions = { exitOnCtrlC: false };
// @ts-expect-error Only the two finite render-mode values are accepted.
const invalidModeOption: MountOptions = { mode: "full-screen" };
// @ts-expect-error liveUpdates is a boolean override.
const invalidLiveUpdatesOption: MountOptions = { liveUpdates: "yes" };
void removedFullscreenOption;
void removedAlternateScreenOption;
void removedInteractiveOption;
void removedDebugOption;
void removedRawModeOption;
void removedExitOnCtrlCOption;
void invalidModeOption;
void invalidLiveUpdatesOption;

// Prop types carry their component's real, declared props.
expectTypeOf<BoxProps["flexDirection"]>().toEqualTypeOf<
  "row" | "row-reverse" | "column" | "column-reverse" | undefined
>();
expectTypeOf<BoxProps["gap"]>().toEqualTypeOf<number | undefined>();
expectTypeOf<TextProps["bold"]>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<TextProps["color"]>().toEqualTypeOf<string | undefined>();
expectTypeOf<TextProps["backgroundColor"]>().toEqualTypeOf<string | undefined>();
expectTypeOf<BoxProps["backgroundColor"]>().toEqualTypeOf<string | undefined>();
expectTypeOf<BoxProps["borderColor"]>().toEqualTypeOf<string | undefined>();
expectTypeOf<BoxProps["borderBackgroundColor"]>().toEqualTypeOf<string | undefined>();
expectTypeOf<BoxProps["onMousedown"]>().toEqualTypeOf<MouseHandlerProps["onMousedown"]>();
expectTypeOf<BoxProps["onMouseup"]>().toEqualTypeOf<MouseHandlerProps["onMouseup"]>();
expectTypeOf<BoxProps["onClick"]>().toEqualTypeOf<MouseHandlerProps["onClick"]>();
expectTypeOf<BoxProps["onWheel"]>().toEqualTypeOf<MouseHandlerProps["onWheel"]>();
expectTypeOf<TextProps["onClick"]>().toEqualTypeOf<MouseHandlerProps["onClick"]>();
expectTypeOf<TextProps["onWheel"]>().toEqualTypeOf<MouseHandlerProps["onWheel"]>();
expectTypeOf<StaticProps["items"]>().toEqualTypeOf<unknown[]>();
expectTypeOf<StaticProps<string>["items"]>().toEqualTypeOf<string[]>();
expectTypeOf<StaticProps["style"]>().toEqualTypeOf<StaticStyle | undefined>();
expectTypeOf<StaticStyle>().toEqualTypeOf<BoxLayoutStyle>();
expectTypeOf<StaticStyle["flexDirection"]>().toEqualTypeOf<BoxProps["flexDirection"]>();
expectTypeOf<StaticSlotProps<string>>().toEqualTypeOf<{ item: string; index: number }>();
expectTypeOf<StaticSlot<string>>().toEqualTypeOf<
  (props: StaticSlotProps<string>) => import("vue").VNodeChild
>();
expectTypeOf<StaticChildren<string>>().toEqualTypeOf<
  | StaticSlot<string>
  | {
      default: StaticSlot<string>;
    }
>();
expectTypeOf<TransformProps["transform"]>().toEqualTypeOf<
  (line: string, lineIndex: number) => string
>();
expectTypeOf<NewlineProps["count"]>().toEqualTypeOf<number | undefined>();
expectTypeOf<keyof SpacerProps>().toEqualTypeOf<never>();

// Public render-session facts and projections.
expectTypeOf<RenderMode>().toEqualTypeOf<"inline" | "fullscreen">();
expectTypeOf<RenderSize>().toEqualTypeOf<{
  readonly columns: number;
  readonly rows: number;
}>();
expectTypeOf<RenderLayoutSize>().toEqualTypeOf<{
  readonly columns: number;
  readonly rows: number | null;
}>();
expectTypeOf<RenderModeResolution>().toEqualTypeOf<
  | { readonly requested: "inline"; readonly effective: "inline"; readonly fallback: null }
  | { readonly requested: "fullscreen"; readonly effective: "fullscreen"; readonly fallback: null }
  | {
      readonly requested: "fullscreen";
      readonly effective: "inline";
      readonly fallback: "screen-reader-transcript";
    }
  | {
      readonly requested: RenderMode;
      readonly effective: null;
      readonly fallback: "live-updates-disabled" | "stdout-not-tty" | "terminal-size-unavailable";
    }
>();
expectTypeOf<RenderOutput>().toEqualTypeOf<
  | {
      readonly destination: "terminal";
      readonly dynamicUpdates: "live";
      readonly presentation: "visual" | "screen-reader";
    }
  | {
      readonly destination: "stream";
      readonly dynamicUpdates: "live" | "at-teardown";
      readonly presentation: "visual" | "screen-reader";
    }
  | {
      readonly destination: "document";
      readonly dynamicUpdates: "none";
      readonly presentation: "visual" | "screen-reader";
    }
>();
expectTypeOf<ReturnType<typeof useRenderSession>>().toEqualTypeOf<RenderSession>();
expectTypeOf<UseLayoutSizeReturn>().toEqualTypeOf<{
  readonly columns: Readonly<Ref<number>>;
  readonly rows: Readonly<Ref<number | null>>;
}>();
expectTypeOf<ReturnType<typeof useLayoutSize>>().toEqualTypeOf<UseLayoutSizeReturn>();

declare const session: RenderSession;
if (session.host === "string") {
  expectTypeOf(session.mode).toEqualTypeOf<null>();
  expectTypeOf(session.output.destination).toEqualTypeOf<"document">();
  expectTypeOf(session.output.dynamicUpdates).toEqualTypeOf<"none">();
  expectTypeOf(session.dimensions.terminal).toEqualTypeOf<null>();
  expectTypeOf(session.dimensions.layout.rows).toEqualTypeOf<null>();
  expectTypeOf(session.capabilities.stableOrigin).toEqualTypeOf<false>();
} else {
  expectTypeOf(session.mode).toEqualTypeOf<RenderModeResolution>();
  expectTypeOf(session.output.destination).toEqualTypeOf<"terminal" | "stream">();
  expectTypeOf(session.dimensions.terminal).toEqualTypeOf<RenderSize | null>();
  expectTypeOf(session.dimensions.layout).toEqualTypeOf<RenderLayoutSize>();
}

declare const resolution: RenderModeResolution;
if (resolution.effective === "fullscreen") {
  expectTypeOf(resolution.requested).toEqualTypeOf<"fullscreen">();
  expectTypeOf(resolution.fallback).toEqualTypeOf<null>();
} else if (resolution.fallback === "screen-reader-transcript") {
  expectTypeOf(resolution.requested).toEqualTypeOf<"fullscreen">();
  expectTypeOf(resolution.effective).toEqualTypeOf<"inline">();
}

const impossibleInlineFallback: RenderModeResolution = {
  requested: "inline",
  effective: "inline",
  // @ts-expect-error Inline requests cannot carry a Fullscreen-only transcript fallback.
  fallback: "screen-reader-transcript",
};
const impossibleStreamMode: RenderModeResolution = {
  requested: "fullscreen",
  effective: "fullscreen",
  // @ts-expect-error A stream fallback cannot claim an effective terminal mode.
  fallback: "stdout-not-tty",
};
void impossibleInlineFallback;
void impossibleStreamMode;

declare const size: RenderSize;
declare const layoutSize: RenderLayoutSize;
declare const layoutProjection: UseLayoutSizeReturn;
// @ts-expect-error Render-session facts are readonly.
size.columns = 40;
// @ts-expect-error Render-session facts are readonly.
layoutSize.rows = 24;
// @ts-expect-error Session facts cannot be mutated through the public union.
session.dimensions.layout.columns = 40;
// @ts-expect-error The derived layout refs are readonly.
layoutProjection.rows.value = 24;

// @ts-expect-error useWindowSize and its numeric-row WindowSize type were removed.
export type _WindowSizeWasRemoved = import("@vue-tui/runtime").WindowSize;

// Framework-neutral cursor data shape, mirrored from Ink exactly.
expectTypeOf<CursorPosition>().toEqualTypeOf<{ x: number; y: number }>();

// Composable return types: named per VueUse's `UseXReturn` convention. useStdin() exposes
// only the actual mounted stream; framework semantic routes own every raw-mode and protocol
// operation through the private StdinContext.
expectTypeOf<UseStdinReturn>().toEqualTypeOf<{
  readonly stdin: NodeJS.ReadStream;
}>();
expectTypeOf<ReturnType<typeof useStdin>>().toEqualTypeOf<UseStdinReturn>();
expectTypeOf<keyof ReturnType<typeof useStdin>>().toEqualTypeOf<"stdin">();
declare const publicStdin: ReturnType<typeof useStdin>;
// @ts-expect-error Public raw-mode control was removed; semantic routes own acquisition.
publicStdin.setRawMode(false);
// @ts-expect-error Raw-input availability belongs to the eventual semantic input API.
void publicStdin.isRawModeSupported;

expectTypeOf<UseStdoutReturn>().toEqualTypeOf<{
  readonly stdout: NodeJS.WriteStream;
  readonly write: (data: string) => void;
}>();
expectTypeOf<ReturnType<typeof useStdout>>().toEqualTypeOf<UseStdoutReturn>();

expectTypeOf<UseStderrReturn>().toEqualTypeOf<{
  readonly stderr: NodeJS.WriteStream;
  readonly write: (data: string) => void;
}>();
expectTypeOf<ReturnType<typeof useStderr>>().toEqualTypeOf<UseStderrReturn>();

expectTypeOf<UseAppReturn>().toEqualTypeOf<{
  readonly exit: (errorOrResult?: unknown) => void;
  readonly waitUntilRenderFlush: () => Promise<void>;
}>();
expectTypeOf<ReturnType<typeof useApp>>().toEqualTypeOf<UseAppReturn>();

// Logical focus is ref-bound and opaque. Targets and scopes compose input
// without exposing renderer nodes, string IDs, or a second event model.
expectTypeOf<Parameters<typeof useFocus>[0]>().toEqualTypeOf<
  MaybeRefOrGetter<ComponentPublicInstance | null | undefined>
>();
expectTypeOf<ReturnType<typeof useFocus>>().toEqualTypeOf<UseFocusReturn>();
expectTypeOf<UseFocusReturn["isFocused"]>().toEqualTypeOf<Readonly<ShallowRef<boolean>>>();
expectTypeOf<UseFocusOptions["scope"]>().toEqualTypeOf<UseFocusScopeReturn | undefined>();
expectTypeOf<UseFocusOptions["disabled"]>().toEqualTypeOf<MaybeRefOrGetter<boolean> | undefined>();
expectTypeOf<UseFocusOptions["tabIndex"]>().toEqualTypeOf<MaybeRefOrGetter<0 | -1> | undefined>();
expectTypeOf<UseFocusOptions["autoFocus"]>().toEqualTypeOf<MaybeRefOrGetter<boolean> | undefined>();
expectTypeOf<ReturnType<typeof useFocusScope>>().toEqualTypeOf<UseFocusScopeReturn>();
expectTypeOf<UseFocusScopeReturn["containsFocus"]>().toEqualTypeOf<Readonly<ShallowRef<boolean>>>();
expectTypeOf<UseFocusScopeOptions>().toEqualTypeOf<{
  readonly isActive?: MaybeRefOrGetter<boolean>;
  readonly trapped?: MaybeRefOrGetter<boolean>;
}>();
expectTypeOf<ReturnType<typeof useFocusManager>>().toEqualTypeOf<UseFocusManagerReturn>();
expectTypeOf<UseFocusManagerReturn["focusedTarget"]>().toEqualTypeOf<
  Readonly<ShallowRef<UseFocusReturn | null>>
>();
expectTypeOf<Parameters<typeof useFocusedInput>>().toEqualTypeOf<
  [target: UseFocusReturn, handler: MaybeRef<InputHandler>]
>();
expectTypeOf<Parameters<typeof useFocusScopeInput>>().toEqualTypeOf<
  [scope: UseFocusScopeReturn, handler: MaybeRef<InputHandler>]
>();
expectTypeOf<ExternalInputSource>().toEqualTypeOf<{
  readonly event: TuiInputEvent;
  readonly sequence: string;
  readonly fidelity: "normalized-utf8-sequence";
}>();
expectTypeOf<ExternalInputHandler>().toEqualTypeOf<(source: ExternalInputSource) => void>();
expectTypeOf<Parameters<typeof useExternalInput>>().toEqualTypeOf<
  [target: UseFocusReturn, handler: MaybeRef<ExternalInputHandler>]
>();

const focusHost = shallowRef<ComponentPublicInstance | null>(null);
const focusScope = useFocusScope({ isActive: true, trapped: false });
const focusTarget = useFocus(focusHost, {
  scope: focusScope,
  disabled: shallowRef(false),
  tabIndex: () => 0,
  autoFocus: true,
});
const focusedInputHandler = shallowRef<InputHandler>(() => "continue");
const externalInputHandler = shallowRef<ExternalInputHandler>(() => {});
useFocusedInput(focusTarget, focusedInputHandler);
useFocusScopeInput(focusScope, focusedInputHandler);
useExternalInput(focusTarget, externalInputHandler);

// @ts-expect-error A rendered target ref is required; setup identity is not focus identity.
useFocus();
// @ts-expect-error String IDs were removed in favor of opaque target handles.
useFocus(focusHost, { id: "legacy" });
// @ts-expect-error Target activity is disabled; region activity belongs to useFocusScope().
useFocus(focusHost, { isActive: true });
// @ts-expect-error Only sequential and programmatic-only traversal values exist.
useFocus(focusHost, { tabIndex: 1 });
// @ts-expect-error Public focus refs are readonly.
focusTarget.isFocused.value = false;
declare const focusManager: UseFocusManagerReturn;
// @ts-expect-error String lookup was removed from the boundary-level manager.
focusManager.focus("legacy");
// @ts-expect-error The manager exposes the exact handle rather than a string ID.
void focusManager.activeId;

// Semantic input is one normalized, readonly event union. Public handlers must make an explicit
// synchronous routing decision; paste is a union member rather than a separate composable.
expectTypeOf<TuiInputPhase>().toEqualTypeOf<"press" | "repeat" | "release">();
expectTypeOf<TuiInputSource>().toEqualTypeOf<{
  readonly sequence: string;
  readonly fidelity: "normalized-utf8-sequence";
}>();
expectTypeOf<TuiInputModifiers>().toEqualTypeOf<{
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
  readonly super: boolean;
  readonly hyper: boolean;
  readonly meta: boolean;
  readonly capsLock: boolean;
  readonly numLock: boolean;
}>();
expectTypeOf<TuiInputEvent>().toEqualTypeOf<
  | (TuiInputSource & {
      readonly kind: "key";
      readonly key: {
        readonly protocol: "legacy" | "kitty";
        readonly name: string | null;
        readonly code: string | null;
        readonly primaryCodepoint: number | null;
        readonly shiftedCodepoint: number | null;
        readonly baseLayoutCodepoint: number | null;
        readonly functionalCode: number | null;
        readonly modifiers: TuiInputModifiers;
        readonly phase: TuiInputPhase | null;
        readonly printable: boolean;
        readonly reportedText: string | null;
      };
    })
  | (TuiInputSource & {
      readonly kind: "text";
      readonly text: string;
      readonly protocol: "plain" | "kitty";
      readonly phase: TuiInputPhase | null;
      readonly primaryCodepoint: number | null;
      readonly textOrigin: "reported" | null;
    })
  | (TuiInputSource & {
      readonly kind: "paste";
      readonly text: string;
    })
  | (TuiInputSource & {
      readonly kind: "uninterpreted";
    })
>();

expectTypeOf<InputRouteDecision>().toEqualTypeOf<{
  readonly action: "none" | "performed";
  readonly routing: "continue" | "stop";
  readonly defaultAction: "allow" | "prevent";
  readonly external: "allow" | "block";
}>();
expectTypeOf<InputHandlerResult>().toEqualTypeOf<"continue" | "consume" | InputRouteDecision>();
expectTypeOf<InputHandler>().toEqualTypeOf<(event: TuiInputEvent) => InputHandlerResult>();
expectTypeOf<Parameters<typeof useInput>[0]>().toEqualTypeOf<MaybeRef<InputHandler>>();
expectTypeOf<UseInputOptions>().toEqualTypeOf<{
  readonly isActive?: MaybeRefOrGetter<boolean>;
}>();

const inputHandler = shallowRef<InputHandler>((event) => {
  if (event.kind === "paste") return "consume";
  return "continue";
});
const inputActive = shallowRef(true);
useInput(inputHandler, { isActive: inputActive });
useInput(inputHandler, { isActive: () => inputActive.value });

declare const inputEvent: TuiInputEvent;
// @ts-expect-error Normalized input source facts are readonly.
inputEvent.sequence = "replacement";
if (inputEvent.kind === "key") {
  expectTypeOf(inputEvent.key.name).toEqualTypeOf<string | null>();
  expectTypeOf(inputEvent.key.reportedText).toEqualTypeOf<string | null>();
  if (inputEvent.key.name !== null) {
    expectTypeOf(inputEvent.key.name).toEqualTypeOf<string>();
  }
  // @ts-expect-error Nested normalized key facts are readonly.
  inputEvent.key.name = "replacement";
} else if (inputEvent.kind === "text") {
  expectTypeOf(inputEvent.textOrigin).toEqualTypeOf<"reported" | null>();
} else if (inputEvent.kind === "paste") {
  expectTypeOf(inputEvent.text).toEqualTypeOf<string>();
}

// Every handler must return a supported synchronous decision.
// @ts-expect-error A void handler leaves routing ambiguous.
useInput((_event) => {});
// @ts-expect-error Promise results are not part of synchronous input dispatch.
useInput(async (_event) => "continue");
// @ts-expect-error A structured routing decision must contain all four fields.
useInput((_event) => ({
  action: "performed",
  routing: "stop",
  defaultAction: "prevent",
}));
// @ts-expect-error Arbitrary result strings are not input decisions.
useInput((_event) => "handled");

expectTypeOf<InputAvailability>().toEqualTypeOf<
  | { readonly status: "available" }
  | {
      readonly status: "unavailable";
      readonly reason: "string-host" | "stdin-not-tty" | "stdin-not-controllable";
    }
>();
expectTypeOf<UseInputAvailabilityReturn>().toEqualTypeOf<{
  readonly availability: Readonly<Ref<InputAvailability>>;
}>();
expectTypeOf<ReturnType<typeof useInputAvailability>>().toEqualTypeOf<UseInputAvailabilityReturn>();

const inputAvailability = useInputAvailability();
declare const availability: InputAvailability;
if (availability.status === "available") {
  // @ts-expect-error Available input has no unavailability reason.
  void availability.reason;
} else {
  expectTypeOf(availability.reason).toEqualTypeOf<
    "string-host" | "stdin-not-tty" | "stdin-not-controllable"
  >();
}
// @ts-expect-error Input availability cannot be replaced through the readonly ref.
inputAvailability.availability.value = { status: "available" };

// @ts-expect-error Key was replaced by the normalized TuiInputEvent union.
export type _LegacyKeyWasRemoved = import("@vue-tui/runtime").Key;
// @ts-expect-error Paste is a TuiInputEvent member, so its separate options were removed.
export type _UsePasteOptionsWereRemoved = import("@vue-tui/runtime").UsePasteOptions;
// @ts-expect-error Paste is observed through useInput(), not a separate public composable.
export type _UsePasteWasRemoved = typeof import("@vue-tui/runtime").usePaste;

expectTypeOf<MouseInputEvent>().toEqualTypeOf<{
  readonly type: "wheel";
  readonly direction: "up" | "down";
  readonly x: number;
  readonly y: number;
  readonly shift: boolean;
  readonly meta: boolean;
  readonly ctrl: boolean;
}>();
const mouseHandler = shallowRef((_event: MouseInputEvent) => {});
expectTypeOf(mouseHandler).toMatchTypeOf<Parameters<typeof useMouseInput>[0]>();

expectTypeOf<string>().toMatchTypeOf<MouseButton>();
expectTypeOf<MouseButton>().toMatchTypeOf<string>();
expectTypeOf<"back" | "forward">().toMatchTypeOf<MouseButton>();
expectTypeOf<string>().toMatchTypeOf<TuiMouseEventType>();
expectTypeOf<TuiMouseEventType>().toMatchTypeOf<string>();
expectTypeOf<MouseTargetRect>().toEqualTypeOf<{
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}>();
expectTypeOf<MouseTarget["rect"]>().toEqualTypeOf<MouseTargetRect>();
expectTypeOf<TuiMouseEvent["type"]>().toEqualTypeOf<TuiMouseEventType>();
expectTypeOf<TuiMouseEvent["button"]>().toEqualTypeOf<MouseButton | null>();
expectTypeOf<TuiMouseEvent["buttons"]>().toEqualTypeOf<ReadonlySet<MouseButton>>();
expectTypeOf<TuiMouseEvent["target"]>().toEqualTypeOf<MouseTarget | null>();
expectTypeOf<TuiMouseEvent["currentTarget"]>().toEqualTypeOf<MouseTarget | null>();
expectTypeOf<TuiMouseEvent["movementX"]>().toEqualTypeOf<number>();
expectTypeOf<TuiMouseEvent["movementY"]>().toEqualTypeOf<number>();
expectTypeOf<TuiWheelEvent["type"]>().toEqualTypeOf<"wheel">();
expectTypeOf<TuiWheelEvent["button"]>().toEqualTypeOf<null>();
expectTypeOf<TuiWheelEvent["deltaX"]>().toEqualTypeOf<number>();
expectTypeOf<TuiWheelEvent["deltaY"]>().toEqualTypeOf<number>();

expectTypeOf<Parameters<typeof useMouseInput>[0]>().toEqualTypeOf<
  MaybeRef<(event: MouseInputEvent) => void>
>();

const dragTarget = shallowRef<InstanceType<typeof Box> | null>(null);
expectTypeOf(dragTarget).toMatchTypeOf<Parameters<typeof useDraggable>[0]>();
expectTypeOf<Parameters<typeof useDraggable>[0]>().toEqualTypeOf<UseDraggableTarget>();
expectTypeOf<UseDraggableTarget>().toEqualTypeOf<
  MaybeRefOrGetter<ComponentPublicInstance | null | undefined>
>();
expectTypeOf<ReturnType<typeof useDraggable>>().toEqualTypeOf<UseDraggableReturn>();
expectTypeOf<UseDraggableAxis>().toEqualTypeOf<"x" | "y" | "both">();
expectTypeOf<UseDraggableOptions["initialValue"]>().toEqualTypeOf<
  UseDraggablePosition | undefined
>();
expectTypeOf<UseDraggableOptions["axis"]>().toEqualTypeOf<UseDraggableAxis | undefined>();
expectTypeOf<UseDraggableOptions["onStart"]>().toEqualTypeOf<
  ((position: UseDraggablePosition, event: TuiMouseEvent) => void) | undefined
>();
expectTypeOf<UseDraggableReturn["x"]>().toEqualTypeOf<Ref<number>>();
expectTypeOf<UseDraggableReturn["y"]>().toEqualTypeOf<Ref<number>>();
expectTypeOf<UseDraggableReturn["position"]>().toMatchTypeOf<Readonly<Ref<UseDraggablePosition>>>();
