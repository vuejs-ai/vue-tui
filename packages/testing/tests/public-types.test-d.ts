// These assertions are checked by the package's `tsc --noEmit` gate. The
// `*.test-d.ts` name keeps the file out of the runtime Vitest suite.
import { expectTypeOf } from "vite-plus/test";
import { defineComponent } from "vue";
// @ts-expect-error The test package no longer aliases Runtime's broad session contract.
import type { TestRenderSession } from "../src/index.ts";
import {
  render,
  type ContentFrame,
  type RenderOptions,
  type RenderResult,
  type ScreenSnapshot,
  type TestHost,
} from "../src/index.ts";

const defaultOptions: RenderOptions = {};
const inlineTtyOptions: RenderOptions = {
  columns: 80,
  rows: 24,
  props: { label: "ready" },
  host: {
    mode: "inline",
    presentation: "visual",
    stdin: "tty",
    stdout: "tty",
    patchConsole: false,
  },
};
const fullscreenOptions: RenderOptions = { host: { mode: "fullscreen" } };
const transcriptStreamOptions: RenderOptions = {
  host: {
    mode: "fullscreen",
    presentation: "screen-reader",
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

// @ts-expect-error Removed testing option; output cadence follows the modeled stdout.
const removedLiveUpdates: RenderOptions = { liveUpdates: true };
// @ts-expect-error Removed testing implementation detail; observation is always available.
const removedDebug: RenderOptions = { debug: true };
// @ts-expect-error Ctrl+C is a preventable delayed default, not a test-host option.
const removedExitOnCtrlC: RenderOptions = { exitOnCtrlC: false };
// @ts-expect-error Only Inline and Fullscreen are valid requested modes.
const invalidMode: RenderOptions = { host: { mode: "full-screen" } };
// @ts-expect-error Only visual and screen-reader presentations are modeled.
const invalidPresentation: RenderOptions = { host: { presentation: "audio" } };
// @ts-expect-error Only TTY and non-TTY input hosts are modeled.
const invalidStdin: RenderOptions = { host: { stdin: "pipe" } };
// @ts-expect-error Only TTY and stream output hosts are modeled.
const invalidStdout: RenderOptions = { host: { stdout: "file" } };
void removedLiveUpdates;
void removedDebug;
void removedExitOnCtrlC;
void invalidMode;
void invalidPresentation;
void invalidStdin;
void invalidStdout;
void (null as unknown as TestRenderSession);

declare const result: RenderResult;
declare const frame: ContentFrame;
declare const screen: ScreenSnapshot;

expectTypeOf(result.frames).toEqualTypeOf<readonly ContentFrame[]>();
expectTypeOf(result.lastFrame()).toEqualTypeOf<string>();
expectTypeOf(result.screen()).toEqualTypeOf<Promise<ScreenSnapshot>>();
expectTypeOf(result.stdin.write("")).toEqualTypeOf<Promise<void>>();
expectTypeOf(result.terminal.suspend()).toEqualTypeOf<Promise<void>>();
expectTypeOf(result.terminal.resume()).toEqualTypeOf<Promise<void>>();
expectTypeOf(result.dispose()).toEqualTypeOf<void>();

// @ts-expect-error Captured frame collections are readonly observations.
result.frames.push(frame);
// @ts-expect-error Captured frame fields are readonly observations.
frame.dynamic = "replacement";
// @ts-expect-error The test host does not republish Runtime session internals.
void result.session;
// @ts-expect-error Emulated screen rows are readonly observations.
screen.lines.push("replacement");
// @ts-expect-error Emulated cursor facts are readonly observations.
screen.cursor.column = 1;
// @ts-expect-error Emulated cursor visibility is a readonly observation.
screen.cursor.visible = false;
// @ts-expect-error Raw-mode state is a readonly live observation.
result.terminal.rawMode.current = false;
