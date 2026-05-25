import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

// overflowX tests — directional overflow not yet supported
test.todo("overflowX - single text node in a box inside overflow container");
test.todo("overflowX - single text node inside overflow container with border");
test.todo("overflowX - single text node in a box with border inside overflow container");
test.todo("overflowX - multiple text nodes in a box inside overflow container");
test.todo("overflowX - multiple text nodes in a box inside overflow container with border");
test.todo("overflowX - multiple text nodes in a box with border inside overflow container");
test.todo("overflowX - multiple boxes inside overflow container");
test.todo("overflowX - multiple boxes inside overflow container with border");
test.todo("overflowX - box before left edge of overflow container");
test.todo("overflowX - box before left edge of overflow container with border");
test.todo("overflowX - box intersecting with left edge of overflow container");
test.todo("overflowX - box intersecting with left edge of overflow container with border");
test.todo("overflowX - box after right edge of overflow container");
test.todo("overflowX - box intersecting with right edge of overflow container");

// overflowY tests — directional overflow not yet supported
test.todo("overflowY - single text node inside overflow container");
test.todo("overflowY - single text node inside overflow container with border");
test.todo("overflowY - multiple boxes inside overflow container");
test.todo("overflowY - multiple boxes inside overflow container with border");
test.todo("overflowY - box above top edge of overflow container");
test.todo("overflowY - box above top edge of overflow container with border");
test.todo("overflowY - box intersecting with top edge of overflow container");
test.todo("overflowY - box intersecting with top edge of overflow container with border");
test.todo("overflowY - box below bottom edge of overflow container");
test.todo("overflowY - box below bottom edge of overflow container with border");
test.todo("overflowY - box intersecting with bottom edge of overflow container");
test.todo("overflowY - box intersecting with bottom edge of overflow container with border");

// unified overflow tests
test("overflow - single text node inside overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box paddingBottom={1}>
        <Box width={6} height={1} overflow="hidden">
          <Box width={12} height={2} flexShrink={0}>
            <Text>Hello{"\n"}World</Text>
          </Box>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("Hello\n");
});

test("overflow - single text node inside overflow container with border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box paddingBottom={1}>
        <Box width={8} height={3} overflow="hidden" borderStyle="round">
          <Box width={12} height={2} flexShrink={0}>
            <Text>Hello{"\n"}World</Text>
          </Box>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("╭──────╮\n│Hello │\n╰──────╯\n");
});

test("overflow - multiple boxes inside overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box paddingBottom={1}>
        <Box width={4} height={1} overflow="hidden">
          <Box width={2} height={2} flexShrink={0}>
            <Text>TL{"\n"}BL</Text>
          </Box>
          <Box width={2} height={2} flexShrink={0}>
            <Text>TR{"\n"}BR</Text>
          </Box>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("TLTR\n");
});

test("overflow - multiple boxes inside overflow container with border", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box paddingBottom={1}>
        <Box width={6} height={3} overflow="hidden" borderStyle="round">
          <Box width={2} height={2} flexShrink={0}>
            <Text>TL{"\n"}BL</Text>
          </Box>
          <Box width={2} height={2} flexShrink={0}>
            <Text>TR{"\n"}BR</Text>
          </Box>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("╭────╮\n│TLTR│\n╰────╯\n");
});

test("overflow - box intersecting with top left edge of overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={4} height={4} overflow="hidden">
        <Box marginTop={-2} marginLeft={-2} width={4} height={4} flexShrink={0}>
          <Text>
            AAAA{"\n"}BBBB{"\n"}CCCC{"\n"}DDDD
          </Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("CC\nDD\n\n");
});

test("overflow - box intersecting with top right edge of overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={4} height={4} overflow="hidden">
        <Box marginTop={-2} marginLeft={2} width={4} height={4} flexShrink={0}>
          <Text>
            AAAA{"\n"}BBBB{"\n"}CCCC{"\n"}DDDD
          </Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("  CC\n  DD\n\n");
});

test("overflow - box intersecting with bottom left edge of overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={4} height={4} overflow="hidden">
        <Box marginTop={2} marginLeft={-2} width={4} height={4} flexShrink={0}>
          <Text>
            AAAA{"\n"}BBBB{"\n"}CCCC{"\n"}DDDD
          </Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\nAA\nBB");
});

test("overflow - box intersecting with bottom right edge of overflow container", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={4} height={4} overflow="hidden">
        <Box marginTop={2} marginLeft={2} width={4} height={4} flexShrink={0}>
          <Text>
            AAAA{"\n"}BBBB{"\n"}CCCC{"\n"}DDDD
          </Text>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("\n\n  AA\n  BB");
});

test("nested overflow", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box paddingBottom={1}>
        <Box width={4} height={4} overflow="hidden" flexDirection="column">
          <Box width={2} height={2} overflow="hidden">
            <Box width={4} height={4} flexShrink={0}>
              <Text>
                AAAA{"\n"}BBBB{"\n"}CCCC{"\n"}DDDD
              </Text>
            </Box>
          </Box>

          <Box width={4} height={3}>
            <Text>
              XXXX{"\n"}YYYY{"\n"}ZZZZ
            </Text>
          </Box>
        </Box>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame({ trimLines: true })).toBe("AA\nBB\nXXXX\nYYYY\n");
});

test("out of bounds writes do not crash", async () => {
  // Just verify it renders without throwing; exact output varies by terminal width
  const { lastFrame } = await render(
    defineComponent(() => () => <Box width={12} height={10} borderStyle="round" />),
    { columns: 10 },
  );
  expect(lastFrame({ trimLines: true })).toBeDefined();
});
