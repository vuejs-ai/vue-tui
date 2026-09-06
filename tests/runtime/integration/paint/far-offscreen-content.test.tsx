import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, renderToString, Text } from "@vue-tui/runtime";

test("rejects an overflow-visible picture that exceeds the Frame resource limit", () => {
  const App = defineComponent(() => () => (
    <Box width={1} height={17}>
      <Box position="absolute" left={61680}>
        <Text>X</Text>
      </Box>
    </Box>
  ));

  expect(() => renderToString(App, { width: 10, height: 17 })).toThrow(
    "Paint surface 61681x17 exceeds the 1048576-cell resource limit.",
  );
});
