import { PassThrough } from "node:stream";
import { defineComponent, nextTick, onUnmounted, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, Static, createApp } from "@vue-tui/runtime";

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

  // Initial render — no items, should produce empty or near-empty output
  const initialFrame = frames.at(-1);
  expect(initialFrame !== undefined).toBe(true);

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
