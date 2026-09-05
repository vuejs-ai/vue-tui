import { defineComponent, type VNode } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, renderToString, Text } from "@vue-tui/runtime";

// What a truncated line keeps. Every retained grapheme keeps the style its
// author wrote — including two attributes that share one end code, such as an
// inner `bold` under an outer `dimColor`, which a serialized line cannot carry
// through `cli-truncate` because `22m` closes both. The ellipsis inherits what
// the library gives it: the neighbouring retained grapheme's style in `truncate`
// and `truncate-start`, and nothing at all in `truncate-middle`.

const ESC = "\x1b";
const BEL = "\x07";

const truncated = (
  width: number,
  node: () => VNode,
  color: false | "ansi16" | "truecolor" = "truecolor",
): string =>
  renderToString(
    defineComponent(() => node),
    { color, width },
  );

test.each(["ansi16", "truecolor"] as const)(
  "an inner bold survives truncation inside an outer dimColor at %s",
  (color) => {
    const end = truncated(
      4,
      () => (
        <Box width={4}>
          <Text dimColor wrap="truncate">
            <Text bold>abcdef</Text>
          </Text>
        </Box>
      ),
      color,
    );
    const start = truncated(
      4,
      () => (
        <Box width={4}>
          <Text dimColor wrap="truncate-start">
            <Text bold>abcdef</Text>
          </Text>
        </Box>
      ),
      color,
    );
    const middle = truncated(
      4,
      () => (
        <Box width={4}>
          <Text dimColor wrap="truncate-middle">
            <Text bold>abcdef</Text>
          </Text>
        </Box>
      ),
      color,
    );

    // Both attributes, exactly as the same tree renders when it fits or wraps.
    expect(end).toBe(`${ESC}[1m${ESC}[2mabc…${ESC}[22m`);
    expect(start).toBe(`${ESC}[1m${ESC}[2m…def${ESC}[22m`);
    expect(middle).toBe(`${ESC}[1m${ESC}[2mab${ESC}[22m…${ESC}[1m${ESC}[2mf${ESC}[22m`);
  },
);

test("a truncated line carries the same styles as the untruncated one", () => {
  const wide = truncated(20, () => (
    <Box width={20}>
      <Text dimColor wrap="truncate">
        <Text bold>abcdef</Text>
      </Text>
    </Box>
  ));

  expect(wide).toBe(`${ESC}[1m${ESC}[2mabcdef${ESC}[22m`);
});

test("the ellipsis inherits the grapheme it touches, and nothing in the middle", () => {
  const line = (wrap: "truncate" | "truncate-start" | "truncate-middle") =>
    truncated(7, () => (
      <Box width={7}>
        <Text color="red" wrap={wrap}>
          Hello World
        </Text>
      </Box>
    ));

  expect(line("truncate")).toBe(`${ESC}[31mHello …${ESC}[39m`);
  expect(line("truncate-start")).toBe(`${ESC}[31m… World${ESC}[39m`);
  // `truncate-middle` joins two independently sliced halves, so the ellipsis
  // between them carries no style at all.
  expect(line("truncate-middle")).toBe(`${ESC}[31mHel${ESC}[39m…${ESC}[31mrld${ESC}[39m`);
});

test("the ellipsis inherits the nested Text it touches", () => {
  const line = (wrap: "truncate" | "truncate-start" | "truncate-middle") =>
    truncated(7, () => (
      <Box width={7}>
        <Text wrap={wrap}>
          <Text color="red">aaaa</Text>
          <Text color="blue">bbbb</Text>
        </Text>
      </Box>
    ));

  expect(line("truncate")).toBe(`${ESC}[31maaaa${ESC}[34mbb…${ESC}[39m`);
  expect(line("truncate-start")).toBe(`${ESC}[31m…aa${ESC}[34mbbbb${ESC}[39m`);
  expect(line("truncate-middle")).toBe(`${ESC}[31maaa${ESC}[39m…${ESC}[34mbbb${ESC}[39m`);
});

test("a one-column budget is the bare ellipsis, unstyled", () => {
  const output = truncated(1, () => (
    <Box width={1}>
      <Text color="red" wrap="truncate">
        Hello
      </Text>
    </Box>
  ));

  expect(output).toBe("…");
});

test("a wide grapheme a cut would split is dropped whole", () => {
  const output = truncated(7, () => (
    <Box width={7}>
      <Text color="green" wrap="truncate-middle">
        中文中文中文
      </Text>
    </Box>
  ));

  // Each half stops before the grapheme that would straddle its boundary, so
  // the line comes back five columns wide against a budget of seven.
  expect(output).toBe(`${ESC}[32m中${ESC}[39m…${ESC}[32m文${ESC}[39m`);
});

test("the ellipsis does not join the hyperlink it follows", () => {
  const output = truncated(7, () => (
    <Box width={7}>
      <Text wrap="truncate">{`${ESC}]8;;https://example.com${BEL}Hello World${ESC}]8;;${BEL}`}</Text>
    </Box>
  ));

  expect(output).toBe(`${ESC}]8;;https://example.com${BEL}Hello ${ESC}]8;;${BEL}…`);
});

test("each hard-newline line is truncated against the same budget", () => {
  const output = truncated(7, () => (
    <Box width={7}>
      <Text color="red" wrap="truncate">
        {"Hello World\nshort\nlonger line"}
      </Text>
    </Box>
  ));

  expect(output).toBe(
    `${ESC}[31mHello …${ESC}[39m\n${ESC}[31mshort${ESC}[39m\n${ESC}[31mlonger…${ESC}[39m`,
  );
});

test("a mounted host keeps an inner bold through a truncated outer dimColor", async () => {
  const App = defineComponent(() => () => (
    <Box width={4}>
      <Text dimColor wrap="truncate">
        <Text bold>abcdef</Text>
      </Text>
    </Box>
  ));
  const { lastFrame } = await render(App, { columns: 4, color: "truecolor" });

  expect(lastFrame()).toBe(`${ESC}[1m${ESC}[2mabc…${ESC}[22m`);
});
