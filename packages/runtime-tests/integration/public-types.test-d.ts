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
import type {
  BoxProps,
  TextProps,
  StaticProps,
  TransformProps,
  NewlineProps,
  WindowSize,
  CursorPosition,
} from "@vue-tui/runtime";

// Prop types carry their component's real, declared props.
expectTypeOf<BoxProps["flexDirection"]>().toEqualTypeOf<
  "row" | "row-reverse" | "column" | "column-reverse" | undefined
>();
expectTypeOf<BoxProps["gap"]>().toEqualTypeOf<number | undefined>();
expectTypeOf<TextProps["bold"]>().toEqualTypeOf<boolean | undefined>();
expectTypeOf<StaticProps["items"]>().toEqualTypeOf<unknown[]>();
expectTypeOf<TransformProps["transform"]>().toEqualTypeOf<
  (line: string, lineIndex: number) => string
>();
expectTypeOf<NewlineProps["count"]>().toEqualTypeOf<number | undefined>();

// Framework-neutral data shapes, mirrored from Ink exactly.
expectTypeOf<WindowSize>().toEqualTypeOf<{ readonly columns: number; readonly rows: number }>();
expectTypeOf<CursorPosition>().toEqualTypeOf<{ x: number; y: number }>();
