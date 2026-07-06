// Type-level guarantees for the public *named* type surface.
//
// vue-tui tracks Ink, and Ink re-exports its component prop types and a couple of
// framework-neutral data shapes under stable names. These names (BoxProps, TextProps,
// …, WindowSize, CursorPosition) have nothing to do with React vs Vue — a <Box> has
// props in Vue exactly as in React — so vue-tui re-exports them too, letting consumers
// name a component's props the same way they would in Ink. This is parity, not a
// divergence, so it is deliberately absent from `.agents/docs/ink-divergences.md` (which
// records only divergences); this test is the guard that the names stay aligned.
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
} from "vue";
import {
  Box,
  useApp,
  useDraggable,
  useInput,
  useMouseInput,
  usePaste,
  useStdin,
  useStdout,
  useStderr,
} from "@vue-tui/runtime";
import type {
  BoxProps,
  BoxLayoutStyle,
  TextProps,
  StaticChildren,
  StaticProps,
  StaticSlot,
  StaticSlotProps,
  StaticStyle,
  TransformProps,
  NewlineProps,
  SpacerProps,
  Key,
  MouseButton,
  MouseHandlerProps,
  MouseInputEvent,
  MouseTarget,
  MouseTargetRect,
  TuiMouseEvent,
  TuiMouseEventType,
  TuiWheelEvent,
  UseDraggableAxis,
  UseDraggableOptions,
  UseDraggablePosition,
  UseDraggableReturn,
  UseDraggableTarget,
  WindowSize,
  CursorPosition,
  UseAppReturn,
  UseStdinReturn,
  UseStdoutReturn,
  UseStderrReturn,
} from "@vue-tui/runtime";

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

// Framework-neutral data shapes, mirrored from Ink exactly.
expectTypeOf<WindowSize>().toEqualTypeOf<{ readonly columns: number; readonly rows: number }>();
expectTypeOf<CursorPosition>().toEqualTypeOf<{ x: number; y: number }>();

// Composable return types: named per VueUse's `UseXReturn` convention, and shape-locked to
// Ink's public hook returns. useStdin() in particular must expose ONLY Ink's `PublicProps`
// (stdin/setRawMode/isRawModeSupported) — never the internal raw-mode/paste controller
// (acquireRawMode/releaseRawMode/setBracketedPasteMode/acquireSgrMouseMode/
// releaseSgrMouseMode/internal_*), which the framework's own composables reach via
// inject(StdinContextKey).
expectTypeOf<UseStdinReturn>().toEqualTypeOf<{
  readonly stdin: NodeJS.ReadStream;
  readonly setRawMode: (mode: boolean) => void;
  readonly isRawModeSupported: boolean;
}>();
expectTypeOf<ReturnType<typeof useStdin>>().toEqualTypeOf<UseStdinReturn>();
expectTypeOf<keyof ReturnType<typeof useStdin>>().toEqualTypeOf<
  "stdin" | "setRawMode" | "isRawModeSupported"
>();

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

const inputHandler = shallowRef((_input: string, _key: Key) => {});
expectTypeOf(inputHandler).toMatchTypeOf<Parameters<typeof useInput>[0]>();

const pasteHandler = shallowRef((_text: string) => {});
expectTypeOf(pasteHandler).toMatchTypeOf<Parameters<typeof usePaste>[0]>();

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
