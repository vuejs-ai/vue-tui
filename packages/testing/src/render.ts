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

export interface RenderResult {
  lastFrame(this: void): string | undefined;
  frames: string[];
  stdin: {
    write(data: string): Promise<void>;
  };
  terminal: Terminal;
  unmount(this: void): void;
  waitUntilExit(this: void): Promise<void>;
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
    frames.push(trimFrame(chunk.toString()));
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
    lastFrame: () => frames.at(-1),
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
