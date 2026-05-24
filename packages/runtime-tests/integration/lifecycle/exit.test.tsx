import { defineComponent, onScopeDispose } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useExit } from "@vue-tui/runtime";

test("useExit() triggers teardown and waitUntilExit resolves", async () => {
  let exitFn!: () => void;
  let disposed = false;

  const App = defineComponent(() => {
    const exit = useExit();
    exitFn = exit;
    onScopeDispose(() => {
      disposed = true;
    });
    return () => <Text>running</Text>;
  });

  const { lastFrame, waitUntilExit } = await render(App);
  expect(lastFrame()).toContain("running");

  exitFn();
  await waitUntilExit();
  expect(disposed).toBe(true);
});

test("exit(error) rejects waitUntilExit with the error", async () => {
  let exitFn!: (err: Error) => void;

  const App = defineComponent(() => {
    const exit = useExit();
    exitFn = exit;
    return () => <Text>x</Text>;
  });

  const { waitUntilExit } = await render(App);

  const boom = new Error("boom");
  exitFn(boom);
  await expect(waitUntilExit()).rejects.toBe(boom);
});

test("unmount() resolves waitUntilExit", async () => {
  const App = defineComponent(() => {
    return () => <Text>x</Text>;
  });

  const { unmount, waitUntilExit } = await render(App);
  unmount();
  await waitUntilExit();
});

test("unmount() after exit() is idempotent", async () => {
  let exitFn!: () => void;

  const App = defineComponent(() => {
    const exit = useExit();
    exitFn = exit;
    return () => <Text>x</Text>;
  });

  const { unmount, waitUntilExit } = await render(App);
  exitFn();
  await waitUntilExit();

  expect(() => unmount()).not.toThrow();
});
