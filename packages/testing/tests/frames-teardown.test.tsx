import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "../src/index.ts";
import { Text, useApp } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";

// Public content frames describe rendering-phase commits only. Teardown may
// still write final output or terminal-restoration bytes to the emulated screen,
// but the testing adapter excludes every observer commit labeled `teardown`.
// These cases cover both explicit unmount and the exit-driven teardown path.

test("manual unmount() does not append a teardown frame", async () => {
  const { frames, unmount } = await render(() => <Text>hello</Text>);
  const before = frames.length;
  expect(before).toBeGreaterThan(0);

  unmount();

  expect(frames.length).toBe(before);
});

test("programmatic useApp().exit() does not append a teardown frame", async () => {
  let doExit: (() => void) | undefined;
  const Comp = defineComponent(() => {
    const { exit } = useApp();
    doExit = () => exit();
    return () => <Text>bye</Text>;
  });

  const { frames, waitUntilExit } = await render(Comp);
  const before = frames.length;
  expect(before).toBeGreaterThan(0);

  // exit() routes through teardown() WITHOUT the helper's unmount wrapper.
  doExit?.();
  await waitUntilExit();

  expect(frames.length).toBe(before);
});

test("lastFrame() still reads the last real render after unmount", async () => {
  const { frames, lastFrame, unmount } = await render(() => <Text>hi</Text>);
  const lastBefore = frames.at(-1);
  expect(lastFrame()).toContain("hi");

  unmount();

  expect(frames.at(-1)).toBe(lastBefore);
  expect(lastFrame()).toContain("hi");
});

test("unmount() with <Static> does not append static + dynamic teardown frames", async () => {
  const { frames, unmount } = await render(() => (
    <Static>
      <Text>a</Text>
      <Text>b</Text>
    </Static>
  ));
  const before = frames.length;
  expect(before).toBeGreaterThan(0);

  unmount();

  expect(frames.length).toBe(before);
});

test("useApp().exit() with <Static> does not append static + dynamic teardown frames", async () => {
  let doExit: (() => void) | undefined;
  const Comp = defineComponent(() => {
    const { exit } = useApp();
    doExit = () => exit();
    return () => (
      <Static>
        <Text>a</Text>
        <Text>b</Text>
      </Static>
    );
  });

  const { frames, waitUntilExit } = await render(Comp);
  const before = frames.length;
  expect(before).toBeGreaterThan(0);

  doExit?.();
  await waitUntilExit();

  expect(frames.length).toBe(before);
});
