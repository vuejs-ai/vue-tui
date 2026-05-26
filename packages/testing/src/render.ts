import { PassThrough } from "node:stream";
import { nextTick, type Component } from "vue";
import { createApp, type TuiApp } from "@vue-tui/runtime";
import { makeFakeStdin, makeFakeWritable, type RawModeState } from "./streams.ts";
import { trackApp } from "./cleanup.ts";

export interface RenderOptions {
  columns?: number;
  rows?: number;
  props?: Record<string, unknown>;
  exitOnCtrlC?: boolean;
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

  const frames: string[] = [];
  stdout.on("data", (chunk) => {
    let raw = chunk.toString();
    // Debug-mode frame writer appends "\n"; strip it so frame height matches yoga layout
    if (raw.endsWith("\n")) raw = raw.slice(0, -1);
    frames.push(raw);
  });

  const app: TuiApp = createApp(component, options.props ?? undefined);
  app.mount({ stdout, stdin, stderr, debug: true, exitOnCtrlC: options.exitOnCtrlC ?? false });

  trackApp(app);

  // Attach early-error detector BEFORE flushing, so the rejection handler is
  // in place when the error boundary's nextTick → exit() → microtask fires.
  let earlyError: Error | undefined;
  app.waitUntilExit().catch((e) => {
    earlyError = e as Error;
  });

  // Flush the Vue queue. Chain: onErrorCaptured → nextTick → exit → queueMicrotask
  // → teardown → resolveExit() → stdout.write("", callback) → reject.
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
      const f = frames.at(-1);
      if (f === undefined) return undefined;
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
