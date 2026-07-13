// These assertions are checked by the package's `tsc --noEmit` gate. The
// `*.test-d.ts` name keeps the file out of the runtime Vitest suite.
import { expectTypeOf } from "vite-plus/test";
import { defineComponent } from "vue";
import type { CellPoint, RenderSession } from "@vue-tui/runtime";
import type { MouseButton } from "@vue-tui/runtime/fullscreen";
import {
  render,
  type ContentFrame,
  type RenderOptions,
  type RenderResult,
  type ScreenSnapshot,
  type TestHost,
  type TestMouse,
  type TestMouseButtonOptions,
  type TestMouseModifiers,
  type TestMouseReportingLevel,
  type TestMouseReportingState,
  type TestRenderSession,
} from "../src/index.ts";

const defaultOptions: RenderOptions = {};
const inlineTtyOptions: RenderOptions = {
  columns: 80,
  rows: 24,
  props: { label: "ready" },
  host: {
    mode: "inline",
    presentation: "visual",
    updates: "live",
    stdin: "tty",
    stdout: "tty",
  },
};
const fullscreenOptions: RenderOptions = { host: { mode: "fullscreen" } };
const transcriptStreamOptions: RenderOptions = {
  host: {
    mode: "fullscreen",
    presentation: "screen-reader",
    updates: "at-teardown",
    stdin: "non-tty",
    stdout: "stream",
  },
};

expectTypeOf(defaultOptions).toMatchTypeOf<RenderOptions>();
expectTypeOf(inlineTtyOptions).toMatchTypeOf<RenderOptions>();
expectTypeOf(fullscreenOptions).toMatchTypeOf<RenderOptions>();
expectTypeOf(transcriptStreamOptions).toMatchTypeOf<RenderOptions>();
expectTypeOf<NonNullable<RenderOptions["host"]>>().toEqualTypeOf<TestHost>();

const TestComponent = defineComponent(() => () => null);
expectTypeOf(render(TestComponent, inlineTtyOptions)).toEqualTypeOf<Promise<RenderResult>>();

// @ts-expect-error Removed testing option; configure host.updates instead.
const removedLiveUpdates: RenderOptions = { liveUpdates: true };
// @ts-expect-error Removed testing implementation detail; observation is always available.
const removedDebug: RenderOptions = { debug: true };
// @ts-expect-error Ctrl+C is a preventable delayed default, not a test-host option.
const removedExitOnCtrlC: RenderOptions = { exitOnCtrlC: false };
// @ts-expect-error Only Inline and Fullscreen are valid requested modes.
const invalidMode: RenderOptions = { host: { mode: "full-screen" } };
// @ts-expect-error Only visual and screen-reader presentations are modeled.
const invalidPresentation: RenderOptions = { host: { presentation: "audio" } };
// @ts-expect-error Only live and at-teardown update cadences are modeled.
const invalidUpdates: RenderOptions = { host: { updates: "sometimes" } };
// @ts-expect-error Only TTY and non-TTY input hosts are modeled.
const invalidStdin: RenderOptions = { host: { stdin: "pipe" } };
// @ts-expect-error Only TTY and stream output hosts are modeled.
const invalidStdout: RenderOptions = { host: { stdout: "file" } };
void removedLiveUpdates;
void removedDebug;
void removedExitOnCtrlC;
void invalidMode;
void invalidPresentation;
void invalidUpdates;
void invalidStdin;
void invalidStdout;

declare const result: RenderResult;
declare const frame: ContentFrame;
declare const session: TestRenderSession;
declare const screen: ScreenSnapshot;

expectTypeOf(result.frames).toEqualTypeOf<readonly ContentFrame[]>();
expectTypeOf(result.session).toEqualTypeOf<TestRenderSession>();
expectTypeOf<TestRenderSession>().toEqualTypeOf<
  Extract<RenderSession, { readonly host: "live" }>
>();
expectTypeOf(result.lastFrame()).toEqualTypeOf<string>();
expectTypeOf(result.screen()).toEqualTypeOf<Promise<ScreenSnapshot>>();
expectTypeOf(result.mouse).toEqualTypeOf<TestMouse>();
expectTypeOf(result.mouse.reporting).toEqualTypeOf<TestMouseReportingState>();
expectTypeOf(result.mouse.reporting.current).toEqualTypeOf<TestMouseReportingLevel>();
expectTypeOf(result.mouse.reporting.history).toEqualTypeOf<readonly TestMouseReportingLevel[]>();
expectTypeOf<TestMouse["down"]>().toEqualTypeOf<
  (point: CellPoint, options?: TestMouseButtonOptions) => Promise<void>
>();
expectTypeOf<TestMouse["move"]>().toEqualTypeOf<
  (point: CellPoint, modifiers?: TestMouseModifiers) => Promise<void>
>();
expectTypeOf<TestMouse["up"]>().toEqualTypeOf<
  (point: CellPoint, options?: TestMouseButtonOptions) => Promise<void>
>();
expectTypeOf<TestMouse["wheel"]>().toEqualTypeOf<
  (
    point: CellPoint,
    direction: "up" | "down" | "left" | "right",
    modifiers?: TestMouseModifiers,
  ) => Promise<void>
>();
expectTypeOf(result.terminal.suspend()).toEqualTypeOf<Promise<void>>();
expectTypeOf(result.terminal.resume()).toEqualTypeOf<Promise<void>>();
expectTypeOf(result.dispose()).toEqualTypeOf<void>();

// @ts-expect-error Captured frame collections are readonly observations.
result.frames.push(frame);
// @ts-expect-error Captured frame fields are readonly observations.
frame.dynamic = "replacement";
// @ts-expect-error The session reference cannot be replaced.
result.session = session;
// @ts-expect-error Nested session facts are readonly.
result.session.output.presentation = "visual";
// @ts-expect-error Nested session dimensions are readonly.
result.session.dimensions.layout.columns = 120;
// @ts-expect-error Emulated screen rows are readonly observations.
screen.lines.push("replacement");
// @ts-expect-error Emulated cursor facts are readonly observations.
screen.cursor.column = 1;
// @ts-expect-error Emulated cursor visibility is a readonly observation.
screen.cursor.visible = false;
// @ts-expect-error Raw-mode state is a readonly live observation.
result.terminal.rawMode.current = false;
// @ts-expect-error Mouse-reporting state is a readonly live observation.
result.mouse.reporting.current = "none";
// @ts-expect-error Mouse-reporting history is a readonly live observation.
result.mouse.reporting.history.push("button");
// @ts-expect-error TestMouse deliberately does not manufacture production clicks.
result.mouse.click({ x: 0, y: 0 });
// @ts-expect-error Physical test input uses the runtime's public mouse-button vocabulary.
void result.mouse.down({ x: 0, y: 0 }, { button: "primary" });
// @ts-expect-error Modifier flags are booleans.
void result.mouse.move({ x: 0, y: 0 }, { shift: 1 });
// @ts-expect-error Wheel input supports exactly four terminal directions.
void result.mouse.wheel({ x: 0, y: 0 }, "forward");

const leftButton: MouseButton = "left";
const buttonOptions: TestMouseButtonOptions = { button: leftButton, alt: true };
const modifiers: TestMouseModifiers = { shift: true, ctrl: false };
void buttonOptions;
void modifiers;
