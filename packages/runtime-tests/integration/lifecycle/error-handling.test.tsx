import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useExit } from "@vue-tui/runtime";

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
  try {
    await nextTick();
  } catch {
    // swallow the render error
  }

  expect(() => unmount()).not.toThrow();
});

test("useExit() called with error rejects waitUntilExit", async () => {
  // Mirrors Ink's "exit on exit() with error" fixture test, adapted for
  // render-based testing. Verifies exit(err) rejects the promise cleanly.
  // Also covered by exit.test.tsx "exit(error) rejects waitUntilExit with the error".
  let exitFn!: (err?: Error) => void;

  const App = defineComponent(() => {
    exitFn = useExit();
    return () => <Text>running</Text>;
  });

  const { waitUntilExit } = await render(App);

  const err = new Error("errored via useExit");
  exitFn(err);

  await expect(waitUntilExit()).rejects.toBe(err);
});

// --- Tests that cannot be ported due to vue-tui runtime limitations ---

test.todo(
  "nested component setup error rejects waitUntilExit — " +
    "errorHandler is installed AFTER mount, so errors during initial mount " +
    "propagate synchronously instead of routing through exit(err). " +
    "Additionally, throwing during mount corrupts the WASM yoga tree, " +
    "making teardown unreliable. Requires runtime-level pre-mount error handling.",
);

test.todo(
  "does not emit unhandledRejection when render exits with an error and waitUntilExit is unused — " +
    "in vue-tui, setup errors thrown during mount surface via render() rejection " +
    "and may also produce unhandledRejection events from Vue's internal promise chains " +
    "before our exitPromise.catch() guard takes effect. Requires engine-level fix.",
);

test.todo(
  "error in component triggered after mount routes through errorHandler — " +
    "render-function throws during a reactive re-render (post-mount) cause " +
    "yoga WASM table index out-of-bounds crashes that corrupt the layout engine. " +
    "The errorHandler is called but the process state is unrecoverable. " +
    "Requires WASM error isolation or render-phase error recovery in the runtime.",
);

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
