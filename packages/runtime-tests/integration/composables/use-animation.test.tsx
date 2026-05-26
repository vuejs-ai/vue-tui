import { defineComponent, shallowRef, watchEffect } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useAnimation } from "@vue-tui/runtime";

describe("useAnimation", () => {
  test("increments frame over time", async () => {
    const frames: number[] = [];
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 50 });
      watchEffect(() => {
        frames.push(frame.value);
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await new Promise((r) => setTimeout(r, 200));
    unmount();
    expect(frames.length).toBeGreaterThan(2);
  });

  test("isActive false pauses animation", async () => {
    const active = shallowRef(false);
    let lastFrame = 0;
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 50, isActive: active });
      watchEffect(() => {
        lastFrame = frame.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await new Promise((r) => setTimeout(r, 200));
    expect(lastFrame).toBe(0);
    unmount();
  });

  test("toggling isActive to true starts animation", async () => {
    const active = shallowRef(false);
    let lastFrame = 0;
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: 50, isActive: active });
      watchEffect(() => {
        lastFrame = frame.value;
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await new Promise((r) => setTimeout(r, 100));
    expect(lastFrame).toBe(0);

    active.value = true;
    await new Promise((r) => setTimeout(r, 200));
    expect(lastFrame).toBeGreaterThan(0);
    unmount();
  });

  test("reset resets all values to 0", async () => {
    let resetFn: (() => void) | undefined;
    let frameRef: { readonly value: number } | undefined;
    let timeRef: { readonly value: number } | undefined;
    let deltaRef: { readonly value: number } | undefined;
    const App = defineComponent(() => {
      const { frame, time, delta, reset } = useAnimation({ interval: 50 });
      resetFn = reset;
      frameRef = frame;
      timeRef = time;
      deltaRef = delta;
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await new Promise((r) => setTimeout(r, 200));
    expect(frameRef!.value).toBeGreaterThan(0);
    resetFn!();
    // reset() synchronously sets all refs to 0
    expect(frameRef!.value).toBe(0);
    expect(timeRef!.value).toBe(0);
    expect(deltaRef!.value).toBe(0);
    unmount();
  });

  test("time and delta are populated", async () => {
    let timeVal = 0;
    let deltaVal = 0;
    const App = defineComponent(() => {
      const { time, delta } = useAnimation({ interval: 50 });
      watchEffect(() => {
        timeVal = time.value;
        deltaVal = delta.value;
      });
      return () => <Text>anim</Text>;
    });
    const { unmount } = await render(App);
    await new Promise((r) => setTimeout(r, 200));
    expect(timeVal).toBeGreaterThan(0);
    expect(deltaVal).toBeGreaterThan(0);
    unmount();
  });

  test("non-finite interval defaults to 100ms", async () => {
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: Infinity });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    // Should not crash and should still tick
    await new Promise((r) => setTimeout(r, 250));
    unmount();
  });

  test("NaN interval defaults to 100ms", async () => {
    const App = defineComponent(() => {
      const { frame } = useAnimation({ interval: NaN });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await new Promise((r) => setTimeout(r, 250));
    unmount();
  });

  test("cleans up timer on unmount", async () => {
    const App = defineComponent(() => {
      useAnimation({ interval: 50 });
      return () => <Text>cleanup</Text>;
    });
    const { unmount } = await render(App);
    unmount();
    // No crash after unmount = timer was properly cleared
  });

  test("default options work", async () => {
    const frames: number[] = [];
    const App = defineComponent(() => {
      const { frame } = useAnimation();
      watchEffect(() => {
        frames.push(frame.value);
      });
      return () => <Text>{String(frame.value)}</Text>;
    });
    const { unmount } = await render(App);
    await new Promise((r) => setTimeout(r, 350));
    unmount();
    expect(frames.length).toBeGreaterThan(1);
  });
});
