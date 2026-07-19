import { defineComponent, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, renderToString, Text, useBoxSize } from "@vue-tui/runtime";

test("validates its direct Box target on hosts without visual geometry", async () => {
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    useBoxSize(target);
    return () => <Text ref={target}>wrong target</Text>;
  });

  expect(() => renderToString(App)).toThrow(
    "useBoxSize() target must be a ref bound directly to <Box>",
  );
  await expect(
    render(App, { columns: 20, rows: 4, host: { presentation: "screen-reader" } }),
  ).rejects.toThrow("useBoxSize() target must be a ref bound directly to <Box>");
});
