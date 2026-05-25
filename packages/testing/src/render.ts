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

  await nextTick();

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
      },
    },
    terminal,
    unmount: app.unmount.bind(app),
    waitUntilExit: app.waitUntilExit.bind(app),
  };
}
