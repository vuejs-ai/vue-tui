import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("display flex", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box display="flex">
        <Text>X</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("X");
});

test("display none", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Box display="none">
          <Text>Kitty!</Text>
        </Box>
        <Text>Doggo</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("Doggo");
});

// Skipped: display flex - concurrent
// Skipped: display none - concurrent
