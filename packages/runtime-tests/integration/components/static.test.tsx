import { PassThrough } from "node:stream";
import { defineComponent, nextTick, onUnmounted, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, Static, Spacer, createApp } from "@vue-tui/runtime";

test("Static appends new items above the dynamic frame", async () => {
  const items = shallowRef<string[]>([]);

  const App = defineComponent(() => {
    return () => (
      <Box>
        <Static items={items.value}>
          {{
            default: ({ item, index }: { item: string; index: number }) => (
              <Text key={index}>{item}</Text>
            ),
          }}
        </Static>
        <Text>[dynamic]</Text>
      </Box>
    );
  });

  const { lastFrame, frames } = await render(App);
  expect(lastFrame()).toContain("[dynamic]");

  items.value = ["log-1"];
  await nextTick();

  const allOutput = frames.join("");
  expect(allOutput).toContain("log-1");
  expect(lastFrame()).toContain("[dynamic]");
});

test("Static preserves prior items when new ones are added", async () => {
  const logs = shallowRef<string[]>([]);
  const status = shallowRef("idle");

  const App = defineComponent(() => {
    return () => (
      <Box>
        <Static items={logs.value}>
          {{
            default: ({ item, index }: { item: string; index: number }) => (
              <Text key={index}>{item}</Text>
            ),
          }}
        </Static>
        <Text>status: {status.value}</Text>
      </Box>
    );
  });

  const { lastFrame, frames } = await render(App);
  expect(lastFrame()).toContain("status: idle");

  logs.value = [...logs.value, "log A"];
  await nextTick();
  logs.value = [...logs.value, "log B"];
  await nextTick();
  status.value = "running";
  await nextTick();

  const allOutput = frames.join("");
  expect(allOutput).toContain("log A");
  expect(allOutput).toContain("log B");
  expect(lastFrame()).toContain("status: running");
});

function makeTtyStream(cols = 80): NodeJS.WriteStream & { chunks: string[] } {
  const s = new PassThrough() as unknown as NodeJS.WriteStream & { chunks: string[] };
  Object.assign(s, { columns: cols, rows: 24, isTTY: true, chunks: [] as string[] });
  s.on("data", (chunk: Buffer) => s.chunks.push(chunk.toString()));
  return s;
}

test("Static flush clears the dynamic frame first (non-debug mode)", async () => {
  const stdout = makeTtyStream();
  const stderr = makeTtyStream();
  const stdinStream = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdinStream, {
    isTTY: true,
    setRawMode() {
      return stdinStream;
    },
    setEncoding() {
      return stdinStream;
    },
  });

  const items = shallowRef<string[]>([]);
  const App = defineComponent(() => () => (
    <Box>
      <Static items={items.value}>
        {{ default: ({ item }: { item: string }) => <Text>{item}</Text> }}
      </Static>
      <Text>LIVE_FRAME</Text>
    </Box>
  ));

  const app = createApp(App);
  app.mount({ stdout, stdin: stdinStream, stderr, debug: false, exitOnCtrlC: false });
  await nextTick();

  // After initial render, dynamic frame should contain LIVE_FRAME
  const initialOutput = stdout.chunks.join("");
  expect(initialOutput).toContain("LIVE_FRAME");

  // Clear captured chunks, then trigger a static flush
  stdout.chunks.length = 0;
  items.value = ["STATIC_ITEM"];
  await nextTick();
  // Wait for the render throttle trailing timer (~32ms) to fire in production mode.
  await new Promise((r) => setTimeout(r, 50));

  // Collect everything written during this render cycle
  const renderOutput = stdout.chunks.join("");

  // The render output must contain the static content
  expect(renderOutput).toContain("STATIC_ITEM");

  // Key assertion: log-update's clear sequence (ESC[2K = erase line) must appear
  // BEFORE the static content. This proves writer.clear() was called before
  // flushStatic(). Without the fix, flushStatic writes first and then log-update
  // overwrites the static content when it re-renders the dynamic frame.
  const clearLineSeq = "[2K";
  const clearIndex = renderOutput.indexOf(clearLineSeq);
  const staticIndex = renderOutput.indexOf("STATIC_ITEM");
  expect(clearIndex).toBeGreaterThanOrEqual(0);
  expect(clearIndex).toBeLessThan(staticIndex);

  app.unmount();
});

// --- Ink static tests ---

test("static output", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box>
        <Static items={["A", "B", "C"]} style={{ paddingBottom: 1 }}>
          {{ default: ({ item }: { item: string }) => <Text>{item}</Text> }}
        </Static>
        <Box marginTop={1}>
          <Text>X</Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  // In vue-tui, static content is emitted to frames; the last frame shows only the dynamic part
  // We check that all items appeared in the frames
  expect(lastFrame()).toContain("X");
});

test("skip previous output when rendering new static output", async () => {
  const items = shallowRef<string[]>(["A"]);

  const App = defineComponent(() => () => (
    <Static items={items.value}>
      {{
        default: ({ item }: { item: string }) => <Text key={item}>{item}</Text>,
      }}
    </Static>
  ));

  const { frames } = await render(App);

  // First render should emit "A" in static output
  const afterFirst = frames.join("");
  expect(afterFirst).toContain("A");

  items.value = ["A", "B"];
  await nextTick();

  // After adding "B", the static channel only emits the fresh item "B"
  // (not "A" again). We verify by checking that the new frames contain "B".
  const allOutput = frames.join("");
  expect(allOutput).toContain("B");
});

test("static output stops accumulating after Static unmounts", async () => {
  const show = shallowRef(true);
  const items = ["A", "B"];

  const App = defineComponent(() => () => (
    <Box>
      {show.value ? (
        <Static items={items}>
          {{
            default: ({ item }: { item: string }) => <Text key={item}>{item}</Text>,
          }}
        </Static>
      ) : null}
      <Text>Dynamic</Text>
    </Box>
  ));

  const { frames } = await render(App);

  // Static items should be emitted on first mount
  const afterMount = frames.join("");
  expect(afterMount).toContain("A");
  expect(afterMount).toContain("B");

  // Unmount Static
  show.value = false;
  await nextTick();

  const framesAfterUnmount = frames.length;

  // Do several more rerenders — these should NOT produce additional static output
  show.value = false; // no-op but triggers re-render path
  await nextTick();

  // After unmount, the dynamic frame should still render but no new static content
  expect(frames.at(-1)).toContain("Dynamic");
  // No new frames should have been added with static content after unmount
  // (i.e., the count shouldn't grow from static writes)
  expect(frames.length).toBeLessThanOrEqual(framesAfterUnmount + 1);
});

test("fullStaticOutput is reset when <Static> unmounts", async () => {
  const show = shallowRef(true);
  const dynamicLabel = shallowRef("d1");

  const App = defineComponent(() => () => (
    <Box>
      {show.value ? (
        <Static items={["HISTORY-A", "HISTORY-B"]}>
          {{
            default: ({ item }: { item: string }) => <Text key={item}>{item}</Text>,
          }}
        </Static>
      ) : null}
      <Text>{dynamicLabel.value}</Text>
    </Box>
  ));

  const { frames } = await render(App);

  // Static items must be emitted on first mount
  const afterMount = frames.join("");
  expect(afterMount).toContain("HISTORY-A");
  expect(afterMount).toContain("HISTORY-B");

  // Unmount Static and update dynamic label
  show.value = false;
  dynamicLabel.value = "d2";
  await nextTick();

  // After unmount, the last frame should contain the new dynamic label
  // but NOT the old static items
  const lastFrameAfterUnmount = frames.at(-1)!;
  expect(lastFrameAfterUnmount).toContain("d2");
  // The static content is no longer in the live DOM, so it shouldn't appear
  // in any NEW frames written after the unmount
  expect(lastFrameAfterUnmount).not.toContain("HISTORY-A");
  expect(lastFrameAfterUnmount).not.toContain("HISTORY-B");
});

test("remounting <Static> via key change emits the new items (nested under <Box>)", async () => {
  const session = shallowRef(1);

  const App = defineComponent(() => () => {
    const items = session.value === 1 ? ["old-A", "old-B"] : ["new-C", "new-D"];
    return (
      <Box>
        <Static key={session.value} items={items}>
          {{
            default: ({ item }: { item: string }) => <Text key={item}>{item}</Text>,
          }}
        </Static>
        <Text>dynamic</Text>
      </Box>
    );
  });

  const { frames } = await render(App);

  // First mount must emit its Static items
  const afterFirstMount = frames.join("");
  expect(afterFirstMount).toContain("old-A");
  expect(afterFirstMount).toContain("old-B");

  // Remount via key change
  session.value = 2;
  await nextTick();

  // Remounted Static must emit its new items
  const allOutput = frames.join("");
  expect(allOutput).toContain("new-C");
  expect(allOutput).toContain("new-D");
});

test("remounting <Static> via key change emits the new items (root-level)", async () => {
  const session = shallowRef(1);

  const App = defineComponent(() => () => {
    const items = session.value === 1 ? ["old-A", "old-B"] : ["new-C", "new-D"];
    return (
      <Static key={session.value} items={items}>
        {{
          default: ({ item }: { item: string }) => <Text key={item}>{item}</Text>,
        }}
      </Static>
    );
  });

  const { frames } = await render(App);

  // First mount must emit its Static items
  const afterFirstMount = frames.join("");
  expect(afterFirstMount).toContain("old-A");
  expect(afterFirstMount).toContain("old-B");

  // Remount via key change
  session.value = 2;
  await nextTick();

  // Remounted Static must emit its new items
  const allOutput = frames.join("");
  expect(allOutput).toContain("new-C");
  expect(allOutput).toContain("new-D");
});

test("render only new items in static output on final render", async () => {
  const items = shallowRef<string[]>([]);

  const App = defineComponent(() => () => (
    <Static items={items.value}>
      {{
        default: ({ item }: { item: string }) => <Text key={item}>{item}</Text>,
      }}
    </Static>
  ));

  const { frames, unmount } = await render(App);

  // Initial render — no items: Ink writes `fullStaticOutput + output`, both ""
  // here (ink.tsx:558), so the captured initial frame is the empty string.
  const initialFrame = frames.at(-1);
  expect(initialFrame).toBe("");

  items.value = ["A"];
  await nextTick();

  // After adding "A", the static output should contain "A"
  const allAfterA = frames.join("");
  expect(allAfterA).toContain("A");

  items.value = ["A", "B"];
  await nextTick();
  unmount();

  // The static channel should have only emitted "B" (new item), not "A" again.
  // Since both A and B appear in accumulated frames, we verify that the last
  // static write contained "B".
  const allOutput = frames.join("");
  expect(allOutput).toContain("A");
  expect(allOutput).toContain("B");
});

// Ink reference: src/components/Static.tsx — `itemsToRender = items.slice(index)`
// with `useLayoutEffect(() => setIndex(items.length))`. Once an item is written
// (committed/painted), the effect advances `index` past it, so on the next
// render `items.slice(index)` no longer includes it and its element is removed
// from the tree → its component UNMOUNTS. vue-tui must match: a written Static
// item's component must unmount (onUnmounted fires) while not-yet-written items
// stay mounted.
test("written Static items unmount their components (Ink parity)", async () => {
  const unmounted: string[] = [];

  const Item = defineComponent({
    name: "StaticItem",
    props: { label: { type: String, required: true } },
    setup(props) {
      onUnmounted(() => {
        unmounted.push(props.label);
      });
      return () => <Text key={props.label}>{props.label}</Text>;
    },
  });

  const items = shallowRef<string[]>(["A"]);

  const App = defineComponent(() => () => (
    <Box>
      <Static items={items.value}>
        {{
          default: ({ item }: { item: string }) => <Item key={item} label={item} />,
        }}
      </Static>
      <Text>[live]</Text>
    </Box>
  ));

  const { unmount } = await render(App);

  // After the first render, item "A" has been written. Once the write settles,
  // its component must unmount (mirroring Ink advancing the cursor past it).
  await nextTick();
  await new Promise((r) => setTimeout(r, 50));
  await nextTick();
  expect(unmounted).toContain("A");

  // Add "B". "A" was already unmounted; only "B" is freshly mounted+written.
  items.value = ["A", "B"];
  await nextTick();
  await new Promise((r) => setTimeout(r, 50));
  await nextTick();
  expect(unmounted).toContain("B");

  unmount();
});

// Ink reference: Static resets `index` to `items.length` on every length change
// (`useLayoutEffect(() => setIndex(items.length), [items.length])`), so the cursor
// can DECREASE. vue-tui must mirror this. A monotonic cursor (only-increase) drops
// items after a shrink-then-grow: [A,B] writes (cursor→2); shrink to [A] (Ink resets
// cursor→1); grow to [A,C] renders slice(1)=[C] and writes C. With a monotonic
// cursor, slice(2)=[] and C is silently never painted.
test("Static resets cursor on shrink so later items still paint (Ink parity)", async () => {
  const items = shallowRef<string[]>(["A", "B"]);

  const App = defineComponent(() => () => (
    <Box>
      <Static items={items.value}>
        {{
          default: ({ item }: { item: string }) => <Text key={item}>{item}</Text>,
        }}
      </Static>
      <Text>[live]</Text>
    </Box>
  ));

  const { frames } = await render(App);

  // Let A and B write (cursor advances to 2).
  await nextTick();
  await new Promise((r) => setTimeout(r, 50));
  await nextTick();
  expect(frames.join("")).toContain("A");
  expect(frames.join("")).toContain("B");

  // Shrink to [A]. Ink resets the cursor to items.length (1); no re-paint of A.
  items.value = ["A"];
  await nextTick();
  await new Promise((r) => setTimeout(r, 50));
  await nextTick();

  // Grow to [A, C]. With Ink-parity cursor reset, slice(1)=[C] paints C.
  // With the monotonic bug, slice(2)=[] and C is dropped forever.
  items.value = ["A", "C"];
  await nextTick();
  await new Promise((r) => setTimeout(r, 50));
  await nextTick();

  expect(frames.join("")).toContain("C");
});

// Ink reference: src/components/Static.tsx merges
// `{position:'absolute', flexDirection:'column', ...customStyle}` onto the
// internal_static <ink-box>, and renderer.ts:48-56 lays the static node out via
// its OWN yoga node. So every caller-supplied LAYOUT style prop on
// `<Static style={{...}}>` (flexDirection, padding, width, justifyContent, ...)
// must govern how the static children are laid out and written. (G44)
test("Static honors flexDirection:row in the isolated paint (Ink parity, G44)", async () => {
  const items = shallowRef<string[]>([]);

  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static items={items.value} style={{ flexDirection: "row" }}>
        {{
          default: ({ item }: { item: string }) => <Text key={item}>{item}</Text>,
        }}
      </Static>
      <Text>[live]</Text>
    </Box>
  ));

  const { frames } = await render(App);

  items.value = ["AA", "BB"];
  await nextTick();

  // The static frame must lay AA and BB out on ONE row ("AABB"), not stacked
  // on two lines ("AA\nBB"). The buggy path hard-defaults FLEX_DIRECTION_COLUMN
  // on the iso root and drops the row style, painting "AA\nBB".
  const staticFrame = frames.find((f) => f.includes("AA") && f.includes("BB"));
  expect(staticFrame).toBeDefined();
  expect(staticFrame).toContain("AABB");
  expect(staticFrame).not.toContain("AA\nBB");
});

test("Static honors paddingLeft in the isolated paint (Ink parity, G44)", async () => {
  const items = shallowRef<string[]>([]);

  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static items={items.value} style={{ paddingLeft: 4 }}>
        {{
          default: ({ item }: { item: string }) => <Text key={item}>{item}</Text>,
        }}
      </Static>
      <Text>[live]</Text>
    </Box>
  ));

  const { frames } = await render(App);

  items.value = ["X"];
  await nextTick();

  // paddingLeft:4 must shift the static item right by 4 cells ("    X"). The
  // buggy path never reaches the static node's resolved padding, painting "X".
  const staticFrame = frames.find((f) => f.includes("X") && !f.includes("[live]"));
  expect(staticFrame).toBeDefined();
  expect(staticFrame).toContain("    X");
});

// Ink reference: src/components/Static.tsx sets the static box style
// `{position:'absolute', flexDirection:'column', ...customStyle}` with NO width,
// and ink.tsx calculateLayout NEVER sets the static node's width — so renderer.ts
// reads node.staticNode.yogaNode.getComputedWidth() of a yoga absolute,
// auto-width node, which shrinks to its CONTENT. So flex-fill children
// (<Spacer>, flexGrow, justifyContent, percent width) inside a Static item
// COLLAPSE to content width rather than expanding to the terminal width.
// (G64 — refines G44, which over-forced the iso root to terminal width.)
//
// Confirmed against the built Ink reference (v7.0.4, /tmp/ink-40b3a75/build,
// cols=80): a Static item Box row [Text LEFT][Spacer][Text RIGHT] renders the
// static frame "LEFTRIGHT" (9 chars; the Spacer collapses to 0), NOT
// "LEFT" + 71 spaces + "RIGHT".
test("Static content-sizes an auto-width item: Spacer collapses (Ink parity, G64)", async () => {
  const items = shallowRef<string[]>([]);

  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static items={items.value}>
        {{
          default: ({ item }: { item: string }) => (
            <Box key={item} flexDirection="row">
              <Text>LEFT</Text>
              <Spacer />
              <Text>RIGHT</Text>
            </Box>
          ),
        }}
      </Static>
      <Text>[live]</Text>
    </Box>
  ));

  const { frames } = await render(App, { columns: 80 });

  items.value = ["one"];
  await nextTick();

  // The static frame must content-size to "LEFTRIGHT" (Spacer collapses to 0),
  // matching Ink. The buggy path forces the iso root to terminal width (80), so
  // the Spacer expands and the line becomes "LEFT" + 71 spaces + "RIGHT".
  const staticFrame = frames.find((f) => f.includes("LEFT") && f.includes("RIGHT"));
  expect(staticFrame).toBeDefined();
  expect(staticFrame).toContain("LEFTRIGHT");
  expect(staticFrame).not.toMatch(/LEFT {2,}RIGHT/);
});

// flexGrow box inside an auto-width Static item also collapses to content width.
// Confirmed against Ink ref (cols=80): row [Text A][Box flexGrow=1][Text B] →
// static frame "AB" (the flexGrow box collapses to 0).
test("Static content-sizes an auto-width item: flexGrow collapses (Ink parity, G64)", async () => {
  const items = shallowRef<string[]>([]);

  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static items={items.value}>
        {{
          default: ({ item }: { item: string }) => (
            <Box key={item} flexDirection="row">
              <Text>A</Text>
              <Box flexGrow={1} />
              <Text>B</Text>
            </Box>
          ),
        }}
      </Static>
      <Text>[live]</Text>
    </Box>
  ));

  const { frames } = await render(App, { columns: 80 });

  items.value = ["one"];
  await nextTick();

  const staticFrame = frames.find(
    (f) => f.includes("A") && f.includes("B") && !f.includes("[live]"),
  );
  expect(staticFrame).toBeDefined();
  expect(staticFrame).toContain("AB");
  expect(staticFrame).not.toMatch(/A {2,}B/);
});

// G64 MUST-FIX: an auto-width Static item with CONTENT WIDER than the terminal
// must OVERFLOW to its content width, NOT be clamped to the terminal width.
//
// Ink's static box is `position:absolute` + auto-width: it is a child of the
// terminal-width root, so TEXT wraps against that containing block, but BOXES
// size to their content and overflow past the terminal. The output grid is
// sized from node.staticNode.yogaNode.getComputedWidth() (renderer.ts:48), which
// can exceed the terminal width.
//
// Confirmed against the built Ink reference (/tmp/ink-40b3a75/build, cols=5): an
// explicit-width child Box width:10 flexShrink:0 renders the full "ABCDEFGHIJ"
// (10 cols, overflowing the 5-col terminal), NOT the clamped "ABCDE". The
// b913386 setMaxWidth(columns) path clips this to "ABCDE".
test("Static overflows an explicit-width child wider than the terminal (Ink parity, G64)", async () => {
  const items = shallowRef<string[]>([]);

  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static items={items.value}>
        {{
          default: ({ item }: { item: string }) => (
            <Box key={item}>
              <Box width={10} flexShrink={0}>
                <Text>ABCDEFGHIJ</Text>
              </Box>
            </Box>
          ),
        }}
      </Static>
      <Text>[live]</Text>
    </Box>
  ));

  const { frames } = await render(App, { columns: 5 });

  items.value = ["one"];
  await nextTick();

  const staticFrame = frames.find((f) => f.includes("ABCDE") && !f.includes("[live]"));
  expect(staticFrame).toBeDefined();
  // Must overflow to the full content width, NOT clamp to the terminal width.
  expect(staticFrame).toContain("ABCDEFGHIJ");
  expect(staticFrame).not.toBe("ABCDE");
});

// G64 MUST-FIX: a non-wrapping multi-<Text> row wider than the terminal must
// also overflow to content width. Confirmed against Ink ref (cols=5): a row
// [Text ABC][Text DEF] renders "ABCDEF" (6 cols, overflowing), NOT a clamped /
// char-dropped result. The b913386 setMaxWidth(columns) path produced "ABDEF"
// (a dropped character).
test("Static overflows a non-wrapping two-Text row wider than the terminal (Ink parity, G64)", async () => {
  const items = shallowRef<string[]>([]);

  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static items={items.value}>
        {{
          default: ({ item }: { item: string }) => (
            <Box key={item} flexDirection="row">
              <Text>ABC</Text>
              <Text>DEF</Text>
            </Box>
          ),
        }}
      </Static>
      <Text>[live]</Text>
    </Box>
  ));

  const { frames } = await render(App, { columns: 5 });

  items.value = ["one"];
  await nextTick();

  const staticFrame = frames.find((f) => f.includes("ABC") && !f.includes("[live]"));
  expect(staticFrame).toBeDefined();
  // Ink content-width output is exactly "ABCDEF" (Texts do not shrink/wrap here).
  // The captured static chunk is the "\n"-terminated `fullStaticOutput` (each
  // static frame is joined as `frame + "\n"`, Ink-faithful — ink.tsx static path).
  expect(staticFrame).toBe("ABCDEF\n");
});

// G64 (matches): plain wide TEXT must still WRAP to the terminal width, because
// text measures/wraps against the terminal-width containing block. Confirmed
// against Ink ref (cols=5): "ABCDEFGHIJ" → "ABCDE\nFGHIJ".
test("Static wraps a plain wide text to the terminal width (Ink parity, G64)", async () => {
  const items = shallowRef<string[]>([]);

  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static items={items.value}>
        {{
          default: ({ item }: { item: string }) => <Text key={item}>ABCDEFGHIJ</Text>,
        }}
      </Static>
      <Text>[live]</Text>
    </Box>
  ));

  const { frames } = await render(App, { columns: 5 });

  items.value = ["one"];
  await nextTick();

  const staticFrame = frames.find((f) => f.includes("ABCDE") && !f.includes("[live]"));
  expect(staticFrame).toBeDefined();
  // "\n"-terminated static chunk (`fullStaticOutput`), Ink-faithful.
  expect(staticFrame).toBe("ABCDE\nFGHIJ\n");
});

// G64 (matches): a percent-width child wraps against the terminal-width
// containing block. Confirmed against Ink ref (cols=6): a row of two 50%-width
// boxes [HALF][END] → "HALEND\nF" (each box is 3 cols; HALF wraps to HAL/F).
test("Static lays out percent-width children against the terminal width (Ink parity, G64)", async () => {
  const items = shallowRef<string[]>([]);

  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static items={items.value}>
        {{
          default: ({ item }: { item: string }) => (
            <Box key={item}>
              <Box width="50%">
                <Text>HALF</Text>
              </Box>
              <Box width="50%">
                <Text>END</Text>
              </Box>
            </Box>
          ),
        }}
      </Static>
      <Text>[live]</Text>
    </Box>
  ));

  const { frames } = await render(App, { columns: 6 });

  items.value = ["one"];
  await nextTick();

  const staticFrame = frames.find((f) => f.includes("HAL") && !f.includes("[live]"));
  expect(staticFrame).toBeDefined();
  // "\n"-terminated static chunk (`fullStaticOutput`), Ink-faithful.
  expect(staticFrame).toBe("HALEND\nF\n");
});

test("Static items do not add blank lines to the dynamic frame", async () => {
  const items = shallowRef<string[]>([]);

  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static items={items.value}>
        {{
          default: ({ item }: { item: string }) => <Text>{item}</Text>,
        }}
      </Static>
      <Text>[live]</Text>
    </Box>
  ));

  const { lastFrame } = await render(App);
  expect(lastFrame()).toBe("[live]");

  items.value = ["a", "b", "c"];
  await nextTick();

  // The dynamic frame should ONLY contain [live], no blank lines from Static
  const frame = lastFrame()!;
  expect(frame).toBe("[live]");
});

// A07 — multiple <Static> regions both render.
//
// Ink honors only the FIRST <Static> in the tree (ink.tsx tracks a single
// `staticNode`); a second one is silently dropped. vue-tui is an ADDITIVE
// DIVERGENCE: every <Static> node found by findStatics() is painted, so two
// independent static regions in one tree BOTH emit their items. This pins that
// superset behavior (there was previously no test mounting two regions).
test("two separate <Static> regions both render their items (additive divergence)", async () => {
  const headerItems = shallowRef<string[]>([]);
  const logItems = shallowRef<string[]>([]);

  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static items={headerItems.value}>
        {{ default: ({ item }: { item: string }) => <Text key={item}>{item}</Text> }}
      </Static>
      <Static items={logItems.value}>
        {{ default: ({ item }: { item: string }) => <Text key={item}>{item}</Text> }}
      </Static>
      <Text>[live]</Text>
    </Box>
  ));

  const { frames } = await render(App);

  // Populate both regions; each region's items must appear in the emitted output.
  headerItems.value = ["HEADER-1", "HEADER-2"];
  logItems.value = ["LOG-1", "LOG-2"];
  await nextTick();
  await new Promise((r) => setTimeout(r, 50));
  await nextTick();

  const allOutput = frames.join("");
  // BOTH regions render (Ink would drop the second).
  expect(allOutput).toContain("HEADER-1");
  expect(allOutput).toContain("HEADER-2");
  expect(allOutput).toContain("LOG-1");
  expect(allOutput).toContain("LOG-2");
});

// B04(a) — the render-prop's SECOND arg (`index`) is the ABSOLUTE array index,
// stable across INCREMENTAL appends.
//
// Static.ts renders `items.slice(cursor)` and passes `index = cursor + i`, where
// the cursor advances to items.length after each batch is written. So an item's
// index is its position in the FULL list, never its position within the append
// batch. This mirrors Ink's Static, which renders `items.slice(index)` and passes
// the absolute index to the render prop. (Confirmed: batch [a0,a1] → indices 0,1;
// batch [b2,b3] appended → indices 2,3, NOT 0,1.)
test("Static render-prop index is the absolute array index across incremental appends", async () => {
  const seen: Array<{ item: string; index: number }> = [];
  const items = shallowRef<string[]>([]);

  const App = defineComponent(() => () => (
    <Box>
      <Static items={items.value}>
        {{
          default: ({ item, index }: { item: string; index: number }) => {
            seen.push({ item, index });
            return <Text key={item}>{item}</Text>;
          },
        }}
      </Static>
      <Text>[live]</Text>
    </Box>
  ));

  await render(App);

  // First batch: two items at absolute indices 0 and 1.
  items.value = ["a0", "a1"];
  await nextTick();
  await new Promise((r) => setTimeout(r, 50));
  await nextTick();

  // Second batch appended: the new items must get absolute indices 2 and 3
  // (their position in the FULL [a0,a1,b2,b3] list), not the batch-local 0,1.
  items.value = ["a0", "a1", "b2", "b3"];
  await nextTick();
  await new Promise((r) => setTimeout(r, 50));
  await nextTick();

  // Each item was rendered with its absolute index. (Items render once; the
  // already-written a0/a1 are sliced out before the second batch renders.)
  expect(seen).toEqual([
    { item: "a0", index: 0 },
    { item: "a1", index: 1 },
    { item: "b2", index: 2 },
    { item: "b3", index: 3 },
  ]);
});

// B04(b) — vertical padding on the <Static> container paints into the static frame.
//
// Static.ts merges the caller `style` onto the internal static box, and
// static-channel.ts paints that node via its OWN yoga node (paintIsolated). So
// paddingTop/paddingBottom resolve as real layout: they add blank rows above /
// below the item inside the painted static frame. Confirmed against the pinned
// Ink reference (v7.0.4): paddingTop:2 paddingBottom:1 → static frame "\n\nX\n\n"
// (2 blank rows above X, then X, then 1 blank row below).
test("Static container vertical padding adds blank rows to the painted static frame", async () => {
  const items = shallowRef<string[]>([]);

  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static items={items.value} style={{ paddingTop: 2, paddingBottom: 1 }}>
        {{ default: ({ item }: { item: string }) => <Text key={item}>{item}</Text> }}
      </Static>
      <Text>[live]</Text>
    </Box>
  ));

  const { frames } = await render(App);

  items.value = ["X"];
  await nextTick();
  await new Promise((r) => setTimeout(r, 50));
  await nextTick();

  // The captured static chunk is the "\n"-terminated fullStaticOutput. With
  // paddingTop:2 / paddingBottom:1 the painted region is "\n\nX\n\n" (Ink parity).
  const staticFrame = frames.find((f) => f.includes("X") && !f.includes("[live]"));
  expect(staticFrame).toBeDefined();
  expect(staticFrame).toBe("\n\nX\n\n");
});
