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

test("component-thrown cross-realm Error preserves the original (not re-wrapped)", async () => {
  // A cross-realm Error (created in a different VM context) is a genuine Error
  // but fails `instanceof Error` because its prototype comes from the other
  // realm. The error-boundary path must NOT re-wrap it into
  // `new Error(String(foreignError))` (which would yield "Error: boom" and lose
  // the original identity). It uses the same isErrorInput brand check as exit(),
  // so the ORIGINAL foreign Error rejects waitUntilExit() — matching Ink's
  // ErrorBoundary, which rejects with the thrown value itself.
  const vm = await import("node:vm");
  const foreignError = vm.runInNewContext("new Error('boom')") as Error;

  const trigger = shallowRef(false);
  const App = defineComponent(() => {
    return () => {
      if (trigger.value) throw foreignError;
      return <Text>ok</Text>;
    };
  });

  const { waitUntilExit, lastFrame } = await render(App);
  expect(lastFrame()).toContain("ok");

  trigger.value = true;
  await nextTick();
  await nextTick();
  await Promise.resolve();

  // Same identity (not a re-wrapped copy) and the original message "boom"
  // (NOT "Error: boom" that re-wrapping would produce).
  await expect(waitUntilExit()).rejects.toBe(foreignError);
  await expect(waitUntilExit()).rejects.toMatchObject({ message: "boom" });
});

test("component-thrown non-Error value is still wrapped into an Error", async () => {
  // Guard: a true non-Error throw must still be wrapped into a real Error so the
  // exit/ErrorOverview machinery always receives an Error. Only the cross-realm
  // Error case is preserved; this case is unchanged.
  const trigger = shallowRef(false);
  const App = defineComponent(() => {
    return () => {
      // eslint-disable-next-line no-throw-literal -- exercising a non-Error throw on purpose
      if (trigger.value) throw "plain";
      return <Text>ok</Text>;
    };
  });

  const { waitUntilExit, lastFrame } = await render(App);
  expect(lastFrame()).toContain("ok");

  trigger.value = true;
  await nextTick();
  await nextTick();
  await Promise.resolve();

  await expect(waitUntilExit()).rejects.toBeInstanceOf(Error);
  await expect(waitUntilExit()).rejects.toMatchObject({ message: "plain" });
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
