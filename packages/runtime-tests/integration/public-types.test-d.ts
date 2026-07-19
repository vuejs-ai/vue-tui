// Type-level guarantees for the public *named* type surface.
//
// Component props, narrow layout/measurement facts, and framework-neutral cursor
// data retain stable public names. Internal session and paint graphs do not.
//
// These assertions are erased at runtime; the real gate is `tsc --noEmit` (the package's
// `check:type` script). This file is named `*.test-d.ts` on purpose so vitest does NOT
// pick it up as a runtime test (its include is `*.test.ts`), while tsc still checks it.
import { expectTypeOf } from "vite-plus/test";
import { shallowRef, type ComponentPublicInstance, type MaybeRefOrGetter, type Ref } from "vue";
import {
  Box,
  Text,
  useApp,
  useBoxPresence,
  useBoxSize,
  useInput,
  useLayoutWidth,
  useStdin,
  useViewportHeight,
} from "@vue-tui/runtime";
import type {
  AriaRole,
  AriaState,
  BoxProps,
  BoxSize,
  Color,
  TextProps,
  MountOptions,
  TuiInputEvent,
  TuiKeyName,
  RenderMode,
  RenderPresentation,
  TuiApp,
  UseAppReturn,
  UseStdinReturn,
} from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";

const defaultMountOptions: MountOptions = {};
const inlineMountOptions: MountOptions = { mode: "inline", presentation: "visual" };
const fullscreenMountOptions: MountOptions = {
  mode: "fullscreen",
  presentation: "screen-reader",
};
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
// @ts-expect-error Runtime privately negotiates the keyboard protocol needed by public input facts.
const removedKittyKeyboardOption: MountOptions = { kittyKeyboard: { mode: "enabled" } };
// @ts-expect-error Only the two finite render-mode values are accepted.
const invalidModeOption: MountOptions = { mode: "full-screen" };
// @ts-expect-error Output cadence is Runtime-owned rather than a mount policy.
const removedLiveUpdatesOption: MountOptions = { liveUpdates: true };
// @ts-expect-error Presentation has two finite public values.
const invalidPresentationOption: MountOptions = { presentation: "screenreader" };
const removedClipboardOption: MountOptions = {
  // @ts-expect-error Clipboard transport injection is application policy, not a Runtime mount option.
  clipboard: { kind: "custom", writeText: async () => ({ status: "copied" }) },
};
void removedFullscreenOption;
void removedAlternateScreenOption;
void removedInteractiveOption;
void removedDebugOption;
void removedRawModeOption;
void removedExitOnCtrlCOption;
void removedKittyKeyboardOption;
void invalidModeOption;
void removedLiveUpdatesOption;
void invalidPresentationOption;
void removedClipboardOption;

// @ts-expect-error Clipboard policy is outside the Runtime foundation.
export type _UseClipboardWasRemoved = typeof import("@vue-tui/runtime").useClipboard;
// @ts-expect-error Runtime does not publish clipboard transport types.
export type _ClipboardTransportWasRemoved = import("@vue-tui/runtime").ClipboardTransport;
// @ts-expect-error Selection policy is outside the Runtime foundation.
export type _UseTextSelectionWasRemoved = typeof import("@vue-tui/runtime").useTextSelection;
// @ts-expect-error Static is exported only from the Inline history subpath.
export type _StaticIsInlineOnly = typeof import("@vue-tui/runtime").Static;
// @ts-expect-error The removed Static collection types are not exported from the root.
export type _RemovedRootStaticChildren = import("@vue-tui/runtime").StaticChildren;
// @ts-expect-error The removed Static collection types are not exported from the root.
export type _RemovedRootStaticProps = import("@vue-tui/runtime").StaticProps;
// @ts-expect-error The removed Static collection types are not exported from the root.
export type _RemovedRootStaticSlot = import("@vue-tui/runtime").StaticSlot;
// @ts-expect-error The removed Static collection types are not exported from the root.
export type _RemovedRootStaticSlotProps = import("@vue-tui/runtime").StaticSlotProps;
// @ts-expect-error The removed Static collection types are not exported from the root.
export type _RemovedRootStaticStyle = import("@vue-tui/runtime").StaticStyle;
// @ts-expect-error The no-prop Static component has no named author type exports.
export type _RemovedInlineStaticChildren = import("@vue-tui/runtime/inline").StaticChildren;
// @ts-expect-error The no-prop Static component has no named author type exports.
export type _RemovedInlineStaticProps = import("@vue-tui/runtime/inline").StaticProps;
// @ts-expect-error The no-prop Static component has no named author type exports.
export type _RemovedInlineStaticSlot = import("@vue-tui/runtime/inline").StaticSlot;
// @ts-expect-error The no-prop Static component has no named author type exports.
export type _RemovedInlineStaticSlotProps = import("@vue-tui/runtime/inline").StaticSlotProps;
// @ts-expect-error The no-prop Static component has no named author type exports.
export type _RemovedInlineStaticStyle = import("@vue-tui/runtime/inline").StaticStyle;
// @ts-expect-error Common component types are not duplicated on the Inline subpath.
export type _BoxPropsIsCommonOnly = import("@vue-tui/runtime/inline").BoxProps;

// Prop types carry their component's real, declared props.
expectTypeOf<keyof BoxProps>().toEqualTypeOf<
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
>();
expectTypeOf<keyof TextProps>().toEqualTypeOf<
  "color" | "backgroundColor" | "dimColor" | "bold" | "wrap" | "ariaLabel" | "ariaHidden"
>();
expectTypeOf<BoxProps["flexDirection"]>().toEqualTypeOf<"row" | "column" | undefined>();
expectTypeOf<BoxProps["alignItems"]>().toEqualTypeOf<"center" | "stretch" | undefined>();
expectTypeOf<BoxProps["justifyContent"]>().toEqualTypeOf<
  "flex-start" | "center" | "space-between" | undefined
>();
expectTypeOf<BoxProps["width"]>().toEqualTypeOf<number | `${number}%` | undefined>();
expectTypeOf<BoxProps["height"]>().toEqualTypeOf<number | undefined>();
expectTypeOf<BoxProps["position"]>().toEqualTypeOf<"absolute" | undefined>();
expectTypeOf<BoxProps["borderStyle"]>().toEqualTypeOf<"single" | "round" | undefined>();
expectTypeOf<BoxProps["overflowY"]>().toEqualTypeOf<"visible" | "hidden" | undefined>();
expectTypeOf<BoxProps["display"]>().toEqualTypeOf<"flex" | "none" | undefined>();
expectTypeOf<BoxProps["gap"]>().toEqualTypeOf<number | undefined>();
expectTypeOf<TextProps["bold"]>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<TextProps["color"]>().toEqualTypeOf<Color | "revert" | "initial" | undefined>();
expectTypeOf<TextProps["backgroundColor"]>().toEqualTypeOf<Color | undefined>();
expectTypeOf<TextProps["wrap"]>().toEqualTypeOf<"wrap" | "truncate" | undefined>();
expectTypeOf<BoxProps["backgroundColor"]>().toEqualTypeOf<Color | undefined>();
expectTypeOf<BoxProps["borderColor"]>().toEqualTypeOf<Color | undefined>();
expectTypeOf<BoxProps["ariaRole"]>().toEqualTypeOf<AriaRole | undefined>();
expectTypeOf<BoxProps["ariaState"]>().toEqualTypeOf<AriaState | undefined>();

const namedColor: Color = "gray";
const rgbColor: Color = "#12abEF";
// @ts-expect-error British spelling is not a canonical Runtime color.
const removedGreyAlias: Color = "grey";
// @ts-expect-error blackBright is not a second name for the canonical gray entry.
const removedBlackBrightAlias: Color = "blackBright";
void namedColor;
void rgbColor;
void removedGreyAlias;
void removedBlackBrightAlias;

// Removed props are absent, rather than retained as `never` tombstones.
// @ts-expect-error Mouse listeners are not Box props.
export type _RemovedBoxClick = BoxProps["onClick"];
// @ts-expect-error Spacing shorthands are not Box props.
export type _RemovedBoxPaddingX = BoxProps["paddingX"];
// @ts-expect-error Unevidenced horizontal margin is not a Box prop.
export type _RemovedBoxMarginLeft = BoxProps["marginLeft"];
// @ts-expect-error Horizontal clipping is not a Box prop.
export type _RemovedBoxOverflowX = BoxProps["overflowX"];
// @ts-expect-error Unevidenced text decoration is not a Text prop.
export type _RemovedTextUnderline = TextProps["underline"];
// @ts-expect-error Selection-only inverse styling is not a public Text primitive.
export type _RemovedTextInverse = TextProps["inverse"];
type StaticComponentProps = InstanceType<typeof Static>["$props"];
// @ts-expect-error Static no longer owns an application collection.
export type _RemovedStaticItemsProp = StaticComponentProps["items"];
// @ts-expect-error Layout is composed inside Static's ordinary slot.
export type _RemovedStaticStyleProp = StaticComponentProps["style"];
// @ts-expect-error BoxLayoutStyle exposed the removed Yoga vocabulary.
export type _RemovedBoxLayoutStyle = import("@vue-tui/runtime").BoxLayoutStyle;
// @ts-expect-error Custom border glyph objects are not a public Runtime contract.
export type _RemovedBoxStyle = import("@vue-tui/runtime").BoxStyle;
// @ts-expect-error Newline is ordinary Text composition.
export type _RemovedNewlineProps = import("@vue-tui/runtime").NewlineProps;
// @ts-expect-error Spacer is ordinary growing Box composition.
export type _RemovedSpacerProps = import("@vue-tui/runtime").SpacerProps;
// @ts-expect-error Transform remains a private renderer mechanism.
export type _RemovedTransformProps = import("@vue-tui/runtime").TransformProps;
// @ts-expect-error Animation scheduling is ordinary Vue timer policy.
export type _RemovedUseAnimationOptions = import("@vue-tui/runtime").UseAnimationOptions;
// @ts-expect-error Animation scheduling is ordinary Vue timer policy.
export type _RemovedUseAnimationReturn = import("@vue-tui/runtime").UseAnimationReturn;

// Runtime publishes only the layout facts applications have demonstrated.
expectTypeOf<RenderMode>().toEqualTypeOf<"inline" | "fullscreen">();
expectTypeOf<RenderPresentation>().toEqualTypeOf<"visual" | "screen-reader">();
expectTypeOf<ReturnType<typeof useLayoutWidth>>().toEqualTypeOf<Readonly<Ref<number>>>();
expectTypeOf<ReturnType<typeof useViewportHeight>>().toEqualTypeOf<Readonly<Ref<number>> | null>();

const layoutWidth = useLayoutWidth();
const viewportHeight = useViewportHeight();
// @ts-expect-error Runtime-owned layout facts are readonly.
layoutWidth.value = 40;
if (viewportHeight) {
  // @ts-expect-error Runtime-owned viewport facts are readonly.
  viewportHeight.value = 24;
}

// @ts-expect-error The broad Runtime session graph is private.
export type _RenderSessionWasRemoved = import("@vue-tui/runtime").RenderSession;
// @ts-expect-error Requested/effective mode resolution is private.
export type _RenderModeResolutionWasRemoved = import("@vue-tui/runtime").RenderModeResolution;
// @ts-expect-error Output writer policy is private.
export type _RenderOutputWasRemoved = import("@vue-tui/runtime").RenderOutput;
// @ts-expect-error Physical terminal dimensions are not a public Runtime type.
export type _RenderSizeWasRemoved = import("@vue-tui/runtime").RenderSize;
// @ts-expect-error The old combined layout wrapper was removed.
export type _RenderLayoutSizeWasRemoved = import("@vue-tui/runtime").RenderLayoutSize;
// @ts-expect-error The old combined layout hook was removed.
export type _UseLayoutSizeWasRemoved = typeof import("@vue-tui/runtime").useLayoutSize;
// @ts-expect-error The broad session hook was removed.
export type _UseRenderSessionWasRemoved = typeof import("@vue-tui/runtime").useRenderSession;

// @ts-expect-error useWindowSize and its numeric-row WindowSize type were removed.
export type _WindowSizeWasRemoved = import("@vue-tui/runtime").WindowSize;

expectTypeOf<BoxSize>().toEqualTypeOf<{
  readonly width: number;
  readonly height: number;
}>();

const boxHost = shallowRef<InstanceType<typeof Box> | null>(null);
const boxSize = useBoxSize(boxHost);
const boxPresence = useBoxPresence(boxHost);
expectTypeOf(boxSize).toEqualTypeOf<Readonly<Ref<BoxSize | null>>>();
expectTypeOf(boxPresence).toEqualTypeOf<Readonly<Ref<boolean>>>();
// @ts-expect-error The accepted Box measurement is readonly.
boxSize.value = { width: 1, height: 1 };
// @ts-expect-error Accepted Box presence is renderer-owned and readonly.
boxPresence.value = false;

const textHost = shallowRef<InstanceType<typeof Text> | null>(null);
// @ts-expect-error Text layout has separate semantics and is not a Box size target.
useBoxSize(textHost);
// @ts-expect-error Text is not a direct Box-presence target.
useBoxPresence(textHost);
const customHost = shallowRef<ComponentPublicInstance | null>(null);
// @ts-expect-error Arbitrary component refs do not mean one measurable Box.
useBoxSize(customHost);
// @ts-expect-error Arbitrary component refs do not mean one direct Box.
useBoxPresence(customHost);
declare const rawBoxHost: InstanceType<typeof Box>;
// @ts-expect-error A raw component value cannot represent target attachment and detachment.
useBoxSize(rawBoxHost);
// @ts-expect-error A raw component value cannot represent target attachment and detachment.
useBoxPresence(rawBoxHost);
// @ts-expect-error Callers can wrap a derived target in computed(); Runtime accepts refs only.
useBoxSize(() => boxHost.value);
// @ts-expect-error Callers can wrap a derived target in computed(); Runtime accepts refs only.
useBoxPresence(() => boxHost.value);

// @ts-expect-error Rich paint geometry is private.
export type _UseElementGeometryWasRemoved = typeof import("@vue-tui/runtime").useElementGeometry;
// @ts-expect-error Rich paint geometry status and fragments are private.
export type _ElementGeometryWasRemoved = import("@vue-tui/runtime").ElementGeometry;
// @ts-expect-error Paint rectangles are private.
export type _CellRectWasRemoved = import("@vue-tui/runtime").CellRect;
// @ts-expect-error Paint fragments are private.
export type _ElementGeometryFragmentWasRemoved = import("@vue-tui/runtime").ElementGeometryFragment;
// @ts-expect-error The old geometry wrapper type was removed.
export type _OldGeometryReturn = import("@vue-tui/runtime").UseElementGeometryReturn;
// @ts-expect-error useBoxMetrics was replaced, not retained as an alias.
export type _UseBoxMetricsWasRemoved = typeof import("@vue-tui/runtime").useBoxMetrics;
// @ts-expect-error Its named return type was removed with the composable.
export type _UseBoxMetricsReturnWasRemoved = import("@vue-tui/runtime").UseBoxMetricsReturn;
// @ts-expect-error Its parent-relative scalar snapshot type was removed too.
export type _BoxMetricsWasRemoved = import("@vue-tui/runtime").BoxMetrics;
// @ts-expect-error Imperative Yoga measurement has no semantic geometry contract.
export type _MeasureElementWasRemoved = typeof import("@vue-tui/runtime").measureElement;

// The old focus-bound, cell-coordinate caret is withdrawn. Path 4 may publish
// a semantic Text-position primitive without retaining these contracts.
// @ts-expect-error Cell-coordinate caret ownership is not public.
export type _OldUseCaretWasRemoved = typeof import("@vue-tui/runtime").useCaret;
// @ts-expect-error Renderer diagnostic state is not an application contract.
export type _OldCaretStateWasRemoved = import("@vue-tui/runtime").CaretState;
// @ts-expect-error The old focus-plus-cell options were removed with useCaret().
export type _OldUseCaretOptionsWereRemoved = import("@vue-tui/runtime").UseCaretOptions;
// @ts-expect-error The old state wrapper was removed with useCaret().
export type _OldUseCaretReturnWasRemoved = import("@vue-tui/runtime").UseCaretReturn;
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

expectTypeOf<UseAppReturn>().toEqualTypeOf<{
  readonly exit: (error?: Error) => void;
}>();
expectTypeOf<ReturnType<typeof useApp>>().toEqualTypeOf<UseAppReturn>();
expectTypeOf<ReturnType<TuiApp["waitUntilExit"]>>().toEqualTypeOf<Promise<void>>();
expectTypeOf<ReturnType<TuiApp["waitUntilRenderFlush"]>>().toEqualTypeOf<Promise<void>>();
// @ts-expect-error Host flush is app-owner lifecycle, not an in-tree control.
export type _UseAppFlushWasRemoved = UseAppReturn["waitUntilRenderFlush"];
// @ts-expect-error Imperative frame clearing is not a stable app contract.
export type _AppClearWasRemoved = TuiApp["clear"];
// @ts-expect-error Imperative stdout coordination is outside the minimum foundation.
export type _UseStdoutWasRemoved = typeof import("@vue-tui/runtime").useStdout;
// @ts-expect-error Imperative stderr coordination is outside the minimum foundation.
export type _UseStderrWasRemoved = typeof import("@vue-tui/runtime").useStderr;
// @ts-expect-error The output-gate result type is private.
export type _CoordinatedWriteResultWasRemoved = import("@vue-tui/runtime").CoordinatedWriteResult;

// Runtime publishes renderer presence, not one focus/scope/routing policy.
// @ts-expect-error Focus policy can be composed above Runtime.
export type _UseFocusWasRemoved = typeof import("@vue-tui/runtime").useFocus;
// @ts-expect-error Scope policy can be composed above Runtime.
export type _UseFocusScopeWasRemoved = typeof import("@vue-tui/runtime").useFocusScope;
// @ts-expect-error Focused routing can be composed above Runtime's one global subscription.
export type _UseFocusedInputWasRemoved = typeof import("@vue-tui/runtime").useFocusedInput;
// @ts-expect-error Scope routing can be composed above Runtime's one global subscription.
export type _UseFocusScopeInputWasRemoved = typeof import("@vue-tui/runtime").useFocusScopeInput;
// @ts-expect-error Runtime does not publish a global focus manager.
export type _UseFocusManagerWasRemoved = typeof import("@vue-tui/runtime").useFocusManager;
// @ts-expect-error Normalized external forwarding was not a lossless terminal transport.
export type _UseExternalInputWasRemoved = typeof import("@vue-tui/runtime").useExternalInput;
// @ts-expect-error Focus supporting types were removed with the policy API.
export type _UseFocusReturnWasRemoved = import("@vue-tui/runtime").UseFocusReturn;
// @ts-expect-error Focus supporting types were removed with the policy API.
export type _UseFocusScopeReturnWasRemoved = import("@vue-tui/runtime").UseFocusScopeReturn;
// @ts-expect-error External routing supporting types were removed with the policy API.
export type _ExternalInputSourceWasRemoved = import("@vue-tui/runtime").ExternalInputSource;

// Semantic input exposes only insertion text, complete paste, and a finite key fact.
expectTypeOf<TuiKeyName>().toEqualTypeOf<
  | "backspace"
  | "delete"
  | "down"
  | "end"
  | "enter"
  | "escape"
  | "home"
  | "left"
  | "page-down"
  | "page-up"
  | "right"
  | "tab"
  | "up"
>();
type ExpectedTuiInputEvent =
  | { readonly kind: "text"; readonly text: string }
  | { readonly kind: "paste"; readonly text: string }
  | {
      readonly kind: "key";
      readonly name: TuiKeyName;
      readonly character?: never;
      readonly shift: boolean;
      readonly alt: boolean;
      readonly ctrl: boolean;
    }
  | {
      readonly kind: "key";
      readonly character: string;
      readonly name?: never;
      readonly shift: boolean;
      readonly alt: boolean;
      readonly ctrl: boolean;
    };
expectTypeOf<TuiInputEvent>().toMatchTypeOf<ExpectedTuiInputEvent>();
expectTypeOf<ExpectedTuiInputEvent>().toMatchTypeOf<TuiInputEvent>();
expectTypeOf<Parameters<typeof useInput>[0]>().toEqualTypeOf<
  (event: TuiInputEvent) => void | { readonly preventDefault: true }
>();
expectTypeOf<Parameters<typeof useInput>[1]>().toEqualTypeOf<
  { readonly isActive?: MaybeRefOrGetter<boolean> } | undefined
>();

const inputHandler = (event: TuiInputEvent): void | { readonly preventDefault: true } => {
  if (event.kind === "key" && event.character === "c" && event.ctrl) {
    return { preventDefault: true };
  }
};
const inputActive = shallowRef(true);
useInput(inputHandler, { isActive: inputActive });
useInput(inputHandler, { isActive: () => inputActive.value });

declare const inputEvent: TuiInputEvent;
if (inputEvent.kind === "key") {
  expectTypeOf(inputEvent.shift).toEqualTypeOf<boolean>();
  expectTypeOf(inputEvent.alt).toEqualTypeOf<boolean>();
  expectTypeOf(inputEvent.ctrl).toEqualTypeOf<boolean>();
  if (inputEvent.name !== undefined) {
    expectTypeOf(inputEvent.name).toEqualTypeOf<TuiKeyName>();
  } else {
    expectTypeOf(inputEvent.character).toEqualTypeOf<string>();
  }
  // @ts-expect-error Normalized key facts are readonly.
  inputEvent.ctrl = false;
} else {
  expectTypeOf(inputEvent.text).toEqualTypeOf<string>();
  // @ts-expect-error Normalized text and paste payloads are readonly.
  inputEvent.text = "replacement";
}

useInput(() => undefined);
useInput(() => ({ preventDefault: true }));
// @ts-expect-error Handler refs are unnecessary; close over a ref when callback identity is reactive.
useInput(shallowRef(inputHandler));
// @ts-expect-error Activation must resolve to a boolean.
useInput(inputHandler, { isActive: "yes" });

// @ts-expect-error Parser-shaped handler aliases are not public supporting types.
export type _InputHandlerWasRemoved = import("@vue-tui/runtime").InputHandler;
// @ts-expect-error Route-result aliases are not public supporting types.
export type _InputHandlerResultWasRemoved = import("@vue-tui/runtime").InputHandlerResult;
// @ts-expect-error Runtime does not publish routing policy through input results.
export type _InputRouteDecisionWasRemoved = import("@vue-tui/runtime").InputRouteDecision;
// @ts-expect-error The inline options shape needs no public supporting name.
export type _UseInputOptionsWasRemoved = import("@vue-tui/runtime").UseInputOptions;
// @ts-expect-error Parser phase is not an application fact.
export type _TuiInputPhaseWasRemoved = import("@vue-tui/runtime").TuiInputPhase;
// @ts-expect-error Parser source/fidelity is not an application fact.
export type _TuiInputSourceWasRemoved = import("@vue-tui/runtime").TuiInputSource;
// @ts-expect-error Modifiers live directly on key events without another named type.
export type _TuiInputModifiersWasRemoved = import("@vue-tui/runtime").TuiInputModifiers;
type RuntimePublicModule = typeof import("@vue-tui/runtime");
export type _UseInputAvailabilityWasRemoved =
  // @ts-expect-error Availability is established by activating a subscription, not a speculative hook.
  RuntimePublicModule["useInputAvailability"];
// @ts-expect-error Input availability supporting types were removed with the hook.
export type _InputAvailabilityWasRemoved = import("@vue-tui/runtime").InputAvailability;
// @ts-expect-error Kitty negotiation is Runtime-owned protocol machinery.
export type _KittyKeyboardOptionsWasRemoved = import("@vue-tui/runtime").KittyKeyboardOptions;
// @ts-expect-error Kitty flags are Runtime-owned protocol machinery.
export type _KittyFlagNameWasRemoved = import("@vue-tui/runtime").KittyFlagName;

// @ts-expect-error Key was replaced by the normalized TuiInputEvent union.
export type _LegacyKeyWasRemoved = import("@vue-tui/runtime").Key;
// @ts-expect-error Paste is a TuiInputEvent member, so its separate options were removed.
export type _UsePasteOptionsWereRemoved = import("@vue-tui/runtime").UsePasteOptions;
// @ts-expect-error Paste is observed through useInput(), not a separate public composable.
export type _UsePasteWasRemoved = typeof import("@vue-tui/runtime").usePaste;

// Pointer targeting and routing remain private until a smaller Runtime-only primitive is proven.
// @ts-expect-error The terminal-wide v1 mouse hook was removed.
export type _UseMouseInputWasRemoved = typeof import("@vue-tui/runtime").useMouseInput;
// @ts-expect-error The v1 drag helper was removed.
export type _UseDraggableWasRemoved = typeof import("@vue-tui/runtime").useDraggable;
// @ts-expect-error Targeted mouse policy is outside the Runtime foundation.
export type _UseMouseEventWasRemoved = typeof import("@vue-tui/runtime").useMouseEvent;
// @ts-expect-error Drag policy is outside the Runtime foundation.
export type _UseMouseDragWasRemoved = typeof import("@vue-tui/runtime").useMouseDrag;
// @ts-expect-error Runtime does not publish mouse protocol types.
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
// @ts-expect-error Cell coordinates are not a public Runtime contract.
export type _CellPointWasRemoved = import("@vue-tui/runtime").CellPoint;
// @ts-expect-error Component target wiring is not a public Runtime contract.
export type _ElementTargetWasRemoved = import("@vue-tui/runtime").ElementTarget;
