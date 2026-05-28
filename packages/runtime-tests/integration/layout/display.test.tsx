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

test("display none after visible sibling does not corrupt output", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Text>AAA</Text>
        <Box display="none">
          <Text>BBBBB</Text>
        </Box>
        <Text>ZZ</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("AAAZZ");
});

test("display none multi-line text adds no extra rows", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Text>top</Text>
        <Box display="none">
          <Text>{"h1\nh2\nh3"}</Text>
        </Box>
        <Text>bottom</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("top\nbottom");
});

test("display none box does not paint its border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Text>AAA</Text>
        <Box display="none" borderStyle="round">
          <Text>X</Text>
        </Box>
        <Text>ZZ</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("AAAZZ");
});
