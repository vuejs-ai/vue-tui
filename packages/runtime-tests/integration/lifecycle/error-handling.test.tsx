import { defineComponent, onMounted } from "vue";
import { PassThrough } from "node:stream";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, createApp, Text, useApp, useStdin } from "@vue-tui/runtime";

test("setup() throw rejects render()", async () => {
  const Boom = defineComponent(() => {
    throw new Error("setup boom");
  });
  await expect(render(Boom)).rejects.toThrow("setup boom");
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

test("raw mode is disabled when initial mount fails", async () => {
  const setRawModeCalls: boolean[] = [];
  const mountError = new Error("Error after raw mode enabled");

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
    useStdin().setRawMode(true);
    onMounted(() => {
      throw mountError;
    });
    return () => <Text>Test</Text>;
  });

  const app = createApp(Boom);
  let thrown: unknown;
  try {
    app.mount({ stdout, stdin, stderr });
  } catch (error) {
    thrown = error;
  }

  expect(thrown).toBe(mountError);
  await expect(app.waitUntilExit()).rejects.toBe(mountError);

  expect(setRawModeCalls).toContain(true);
  expect(setRawModeCalls).toContain(false);
  expect(setRawModeCalls.lastIndexOf(false)).toBeGreaterThan(setRawModeCalls.indexOf(true));
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
