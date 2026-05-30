import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useApp } from "@vue-tui/runtime";

test("setup() throw rejects render()", async () => {
  const Boom = defineComponent(() => {
    throw new Error("setup boom");
  });
  await expect(render(Boom)).rejects.toThrow("setup boom");
});

test("render-time throw does not prevent unmount", async () => {
  const trigger = shallowRef(false);
  const App = defineComponent(() => {
    return () => {
      if (trigger.value) throw new Error("render boom");
      return <Text>ok</Text>;
    };
  });

  const { lastFrame, unmount } = await render(App);
  expect(lastFrame()).toContain("ok");

  trigger.value = true;
  // Error boundary catches the render error and routes through exit()
  await nextTick();
  await nextTick();
  await Promise.resolve();

  // After exit(), teardown has run. unmount() should be idempotent/no-throw.
  expect(() => unmount()).not.toThrow();
});

test("useApp() called with error rejects waitUntilExit", async () => {
  // Mirrors Ink's "exit on exit() with error" fixture test, adapted for
  // render-based testing. Verifies exit(err) rejects the promise cleanly.
  // Also covered by exit.test.tsx "exit(error) rejects waitUntilExit with the error".
  let exitFn!: (err?: Error) => void;

  const App = defineComponent(() => {
    exitFn = useApp().exit;
    return () => <Text>running</Text>;
  });

  const { waitUntilExit } = await render(App);

  const err = new Error("errored via useApp");
  exitFn(err);

  await expect(waitUntilExit()).rejects.toBe(err);
});

// --- Error boundary tests (previously blocked by yoga WASM crashes) ---

test("nested component setup error rejects waitUntilExit", async () => {
  const err = new Error("setup boom nested");
  const Child = defineComponent(() => {
    throw err;
  });
  const App = defineComponent(() => () => <Child />);
  await expect(render(App)).rejects.toThrow("setup boom nested");
});

test("does not emit unhandledRejection when render exits with an error and waitUntilExit is unused", async () => {
  const unhandledErrors: Error[] = [];
  const handler = (reason: unknown) => {
    unhandledErrors.push(reason as Error);
  };
  process.on("unhandledRejection", handler);

  try {
    const Boom = defineComponent(() => {
      throw new Error("no-listener boom");
    });
    await render(Boom).catch(() => {});
    // Give a tick for any stray rejections to surface
    await new Promise((r) => setTimeout(r, 10));
    expect(unhandledErrors).toHaveLength(0);
  } finally {
    process.off("unhandledRejection", handler);
  }
});

test("error in component triggered after mount routes through exit", async () => {
  const trigger = shallowRef(false);
  const App = defineComponent(() => {
    return () => {
      if (trigger.value) throw new Error("post-mount boom");
      return <Text>ok</Text>;
    };
  });

  const { waitUntilExit, lastFrame } = await render(App);
  expect(lastFrame()).toContain("ok");

  trigger.value = true;
  // Flush the render + error boundary nextTick + exit microtask
  await nextTick();
  await nextTick();
  await Promise.resolve();

  await expect(waitUntilExit()).rejects.toThrow("post-mount boom");
});

// --- Ink error validation tests ---

test("fail when Box nested inside Text", async () => {
  const App = defineComponent(() => () => (
    <Text>
      <Box />
    </Text>
  ));
  await expect(render(App)).rejects.toThrow("can’t be nested inside <Text>");
});

test("fail when text string not within Text component", async () => {
  const App = defineComponent(() => () => <Box>bare text</Box>);
  await expect(render(App)).rejects.toThrow("must be rendered inside <Text>");
});
