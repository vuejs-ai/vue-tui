import { PassThrough } from "node:stream";
import { nextTick, type Component } from "vue";
import { createApp, type TuiApp } from "@vue-tui/runtime";
import { INTERNAL_FRAME_SINK, type FrameSink } from "@vue-tui/runtime/internal";
import { makeFakeStdin, makeFakeWritable, type RawModeState } from "./streams.ts";
import { trackApp } from "./cleanup.ts";

export interface RenderOptions {
  columns?: number;
  rows?: number;
  props?: Record<string, unknown>;
  exitOnCtrlC?: boolean;
  /**
   * Whether the rendered app emits live updates. Defaults to `true` so the
   * harness is deterministic: `terminal.resize()` triggers a re-layout and the
   * current lifetime input hold engages regardless of the host environment. Set
   * to `false` to disable those runtime paths. The current debug-backed frame
   * observer still captures each commit; it does not model production final-stream
   * cadence until F1.5 replaces this host.
   */
  liveUpdates?: boolean;
}

export interface Terminal {
  readonly columns: number;
  readonly rows: number;
  resize(columns: number, rows: number): Promise<void>;
  rawMode: RawModeState;
}

export interface LastFrameOptions {
  raw?: boolean;
  trimLines?: boolean;
}

export interface RenderResult {
  lastFrame(this: void, opts?: LastFrameOptions): string | undefined;
  frames: string[];
  stdin: {
    write(data: string): Promise<void>;
  };
  terminal: Terminal;
  unmount(this: void): void;
  waitUntilExit(this: void): Promise<unknown>;
  waitUntilRenderFlush(this: void): Promise<void>;
}

function trimFrame(raw: string): string {
  return raw
    .split("\n")
    .map((line) => line.trimEnd())
    .join("\n")
    .trimEnd();
}

export async function render(
  component: Component,
  options: RenderOptions = {},
): Promise<RenderResult> {
  const stdout = makeFakeWritable({
    columns: options.columns ?? 100,
    rows: options.rows ?? 100,
  });
  const stderr = makeFakeWritable({
    columns: options.columns ?? 100,
    rows: options.rows ?? 100,
  });
  const { stream: stdin, rawMode } = makeFakeStdin();

  // Capture committed frames via the runtime's internal per-app frame SINK
  // (@vue-tui/runtime/internal: INTERNAL_FRAME_SINK), NOT by reverse-engineering
  // them out of stdout. The runtime's debug commit branch invokes this callback
  // with the EXACT content chunks it writes to stdout — the accumulated <Static>
  // history chunk (when non-empty), then the dynamic frame — in write order, and
  // the debug writeToStdout/writeToStderr branches forward their replayed-frame
  // bytes too. Terminal-control escapes the runtime writes to stay byte-faithful
  // to Ink (bracketed-paste `\x1b[?2004h/l`, cursor hide/show, BSU/ESU) are NOT
  // forwarded, so `frames[]` are provably content-only.
  //
  // Properties this preserves vs the old stdout-sniffing capture:
  //   - EMPTY render is forwarded as "" (Ink-faithful: `fullStaticOutput +
  //     output`, both "" — ink.tsx:558), so `frames.at(-1)` reads back "" after
  //     rendering null and `lastFrame()` correctly returns "".
  //   - VERBATIM content — NO trailing-newline stripping. The static-history
  //     chunk stays "\n"-terminated; the dynamic-frame chunk has NO trailing
  //     newline (output.ts:305-312), so a real blank trailing row (e.g. a height
  //     4 box "AB\n\n\n") survives. `trimFrame` / `trimLines` handle display
  //     trimming in `lastFrame()` instead.
  //   - The flush WRITE BARRIER (`stdout.write("", () => ...)`) never reaches the
  //     sink — barriers are pure stdout drain awaits, not commits — so they can't
  //     clobber `lastFrame()`.
  const frames: string[] = [];
  const frameSink: FrameSink = (chunk) => {
    frames.push(chunk);
  };

  const app: TuiApp = createApp(component, options.props ?? undefined);
  // The frame sink is passed via a Symbol-keyed INTERNAL option, kept off the
  // public MountOptions type (Ink-faithful). Cast through `Parameters` to attach
  // it without widening the public type.
  app.mount({
    stdout,
    stdin,
    stderr,
    debug: true,
    // Pin live updates ON by default so the harness is deterministic and
    // independent of ambient CI/TTY detection. The runtime otherwise derives
    // the default as `!isInCi && Boolean(stdout.isTTY)`, and `isInCi` is
    // evaluated ONCE at import time — so a consumer running tests in CI would
    // silently get final-stream output: `terminal.resize()` would not re-lay-out
    // and the current lifetime input hold would never engage, breaking both APIs
    // this helper advertises. `options.liveUpdates` keeps that host behavior
    // directly testable until F1.5 replaces this debug-backed host.
    liveUpdates: options.liveUpdates ?? true,
    exitOnCtrlC: options.exitOnCtrlC ?? false,
    [INTERNAL_FRAME_SINK]: frameSink,
  } as Parameters<TuiApp["mount"]>[0]);

  trackApp(app);

  // Attach early-error detector BEFORE flushing, so the rejection handler is
  // in place when the error boundary's nextTick → exit() → microtask fires.
  let earlyError: Error | undefined;
  app.waitUntilExit().catch((e) => {
    earlyError = e as Error;
  });

  // Flush the Vue queue. Chain: onErrorCaptured (records pendingExitError
  // synchronously) → nextTick → exit → queueMicrotask → teardown → resolveExit()
  // → stdout.write("", callback) → reject. The error is recorded up front so a
  // racing unmount() still rejects; teardown stays deferred so the overview paints.
  // The stdout write barrier fires via process.nextTick (inside stream internals),
  // so we need setImmediate (runs after all process.nextTick callbacks), then one
  // more microtask yield so the .catch() handler on exitPromise can set earlyError.
  await nextTick();
  await nextTick();
  await Promise.resolve();
  await Promise.resolve();
  await new Promise<void>((r) => setImmediate(r));
  await Promise.resolve();

  if (earlyError) {
    throw earlyError;
  }

  const terminal: Terminal = {
    get columns() {
      return stdout.columns;
    },
    get rows() {
      return stdout.rows;
    },
    async resize(columns: number, rows: number) {
      stdout.columns = columns;
      stdout.rows = rows;
      (stderr as NodeJS.WriteStream).columns = columns;
      (stderr as NodeJS.WriteStream).rows = rows;
      (stdout as unknown as PassThrough).emit("resize");
      await nextTick();
    },
    rawMode,
  };

  return {
    lastFrame: (opts?: LastFrameOptions) => {
      // An empty render is written (and so captured) as "", so `frames.at(-1)`
      // reads back "" after rendering null — matching Ink. `?? ""` is a defensive
      // floor for the (unreachable in practice) pre-first-render read; `render()`
      // always flushes at least one render before returning.
      const f = frames.at(-1) ?? "";
      if (opts?.raw) return f;
      if (opts?.trimLines)
        return f
          .split("\n")
          .map((l) => l.trimEnd())
          .join("\n");
      return trimFrame(f);
    },
    frames,
    stdin: {
      async write(data: string): Promise<void> {
        stdin.emit("data", data);
        await nextTick();
        // The input parser may hold a bare escape (\x1b) as "pending" for
        // up to 20ms, waiting to see if it's the start of an escape sequence.
        // Wait long enough for the pending-flush timer to fire so tests that
        // send a bare escape don't silently lose the event.
        await new Promise((r) => setTimeout(r, 30));
        await nextTick();
      },
    },
    terminal,
    unmount: app.unmount.bind(app),
    waitUntilExit: app.waitUntilExit.bind(app),
    waitUntilRenderFlush: app.waitUntilRenderFlush.bind(app),
  };
}
