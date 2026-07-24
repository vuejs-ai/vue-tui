import { defineComponent, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, renderToString, Text, useBoxMetrics } from "@vue-tui/runtime";

test("validates its direct Box target on hosts without visual geometry", async () => {
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    useBoxMetrics(target);
    return () => <Text ref={target}>wrong target</Text>;
  });

  expect(() => renderToString(App)).toThrow(
    "useBoxMetrics() target must be a ref bound directly to <Box>",
  );
  await expect(render(App, { columns: 20, rows: 4, host: { stdout: "stream" } })).rejects.toThrow(
    "useBoxMetrics() target must be a ref bound directly to <Box>",
  );
});
