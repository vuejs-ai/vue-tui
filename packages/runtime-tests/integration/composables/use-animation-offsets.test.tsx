// Formerly a *.sequential.test file driven by vi.useFakeTimers. Now each app
// mounts with its own VirtualClock via the INTERNAL_CLOCK mount option (see
// .agents/docs/clock.md), which locks the same EXACT frame offsets Ink asserts
// (test/use-animation.tsx) — frame = floor((now - startTime) / interval) over
// virtual time — without process-global timer mocking, so this file runs in
// the normal parallel pool.

import { PassThrough } from "node:stream";
import { defineComponent, nextTick, shallowRef, watchEffect } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { createApp, Text, useAnimation, type TuiApp } from "@vue-tui/runtime";
import { createVirtualClock, INTERNAL_CLOCK, type VirtualClock } from "@vue-tui/runtime/internal";

function makeStreams() {
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { columns: 100, rows: 100, isTTY: true });
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stderr, { columns: 100, rows: 100, isTTY: true });
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
  return { stdout, stderr, stdin };
}

// Flush Vue's microtask-based reactivity (fake timers do NOT gate microtasks),
// then nextTick so the committed frame value settles after a scheduler tick.
async function flush() {
  await Promise.resolve();
  await nextTick();
}

describe("useAnimation exact frame offsets (deterministic)", () => {
  // Ink test/use-animation.tsx:1080-1135 ("newly mounted animations do not
  // inherit elapsed time"). A second animation appearing one interval after the
  // first starts from frame 0 and stays EXACTLY one frame behind.
  test("a newly mounted same-interval animation starts at frame 0 and stays one frame behind", async () => {
    const interval = 20;
    const showSecond = shallowRef(false);
    let firstFrame = 0;
    let secondFrame = 0;

    const First = defineComponent(() => {
      const { frame } = useAnimation({ interval });
      watchEffect(() => {
        firstFrame = frame.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const Second = defineComponent(() => {
      const { frame } = useAnimation({ interval });
      watchEffect(() => {
        secondFrame = frame.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const App = defineComponent(() => {
      return () => (
        <>
          <First />
          {showSecond.value ? <Second /> : <Text>-</Text>}
        </>
      );
    });

    const { stdout, stderr, stdin } = makeStreams();
    const clock: VirtualClock = createVirtualClock();
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      stderr,
      debug: true,
      exitOnCtrlC: false,
      [INTERNAL_CLOCK]: clock,
    } as Parameters<TuiApp["mount"]>[0]);
    await flush();

    // Advance just past one interval, then mount the second animation. The first
    // is now at frame 1; the second subscribes at this moment → frame 0.
    await clock.advance(25);
    showSecond.value = true;
    await flush();

    expect(firstFrame).toBe(1);
    expect(secondFrame).toBe(0);

    // Advance two more intervals: first → 3, second → 2. Exactly one apart.
    await clock.advance(40);
    await flush();

    expect(firstFrame).toBeGreaterThanOrEqual(2);
    expect(secondFrame).toBeGreaterThanOrEqual(1);
    expect(firstFrame - secondFrame).toBe(1);

    app.unmount();
  });

  // Ink test/use-animation.tsx:1137-1201 ("newly activated animations do not
  // inherit elapsed time"). Same exact-offset lock, but the second animation is
  // mounted from the start and only ACTIVATED one interval later.
  test("a newly activated same-interval animation starts at frame 0 and stays one frame behind", async () => {
    const interval = 20;
    const secondActive = shallowRef(false);
    let firstFrame = 0;
    let secondFrame = 0;

    const App = defineComponent(() => {
      const { frame: f1 } = useAnimation({ interval });
      const { frame: f2 } = useAnimation({ interval, isActive: secondActive });
      watchEffect(() => {
        firstFrame = f1.value;
        secondFrame = f2.value;
      });
      return () => (
        <Text>
          {f1.value},{f2.value}
        </Text>
      );
    });

    const { stdout, stderr, stdin } = makeStreams();
    const clock: VirtualClock = createVirtualClock();
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      stderr,
      debug: true,
      exitOnCtrlC: false,
      [INTERNAL_CLOCK]: clock,
    } as Parameters<TuiApp["mount"]>[0]);
    await flush();

    await clock.advance(25);
    secondActive.value = true;
    await flush();

    expect(firstFrame).toBe(1);
    expect(secondFrame).toBe(0);

    await clock.advance(40);
    await flush();

    expect(firstFrame).toBeGreaterThanOrEqual(2);
    expect(secondFrame).toBeGreaterThanOrEqual(1);
    expect(firstFrame - secondFrame).toBe(1);

    app.unmount();
  });

  // Ink test/use-animation.tsx:1203-1238 ("rerendering with the same interval
  // does not reset the frame"). A re-render that leaves the interval unchanged must
  // NOT restart timing. We force a genuine re-render via an UNRELATED reactive dep
  // (`bump`) the render reads — assigning the SAME interval value would be a no-op in
  // Vue (the watcher only fires on change), so it wouldn't exercise anything. The
  // interval ref stays 50 across the re-render; the frame must keep its value.
  test("a re-render with an unchanged interval does not reset the frame", async () => {
    const interval = shallowRef(50);
    const bump = shallowRef(0);
    let frameVal = 0;

    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval });
      watchEffect(() => {
        frameVal = frame.value;
      });
      // Read `bump` in the render so changing it forces a real re-render.
      return () => <Text>{`${frame.value}:${bump.value}`}</Text>;
    });

    const { stdout, stderr, stdin } = makeStreams();
    const clock: VirtualClock = createVirtualClock();
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      stderr,
      debug: true,
      exitOnCtrlC: false,
      [INTERNAL_CLOCK]: clock,
    } as Parameters<TuiApp["mount"]>[0]);
    await flush();

    // Advance past frame 1.
    await clock.advance(120);
    await flush();
    const frameBefore = frameVal;
    expect(frameBefore).toBeGreaterThanOrEqual(1);

    // Force a re-render with the interval unchanged. A bug that reset on re-render
    // would drop frameVal to 0; correct behavior keeps it at frameBefore.
    bump.value++;
    await flush();

    expect(frameVal).toBe(frameBefore);

    app.unmount();
  });

  // Ink test/use-animation.tsx:1356-1378 ("reset is a stable function
  // reference"). reset() identity must survive re-renders. Ink re-runs the
  // component body each render and collects reset every time; in Vue setup()
  // runs once, so we collect reset inside the RENDER function (which DOES re-run
  // per render) to exercise the same "observed across renders" property.
  test("reset is a stable function reference across re-renders", async () => {
    const tick = shallowRef(0);
    const resets: Array<() => void> = [];

    const App = defineComponent(() => {
      const { reset } = useAnimation({ interval: 50 });
      // Read tick.value in render so changing it forces a re-render; collect the
      // reset reference on every render pass.
      return () => {
        resets.push(reset);
        return <Text>{String(tick.value)}</Text>;
      };
    });

    const { stdout, stderr, stdin } = makeStreams();
    const clock: VirtualClock = createVirtualClock();
    const app = createApp(App);
    app.mount({
      stdout,
      stdin,
      stderr,
      debug: true,
      exitOnCtrlC: false,
      [INTERNAL_CLOCK]: clock,
    } as Parameters<TuiApp["mount"]>[0]);
    await flush();

    tick.value = 1;
    await flush();
    tick.value = 2;
    await flush();

    expect(resets.length).toBeGreaterThanOrEqual(2);
    expect(resets[0]).toBe(resets.at(-1));

    app.unmount();
  });
});
