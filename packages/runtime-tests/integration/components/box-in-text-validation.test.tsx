import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("<Box> inside <Text> throws an error", async () => {
  const App = defineComponent(() => () => (
    <Text>
      <Box />
    </Text>
  ));

  await expect(render(App)).rejects.toThrow("can’t be nested inside <Text>");
});
