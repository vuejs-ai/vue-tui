// Sequential: uses vi.useFakeTimers, which mutates process-global timer functions.
import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { Box, createApp, Text } from "@vue-tui/runtime";
import stripAnsi from "strip-ansi";
import {
  bsu,
  createInternalMountOptions,
  esu,
} from "../../../../../packages/runtime/dist/internal.mjs";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "../test-streams.ts";
import { FAKE_TIMER_OPTS } from "./harness.ts";

test.sequential("resize consumes a pending throttled commit without a second paint", async () => {
  // Regression for issue #26: resize bypasses the throttle after Vue has
  // refreshed the host tree. Any trailing timer that represented the same
  // pending tree must be cancelled, or it repaints a second time afterwards.
  vi.useFakeTimers(FAKE_TIMER_OPTS);
  try {
    const msg = shallowRef("A");
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        <Text>line1</Text>
        <Text>{msg.value}</Text>
      </Box>
    ));
    const app = createApp(App);
    const stdout = makeFakeWritable({ columns: 80, rows: 2 });
    const stderr = makeFakeWritable({ columns: 80, rows: 2 });
    const { stream: stdin } = makeFakeStdin();
    const writes = captureWrites(stdout);

    app.mount(
      createInternalMountOptions({
        stdout,
        stdin,
        stderr,
        maxFps: 1,
      }),
    );
    await nextTick();
    await nextTick();

    // Mutate inside the throttle window so a trailing commit is armed.
    msg.value = "B";
    await nextTick();
    expect(vi.getTimerCount()).toBeGreaterThanOrEqual(1);

    const beforeResize = writes.length;
    // A same-size resize event keeps the current physical baseline addressable,
    // but still consumes the pending tree at the resize render barrier.
    stdout.emit("resize");
    await app.waitUntilRenderFlush();
    const afterResize = writes.length;
    expect(stripAnsi(writes.slice(beforeResize).join(""))).toContain("B");

    vi.advanceTimersByTime(1000);

    expect(writes).toHaveLength(afterResize);
    expect(vi.getTimerCount()).toBe(0);
    expect(writes.join("")).not.toContain("\x1b[2J");
    expect(writes.join("")).not.toContain("\x1b[3J");
    expect(writes.join("")).not.toContain("\x1b[H");

    app.unmount();
  } finally {
    vi.useRealTimers();
  }
});

// Port of Ink render.tsx:1985-2022 ("bsu/esu wraps throttledLog trailing call"):
// a CHANGED frame that lands as a trailing throttled commit must still be wrapped
// in the synchronized-update sequence — bsu before content, esu after. The fake
// TTY stdout makes shouldSynchronize() true.
test.sequential("bsu/esu wraps a trailing throttled content change", async () => {
  vi.useFakeTimers(FAKE_TIMER_OPTS);
  try {
    const msg = shallowRef("Hello");
    const App = defineComponent(() => () => <Text>{msg.value}</Text>);
    const app = createApp(App);
    const stdout = makeFakeWritable({ columns: 80 });
    const stderr = makeFakeWritable({ columns: 80 });
    const { stream: stdin } = makeFakeStdin();
    const writes = captureWrites(stdout);

    app.mount(
      createInternalMountOptions({
        stdout,
        stdin,
        stderr,
        maxFps: 1,
      }),
    );
    await nextTick();
    await nextTick();

    // Leading call wrote bsu + content + esu.
    expect(writes.join("")).toContain(bsu);
    expect(writes.join("")).toContain(esu);

    // Mutate inside the throttle window — the trailing commit is deferred.
    writes.length = 0;
    msg.value = "World";
    await nextTick();
    await nextTick();
    // Nothing written yet (throttled): no "World", no barriers.
    expect(writes.some((w) => w.includes("World"))).toBe(false);

    // Cross the window: the trailing commit fires and must be bsu/esu-wrapped.
    writes.length = 0;
    vi.advanceTimersByTime(1000);

    const transaction = writes.join("");
    expect(transaction).toContain(bsu);
    expect(transaction).toContain(esu);
    expect(transaction).toContain("World");
    expect(transaction.indexOf(bsu)).toBeLessThan(transaction.indexOf("World"));
    expect(transaction.indexOf("World")).toBeLessThan(transaction.indexOf(esu));

    app.unmount();
  } finally {
    vi.useRealTimers();
  }
});

// Port of Ink render.tsx:1945-1980 ("no bsu/esu when output is unchanged"): a
// trailing throttled rerender whose cells are identical to the prior frame must
// emit NEITHER bsu NOR esu, because the Surface has no changed range to write.
// We force a re-render
// that produces identical text via a counter ref read in the render fn but not
// reflected in the output, mirroring Ink's rerender(sameElement).
test.sequential("no bsu/esu on an unchanged trailing rerender", async () => {
  vi.useFakeTimers(FAKE_TIMER_OPTS);
  try {
    // tick changes (forcing Vue to re-run the render fn) but the rendered Text
    // is constant, so the produced frame is byte-identical to the prior frame.
    const tick = shallowRef(0);
    const App = defineComponent(() => () => {
      void tick.value;
      return <Text>Hello</Text>;
    });
    const app = createApp(App);
    const stdout = makeFakeWritable({ columns: 80 });
    const stderr = makeFakeWritable({ columns: 80 });
    const { stream: stdin } = makeFakeStdin();
    const writes = captureWrites(stdout);

    app.mount(
      createInternalMountOptions({
        stdout,
        stdin,
        stderr,
        maxFps: 1,
      }),
    );
    await nextTick();
    await nextTick();

    // Initial (leading) render emitted bsu (proves synchronization is active).
    expect(writes.join("")).toContain(bsu);

    // Force an identical-output rerender inside the throttle window, then cross
    // the window so the trailing commit runs.
    writes.length = 0;
    tick.value++;
    await nextTick();
    await nextTick();
    vi.advanceTimersByTime(1000);

    // The Frame has no changed range, so neither barrier is emitted.
    expect(writes.join("")).not.toContain(bsu);
    expect(writes.join("")).not.toContain(esu);

    app.unmount();
  } finally {
    vi.useRealTimers();
  }
});
