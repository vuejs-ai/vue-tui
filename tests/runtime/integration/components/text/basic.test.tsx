import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("nested Text renders inline without independent layout", async () => {
  const { lastFrame } = await render(() => (
    <Text>
      Hello <Text color="red">world</Text>
    </Text>
  ));
  const frame = lastFrame()!;
  expect(frame).toContain("Hello");
  expect(frame).toContain("world");
});

test("CJK wide characters render without corruption", async () => {
  const { lastFrame } = await render(() => <Text>中文测试</Text>, { columns: 20 });
  const frame = lastFrame()!;
  expect(frame).toContain("中文测试");
});

test("content composes an explicit newline", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text>{`Hello\nWorld`}</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Hello\nWorld");
});

test("content composes repeated newlines", async () => {
  const count = 2;
  const { lastFrame } = await render(
    defineComponent(() => () => <Text>{`Hello${"\n".repeat(count)}World`}</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Hello\n\nWorld");
});

// --- Ink text tests ---

test("<Text> with undefined children", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text />),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("");
});

test("<Text> with null children", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text>{null}</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("");
});

// --- Ink text/wrapping tests ---

test("text", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text>Hello World</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Hello World");
});

test("text with variable", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text>Count: {1}</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Count: 1");
});

test("multiple text nodes", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text>
        {"Hello"}
        {" World"}
      </Text>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Hello World");
});

test("text with component", async () => {
  const World = defineComponent(() => () => <Text>World</Text>);
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text>
        Hello <World />
      </Text>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Hello World");
});

test("wrap text", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={7}>
        <Text wrap="wrap">Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Hello\nWorld");
});

test("don't wrap text if there is enough space", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={20}>
        <Text wrap="wrap">Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Hello World");
});

test("truncate text in the end", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={7}>
        <Text wrap="truncate">Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Hello …");
});

// --- Component edge case tests (ported from Ink components.tsx) ---

test("ignore empty text node", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Box>
          <Text>Hello World</Text>
        </Box>
        <Text>{""}</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Hello World");
});

test("render a single empty text node", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text>{""}</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("");
});

test("number", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text>{1}</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("1");
});

// Ink components.tsx:80-88,363-372: a fragment nested inline inside <Text> is
// flattened into the surrounding text run, so "Hello " + <>World</> squashes to
// "Hello World" (the fragment contributes no layout of its own).
test("inline fragment inside <Text> flattens into the text run", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text>
        Hello <>World</>
      </Text>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Hello World");
});

// A top-level fragment wrapping a single <Text> renders as that text — the
// fragment is transparent at the root, matching Ink's root-fragment handling.
test("top-level fragment wrapping a <Text> renders the text", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <>
        <Text>Hello World</Text>
      </>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Hello World");
});
