import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, createApp, Static, Text } from "@vue-tui/runtime";
import {
  captureWrites,
  getContentWrites,
  makeFakeStdin,
  makeFakeWritable,
} from "./test-streams.ts";

// Debug-mode stdout parity with Ink v7.0.4 (ink.tsx onRender debug branch,
// ~lines 550-558). Ink's debug contract is "every update rendered as a separate,
// FULL output": it writes `this.fullStaticOutput + output` on every render — the
// ENTIRE accumulated <Static> history prepended to the current dynamic frame,
// UNCONDITIONALLY (no equality short-circuit). vue-tui writes the same byte
// stream as two consecutive stdout.write calls (static history, then dynamic
// frame), so these tests assert on the per-render byte stream, not chunk count.
// They pin both halves of the contract: (a) the FULL static history is replayed
// every render (not just the new delta), and (b) a commit that paints a
// byte-identical frame still emits (no FrameWriter dedup).

test("debug mode replays the FULL accumulated <Static> history on each render", async () => {
  // Frame 2 (after appending B) must re-print A as well, like Ink's
  // `fullStaticOutput + output`, not only the per-commit static delta (B).
  const items = shallowRef<string[]>(["A"]);

  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      <Static items={items.value}>
        {{ default: ({ item }: { item: string }) => <Text key={item}>{item}</Text> }}
      </Static>
      <Text>dyn</Text>
    </Box>
  ));

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();

  const writes = captureWrites(stdout);

  app.mount({ stdout, stdin, stderr, debug: true, exitOnCtrlC: false });

  await nextTick();
  await nextTick();
  const rawWritesAfterFrame1 = writes.length;

  // Append B → a render whose static history is now A AND B.
  items.value = ["A", "B"];
  await nextTick();
  await nextTick();

  // Ink writes `fullStaticOutput + output` each render; vue-tui writes that same
  // byte stream as (static history) + (dynamic frame). Concatenate the raw
  // post-append writes and assert the FULL history (A AND B) is present — i.e. A
  // is replayed alongside the new B, not only the delta B.
  const frame2Stream = writes.slice(rawWritesAfterFrame1).join("");

  expect(frame2Stream).toContain("B"); // sanity: this is the post-append render
  expect(frame2Stream).toContain("A"); // Ink replays the FULL static history every render
  // And the dynamic frame is still its own chunk (testing-helper frame model).
  // Ink writes `fullStaticOutput + output` with NO trailing newline (ink.tsx:558;
  // `output` is \n-joined and returned WITHOUT a trailing \n), so the dynamic
  // frame chunk is "dyn", not "dyn\n".
  expect(getContentWrites(writes)).toContain("dyn");

  app.unmount();
});

test("debug mode emits a frame on a commit that produces a byte-identical frame (no dedup)", async () => {
  // A re-render that DOES commit (a host mutation occurs — here inserting an
  // empty 0x0 <Box> via v-if) but paints a byte-identical frame ("row"). Ink's
  // resetAfterCommit fires onRender() on every React commit and writes
  // `fullStaticOutput + output` UNCONDITIONALLY, so the identical frame is
  // re-emitted. vue-tui must too: pre-fix the frame went through the FrameWriter,
  // whose `frame === lastFrame` dedup swallowed this second identical frame.
  //
  // (Note: a pure reactive tick that mutates NO host node never reaches a commit
  // at all in vue-tui — Vue's fine-grained reconciler only fires the renderer's
  // onCommit on host mutations, where React runs the commit phase for every
  // re-render. That deeper render-vs-commit difference is out of scope for this
  // FrameWriter-dedup fix; this test exercises the dedup the audit identified.)
  const show = shallowRef(false);

  const App = defineComponent(() => () => (
    <Box>
      <Text>row</Text>
      {show.value ? <Box /> : null}
    </Box>
  ));

  const app = createApp(App);
  const stdout = makeFakeWritable({ columns: 80 });
  const stderr = makeFakeWritable({ columns: 80 });
  const { stream: stdin } = makeFakeStdin();

  const writes = captureWrites(stdout);

  app.mount({ stdout, stdin, stderr, debug: true, exitOnCtrlC: false });

  await nextTick();
  await nextTick();

  const framesAfterFirst = getContentWrites(writes).filter((w) => w.includes("row")).length;
  expect(framesAfterFirst).toBeGreaterThanOrEqual(1);

  // Insert an empty box: a host mutation fires the commit, but the painted frame
  // is byte-identical ("row").
  show.value = true;
  await nextTick();
  await nextTick();

  const framesAfterSecond = getContentWrites(writes).filter((w) => w.includes("row")).length;

  // Ink writes the frame again unconditionally; vue-tui debug mode must emit too.
  expect(framesAfterSecond).toBe(framesAfterFirst + 1);

  app.unmount();
});
