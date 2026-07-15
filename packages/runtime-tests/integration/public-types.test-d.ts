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
  useApp,
  useCaret,
  useClipboard,
  useElementGeometry,
  useExternalInput,
  useFocus,
  useFocusedInput,
  useFocusManager,
  useFocusScope,
  useFocusScopeInput,
  useInput,
  useInputAvailability,
  useLayoutSize,
  useRenderSession,
  useStdin,
  useStdout,
  useStderr,
} from "@vue-tui/runtime";
import type {
  BoxProps,
  BoxLayoutStyle,
  CaretState,
  CellPoint,
  CellRect,
  ClipboardAvailability,
  ClipboardTransport,
  ClipboardTransportResult,
  ClipboardUnavailableReason,
  ClipboardWriteResult,
  CoordinatedWriteResult,
  CustomClipboardTransport,
  ElementGeometry,
  ElementGeometryFragment,
  ElementTarget,
  ExternalInputHandler,
  ExternalInputSource,
  InputAvailability,
  InputHandler,
  InputHandlerResult,
  InputRouteDecision,
  TextProps,
  TransformProps,
  NewlineProps,
  Osc52ClipboardTransport,
  SpacerProps,
  MountOptions,
  TuiInputEvent,
  TuiInputModifiers,
  TuiInputPhase,
  TuiInputSource,
  UseCaretOptions,
  UseCaretReturn,
  UseClipboardReturn,
  UseElementGeometryReturn,
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
  UseAppReturn,
  UseStdinReturn,
  UseStdoutReturn,
  UseStderrReturn,
} from "@vue-tui/runtime";
import type {
  StaticChildren,
  StaticProps,
  StaticSlot,
  StaticSlotProps,
  StaticStyle,
} from "@vue-tui/runtime/inline";
import { useMouseDrag, useMouseEvent, useTextSelection } from "@vue-tui/runtime/fullscreen";
import type {
  CellDelta,
  MouseButton,
  MouseDragHandler,
  MouseEventHandler,
  MouseHandlerResult,
  MouseModifiers,
  TuiMouseClickEvent,
  TuiMouseDragEvent,
  TuiMouseEventMap,
  TuiMouseWheelEvent,
  TextSelectionCommands,
  TextSelectionCopyResult,
  TextSelectionMove,
  TextSelectionRange,
  TextSelectionState,
  TextSelectionUnavailableReason,
  UseMouseDragOptions,
  UseMouseDragReturn,
  UseMouseEventOptions,
  UseTextSelectionOptions,
} from "@vue-tui/runtime/fullscreen";

const defaultMountOptions: MountOptions = {};
const inlineMountOptions: MountOptions = { mode: "inline", liveUpdates: false };
const fullscreenMountOptions: MountOptions = { mode: "fullscreen", liveUpdates: true };
const customClipboard: CustomClipboardTransport = {
  kind: "custom",
  writeText: async () => ({ status: "copied" }),
};
const osc52Clipboard: Osc52ClipboardTransport = { kind: "osc52" };
const clipboardMountOptions: MountOptions = { clipboard: customClipboard };
const osc52MountOptions: MountOptions = { clipboard: osc52Clipboard };
expectTypeOf(defaultMountOptions).toMatchTypeOf<MountOptions>();
expectTypeOf(inlineMountOptions).toMatchTypeOf<MountOptions>();
expectTypeOf(fullscreenMountOptions).toMatchTypeOf<MountOptions>();
expectTypeOf(clipboardMountOptions).toMatchTypeOf<MountOptions>();
expectTypeOf(osc52MountOptions).toMatchTypeOf<MountOptions>();

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
// @ts-expect-error A custom transport must provide writeText.
const invalidCustomClipboardOption: MountOptions = { clipboard: { kind: "custom" } };
// @ts-expect-error Clipboard transport kinds are finite.
const invalidClipboardKindOption: MountOptions = { clipboard: { kind: "platform" } };
void removedFullscreenOption;
void removedAlternateScreenOption;
void removedInteractiveOption;
void removedDebugOption;
void removedRawModeOption;
void removedExitOnCtrlCOption;
void invalidModeOption;
void invalidLiveUpdatesOption;
void invalidCustomClipboardOption;
void invalidClipboardKindOption;

expectTypeOf<ClipboardTransport>().toEqualTypeOf<
  CustomClipboardTransport | Osc52ClipboardTransport
>();
expectTypeOf<ClipboardTransportResult>().toEqualTypeOf<
  | { readonly status: "copied" }
  | { readonly status: "requested" }
  | { readonly status: "unavailable"; readonly reason?: string }
  | { readonly status: "rejected"; readonly cause?: unknown }
>();
expectTypeOf<ClipboardUnavailableReason>().toEqualTypeOf<
  | "not-configured"
  | "output-not-terminal"
  | "screen-reader"
  | "suspended"
  | "disposed"
  | "string-host"
  | "transport-unavailable"
>();
expectTypeOf<ClipboardAvailability>().toEqualTypeOf<
  | { readonly status: "available"; readonly transport: "custom" | "osc52" }
  | { readonly status: "unavailable"; readonly reason: ClipboardUnavailableReason }
>();
expectTypeOf<ClipboardWriteResult>().toEqualTypeOf<
  | { readonly status: "copied"; readonly text: string }
  | { readonly status: "requested"; readonly text: string }
  | {
      readonly status: "unavailable";
      readonly text: string;
      readonly reason: ClipboardUnavailableReason;
      readonly detail?: string;
    }
  | { readonly status: "rejected"; readonly text: string; readonly cause: unknown }
>();
expectTypeOf<ReturnType<typeof useClipboard>>().toEqualTypeOf<UseClipboardReturn>();
expectTypeOf<UseClipboardReturn>().toEqualTypeOf<{
  readonly availability: Readonly<ShallowRef<ClipboardAvailability>>;
  readonly writeText: (text: string) => Promise<ClipboardWriteResult>;
}>();
declare const clipboardProjection: UseClipboardReturn;
// @ts-expect-error Clipboard availability is renderer-owned and readonly.
clipboardProjection.availability.value = { status: "unavailable", reason: "disposed" };
// @ts-expect-error Clipboard payloads are exact strings.
void clipboardProjection.writeText(new Uint8Array());

expectTypeOf<TextSelectionMove>().toEqualTypeOf<
  | "backward"
  | "forward"
  | "up"
  | "down"
  | "line-start"
  | "line-end"
  | "document-start"
  | "document-end"
>();
expectTypeOf<TextSelectionRange>().toEqualTypeOf<{
  readonly anchor: number;
  readonly extent: number;
  readonly direction: "forward" | "backward";
  readonly collapsed: boolean;
}>();
expectTypeOf<TextSelectionUnavailableReason>().toEqualTypeOf<
  "host-unavailable" | "screen-reader" | "string-host" | "mapping-unavailable"
>();
expectTypeOf<TextSelectionState>().toEqualTypeOf<
  | { readonly status: "inactive" | "pending"; readonly range: null; readonly selectedText: "" }
  | {
      readonly status: "unavailable";
      readonly reason: TextSelectionUnavailableReason;
      readonly range: null;
      readonly selectedText: "";
    }
  | {
      readonly status: "ready" | "suspended";
      readonly text: string;
      readonly range: TextSelectionRange | null;
      readonly selectedText: string;
    }
>();
expectTypeOf<TextSelectionCopyResult>().toEqualTypeOf<
  { readonly status: "empty" } | ClipboardWriteResult
>();
expectTypeOf<UseTextSelectionOptions>().toEqualTypeOf<{
  readonly isActive?: MaybeRefOrGetter<boolean>;
  readonly pointer?: MaybeRefOrGetter<boolean>;
}>();
expectTypeOf<Parameters<typeof useTextSelection>>().toEqualTypeOf<
  [target: ElementTarget, options?: UseTextSelectionOptions]
>();
expectTypeOf<ReturnType<typeof useTextSelection>>().toEqualTypeOf<TextSelectionCommands>();
expectTypeOf<TextSelectionCommands>().toEqualTypeOf<{
  readonly state: Readonly<ShallowRef<TextSelectionState>>;
  move(direction: TextSelectionMove, options?: { readonly extend?: boolean }): boolean;
  selectAll(): boolean;
  clear(): boolean;
  copy(): Promise<TextSelectionCopyResult>;
}>();
const selectionTarget = shallowRef<ComponentPublicInstance | null>(null);
const selectionProjection = useTextSelection(selectionTarget, {
  isActive: shallowRef(true),
  pointer: () => true,
});
selectionProjection.move("forward", { extend: true });
// @ts-expect-error Selection state is renderer-owned and readonly.
selectionProjection.state.value = { status: "inactive", range: null, selectedText: "" };
// @ts-expect-error Movement names are semantic and finite.
selectionProjection.move("left");
// @ts-expect-error Pointer activation is boolean.
useTextSelection(selectionTarget, { pointer: "yes" });
// @ts-expect-error Fullscreen text selection is not duplicated on the common root.
export type _UseTextSelectionIsFullscreenOnly = typeof import("@vue-tui/runtime").useTextSelection;
// @ts-expect-error Common clipboard transport is not duplicated on the Fullscreen subpath.
export type _UseClipboardIsCommonOnly = typeof import("@vue-tui/runtime/fullscreen").useClipboard;
// @ts-expect-error Static is exported only from the Inline history subpath.
export type _StaticIsInlineOnly = typeof import("@vue-tui/runtime").Static;
// @ts-expect-error StaticChildren is exported only from the Inline history subpath.
export type _StaticChildrenIsInlineOnly = import("@vue-tui/runtime").StaticChildren;
// @ts-expect-error StaticProps is exported only from the Inline history subpath.
export type _StaticPropsIsInlineOnly = import("@vue-tui/runtime").StaticProps;
// @ts-expect-error StaticSlot is exported only from the Inline history subpath.
export type _StaticSlotIsInlineOnly = import("@vue-tui/runtime").StaticSlot;
// @ts-expect-error StaticSlotProps is exported only from the Inline history subpath.
export type _StaticSlotPropsIsInlineOnly = import("@vue-tui/runtime").StaticSlotProps;
// @ts-expect-error StaticStyle is exported only from the Inline history subpath.
export type _StaticStyleIsInlineOnly = import("@vue-tui/runtime").StaticStyle;
// @ts-expect-error Common component types are not duplicated on the Inline subpath.
export type _BoxPropsIsCommonOnly = import("@vue-tui/runtime/inline").BoxProps;

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
expectTypeOf<BoxProps["onMousedown"]>().toEqualTypeOf<undefined>();
expectTypeOf<BoxProps["onMouseup"]>().toEqualTypeOf<undefined>();
expectTypeOf<BoxProps["onClick"]>().toEqualTypeOf<undefined>();
expectTypeOf<BoxProps["onWheel"]>().toEqualTypeOf<undefined>();
expectTypeOf<TextProps["onMousedown"]>().toEqualTypeOf<undefined>();
expectTypeOf<TextProps["onMouseup"]>().toEqualTypeOf<undefined>();
expectTypeOf<TextProps["onClick"]>().toEqualTypeOf<undefined>();
expectTypeOf<TextProps["onWheel"]>().toEqualTypeOf<undefined>();
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

// Semantic element geometry is one atomic, readonly paint generation. It uses
// ordinary Vue component refs and never exposes renderer or Yoga nodes.
expectTypeOf<ElementTarget>().toEqualTypeOf<
  MaybeRefOrGetter<ComponentPublicInstance | null | undefined>
>();
expectTypeOf<CellPoint>().toEqualTypeOf<{
  readonly x: number;
  readonly y: number;
}>();
expectTypeOf<CellRect>().toEqualTypeOf<{
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}>();
expectTypeOf<ElementGeometryFragment>().toEqualTypeOf<{
  readonly local: CellRect;
  readonly parent: CellRect;
  readonly surface: CellRect;
  readonly visibleSurface: CellRect | null;
}>();
expectTypeOf<ElementGeometry>().toEqualTypeOf<
  | { readonly status: "unavailable" }
  | { readonly status: "detached" }
  | { readonly status: "pending" }
  | { readonly status: "hidden" }
  | ({
      readonly parent: CellRect;
      readonly surface: CellRect;
      readonly fragments: readonly ElementGeometryFragment[];
    } & {
      readonly status: "zero-size" | "fully-clipped" | "visible";
    })
>();
expectTypeOf<Parameters<typeof useElementGeometry>>().toEqualTypeOf<[target: ElementTarget]>();
expectTypeOf<ReturnType<typeof useElementGeometry>>().toEqualTypeOf<UseElementGeometryReturn>();
expectTypeOf<UseElementGeometryReturn>().toEqualTypeOf<{
  readonly geometry: Readonly<ShallowRef<ElementGeometry>>;
}>();

const geometryHost = shallowRef<ComponentPublicInstance | null>(null);
const geometryProjection = useElementGeometry(geometryHost);
// @ts-expect-error The public geometry ref is readonly.
geometryProjection.geometry.value = { status: "detached" };
// @ts-expect-error Renderer-owned caret slots are not part of public geometry.
void geometryProjection.geometry.value.caretSlots;
// @ts-expect-error useBoxMetrics was replaced, not retained as an alias.
export type _UseBoxMetricsWasRemoved = typeof import("@vue-tui/runtime").useBoxMetrics;
// @ts-expect-error Its named return type was removed with the composable.
export type _UseBoxMetricsReturnWasRemoved = import("@vue-tui/runtime").UseBoxMetricsReturn;
// @ts-expect-error Its parent-relative scalar snapshot type was removed too.
export type _BoxMetricsWasRemoved = import("@vue-tui/runtime").BoxMetrics;
// @ts-expect-error Imperative Yoga measurement has no semantic geometry contract.
export type _MeasureElementWasRemoved = typeof import("@vue-tui/runtime").measureElement;

expectTypeOf<CaretState>().toEqualTypeOf<
  | { readonly status: "unavailable" }
  | { readonly status: "inactive" }
  | {
      readonly status: "hidden";
      readonly reason:
        | "unavailable"
        | "detached"
        | "pending"
        | "hidden"
        | "clipped"
        | "outside"
        | "invalid-position"
        | "unrelated";
    }
  | { readonly status: "visible"; readonly surface: CellPoint }
>();
expectTypeOf<UseCaretOptions>().toEqualTypeOf<{
  readonly focus: UseFocusReturn;
  readonly position: MaybeRefOrGetter<CellPoint | null | undefined>;
}>();
expectTypeOf<Parameters<typeof useCaret>>().toEqualTypeOf<
  [target: ElementTarget, options: UseCaretOptions]
>();
expectTypeOf<ReturnType<typeof useCaret>>().toEqualTypeOf<UseCaretReturn>();
expectTypeOf<UseCaretReturn>().toEqualTypeOf<{
  readonly state: Readonly<ShallowRef<CaretState>>;
}>();
// @ts-expect-error Targetless cursor ownership was removed rather than aliased.
export type _UseCursorWasRemoved = typeof import("@vue-tui/runtime").useCursor;
// @ts-expect-error Output-origin CursorPosition was removed with useCursor.
export type _CursorPositionWasRemoved = import("@vue-tui/runtime").CursorPosition;

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
  readonly write: (data: string) => CoordinatedWriteResult;
}>();
expectTypeOf<ReturnType<typeof useStdout>>().toEqualTypeOf<UseStdoutReturn>();

expectTypeOf<UseStderrReturn>().toEqualTypeOf<{
  readonly stderr: NodeJS.WriteStream;
  readonly write: (data: string) => CoordinatedWriteResult;
}>();
expectTypeOf<ReturnType<typeof useStderr>>().toEqualTypeOf<UseStderrReturn>();

expectTypeOf<CoordinatedWriteResult>().toEqualTypeOf<
  | { readonly status: "accepted"; readonly writable: true }
  | {
      readonly status: "accepted";
      readonly writable: false;
      readonly ready: Promise<void>;
    }
  | { readonly status: "blocked"; readonly ready: Promise<void> }
>();

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

// The old root mouse surface is removed directly; Fullscreen targeting is available only
// through @vue-tui/runtime/fullscreen.
// @ts-expect-error The terminal-wide v1 mouse hook was removed.
export type _UseMouseInputWasRemoved = typeof import("@vue-tui/runtime").useMouseInput;
// @ts-expect-error The v1 drag helper was removed.
export type _UseDraggableWasRemoved = typeof import("@vue-tui/runtime").useDraggable;
// @ts-expect-error Fullscreen mouse values are not duplicated at the root.
export type _UseMouseEventIsFullscreenOnly = typeof import("@vue-tui/runtime").useMouseEvent;
// @ts-expect-error Fullscreen mouse values are not duplicated at the root.
export type _UseMouseDragIsFullscreenOnly = typeof import("@vue-tui/runtime").useMouseDrag;
// @ts-expect-error MouseButton moved to the Fullscreen subpath.
export type _RootMouseButtonWasRemoved = import("@vue-tui/runtime").MouseButton;
// @ts-expect-error The terminal-wide v1 mouse event was removed.
export type _MouseInputEventWasRemoved = import("@vue-tui/runtime").MouseInputEvent;
// @ts-expect-error The terminal-wide v1 options were removed.
export type _UseMouseInputOptionsWereRemoved = import("@vue-tui/runtime").UseMouseInputOptions;
// @ts-expect-error Common mouse-listener handler props were removed.
export type _MouseHandlerPropsWereRemoved = import("@vue-tui/runtime").MouseHandlerProps;
// @ts-expect-error The mutable v1 target wrapper was removed.
export type _MouseTargetWasRemoved = import("@vue-tui/runtime").MouseTarget;
// @ts-expect-error The clipped v1 target rectangle was removed.
export type _MouseTargetRectWasRemoved = import("@vue-tui/runtime").MouseTargetRect;
// @ts-expect-error The mutable v1 event was removed.
export type _TuiMouseEventWasRemoved = import("@vue-tui/runtime").TuiMouseEvent;
// @ts-expect-error The open-ended v1 event-name type was removed.
export type _TuiMouseEventTypeWasRemoved = import("@vue-tui/runtime").TuiMouseEventType;
// @ts-expect-error The mutable v1 wheel event was removed.
export type _TuiWheelEventWasRemoved = import("@vue-tui/runtime").TuiWheelEvent;
// @ts-expect-error The v1 drag axis policy was removed.
export type _UseDraggableAxisWasRemoved = import("@vue-tui/runtime").UseDraggableAxis;
// @ts-expect-error The v1 drag options were removed.
export type _UseDraggableOptionsWereRemoved = import("@vue-tui/runtime").UseDraggableOptions;
// @ts-expect-error The v1 application-owned position type was removed.
export type _UseDraggablePositionWasRemoved = import("@vue-tui/runtime").UseDraggablePosition;
// @ts-expect-error The v1 drag return was removed.
export type _UseDraggableReturnWasRemoved = import("@vue-tui/runtime").UseDraggableReturn;
// @ts-expect-error The v1 duplicate target type was removed.
export type _UseDraggableTargetWasRemoved = import("@vue-tui/runtime").UseDraggableTarget;

// The Fullscreen subpath references common geometry types without re-exporting them.
// @ts-expect-error CellPoint remains a root type.
export type _CellPointIsNotDuplicated = import("@vue-tui/runtime/fullscreen").CellPoint;
// @ts-expect-error ElementTarget remains a root type.
export type _ElementTargetIsNotDuplicated = import("@vue-tui/runtime/fullscreen").ElementTarget;
// @ts-expect-error Root application values are not duplicated in the Fullscreen entry point.
export type _CreateAppIsNotDuplicated = typeof import("@vue-tui/runtime/fullscreen").createApp;

expectTypeOf<MouseButton>().toEqualTypeOf<"left" | "middle" | "right">();
expectTypeOf<MouseHandlerResult>().toEqualTypeOf<"continue" | "consume">();
expectTypeOf<CellDelta>().toEqualTypeOf<{
  readonly x: number;
  readonly y: number;
}>();
expectTypeOf<MouseModifiers>().toEqualTypeOf<{
  readonly shift: boolean;
  readonly alt: boolean;
  readonly ctrl: boolean;
}>();
expectTypeOf<TuiMouseClickEvent["type"]>().toEqualTypeOf<"click">();
expectTypeOf<TuiMouseClickEvent["delivery"]>().toEqualTypeOf<"target" | "bubble">();
expectTypeOf<TuiMouseClickEvent["surface"]>().toEqualTypeOf<CellPoint>();
expectTypeOf<TuiMouseClickEvent["local"]>().toEqualTypeOf<CellPoint>();
expectTypeOf<TuiMouseClickEvent["button"]>().toEqualTypeOf<MouseButton>();
expectTypeOf<TuiMouseWheelEvent["type"]>().toEqualTypeOf<"wheel">();
expectTypeOf<TuiMouseWheelEvent["delta"]>().toEqualTypeOf<CellDelta>();
expectTypeOf<TuiMouseEventMap>().toEqualTypeOf<{
  readonly click: TuiMouseClickEvent;
  readonly wheel: TuiMouseWheelEvent;
}>();
expectTypeOf<MouseEventHandler<"click">>().toEqualTypeOf<
  (event: TuiMouseClickEvent) => MouseHandlerResult
>();
expectTypeOf<MouseDragHandler>().toEqualTypeOf<(event: TuiMouseDragEvent) => void>();
expectTypeOf<
  Exclude<TuiMouseDragEvent, { phase: "cancel" }>["movement"]
>().toEqualTypeOf<CellDelta>();
expectTypeOf<Extract<TuiMouseDragEvent, { phase: "cancel" }>["reason"]>().toEqualTypeOf<
  "deactivated" | "target-lost" | "suspended"
>();
expectTypeOf<Extract<TuiMouseDragEvent, { phase: "cancel" }>["movement"]>().toEqualTypeOf<null>();
expectTypeOf<UseMouseEventOptions>().toEqualTypeOf<{
  readonly isActive?: MaybeRefOrGetter<boolean>;
}>();
expectTypeOf<UseMouseDragOptions>().toEqualTypeOf<{
  readonly isActive?: MaybeRefOrGetter<boolean>;
}>();
expectTypeOf<UseMouseDragReturn>().toEqualTypeOf<{
  readonly isDragging: Readonly<ShallowRef<boolean>>;
}>();

const mouseTarget = shallowRef<ComponentPublicInstance | null>(null);
const clickHandler = shallowRef<MouseEventHandler<"click">>(() => "continue");
useMouseEvent(mouseTarget, "click", clickHandler);
useMouseEvent(mouseTarget, "wheel", (event) => {
  expectTypeOf(event).toEqualTypeOf<TuiMouseWheelEvent>();
  return "consume";
});
// @ts-expect-error The event key determines the handler payload.
useMouseEvent(mouseTarget, "click", (_event: TuiMouseWheelEvent) => "continue");
// @ts-expect-error A targeted mouse handler must return an explicit propagation result.
useMouseEvent(mouseTarget, "click", () => undefined);

const dragHandler = shallowRef<MouseDragHandler>(() => {});
const drag = useMouseDrag(mouseTarget, dragHandler, { isActive: shallowRef(true) });
expectTypeOf(drag).toEqualTypeOf<UseMouseDragReturn>();
useMouseDrag(mouseTarget, (event) => {
  expectTypeOf(event).toEqualTypeOf<TuiMouseDragEvent>();
});
