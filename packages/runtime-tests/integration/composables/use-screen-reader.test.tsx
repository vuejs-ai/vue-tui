import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useViewportHeight } from "@vue-tui/runtime";
import { renderToStringWithScreenReader as renderToString } from "@vue-tui/runtime/internal";

// NOTE: tests that auto-detect SR via the process-GLOBAL env var
// `INK_SCREEN_READER` live in use-screen-reader-env.sequential.test.tsx (the
// repo's process-global convention). The tests below never mutate that global.

test("the default visual live host exposes a finite viewport", async () => {
  let viewportHeight: ReturnType<typeof useViewportHeight> | undefined;
  const App = defineComponent(() => {
    viewportHeight = useViewportHeight();
    return () => <Text>sr test</Text>;
  });
  const result = await render(App, { rows: 24 });
  expect(viewportHeight?.value).toBe(24);
  result.dispose();
});

test("the screen-reader string host has no finite visual viewport", () => {
  let viewportHeight: ReturnType<typeof useViewportHeight> | undefined;
  const App = defineComponent(() => {
    viewportHeight = useViewportHeight();
    return () => <Text>sr enabled</Text>;
  });
  const output = renderToString(App);
  expect(viewportHeight).toBeNull();
  expect(output).toBe("sr enabled");
});
