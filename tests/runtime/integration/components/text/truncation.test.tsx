import { defineComponent, type VNode } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, renderToString, Text } from "@vue-tui/runtime";

// What a truncated line keeps. Every retained grapheme keeps the style its
// author wrote — including two attributes that share one end code, such as an
// inner `bold` under an outer `dimColor`, which a serialized line cannot carry
// because `22m` closes both. The ellipsis inherits the complete style of the
// retained grapheme it touches in `truncate` and `truncate-start`, and nothing
// at all in `truncate-middle`, where the two retained pieces are cut
// independently and it belongs to neither.

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

// "Complete style" includes a sequence with colon sub-parameters, which Runtime
// carries through as the exact pair the author wrote. Truncating on cells rather
// than on a serialized line is what makes that reachable: a scan over an SGR
// string that accepts only digits and semicolons stops at the colon and leaves
// the ellipsis bare.
test("the ellipsis inherits a colon-form sequence like any other style", () => {
  const line = (wrap: "truncate" | "truncate-start" | "truncate-middle") =>
    truncated(4, () => (
      <Box width={4}>
        <Text wrap={wrap}>{`${ESC}[4:3mabcdef`}</Text>
      </Box>
    ));

  expect(line("truncate")).toBe(`${ESC}[4:3mabc…${ESC}[24m`);
  expect(line("truncate-start")).toBe(`${ESC}[4:3m…def${ESC}[24m`);
  expect(line("truncate-middle")).toBe(`${ESC}[4:3mab${ESC}[24m…${ESC}[4:3mf${ESC}[24m`);
});

// What a grapheme costs the budget. Runtime measures every grapheme with
// `string-width` and gives it `max(1, width)` slots, so a zero-width grapheme
// spends no column of the budget while still holding a slot of its own, and a
// wide one spends two. Every byte below is `0b781b41`'s too, except the
// variation-selector cases: `string-width` reads `"a\ufe0f"` as the one column
// its base displays, while the string round trip `0b781b41` truncated with took
// the width from `@alcalzone/ansi-tokenize`, which calls any cluster holding
// U+FE0F full-width — so `0b781b41` renders `"a\ufe0f…"` for the first case.
//
// The invisible characters are written as escapes: a literal one in a source
// string cannot be read, and every expectation here turns on exactly which one
// is present.

const VS16 = "\ufe0f";
const ZWSP = "\u200b";
const SOFT_HYPHEN = "\u00ad";
const COMBINING_ACUTE = "\u0301";
const ZWJ = "\u200d";
const IDEOGRAPHIC_SPACE = "\u3000";
const FAMILY = `\u{1f468}${ZWJ}\u{1f469}${ZWJ}\u{1f467}${ZWJ}\u{1f466}`;

const truncatedText = (
  width: number,
  wrap: "truncate" | "truncate-start" | "truncate-middle",
  text: string,
): string =>
  truncated(width, () => (
    <Box width={width}>
      <Text wrap={wrap}>{text}</Text>
    </Box>
  ));

test("a variation selector after a non-emoji base spends no column", () => {
  expect(truncatedText(4, "truncate", `a${VS16}bcde`)).toBe(`a${VS16}bc…`);
  expect(truncatedText(4, "truncate-start", `abcde${VS16}f`)).toBe(`…de${VS16}f`);
  expect(truncatedText(4, "truncate-middle", `a${VS16}bcdef`)).toBe(`a${VS16}b…f`);
});

// The right-hand windows end at the columns the line displays, not at the slots
// it occupies, so a zero-width grapheme anywhere in the line shifts them one
// slot to the left: the `truncate-start` case below keeps `cde`, not `def`.
test("a zero-width grapheme spends no column but holds a slot", () => {
  expect(truncatedText(4, "truncate", `ab${ZWSP}cdef`)).toBe("ab…");
  expect(truncatedText(4, "truncate-start", `ab${ZWSP}cdef`)).toBe("…cde");
  expect(truncatedText(5, "truncate-middle", `ab${ZWSP}cdefgh`)).toBe("ab…fg");
  expect(truncatedText(4, "truncate", `ab${SOFT_HYPHEN}cdef`)).toBe("ab…");
});

test("a combining mark is cut with the base it marks", () => {
  const marked = `abc${COMBINING_ACUTE}def`;

  expect(truncatedText(4, "truncate", marked)).toBe(`abc${COMBINING_ACUTE}…`);
  expect(truncatedText(4, "truncate-start", marked)).toBe("…def");
  expect(truncatedText(5, "truncate-middle", `abc${COMBINING_ACUTE}defgh`)).toBe("ab…gh");
});

test("a ZWJ emoji sequence is cut whole, at the two columns it displays", () => {
  expect(truncatedText(5, "truncate", `${FAMILY}abcdefgh`)).toBe(`${FAMILY}ab…`);
  expect(truncatedText(5, "truncate-start", `abcdefgh${FAMILY}`)).toBe(`…gh${FAMILY}`);
  expect(truncatedText(6, "truncate-middle", `ab${FAMILY}cdefgh`)).toBe("ab…gh");
});

test("a CJK glyph and an ideographic space each spend two columns", () => {
  expect(truncatedText(5, "truncate", "中文中文中文")).toBe("中文…");
  expect(truncatedText(5, "truncate-start", "中文中文中文")).toBe("…中文");
  expect(truncatedText(6, "truncate", `ab${IDEOGRAPHIC_SPACE}cdefgh`)).toBe(
    `ab${IDEOGRAPHIC_SPACE}c…`,
  );
});

// A line that displays no columns at all still fits every budget, so
// truncation leaves it alone: the modes shorten a line that is too wide, and
// nothing here is too wide. Zero-width graphemes reach a Text through pasted
// text, an editor's invisible characters, or a lone combining mark, and the
// three modes must keep painting what the author wrote — with the props and the
// hyperlink around it.
test.each(["truncate", "truncate-start", "truncate-middle"] as const)(
  "%s keeps a line that displays no columns",
  (wrap) => {
    const output = truncated(4, () => (
      <Box width={4}>
        <Text wrap={wrap}>{ZWSP}</Text>
      </Box>
    ));

    expect(output).toBe(ZWSP);
  },
);

test("a lone variation selector and a lone combining mark survive truncation", () => {
  const line = (text: string) =>
    truncated(4, () => (
      <Box width={4}>
        <Text wrap="truncate">{text}</Text>
      </Box>
    ));

  expect(line(VS16)).toBe(VS16);
  expect(line(COMBINING_ACUTE)).toBe(COMBINING_ACUTE);
});

test("a zero-column line keeps the props and the hyperlink written around it", () => {
  const colored = truncated(4, () => (
    <Box width={4}>
      <Text color="red" wrap="truncate">
        {ZWSP}
      </Text>
    </Box>
  ));
  const linked = truncated(4, () => (
    <Box width={4}>
      <Text wrap="truncate">{`${ESC}]8;;https://example.com${BEL}${ZWSP}${ESC}]8;;${BEL}`}</Text>
    </Box>
  ));

  expect(colored).toBe(`${ESC}[31m${ZWSP}${ESC}[39m`);
  expect(linked).toBe(`${ESC}]8;;https://example.com${BEL}${ZWSP}${ESC}]8;;${BEL}`);
});

test("each zero-column hard-newline line is kept", () => {
  const output = truncated(4, () => (
    <Box width={4}>
      <Text wrap="truncate">{`${ZWSP}\n${ZWSP}`}</Text>
    </Box>
  ));

  expect(output).toBe(`${ZWSP}\n${ZWSP}`);
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
