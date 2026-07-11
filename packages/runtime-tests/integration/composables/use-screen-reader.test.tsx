import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useIsScreenReaderEnabled } from "@vue-tui/runtime";
import { renderToStringWithScreenReader as renderToString } from "@vue-tui/runtime/internal";

// NOTE: tests that auto-detect SR via the process-GLOBAL env var
// `INK_SCREEN_READER` live in use-screen-reader-env.sequential.test.tsx (the
// repo's process-global convention). The tests below never mutate that global.

test("useIsScreenReaderEnabled returns false by default", async () => {
  let result = false;
  const App = defineComponent(() => {
    result = useIsScreenReaderEnabled();
    return () => <Text>sr test</Text>;
  });
  await render(App);
  expect(result).toBe(false);
});

// The internal helper selects the fixed screen-reader string host. The
// composable reads that presentation from the shared render session.
test("useIsScreenReaderEnabled returns true in the screen-reader string host", () => {
  let result: boolean | undefined;
  const App = defineComponent(() => {
    result = useIsScreenReaderEnabled();
    return () => <Text>sr enabled</Text>;
  });
  const output = renderToString(App);
  // Composable observed the enabled flag, and the SR text still rendered.
  expect(result).toBe(true);
  expect(output).toBe("sr enabled");
});
