import { defineComponent } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("<Box> inside <Text> emits a dev warning", async () => {
  const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

  await render(
    defineComponent(() => () => (
      <Text>
        <Box>invalid</Box>
      </Text>
    )),
  );

  expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining("<Box>"));

  warnSpy.mockRestore();
});
