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

test("exit() called multiple times is idempotent", async () => {
  // Mirrors Ink's "exit normally without unmount() or exit()" pattern:
  // verifies that calling exit() twice does not throw or reject again.
  let exitFn!: () => void;

  const App = defineComponent(() => {
    exitFn = useExit();
    return () => <Text>x</Text>;
  });

  const { waitUntilExit } = await render(App);
  exitFn();
  exitFn(); // second call — must not throw or create a new promise
  await waitUntilExit();
});

test("waitUntilExit() resolves with result value passed to exit()", async () => {
  // Mirrors Ink's "exit on exit() with result value"
  let exitFn!: (errorOrResult?: unknown) => void;

  const App = defineComponent(() => {
    exitFn = useExit();
    return () => <Text>hello from vue-tui</Text>;
  });

  const { lastFrame, waitUntilExit } = await render(App);
  expect(lastFrame()).toContain("hello from vue-tui");

  exitFn("hello from ink");
  await expect(waitUntilExit()).resolves.toBe("hello from ink");
});

test("waitUntilExit() resolves with object result value", async () => {
  // Mirrors Ink's "exit on exit() with object result"
  let exitFn!: (errorOrResult?: unknown) => void;

  const App = defineComponent(() => {
    exitFn = useExit();
    return () => <Text>hello</Text>;
  });

  const { waitUntilExit } = await render(App);
  const resultObj = { message: "hello from ink object" };
  exitFn(resultObj);
  await expect(waitUntilExit()).resolves.toBe(resultObj);
});

test("waitUntilExit() resolves with undefined when exit() called with no args", async () => {
  let exitFn!: (errorOrResult?: unknown) => void;

  const App = defineComponent(() => {
    exitFn = useExit();
    return () => <Text>hello</Text>;
  });

  const { waitUntilExit } = await render(App);
  exitFn();
  await expect(waitUntilExit()).resolves.toBeUndefined();
});

test("onScopeDispose fires when exit(error) is called", async () => {
  // Mirrors Ink's "exit with thrown error" fixture — verifies teardown hooks
  // still run even when the exit is error-driven.
  let exitFn!: (err?: Error) => void;
  let disposed = false;

  const App = defineComponent(() => {
    exitFn = useExit();
    onScopeDispose(() => {
      disposed = true;
    });
    return () => <Text>running</Text>;
  });

  const { waitUntilExit } = await render(App);
  exitFn(new Error("errored"));
  await waitUntilExit().catch(() => {});
  expect(disposed).toBe(true);
});

test("exit(error) followed by exit(value) still rejects", async () => {
  // Edge case: when exit is called with an error first, a subsequent exit()
  // call with a plain value should not override the rejection. The error
  // should take precedence because teardown runs only once.
  let exitFn!: (errorOrResult?: unknown) => void;

  const App = defineComponent(() => {
    exitFn = useExit();
    return () => <Text>hello</Text>;
  });

  const { waitUntilExit } = await render(App);

  const boom = new Error("first-error");
  exitFn(boom);
  exitFn("second-value");

  await expect(waitUntilExit()).rejects.toThrow("first-error");
});

test("exit(value) resolves even when called rapidly twice", async () => {
  // Verifies rapid duplicate exit() calls don't crash or hang.
  // Both calls queue microtasks; teardown() is idempotent so
  // the app shuts down cleanly regardless.
  let exitFn!: (errorOrResult?: unknown) => void;

  const App = defineComponent(() => {
    exitFn = useExit();
    return () => <Text>hello</Text>;
  });

  const { waitUntilExit } = await render(App);

  exitFn("first");
  exitFn("second");

  // Should resolve without throwing or hanging; second value wins because
  // both exit() calls queue microtasks that overwrite pendingExitResult
  // before the write barrier fires.
  const result = await waitUntilExit();
  expect(result).toBe("second");
});
