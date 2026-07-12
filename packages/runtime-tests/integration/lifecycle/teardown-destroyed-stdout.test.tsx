/**
 * Item 2.5b — every teardown stdout write must be skipped when stdout is already
 * destroyed/ended, not just gated on `isTTY`.
 *
 * On teardown vue-tui restores terminal state by writing escapes to stdout
 * (show-cursor `\x1b[?25h` via the frame writer's `done()`, alt-screen exit,
 * disable-kitty `\x1b[<u`). Some of these were gated ONLY on `isTTY` — which
 * stays cached-truthy after `destroy()`/`end()` — with NO writability check, so
 * on a teardown where stdout is already gone the unguarded `.write()` hits a
 * dead stream (ERR_STREAM_DESTROYED). Ink guards the analogous cursor-show and
 * disable-kitty writes on `canWriteToStdout = !destroyed && !writableEnded`
 * (App.tsx:620-624 for the cursor show; ink.tsx:792-795 for disable-kitty).
 *
 * The paste-disable site was fixed in PR #126; this covers the SAME bug class at
 * the OTHER teardown sites. We use a recording TTY double that RECORDS every
 * restore-escape write attempt and whether the stream was already dead at the
 * time, so the test asserts the runtime never even ATTEMPTS the write on a dead
 * stdout (the observable contract), rather than relying on a call site swallowing
 * the throw.
 */
import { PassThrough } from "node:stream";
import { defineComponent, nextTick } from "vue";
import { describe, test, expect } from "vite-plus/test";
import { createApp, Text, useCursor, useInput } from "@vue-tui/runtime";

const SHOW_CURSOR = "\x1b[?25h";
const DISABLE_KITTY = "\x1b[<u";

// A TTY-ish stdout that mirrors a real terminal torn down underneath us: after
// hardDestroy() `isTTY` stays cached-truthy while the stream is no longer
// writable. It RECORDS every restore-escape write attempt made while dead.
function makeRecordingTtyStream(): NodeJS.WriteStream & {
  chunks: string[];
  showCursorWhileDead: number;
  disableKittyWhileDead: number;
  hardDestroy(): void;
} {
  const inner = new PassThrough();
  const s = inner as unknown as NodeJS.WriteStream & {
    chunks: string[];
    showCursorWhileDead: number;
    disableKittyWhileDead: number;
    hardDestroy(): void;
  };
  let dead = false;
  s.chunks = [];
  s.showCursorWhileDead = 0;
  s.disableKittyWhileDead = 0;
  inner.on("data", (chunk: Buffer) => s.chunks.push(chunk.toString()));

  const realWrite = inner.write.bind(inner);
  s.write = ((data: string | Uint8Array, ...rest: unknown[]) => {
    const str = String(data);
    if (dead && (str.includes(SHOW_CURSOR) || str.includes(DISABLE_KITTY))) {
      // The bug: a restore-escape write attempted on a destroyed stream. In a
      // real terminal this throws ERR_STREAM_DESTROYED; reproduce that here.
      if (str.includes(SHOW_CURSOR)) s.showCursorWhileDead++;
      if (str.includes(DISABLE_KITTY)) s.disableKittyWhileDead++;
      const err = new Error("write after destroy") as NodeJS.ErrnoException;
      err.code = "ERR_STREAM_DESTROYED";
      throw err;
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (realWrite as any)(str, ...rest);
  }) as NodeJS.WriteStream["write"];

  s.hardDestroy = () => {
    dead = true;
    inner.destroy();
  };

  Object.assign(s, { columns: 80, rows: 24, isTTY: true });
  return s;
}

function makeFakeStdin(): NodeJS.ReadStream {
  const s = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(s, {
    isTTY: true,
    setRawMode() {
      return s;
    },
    setEncoding() {
      return s;
    },
  });
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (s as any).ref = () => {};
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (s as any).unref = () => {};
  return s;
}

const CursorApp = defineComponent(() => {
  // useCursor makes the frame writer carry a live cursor, but the show-cursor
  // restore at done() fires for ANY interactive app — the cursor was hidden at
  // mount and the frame writer's done() shows it again on teardown.
  useCursor();
  return () => <Text>cursor</Text>;
});

const PlainApp = defineComponent(() => () => <Text>plain</Text>);
const InputApp = defineComponent(() => {
  useInput(() => {});
  return () => <Text>plain</Text>;
});

describe("teardown stdout writes on destroyed stdout", () => {
  test("teardown skips the show-cursor write (frame writer done) when stdout was destroyed", async () => {
    const stdout = makeRecordingTtyStream();
    const stderr = makeRecordingTtyStream();
    const stdin = makeFakeStdin();

    const app = createApp(PlainApp);
    app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });

    // Let the initial render settle (cursor hidden at mount).
    await new Promise<void>((r) => setTimeout(r, 60));
    expect(stdout.chunks.join("")).toContain("\x1b[?25l");

    // Terminal torn down underneath us BEFORE teardown. isTTY stays truthy.
    stdout.hardDestroy();

    // Teardown must not even ATTEMPT the show-cursor write on a dead stdout
    // (via mountedWriter.done() -> log-update showCursor), and must not throw.
    expect(() => app.unmount()).not.toThrow();
    expect(
      stdout.showCursorWhileDead,
      "no show-cursor (\\x1b[?25h) write may be attempted on a destroyed stdout",
    ).toBe(0);
  });

  test("teardown skips the show-cursor write for a useCursor app when stdout was destroyed", async () => {
    const stdout = makeRecordingTtyStream();
    const stderr = makeRecordingTtyStream();
    const stdin = makeFakeStdin();

    const app = createApp(CursorApp);
    app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });

    await new Promise<void>((r) => setTimeout(r, 60));
    stdout.hardDestroy();

    expect(() => app.unmount()).not.toThrow();
    expect(stdout.showCursorWhileDead).toBe(0);
  });

  test("teardown skips the disable-kitty write when stdout was destroyed", async () => {
    const stdout = makeRecordingTtyStream();
    const stderr = makeRecordingTtyStream();
    const stdin = makeFakeStdin();

    const app = createApp(InputApp);
    app.mount({
      stdout,
      stdin,
      stderr,
      exitOnCtrlC: false,
      // Force kitty enabled so dispose() attempts the disable-kitty escape.
      kittyKeyboard: { mode: "enabled" },
    });

    await new Promise<void>((r) => setTimeout(r, 60));
    // Kitty enable escape should have gone out on the live stream.
    expect(stdout.chunks.join("")).toContain("\x1b[>");

    stdout.hardDestroy();

    expect(() => app.unmount()).not.toThrow();
    expect(
      stdout.disableKittyWhileDead,
      "no disable-kitty (\\x1b[<u) write may be attempted on a destroyed stdout",
    ).toBe(0);
  });

  test("live stdout still receives the show-cursor escape at teardown", async () => {
    const stdout = makeRecordingTtyStream();
    const stderr = makeRecordingTtyStream();
    const stdin = makeFakeStdin();

    const app = createApp(PlainApp);
    app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });

    await new Promise<void>((r) => setTimeout(r, 60));

    // Do NOT destroy: a live stdout must still get the cursor restored.
    app.unmount();
    await nextTick();

    expect(stdout.chunks.join("")).toContain(SHOW_CURSOR);
  });

  test("live stdout still receives the disable-kitty escape at teardown", async () => {
    const stdout = makeRecordingTtyStream();
    const stderr = makeRecordingTtyStream();
    const stdin = makeFakeStdin();

    const app = createApp(InputApp);
    app.mount({
      stdout,
      stdin,
      stderr,
      exitOnCtrlC: false,
      kittyKeyboard: { mode: "enabled" },
    });

    await new Promise<void>((r) => setTimeout(r, 60));

    app.unmount();
    await nextTick();

    expect(stdout.chunks.join("")).toContain(DISABLE_KITTY);
  });
});
