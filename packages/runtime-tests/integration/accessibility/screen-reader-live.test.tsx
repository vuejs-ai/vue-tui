import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import ansiEscapes from "ansi-escapes";
import { Box, createApp, Text } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import {
  makeFakeStdin,
  makeFakeWritable,
  captureWrites,
  getContentWrites,
} from "../lifecycle/test-streams.ts";

// G03 (Ink parity): the LIVE commit path must branch on isScreenReaderEnabled
// and emit the flat, linearized screen-reader text (via renderScreenReaderOutput),
// NOT the 2D grid produced by paint() — which would include border glyphs.

test.sequential("live commit path emits linear screen-reader text (no border glyphs) when SR enabled", async () => {
  const App = defineComponent(() => {
    return () => (
      <Box borderStyle="round">
        <Text>Hello world</Text>
      </Box>
    );
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({
    stdout,
    stdin,
    stderr,
    isScreenReaderEnabled: true,
  });

  await nextTick();
  await nextTick();

  const content = getContentWrites(writes).join("");

  // The flat text content must be present.
  expect(content).toContain("Hello world");

  // Border / box-drawing glyphs must NOT appear — SR mode linearizes the tree.
  const borderGlyphs = ["╭", "╮", "╰", "╯", "─", "│"];
  for (const glyph of borderGlyphs) {
    expect(content).not.toContain(glyph);
  }

  app.unmount();
});

test.sequential("forced live screen-reader output updates a non-TTY without alternate screen", async () => {
  const label = shallowRef("first-linear-frame");
  const App = defineComponent(() => () => <Text>{label.value}</Text>);

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80, rows: 24 });
  const stderr = makeFakeWritable({ columns: 80, rows: 24 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);
  (stdout as unknown as { isTTY: boolean }).isTTY = false;

  app.mount({
    stdout,
    stdin,
    stderr,
    liveUpdates: true,
    mode: "fullscreen",
    isScreenReaderEnabled: true,
  });

  await nextTick();
  await app.waitUntilRenderFlush();
  expect(getContentWrites(writes).join("")).toContain("first-linear-frame");
  expect(writes.join("")).not.toContain(ansiEscapes.enterAlternativeScreen);

  writes.length = 0;
  label.value = "second-linear-frame";
  await nextTick();
  await app.waitUntilRenderFlush();

  const liveUpdate = writes.join("");
  expect(liveUpdate).toContain(ansiEscapes.eraseLines(1));
  expect(getContentWrites(writes).join("")).toContain("second-linear-frame");
  expect(liveUpdate).not.toContain(ansiEscapes.enterAlternativeScreen);

  app.unmount();
  await app.waitUntilExit();
  expect(writes.join("")).not.toContain(ansiEscapes.exitAlternativeScreen);
});

test.sequential("live commit path WITHOUT SR still emits 2D grid with border glyphs (contrast)", async () => {
  const App = defineComponent(() => {
    return () => (
      <Box borderStyle="round">
        <Text>Hello world</Text>
      </Box>
    );
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({
    stdout,
    stdin,
    stderr,
  });

  await nextTick();
  await nextTick();

  const content = getContentWrites(writes).join("");
  expect(content).toContain("Hello world");
  // Non-SR path renders the visual frame, which DOES contain border glyphs.
  expect(content).toContain("─");

  app.unmount();
});

// G17 edge (a) (Ink parity): the LIVE static channel must ALSO linearize in SR
// mode. The dynamic frame already excludes <Static> (skipStaticElements:true),
// but commit() flushes statics separately — and previously via the 2D grid
// painter (paintIsolated), so a bordered static item leaked box glyphs even in
// SR mode. Ink linearizes static too: renderer.ts renders node.staticNode via
// renderNodeToScreenReaderOutput({ skipStaticElements:false }).
test.sequential("live static channel emits linear screen-reader text (no border glyphs) when SR enabled", async () => {
  const App = defineComponent(() => {
    return () => (
      <Box flexDirection="column">
        <Static>
          <Box borderStyle="round">
            <Text>Logged in</Text>
          </Box>
        </Static>
        <Text>Live</Text>
      </Box>
    );
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({
    stdout,
    stdin,
    stderr,
    isScreenReaderEnabled: true,
  });

  await nextTick();
  await nextTick();

  const content = getContentWrites(writes).join("");

  // The flat static text content must be present.
  expect(content).toContain("Logged in");

  // Border / box-drawing glyphs must NOT appear — the static channel must
  // linearize the bordered Box in SR mode just like the dynamic frame.
  const borderGlyphs = ["╭", "╮", "╰", "╯", "─", "│"];
  for (const glyph of borderGlyphs) {
    expect(content).not.toContain(glyph);
  }

  app.unmount();
});

// G17 edge (b) (Ink parity): an EMPTY SR frame must not write a spurious blank
// trailing line. Ink's SR path writes the wrapped output directly with
// lastOutputToRender = wrappedOutput (NO appended "\n"), and an empty frame is
// "" → height 0, so nothing is emitted (ink.tsx:599-621). The normal frame
// writer appends "\n" even for empty frames, which would leak a blank line.
test.sequential("empty SR frame does not write a spurious blank trailing line", async () => {
  const App = defineComponent(() => {
    // A Box with no visible text produces an empty linearized SR frame.
    return () => <Box />;
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({
    stdout,
    stdin,
    stderr,
    isScreenReaderEnabled: true,
  });

  await nextTick();
  await nextTick();

  const content = getContentWrites(writes).join("");

  // An empty SR frame must not produce any newline-only / blank write. The
  // non-empty case appends a newline via the frame writer; the empty case
  // must produce zero output lines (Ink: wrappedOutput === "" writes nothing).
  expect(content).not.toContain("\n");
  expect(content).toBe("");

  app.unmount();
});

// G46 (Ink parity): a NON-empty multi-line SR frame must be written verbatim
// with NO appended trailing newline, matching Ink's SR branch (ink.tsx:617-621):
// stdout.write(erase + wrappedOutput); lastOutputToRender = wrappedOutput (no
// "\n"); lastOutputHeight = wrappedOutput.split("\n").length. G17 only handled
// the empty case, so a 2-line frame "Line one\nLine two" got a spurious "\n"
// appended — parking the cursor on a blank line below content AND making every
// subsequent multi-line SR frame erase N+1 lines instead of N (off-by-one).
test.sequential("non-empty multi-line SR frame appends no trailing newline and erases exactly N lines", async () => {
  const labels = shallowRef<[string, string]>(["Line one", "Line two"]);
  const App = defineComponent(() => {
    return () => (
      <Box flexDirection="column">
        <Text>{labels.value[0]}</Text>
        <Text>{labels.value[1]}</Text>
      </Box>
    );
  });

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({
    stdout,
    stdin,
    stderr,
    isScreenReaderEnabled: true,
  });

  await nextTick();
  await nextTick();

  const firstContent = getContentWrites(writes).join("");

  // (a) The first SR frame must end exactly at the last content line — no
  // spurious trailing newline below "Line two".
  expect(firstContent).toContain("Line one\nLine two");
  expect(firstContent.endsWith("Line two")).toBe(true);
  expect(firstContent.endsWith("Line two\n")).toBe(false);

  // Reactive update to a second multi-line frame.
  writes.length = 0;
  labels.value = ["Line three", "Line four"];
  await nextTick();
  await nextTick();

  const secondRaw = writes.join("");

  // (b) The erase for the previous 2-line frame must be exactly eraseLines(2),
  // NOT eraseLines(3) (the off-by-one caused by the spurious trailing newline).
  expect(secondRaw).toContain(ansiEscapes.eraseLines(2));
  expect(secondRaw).not.toContain(ansiEscapes.eraseLines(3));

  // And the second frame is itself written verbatim with no trailing newline.
  const secondContent = getContentWrites(writes).join("");
  expect(secondContent.endsWith("Line four")).toBe(true);
  expect(secondContent.endsWith("Line four\n")).toBe(false);

  app.unmount();
});

// G59 (Ink parity): a TALL/overflowing SR transcript must NEVER clear the
// terminal, replay accumulated <Static> history, or hide the cursor. Ink's
// onRender SR branch (ink.tsx:573-625) writes the wrapped transcript with a raw
// `stdout.write(eraseLines(prev) + wrappedOutput)` and RETURNS before reaching
// the normal interactive frame path — so it never emits ansiEscapes.clearTerminal,
// never accumulates/replays fullStaticOutput, never routes through log-update,
// and (because SR mounts leave the cursor visible) never writes \x1b[?25l.
//
// vue-tui previously routed SR through renderInteractiveFrame, so a transcript
// taller than the viewport (outputHeight >= viewportRows on frame 1, then
// previousOutputHeight > viewportRows on frame 2 = wasOverflowing) hit the
// clearTerminal branch — wiping the SR user's scrollback. The fake TTY here is 2
// rows tall and the transcript is 4 lines, so the OLD code would clear on the
// second commit.
test.sequential("tall/overflowing SR transcript never clears terminal, replays static, or hides cursor", async () => {
  const tick = shallowRef(0);
  const App = defineComponent(() => {
    return () => (
      <Box flexDirection="column">
        <Static>
          <Text>History line</Text>
        </Static>
        <Text>Alpha {tick.value}</Text>
        <Text>Bravo</Text>
        <Text>Charlie</Text>
        <Text>Delta</Text>
      </Box>
    );
  });

  const app = createApp(App);
  // Viewport of only 2 rows: the 4-line transcript overflows it, so the buggy
  // code took the clearTerminal branch on the second commit.
  const stdout = makeFakeWritable({ columns: 80, rows: 2 });
  const stderr = makeFakeWritable({ columns: 80, rows: 2 });
  const { stream: stdin } = makeFakeStdin();
  const writes = captureWrites(stdout);

  app.mount({
    stdout,
    stdin,
    stderr,
    isScreenReaderEnabled: true,
  });

  await nextTick();
  await nextTick();

  // Drive a second commit so the overflowing-previous-frame branch would fire.
  tick.value = 1;
  await nextTick();
  await nextTick();

  const raw = writes.join("");

  // (1) The SR transcript must be present.
  expect(raw).toContain("Alpha");
  expect(raw).toContain("Delta");

  // (2) NEVER clear the terminal in SR mode.
  expect(raw).not.toContain(ansiEscapes.clearTerminal);

  // (3) NEVER hide the cursor in SR mode (no mount-time \x1b[?25l).
  expect(raw).not.toContain("\x1b[?25l");

  // (4) The accumulated <Static> history must NOT be replayed: "History line"
  // is written exactly once (by the static channel), never a second time as
  // part of a clearTerminal + fullStaticOutput replay.
  const historyOccurrences = raw.split("History line").length - 1;
  expect(historyOccurrences).toBe(1);

  // (5) Subsequent SR frames erase via eraseLines (raw stdout.write), not via a
  // clearTerminal/log-update repaint.
  expect(raw).toContain(ansiEscapes.eraseLines(4));

  app.unmount();
});
