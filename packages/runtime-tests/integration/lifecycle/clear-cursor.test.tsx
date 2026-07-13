// app.clear() must wipe only the owned rendered output and leave the terminal
// caret HIDDEN. The original bug: vue-tui's clear() re-seated the
// persistent cursor (reposition + show) on the now-blank screen, so the caret
// floated on a wiped frame. clear() erases WITHOUT redrawing, so re-asserting
// the caret there is wrong; the persistent-declaration only applies to real
// commits/restores (which DO redraw the content).
//
// This is observable only at the interactive stream level: the @vue-tui/testing
// lastFrame() observes renderer output and never sees output-writer cursor
// escapes (\x1b[?25h / \x1b[?25l / reposition). So we mount a REAL interactive TTY (isTTY:true,
// liveUpdates:true), capture the raw stdout write chunks (Ink's getWriteCalls
// pattern), and assert the byte-level cursor sequences.
//
// The first-clear cursor behavior was cross-checked against Ink v7.0.4. F1.6
// deliberately diverges after that erase by forgetting the physical baseline,
// so repeated clear cannot reach pre-app history. ansiEscapes.cursorTo(x) is a
// 1-based column move `\x1b[${x+1}G`, and cursorTo(0) is the bare `\x1b[G`.
import { PassThrough } from "node:stream";
import { defineComponent, h, nextTick, shallowRef, type ComponentPublicInstance } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { Box, Text, createApp, useCaret, useFocus, useStdout } from "@vue-tui/runtime";

const SHOW = "\x1b[?25h";
const HIDE = "\x1b[?25l";

function makeTtyStdout(): { stream: NodeJS.WriteStream; writes: string[] } {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  // columns:40 to match the Ink ground-truth capture geometry.
  Object.assign(stream, { isTTY: true, columns: 40, rows: 10 });
  const writes: string[] = [];
  const original = stream.write.bind(stream);
  stream.write = ((...args: unknown[]) => {
    writes.push(String(args[0]));
    return (original as (...a: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];
  return { stream, writes };
}

function makeTtyStdin(): NodeJS.ReadStream {
  const s = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(s, {
    isTTY: true,
    setRawMode(this: NodeJS.ReadStream) {
      return this;
    },
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
  });
  (s as unknown as { ref: () => void }).ref = () => {};
  (s as unknown as { unref: () => void }).unref = () => {};
  return s;
}

function makeTtyStderr(): NodeJS.WriteStream {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, { isTTY: true, columns: 40, rows: 10 });
  return stream;
}

// maxFps:0 makes commits immediate (no ~34ms throttle), so each frame is
// flushed synchronously through log-update via waitUntilRenderFlush().
function mountOpts(stdout: NodeJS.WriteStream) {
  return {
    stdout,
    stdin: makeTtyStdin(),
    stderr: makeTtyStderr(),
    liveUpdates: true,
    maxFps: 0,
    patchConsole: false,
  };
}

function useFocusedCaret(position: { readonly x: number; readonly y: number }) {
  const target = shallowRef<ComponentPublicInstance | null>(null);
  const focus = useFocus(target, { autoFocus: true, tabIndex: -1 });
  useCaret(target, { focus, position });
  return target;
}

describe("app.clear() cursor parity (interactive stream level)", () => {
  test("S1: clear() with an active cursor leaves the caret HIDDEN (no show, no reposition)", async () => {
    // Ink v7.0.4 CLEAR_BYTES:
    //   "\x1b[?25l\x1b[1B\x1b[1G\x1b[2K\x1b[1A\x1b[2K\x1b[G"
    // -> hide + return-to-bottom + erase the 2 lines, NO show, NO reposition.
    const { stream: stdout, writes } = makeTtyStdout();
    const App = defineComponent(() => {
      const target = useFocusedCaret({ x: 5, y: 0 });
      return () => h(Text, { ref: target }, () => "Hello");
    });

    const app = createApp(App);
    app.mount(mountOpts(stdout));
    await app.waitUntilRenderFlush();

    const before = writes.length;
    app.clear();
    const clearBytes = writes.slice(before).join("");

    // The core assertion: clear() must NOT show the cursor and must NOT
    // reposition it. Re-showing it would float the caret on the wiped screen.
    expect(clearBytes).not.toContain(SHOW);
    // No reposition (cursorTo(5) -> "\x1b[6G") after the erase.
    expect(clearBytes).not.toContain("\x1b[6G");
    // It DOES still hide + erase (Ink emits the hide via the return-to-bottom
    // prefix, which begins with HIDE because the cursor was shown).
    expect(clearBytes).toContain(HIDE);
    expect(clearBytes).toContain("\x1b[2K");
    // Byte-exact match to the Ink ground-truth capture.
    expect(clearBytes).toBe("\x1b[?25l\x1b[1B\x1b[1G\x1b[2K\x1b[1A\x1b[2K\x1b[G");

    app.unmount();
  });

  test("S2: clear() with NO cursor ever declared erases only (no hide, no show)", async () => {
    // Ink v7.0.4 CLEAR_BYTES: "\x1b[2K\x1b[1A\x1b[2K\x1b[G" (erase only).
    const { stream: stdout, writes } = makeTtyStdout();
    const App = defineComponent(() => () => h(Text, null, () => "Hello"));

    const app = createApp(App);
    app.mount(mountOpts(stdout));
    await app.waitUntilRenderFlush();

    const before = writes.length;
    app.clear();
    const clearBytes = writes.slice(before).join("");

    expect(clearBytes).not.toContain(SHOW);
    expect(clearBytes).not.toContain(HIDE);
    expect(clearBytes).toBe("\x1b[2K\x1b[1A\x1b[2K\x1b[G");

    app.unmount();
  });

  test("S3: clear() then a reactive update brings the caret BACK (declared position not lost)", async () => {
    // Ink v7.0.4: clear() emits no show; the subsequent rerender DELTA re-shows
    // the caret (hasShow=true). The clear() hides for now; the next real commit
    // re-asserts the persistent declaration and shows it again.
    const { stream: stdout, writes } = makeTtyStdout();
    const text = shallowRef("Hello");
    const App = defineComponent(() => {
      const target = useFocusedCaret({ x: 3, y: 0 });
      return () => h(Text, { ref: target }, () => text.value);
    });

    const app = createApp(App);
    app.mount(mountOpts(stdout));
    await app.waitUntilRenderFlush();

    const beforeClear = writes.length;
    app.clear();
    const clearBytes = writes.slice(beforeClear).join("");
    // clear() does not show the caret.
    expect(clearBytes).not.toContain(SHOW);

    const beforeRerender = writes.length;
    text.value = "World";
    await nextTick();
    await app.waitUntilRenderFlush();
    const rerenderBytes = writes.slice(beforeRerender).join("");

    // The caret comes back on the next commit: the new content is drawn and the
    // cursor is re-shown at the still-declared position (x=3 -> cursorTo(3) ->
    // "\x1b[4G").
    expect(rerenderBytes).toContain("World");
    expect(rerenderBytes).toContain(SHOW);
    expect(rerenderBytes).toContain("\x1b[4G");

    app.unmount();
  });

  test("S4: clear() with multi-line output and a cursor on a non-first line stays HIDDEN", async () => {
    // Ink v7.0.4 CLEAR_BYTES:
    //   "\x1b[?25l\x1b[2B\x1b[1G\x1b[2K\x1b[1A\x1b[2K\x1b[1A\x1b[2K\x1b[1A\x1b[2K\x1b[G"
    // -> hide + return-to-bottom (down 2) + erase 4 lines, NO show, NO reposition.
    const { stream: stdout, writes } = makeTtyStdout();
    const App = defineComponent(() => {
      const target = useFocusedCaret({ x: 2, y: 0 });
      return () =>
        h(Box, { flexDirection: "column" }, () => [
          h(Text, null, () => "Line1"),
          h(Text, { ref: target }, () => "Line2"),
          h(Text, null, () => "Line3"),
        ]);
    });

    const app = createApp(App);
    app.mount(mountOpts(stdout));
    await app.waitUntilRenderFlush();

    const before = writes.length;
    app.clear();
    const clearBytes = writes.slice(before).join("");

    expect(clearBytes).not.toContain(SHOW);
    // No reposition (cursorTo(2) -> "\x1b[3G") after erase.
    expect(clearBytes).not.toContain("\x1b[3G");
    expect(clearBytes).toContain(HIDE);
    expect(clearBytes).toBe(
      "\x1b[?25l\x1b[2B\x1b[1G\x1b[2K\x1b[1A\x1b[2K\x1b[1A\x1b[2K\x1b[1A\x1b[2K\x1b[G",
    );

    app.unmount();
  });

  test("S5: clear() with the cursor at {x:0,y:0} stays HIDDEN (no reposition, no show)", async () => {
    // Ink v7.0.4 CLEAR_BYTES:
    //   "\x1b[?25l\x1b[1B\x1b[1G\x1b[2K\x1b[1A\x1b[2K\x1b[G"
    // -> identical to S1 (the cursor x/y only affect the SHOW path, which is
    // suppressed here). The buggy code added "\x1b[1A\x1b[1G\x1b[?25h".
    const { stream: stdout, writes } = makeTtyStdout();
    const App = defineComponent(() => {
      const target = useFocusedCaret({ x: 0, y: 0 });
      return () => h(Text, { ref: target }, () => "Hello");
    });

    const app = createApp(App);
    app.mount(mountOpts(stdout));
    await app.waitUntilRenderFlush();

    const before = writes.length;
    app.clear();
    const clearBytes = writes.slice(before).join("");

    expect(clearBytes).not.toContain(SHOW);
    expect(clearBytes).toBe("\x1b[?25l\x1b[1B\x1b[1G\x1b[2K\x1b[1A\x1b[2K\x1b[G");

    app.unmount();
  });

  test("S6: two clear() calls in a row — the second emits no bytes", async () => {
    // The first clear erases the owned frame and forgets its physical baseline.
    // Replaying the old line count on a second clear would walk upward from the
    // now-blank region and erase terminal history that predates the app.
    const { stream: stdout, writes } = makeTtyStdout();
    const App = defineComponent(() => {
      const target = useFocusedCaret({ x: 5, y: 0 });
      return () => h(Text, { ref: target }, () => "Hello");
    });

    const app = createApp(App);
    app.mount(mountOpts(stdout));
    await app.waitUntilRenderFlush();

    const before1 = writes.length;
    app.clear();
    const first = writes.slice(before1).join("");

    const before2 = writes.length;
    app.clear();
    const second = writes.slice(before2).join("");

    expect(first).toBe("\x1b[?25l\x1b[1B\x1b[1G\x1b[2K\x1b[1A\x1b[2K\x1b[G");
    expect(second).not.toContain(SHOW);
    expect(second).not.toContain(HIDE);
    expect(second).toBe("");

    app.unmount();
  });

  test("S7: clear() after the cursor owner unmounted (declaration cleared) erases only", async () => {
    // Ink v7.0.4 CLEAR_BYTES: "\x1b[2K\x1b[1A\x1b[2K\x1b[G" (erase only): the
    // owner's onScopeDispose set the cursor to undefined, so the prior commit
    // already hid it; clear() just erases.
    const { stream: stdout, writes } = makeTtyStdout();
    const showChild = shallowRef(true);
    const Child = defineComponent(() => {
      const target = useFocusedCaret({ x: 5, y: 0 });
      return () => h(Text, { ref: target }, () => "child");
    });
    const App = defineComponent(
      () => () => (showChild.value ? h(Child) : h(Text, null, () => "no cursor")),
    );

    const app = createApp(App);
    app.mount(mountOpts(stdout));
    await app.waitUntilRenderFlush();

    showChild.value = false;
    await nextTick();
    await app.waitUntilRenderFlush();

    const before = writes.length;
    app.clear();
    const clearBytes = writes.slice(before).join("");

    expect(clearBytes).not.toContain(SHOW);
    expect(clearBytes).not.toContain(HIDE);
    expect(clearBytes).toBe("\x1b[2K\x1b[1A\x1b[2K\x1b[G");

    app.unmount();
  });

  test("S8a: clear() in non-interactive mode is a no-op (no bytes)", async () => {
    // Ink no-ops a non-interactive clear() (ink.js:619 `if (this.interactive ...`).
    const { stream: stdout, writes } = makeTtyStdout();
    const App = defineComponent(() => {
      const target = useFocusedCaret({ x: 5, y: 0 });
      return () => h(Text, { ref: target }, () => "Hello");
    });

    const app = createApp(App);
    app.mount({
      stdout,
      stdin: makeTtyStdin(),
      stderr: makeTtyStderr(),
      liveUpdates: false,
      patchConsole: false,
    });
    await app.waitUntilRenderFlush();

    const before = writes.length;
    app.clear();
    expect(writes.slice(before).join("")).toBe("");

    app.unmount();
  });

  test("S9: the external-write restore path still SHOWS the caret (the fix must not touch it)", async () => {
    // Ink v7.0.4 WRITE_BYTES (external useStdout().write): the restore re-shows
    // the cursor (hasShow=true). restoreLastOutput() explicitly re-seats the
    // cursor and REDRAWS the content, so the caret SHOULD be shown there — unlike
    // clear(), which erases without redraw. This guards that the fix is scoped to
    // the clear() path only.
    const { stream: stdout, writes } = makeTtyStdout();
    let writeFn: ((data: string) => void) | undefined;
    const App = defineComponent(() => {
      const target = useFocusedCaret({ x: 2, y: 0 });
      const { write } = useStdout();
      writeFn = write;
      return () => h(Text, { ref: target }, () => "Hello");
    });

    const app = createApp(App);
    app.mount(mountOpts(stdout));
    await app.waitUntilRenderFlush();

    const before = writes.length;
    writeFn?.("external write\n");
    await app.waitUntilRenderFlush();
    const writeBytes = writes.slice(before).join("");

    // The content is redrawn AND the cursor is re-shown at x=2 (cursorTo(2) ->
    // "\x1b[3G"). This path REDRAWS, so showing the caret is correct.
    expect(writeBytes).toContain("Hello");
    expect(writeBytes).toContain(SHOW);
    expect(writeBytes).toContain("\x1b[3G");
    // The LAST visibility change is a SHOW (the caret ends up visible).
    expect(writeBytes.lastIndexOf(SHOW)).toBeGreaterThan(writeBytes.lastIndexOf(HIDE));

    app.unmount();
  });

  test("S10: clear() then a resize repaints and re-shows the caret", async () => {
    // After clear() the screen is blank and the caret hidden; a resize triggers
    // a synchronous repaint (Ink-aligned) that redraws the content and re-shows
    // the persistent caret. clear() did not lose the declared position.
    const { stream: stdout, writes } = makeTtyStdout();
    const App = defineComponent(() => {
      const target = useFocusedCaret({ x: 4, y: 0 });
      return () => h(Text, { ref: target }, () => "Hello");
    });

    const app = createApp(App);
    app.mount(mountOpts(stdout));
    await app.waitUntilRenderFlush();

    app.clear();

    const beforeResize = writes.length;
    // A resize event drives a synchronous commit (render.ts onResize).
    Object.assign(stdout, { columns: 30 });
    (stdout as unknown as PassThrough).emit("resize");
    await app.waitUntilRenderFlush();
    const resizeBytes = writes.slice(beforeResize).join("");

    // The repaint redraws the content and re-shows the caret at x=4
    // (cursorTo(4) -> "\x1b[5G").
    expect(resizeBytes).toContain("Hello");
    expect(resizeBytes).toContain(SHOW);
    expect(resizeBytes).toContain("\x1b[5G");

    app.unmount();
  });
});
