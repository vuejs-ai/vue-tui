import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, Newline, Spacer } from "@vue-tui/runtime";

test("Newline emits line breaks inside Text", async () => {
  const { lastFrame } = await render(() => (
    <Text>
      a<Newline count={2} />b
    </Text>
  ));
  const lines = lastFrame()!.split("\n").filter(Boolean);
  expect(lines.length).toBeGreaterThanOrEqual(2);
});

test("Spacer pushes siblings apart in row direction", async () => {
  const { lastFrame } = await render(
    () => (
      <Box flexDirection="row" width={10}>
        <Text>L</Text>
        <Spacer />
        <Text>R</Text>
      </Box>
    ),
    { columns: 10 },
  );
  const line = lastFrame()!.split("\n")[0]!;
  expect(line.startsWith("L")).toBe(true);
  expect(line.trimEnd().endsWith("R")).toBe(true);
});

// --- Ink newline/spacer tests ---

test("newline", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text>
        Hello
        <Newline />
        World
      </Text>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Hello\nWorld");
});

test("multiple newlines", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text>
        Hello
        <Newline count={2} />
        World
      </Text>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Hello\n\nWorld");
});

test("horizontal spacer", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Text>Left</Text>
        <Spacer />
        <Text>Right</Text>
      </Box>
    )),
    { columns: 20 },
  );
  expect(lastFrame()).toBe("Left           Right");
});

test("vertical spacer", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column" height={6}>
        <Text>Top</Text>
        <Spacer />
        <Text>Bottom</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Top\n\n\n\n\nBottom");
});
