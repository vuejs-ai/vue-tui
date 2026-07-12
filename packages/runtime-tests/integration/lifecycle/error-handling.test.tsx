import { defineComponent, nextTick, onMounted, shallowRef } from "vue";
import { PassThrough } from "node:stream";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, createApp, Text, useApp, useInput } from "@vue-tui/runtime";

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

// NOTE: the "does not emit unhandledRejection …" test lives in
// error-handling.sequential.test.tsx — it installs a process-global
// `unhandledRejection` listener, which file-level parallelism can perturb
// (a sibling test's stray rejection would be miscounted). See Ink's
// test.serial for the same reason.

// Port of Ink errors.tsx:123-169 ("clean up raw mode when error is thrown"):
// a component that enables raw mode and then throws must have raw mode DISABLED
// again on the error cleanup path. We spy on a TTY stdin's setRawMode and assert
// it recorded both an enable (true) and a later disable (false) after the throw
// rejects waitUntilExit.
test("raw mode is disabled on the thrown-error cleanup path", async () => {
  const setRawModeCalls: boolean[] = [];

  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdin, {
    isTTY: true,
    setRawMode(this: NodeJS.ReadStream, mode: boolean) {
      setRawModeCalls.push(mode);
      return this;
    },
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
    ref() {},
    unref() {},
  });

  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { isTTY: true, columns: 80, rows: 24 });
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stderr, { isTTY: true, columns: 80, rows: 24 });

  const Boom = defineComponent(() => {
    useInput(() => {});
    onMounted(() => {
      throw new Error("Error after raw mode enabled");
    });
    return () => <Text>Test</Text>;
  });

  const app = createApp(Boom);
  app.mount({ stdout, stdin, stderr, exitOnCtrlC: false });

  // The thrown error routes through exit() and rejects waitUntilExit; swallow it.
  await expect(app.waitUntilExit()).rejects.toThrow("Error after raw mode enabled");

  // Raw mode was enabled, then disabled again on cleanup.
  expect(setRawModeCalls).toContain(true);
  expect(setRawModeCalls).toContain(false);
  // The disable must come AFTER an enable (teardown order).
  expect(setRawModeCalls.lastIndexOf(false)).toBeGreaterThan(setRawModeCalls.indexOf(true));
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
