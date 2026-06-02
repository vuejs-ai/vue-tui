/**
 * B10 — the bracketed-paste-disable write (`\x1b[?2004l`) must be skipped when
 * stdout is already destroyed/ended at teardown.
 *
 * On teardown, when bracketed paste was active, vue-tui writes the paste-OFF
 * escape to stdout. Those writes were gated ONLY on `stdout.isTTY` — which stays
 * cached-truthy after `destroy()`/`end()` — not on writability. On a teardown
 * where stdout is already gone, the unguarded `.write()` hits a dead stream
 * (ERR_STREAM_DESTROYED / write-after-end). Ink guards the same write on BOTH
 * isTTY AND `!destroyed && !writableEnded` (App.tsx canWriteToStdout,
 * lines 620/633-635).
 *
 * The runtime has two `?2004l` sites — the `setBracketedPasteMode(false)` disable
 * branch (reached at teardown via usePaste's onScopeDispose → detach) and the
 * stdin controller's `dispose()` backstop. Both must skip a dead stdout.
 */
import { PassThrough } from "node:stream";
import { defineComponent } from "vue";
import { describe, test, expect } from "vite-plus/test";
import { createApp, Text, usePaste } from "@vue-tui/runtime";

const PASTE_ON = "\x1b[?2004h";
const PASTE_OFF = "\x1b[?2004l";

// A TTY-ish stdout that mirrors a real terminal torn down underneath us: after
// hardDestroy() `isTTY` stays cached-truthy while the stream is no longer
// writable. It RECORDS every `?2004l` write attempt and whether the stream was
// already dead at the time — so the test asserts the runtime never even ATTEMPTS
// the paste-disable write on a dead stdout (the observable contract), rather than
// relying on whether a particular call site swallows the resulting throw.
function makeRecordingTtyStream(): NodeJS.WriteStream & {
  chunks: string[];
  pasteOffWhileDead: number;
  hardDestroy(): void;
} {
  const inner = new PassThrough();
  const s = inner as unknown as NodeJS.WriteStream & {
    chunks: string[];
    pasteOffWhileDead: number;
    hardDestroy(): void;
  };
  let dead = false;
  s.chunks = [];
  s.pasteOffWhileDead = 0;
  inner.on("data", (chunk: Buffer) => s.chunks.push(chunk.toString()));

  const realWrite = inner.write.bind(inner);
  s.write = ((data: string | Uint8Array, ...rest: unknown[]) => {
    const str = String(data);
    if (dead && str.includes(PASTE_OFF)) {
      // The bug: a paste-disable write attempted on a destroyed stream. In a
      // real terminal this throws ERR_STREAM_DESTROYED; reproduce that here.
      s.pasteOffWhileDead++;
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

const PasteApp = defineComponent(() => {
  usePaste(() => {});
  return () => <Text>paste</Text>;
});

describe("bracketed-paste disable on destroyed stdout", () => {
  test("teardown skips the paste-OFF write when stdout was destroyed while paste mode active", async () => {
    const stdout = makeRecordingTtyStream();
    const stderr = makeRecordingTtyStream();
    const stdin = makeFakeStdin();

    const app = createApp(PasteApp);
    app.mount({ stdout, stdin, stderr, debug: false, exitOnCtrlC: false });

    // Let the initial render + usePaste's attach (enables paste mode, writes
    // \x1b[?2004h) settle.
    await new Promise<void>((r) => setTimeout(r, 60));
    expect(stdout.chunks.join("")).toContain(PASTE_ON);

    // Terminal torn down underneath us BEFORE teardown. isTTY stays truthy.
    stdout.hardDestroy();

    // Teardown must not even ATTEMPT the paste-OFF write on a dead stdout, at
    // either site (usePaste detach + dispose backstop), and must not throw.
    expect(() => app.unmount()).not.toThrow();
    expect(
      stdout.pasteOffWhileDead,
      "no \\x1b[?2004l write may be attempted on a destroyed stdout",
    ).toBe(0);
  });

  test("live stdout still receives the paste-OFF escape at teardown", async () => {
    const stdout = makeRecordingTtyStream();
    const stderr = makeRecordingTtyStream();
    const stdin = makeFakeStdin();

    const app = createApp(PasteApp);
    app.mount({ stdout, stdin, stderr, debug: false, exitOnCtrlC: false });

    await new Promise<void>((r) => setTimeout(r, 60));
    expect(stdout.chunks.join("")).toContain(PASTE_ON);

    // Do NOT destroy: a live stdout must still get the paste-disable escape.
    app.unmount();

    expect(stdout.chunks.join("")).toContain(PASTE_OFF);
  });
});
