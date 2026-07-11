// When an app LEAVES fullscreen (a fullscreen frame whose height >= viewport
// shrinks to a non-fullscreen frame), render.ts takes the shouldClear branch:
// it writes `clearTerminal + fullStaticOutput + output` (RAW output, NO trailing
// newline) and then calls `writer.sync(outputToRender)`. But for a
// non-fullscreen frame `outputToRender = output + "\n"`. So the bytes on screen
// have NO trailing newline (the caret rests on the last visible row), while
// writer.sync records a TRAILING-newline state (and a line count off by one).
//
// With an active declared cursor (useCursor → setCursorPosition), sync() then
// emits buildCursorSuffix(..., hasTrailingNewline=true), which places the caret
// one row too HIGH (it moves up from row `visibleLineCount` instead of the real
// `visibleLineCount - 1`), and previousLineCount is off by one so the NEXT
// frame's return-to-bottom / erase is off by one (G46-style residue).
//
// This is the fullscreen→non-fullscreen sibling of #198 (which fixed the
// steady-state fullscreen caret row). Observable only at the interactive stream
// level — @vue-tui/testing lastFrame() observes renderer output and never sees
// output-writer cursor escapes — so we mount a REAL interactive TTY and assert
// the raw bytes.
import { PassThrough } from "node:stream";
import { defineComponent, h, nextTick, shallowRef } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { Box, Text, createApp, useCursor } from "@vue-tui/runtime";
import ansiEscapes from "ansi-escapes";

const SHOW = "\x1b[?25h";

function makeTtyStdout(): { stream: NodeJS.WriteStream; writes: string[] } {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  // rows:10 so a 12-line frame is fullscreen (outputHeight >= viewportRows).
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

// maxFps:0 makes commits immediate (no throttle) so each frame flushes
// synchronously through log-update via waitUntilRenderFlush().
function mountOpts(stdout: NodeJS.WriteStream) {
  return {
    stdout,
    stdin: makeTtyStdin(),
    stderr: makeTtyStderr(),
    liveUpdates: true,
    exitOnCtrlC: false,
    maxFps: 0,
    patchConsole: false,
  };
}

describe("leaving-fullscreen clear path with a declared cursor", () => {
  test("the shrink frame's caret lands on the LAST written row, not one above it", async () => {
    const { stream: stdout, writes } = makeTtyStdout();
    const lineCount = shallowRef(12); // start fullscreen (>= rows:10)

    const App = defineComponent(() => {
      const { setCursorPosition } = useCursor();
      return () => {
        // Cursor at top-left so the row math is unambiguous: the suffix is a
        // pure cursorUp(<rows-to-top>) + cursorTo(0) + show.
        setCursorPosition({ x: 0, y: 0 });
        return h(Box, { flexDirection: "column" }, () =>
          Array.from({ length: lineCount.value }, (_unused, i) =>
            h(Text, { key: i }, () => `Line${i + 1}`),
          ),
        );
      };
    });

    const app = createApp(App);
    app.mount(mountOpts(stdout));
    await app.waitUntilRenderFlush();

    // Now leave fullscreen: shrink 12 -> 3 lines (3 < rows:10).
    const before = writes.length;
    lineCount.value = 3;
    await nextTick();
    await app.waitUntilRenderFlush();
    const shrinkBytes = writes.slice(before).join("");

    // The shrink frame is the clear path: clearTerminal + the 3-line output with
    // NO trailing newline. So after it the real caret sits on the LAST visible
    // row (row index 2 of 3). The declared cursor is {x:0,y:0}, so the suffix
    // must move UP exactly 2 rows: cursorUp(2). The bug recorded a trailing
    // newline, computing the caret basis as row 3 -> cursorUp(3) (one too many),
    // floating the caret one row above the top of the content.
    expect(shrinkBytes).toContain(ansiEscapes.clearTerminal);
    expect(shrinkBytes).toContain(SHOW);
    const upTwo = ansiEscapes.cursorUp(2); // "\x1b[2A"
    const upThree = ansiEscapes.cursorUp(3); // "\x1b[3A"
    expect(shrinkBytes).toContain(upTwo + ansiEscapes.cursorTo(0) + SHOW);
    expect(shrinkBytes).not.toContain(upThree + ansiEscapes.cursorTo(0) + SHOW);
  });

  test("the NEXT frame's erase after leaving fullscreen is eraseLines(N), not (N+1)", async () => {
    const { stream: stdout, writes } = makeTtyStdout();
    const lineCount = shallowRef(12);
    const tag = shallowRef("A");

    const App = defineComponent(() => {
      const { setCursorPosition } = useCursor();
      return () => {
        setCursorPosition({ x: 0, y: 0 });
        return h(Box, { flexDirection: "column" }, () =>
          Array.from({ length: lineCount.value }, (_unused, i) =>
            h(Text, { key: i }, () => `Line${i + 1}-${tag.value}`),
          ),
        );
      };
    });

    const app = createApp(App);
    app.mount(mountOpts(stdout));
    await app.waitUntilRenderFlush();

    // Leave fullscreen: 12 -> 3 lines.
    lineCount.value = 3;
    await nextTick();
    await app.waitUntilRenderFlush();

    // Now a plain content change at 3 lines (NOT a clear). log-update's diff
    // return-to-bottom must measure from the 3-line state actually on screen.
    // If sync recorded previousLineCount=4 (trailing-newline state) the diff
    // walks one row too many.
    const before = writes.length;
    tag.value = "B";
    await nextTick();
    await app.waitUntilRenderFlush();
    const updateBytes = writes.slice(before).join("");

    // The 3-line frame has no trailing newline, so the caret rested on row 2 and
    // the return-to-bottom prefix on the next diff must move DOWN 0 rows from
    // {y:0}? No — it returns from previousCursorPosition.y(0) to bottom row
    // (previousLineCount-1). With the correct state previousLineCount=3 -> bottom
    // row 2 -> cursorDown(2). The buggy state previousLineCount=4 -> cursorDown(3).
    expect(updateBytes).toContain(ansiEscapes.cursorDown(2));
    expect(updateBytes).not.toContain(ansiEscapes.cursorDown(3));

    app.unmount();
  });
});
