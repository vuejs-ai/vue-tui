// These assertions are checked by the package's `tsc --noEmit` gate. The
// `*.test-d.ts` name keeps the file out of the runtime Vitest suite.
import { expectTypeOf } from "vite-plus/test";
import { defineComponent } from "vue";
import {
  render,
  type ContentFrame,
  type RenderOptions,
  type RenderResult,
  type ScreenSnapshot,
  type TestHost,
  type TestRenderSession,
} from "../src/index.ts";

const defaultOptions: RenderOptions = {};
const inlineTtyOptions: RenderOptions = {
  columns: 80,
  rows: 24,
  props: { label: "ready" },
  exitOnCtrlC: true,
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
expectTypeOf(result.lastFrame()).toEqualTypeOf<string>();
expectTypeOf(result.screen()).toEqualTypeOf<Promise<ScreenSnapshot>>();
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
// @ts-expect-error Raw-mode state is a readonly live observation.
result.terminal.rawMode.current = false;
