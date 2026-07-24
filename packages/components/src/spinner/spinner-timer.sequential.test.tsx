// These tests replace process-global timer functions, so they must remain in a
// sequential test file and restore the real functions after every case.
import { defineComponent, h, nextTick, shallowRef } from "vue";
import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import Spinner from "./spinner.vue";

interface TimerHarness {
  readonly setIntervalSpy: ReturnType<typeof vi.spyOn>;
  readonly clearIntervalSpy: ReturnType<typeof vi.spyOn>;
  readonly delays: number[];
  tickLatest(): void;
}

function installTimerHarness(): TimerHarness {
  let nextHandle = 1;
  const callbacks = new Map<unknown, () => void>();
  const delays: number[] = [];
  let latestHandle: ReturnType<typeof setInterval> | undefined;

  const setIntervalSpy = vi
    .spyOn(globalThis, "setInterval")
    .mockImplementation((callback, delay) => {
      const handle = nextHandle++ as unknown as ReturnType<typeof setInterval>;
      callbacks.set(handle, () => callback());
      delays.push(delay ?? 0);
      latestHandle = handle;
      return handle;
    });
  const clearIntervalSpy = vi.spyOn(globalThis, "clearInterval").mockImplementation((handle) => {
    callbacks.delete(handle);
  });

  return {
    setIntervalSpy,
    clearIntervalSpy,
    delays,
    tickLatest() {
      if (latestHandle === undefined) throw new Error("Spinner timer was not started.");
      const callback = callbacks.get(latestHandle);
      if (callback === undefined) throw new Error("Latest Spinner timer is not active.");
      callback();
    },
  };
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe.sequential("Spinner component-local timer", () => {
  test("advances frames and clears its timer when unmounted", async () => {
    const timer = installTimerHarness();
    const result = await render(Spinner, {
      props: { frames: ["0", "1"], interval: 20 },
    });

    expect(result.lastFrame()).toBe("0");
    expect(timer.delays).toEqual([20]);

    timer.tickLatest();
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.lastFrame()).toBe("1");

    result.dispose();
    expect(timer.clearIntervalSpy).toHaveBeenCalledTimes(1);
  });

  test("restarts from the first frame when the interval changes", async () => {
    const timer = installTimerHarness();
    const interval = shallowRef(20);
    const App = defineComponent(
      () => () => h(Spinner, { frames: ["0", "1"], interval: interval.value }),
    );
    const result = await render(App);

    timer.tickLatest();
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.lastFrame()).toBe("1");

    interval.value = 40;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.lastFrame()).toBe("0");
    expect(timer.delays).toEqual([20, 40]);
    expect(timer.clearIntervalSpy).toHaveBeenCalledTimes(1);

    result.dispose();
    expect(timer.clearIntervalSpy).toHaveBeenCalledTimes(2);
    expect(timer.setIntervalSpy).toHaveBeenCalledTimes(2);
  });
});
