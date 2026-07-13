import { defineComponent, shallowRef, watch, type ComponentPublicInstance } from "vue";
import { expect, test } from "vite-plus/test";
import { render, type RenderOptions } from "@vue-tui/testing";
import { Box, Text, useFocus, useFocusedInput, type UseFocusReturn } from "@vue-tui/runtime";

test("focus input demand follows useful work instead of every registration", async () => {
  const tabIndex = shallowRef<0 | -1>(-1);

  const App = defineComponent(() => {
    const host = shallowRef<ComponentPublicInstance | null>(null);
    useFocus(host, { tabIndex });
    return () => (
      <Box ref={host}>
        <Text>target</Text>
      </Box>
    );
  });

  const result = await render(App);
  try {
    expect(result.terminal.rawMode.current).toBe(false);

    tabIndex.value = 0;
    await result.waitUntilRenderFlush();
    expect(result.terminal.rawMode.current).toBe(true);

    tabIndex.value = -1;
    await result.waitUntilRenderFlush();
    await Promise.resolve();
    expect(result.terminal.rawMode.current).toBe(false);
  } finally {
    result.dispose();
  }
});

test("an atomic keyed host replacement retains focus and raw demand without a false interval", async () => {
  const hostKey = shallowRef("a");
  const focusChanges: boolean[] = [];
  let target!: UseFocusReturn;

  const App = defineComponent(() => {
    const host = shallowRef<ComponentPublicInstance | null>(null);
    target = useFocus(host, { autoFocus: true });
    useFocusedInput(target, () => "continue");
    watch(
      target.isFocused,
      (focused) => {
        focusChanges.push(focused);
      },
      { flush: "sync" },
    );
    return () => (
      <Box key={hostKey.value} ref={host}>
        <Text>target</Text>
      </Box>
    );
  });

  const result = await render(App);
  expect(target.isFocused.value).toBe(true);
  expect(result.terminal.rawMode.current).toBe(true);
  focusChanges.length = 0;
  const historyStart = result.terminal.rawMode.history.length;

  hostKey.value = "b";
  await result.waitUntilRenderFlush();

  expect(target.isFocused.value).toBe(true);
  expect(focusChanges).toEqual([]);
  expect(result.terminal.rawMode.current).toBe(true);
  expect(result.terminal.rawMode.history.slice(historyStart)).not.toContain(false);

  result.unmount();
  expect(target.isFocused.value).toBe(false);
  expect(target.focus()).toBe(false);
  expect(result.terminal.rawMode.current).toBe(false);
  result.dispose();
});

test.each([
  ["Inline visual", { mode: "inline" }],
  ["Fullscreen visual", { mode: "fullscreen" }],
  ["screen-reader fallback", { mode: "fullscreen", presentation: "screen-reader" }],
  ["final-output stream", { mode: "fullscreen", stdout: "stream", updates: "at-teardown" }],
] satisfies ReadonlyArray<readonly [string, NonNullable<RenderOptions["host"]>]>)(
  "%s focus survives suspension and resumes the same route",
  async (_label, host) => {
    const calls: string[] = [];
    let target!: UseFocusReturn;
    const App = defineComponent(() => {
      const rendered = shallowRef<ComponentPublicInstance | null>(null);
      target = useFocus(rendered, { autoFocus: true });
      useFocusedInput(target, (event) => {
        calls.push(event.sequence);
        return "consume";
      });
      return () => <Box ref={rendered} />;
    });

    const result = await render(App, { host });
    try {
      expect(target.isFocused.value).toBe(true);
      expect(result.terminal.rawMode.current).toBe(true);
      await result.stdin.write("a");
      expect(calls).toEqual(["a"]);

      await result.terminal.suspend();
      expect(target.isFocused.value).toBe(true);
      expect(result.terminal.rawMode.current).toBe(false);

      await result.terminal.resume();
      expect(target.isFocused.value).toBe(true);
      expect(result.terminal.rawMode.current).toBe(true);
      await result.stdin.write("b");
      expect(calls).toEqual(["a", "b"]);
    } finally {
      result.dispose();
    }
    expect(result.terminal.rawMode.current).toBe(false);
  },
);
