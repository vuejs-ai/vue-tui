import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useRenderSession } from "@vue-tui/runtime";
import { renderToStringWithScreenReader as renderToString } from "@vue-tui/runtime/internal";

// NOTE: tests that auto-detect SR via the process-GLOBAL env var
// `INK_SCREEN_READER` live in use-screen-reader-env.sequential.test.tsx (the
// repo's process-global convention). The tests below never mutate that global.

test("the default render session reports visual presentation", async () => {
  let presentation: "visual" | "screen-reader" | undefined;
  const App = defineComponent(() => {
    presentation = useRenderSession().output.presentation;
    return () => <Text>sr test</Text>;
  });
  await render(App);
  expect(presentation).toBe("visual");
});

// The internal helper selects the fixed screen-reader string host. The
// public session reads that presentation from the shared render session.
test("the screen-reader string host reports screen-reader presentation", () => {
  let presentation: "visual" | "screen-reader" | undefined;
  const App = defineComponent(() => {
    presentation = useRenderSession().output.presentation;
    return () => <Text>sr enabled</Text>;
  });
  const output = renderToString(App);
  expect(presentation).toBe("screen-reader");
  expect(output).toBe("sr enabled");
});
