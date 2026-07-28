import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { staticTranscript } from "./harness.ts";

test("multiple independently mounted Static regions are all honored", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Box>
          <Static>
            <Text>HEADER</Text>
          </Static>
        </Box>
        <Box>
          <Static>
            <Text>LOG</Text>
          </Static>
        </Box>
        <Text>[live]</Text>
      </Box>
    )),
  );

  expect(staticTranscript(result.frames)).toBe("HEADER\nLOG\n");
  expect(result.lastFrame()).toBe("[live]");
});

test("component and Fragment wrappers are valid while ancestor Box layout stays outside the block", async () => {
  const ThroughFragment = defineComponent(() => () => (
    <>
      <Static>
        <Box flexDirection="row">
          <Text>A</Text>
          <Text>B</Text>
        </Box>
      </Static>
    </>
  ));
  const result = await render(
    defineComponent(() => () => (
      <Box flexDirection="column-reverse" width={1} paddingLeft={4} overflow="hidden">
        <ThroughFragment />
        <Text>[live]</Text>
      </Box>
    )),
  );

  expect(staticTranscript(result.frames)).toBe("AB\n");
  expect(result.lastFrame()).toBe("");
});

test("layout inside a Static block uses ordinary Box composition", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Static>
        <Box flexDirection="row" paddingLeft={2}>
          <Text>A</Text>
          <Text>B</Text>
        </Box>
      </Static>
    )),
  );

  expect(staticTranscript(result.frames)).toBe("  AB\n");
});

test("an auto-width Static block content-sizes growing children", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Static>
        <Box flexDirection="row">
          <Text>A</Text>
          <Box flexGrow={1} />
          <Text>B</Text>
        </Box>
      </Static>
    )),
    { columns: 80 },
  );

  expect(staticTranscript(result.frames)).toBe("AB\n");
});

test("an explicit-width child can overflow the terminal in Static history", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Static>
        <Box width={10} flexShrink={0}>
          <Text>ABCDEFGHIJ</Text>
        </Box>
      </Static>
    )),
    { columns: 5 },
  );

  expect(staticTranscript(result.frames)).toBe("ABCDEFGHIJ\n");
});

test("plain wide Text in Static history wraps to the terminal width", async () => {
  const result = await render(
    defineComponent(() => () => (
      <Static>
        <Text>ABCDEFGHIJ</Text>
      </Static>
    )),
    { columns: 5 },
  );

  expect(staticTranscript(result.frames)).toBe("ABCDE\nFGHIJ\n");
});
