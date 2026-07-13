// Forced-interactive + NON-TTY stdout must emit NO cursor hide/show escapes,
// matching Ink. Ink routes every cursor hide/show through `cli-cursor`, which
// short-circuits `if (!stream.isTTY) return` (cli-cursor/index.js:8-24), and
// its mount-hide is alt-screen-only (also isTTY-gated). So when a caller forces
// `liveUpdates: true` onto a piped, non-TTY stdout (isTTY false), Ink writes
// neither `\x1b[?25l` nor `\x1b[?25h`. vue must do the same: the cursor-control
// writes are a TTY concern, and forcing interactive must not leak them to a pipe.
import { defineComponent, type ComponentPublicInstance, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import {
  createApp,
  Text,
  useCaret,
  useFocus,
  type TuiApp,
  type UseCaretReturn,
} from "@vue-tui/runtime";
import { INTERNAL_SUSPENSION_HOST, createManualSuspensionHost } from "@vue-tui/runtime/internal";
import { PassThrough } from "node:stream";

const hideCursorEscape = "\x1b[?25l";
const showCursorEscape = "\x1b[?25h";

function makeNonTtyStdout() {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream & { chunks: string[] };
  // isTTY explicitly false: a piped/redirected stdout the caller forced into
  // interactive mode. columns/rows still provided so layout has a width.
  Object.assign(stream, { isTTY: false, columns: 80, rows: 24 });
  stream.chunks = [];
  (stream as unknown as PassThrough).on("data", (chunk: Buffer) =>
    stream.chunks.push(chunk.toString()),
  );
  return stream;
}

function makeTtyStream() {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream & { chunks: string[] };
  Object.assign(stream, { isTTY: true, columns: 80, rows: 24 });
  stream.chunks = [];
  (stream as unknown as PassThrough).on("data", (chunk: Buffer) =>
    stream.chunks.push(chunk.toString()),
  );
  return stream;
}

function makeFakeStdin(): NodeJS.ReadStream {
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdin, {
    isTTY: true,
    setRawMode() {
      return stdin;
    },
    setEncoding() {
      return stdin;
    },
    ref() {},
    unref() {},
  });
  return stdin;
}

test.each([false, true])(
  "forced live non-TTY stdout emits no targeted-caret controls with incrementalRendering=%s",
  async (incrementalRendering) => {
    const stdout = makeNonTtyStdout();
    const stdin = makeFakeStdin();
    const suspensionHost = createManualSuspensionHost();

    let caret!: UseCaretReturn;
    const App = defineComponent(() => {
      const target = shallowRef<ComponentPublicInstance | null>(null);
      const focus = useFocus(target, { autoFocus: true });
      caret = useCaret(target, { focus, position: { x: 2, y: 0 } });
      return () => <Text ref={target}>hello</Text>;
    });

    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      stderr: makeTtyStream(),
      liveUpdates: true,
      incrementalRendering,
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as Parameters<TuiApp["mount"]>[0]);
    await app.waitUntilRenderFlush();

    const afterMount = stdout.chunks.join("");
    expect(afterMount).toContain("hello");
    expect(caret.state.value).toEqual({ status: "unavailable" });
    // Ink emits no hide on mount for a non-TTY stdout (cli-cursor short-circuit).
    expect(afterMount).not.toContain(hideCursorEscape);

    await suspensionHost.suspend();
    expect(caret.state.value).toEqual({ status: "unavailable" });
    const afterSuspend = stdout.chunks.join("");
    expect(afterSuspend).not.toContain(hideCursorEscape);
    expect(afterSuspend).not.toContain(showCursorEscape);
    expect(afterSuspend).not.toMatch(/\x1b\[[0-9;]*[ABCDEFGH]/);

    await suspensionHost.resume();
    await app.waitUntilRenderFlush();
    expect(caret.state.value).toEqual({ status: "unavailable" });
    const afterResume = stdout.chunks.join("");
    expect(afterResume).not.toContain(hideCursorEscape);
    expect(afterResume).not.toContain(showCursorEscape);
    expect(afterResume).not.toMatch(/\x1b\[[0-9;]*[ABCDEFGH]/);

    const exited = app.waitUntilExit();
    app.unmount();
    await exited;

    const afterUnmount = stdout.chunks.join("");
    // ...and no show on teardown either.
    expect(afterUnmount).not.toContain(hideCursorEscape);
    expect(afterUnmount).not.toContain(showCursorEscape);
    // Targeted-caret positioning itself is part of this contract, not just hide/show.
    expect(afterUnmount).not.toMatch(/\x1b\[[0-9;]*[ABCDEFGH]/);
  },
);
