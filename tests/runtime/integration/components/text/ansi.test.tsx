import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, renderToString, Text } from "@vue-tui/runtime";
import ansiEscapes from "ansi-escapes";
import { Chalk } from "chalk";
import stripAnsi from "strip-ansi";

const chalk = new Chalk({ level: 3 });

// Keep this suite at the Text boundary: the sanitizer's exhaustive token matrix
// belongs to packages/runtime/tests/paint/sanitize-ansi.test.ts. These cases
// prove that Text uses that policy and that sanitization happens before layout.

const ESC = "\x1b";
const BEL = "\x07";

const renderText = async (text: string): Promise<string> => {
  const App = defineComponent(() => () => (
    <Box>
      <Text>{text}</Text>
    </Box>
  ));
  const { lastFrame } = await render(App, { columns: 100 });
  return lastFrame()!;
};

test("strip ANSI cursor movement sequences from text", async () => {
  // \x1b[1A = cursor up, \x1b[2K = clear line, \x1b[1B = cursor down
  // \x1b[32m = green (SGR, preserved), \x1b[0m = reset (SGR, preserved)
  const input = `${ESC}[1A${ESC}[2KStarting client ... ${ESC}[32mdone${ESC}[0m${ESC}[1B`;
  const frame = await renderText(input);
  expect(frame).not.toContain(`${ESC}[1A`);
  expect(frame).not.toContain(`${ESC}[2K`);
  expect(frame).not.toContain(`${ESC}[1B`);
  expect(stripAnsi(frame)).toBe("Starting client ... done");
});

test("preserve OSC hyperlink sequences in text", async () => {
  const frame = await renderText(`${ESC}]8;;https://example.com${BEL}link${ESC}]8;;${BEL}`);
  expect(frame).toContain(`${ESC}]8;;`);
  expect(stripAnsi(frame)).toBe("link");
});

test.each([
  ["ST opener and BEL closer", `${ESC}\\`, BEL],
  ["BEL opener and ST closer", BEL, `${ESC}\\`],
] as const)(
  "close an OSC hyperlink with a different valid terminator: %s",
  (_name, open, close) => {
    const output = renderToString(
      defineComponent(() => () => (
        <Text>{`${ESC}]8;;https://example.com${open}A${ESC}]8;;${close}B`}</Text>
      )),
      { color: "truecolor", width: 100 },
    );

    expect(output).toBe(`${ESC}]8;;https://example.com${BEL}A${ESC}]8;;${BEL}B`);
  },
);

test("preserve every paired SGR attribute written in Text content", () => {
  const content = [
    "\x1b[1mbold\x1b[22m",
    "\x1b[2mdim\x1b[22m",
    "\x1b[3mitalic\x1b[23m",
    "\x1b[4munderline\x1b[24m",
    "\x1b[5mblink\x1b[25m",
    "\x1b[6mrapid-blink\x1b[25m",
    "\x1b[7minverse\x1b[27m",
    "\x1b[8mconceal\x1b[28m",
    "\x1b[9mstrike\x1b[29m",
    "\x1b[53moverline\x1b[55m",
  ].join(" ");
  const output = renderToString(
    defineComponent(() => () => <Text>{content}</Text>),
    { color: "truecolor", width: 100 },
  );

  expect(output).toBe(content);
});

test.each([
  ["framed", `${ESC}[51m`, `${ESC}[0m`],
  ["superscript", `${ESC}[73m`, `${ESC}[0m`],
  ["alternate font", `${ESC}[11m`, `${ESC}[0m`],
  ["ideogram underline", `${ESC}[60m`, `${ESC}[0m`],
  ["underline color", `${ESC}[58:2::255:0:0m`, `${ESC}[59m`],
  ["semicolon underline color", `${ESC}[58;2;255;0;0m`, `${ESC}[59m`],
] as const)("preserve authored %s SGR through a frame", (text, open, close) => {
  const content = `${open}${text}${close}`;
  const output = renderToString(
    defineComponent(() => () => <Text>{content}</Text>),
    { color: "truecolor", width: 100 },
  );

  expect(output).toBe(content);
});

test("preserve colon underline styles through the frame fallback", () => {
  const render = (content: string) =>
    renderToString(
      defineComponent(() => () => <Text>{content}</Text>),
      { color: "truecolor", width: 40 },
    );

  expect(render(`${ESC}[4:3mcurly${ESC}[24m x`)).toBe(`${ESC}[4:3mcurly${ESC}[24m x`);
  expect(render(`${ESC}[4:1mone${ESC}[4:0m x`)).toBe(`${ESC}[4:1mone${ESC}[24m x`);
  expect(render(`${ESC}[4:2mtwo${ESC}[24m x`)).toBe(`${ESC}[4:2mtwo${ESC}[24m x`);
  expect(render(`${ESC}[1;4:3mbold${ESC}[0m x`)).toBe(
    `${ESC}[1m${ESC}[4:3mbold${ESC}[24m${ESC}[22m x`,
  );
});

test("preserve fallback SGR on every wrapped frame row", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={3}>
        <Text wrap="wrap">{`${ESC}[51mabcdef${ESC}[0m`}</Text>
      </Box>
    )),
    { color: "truecolor", width: 3 },
  );

  expect(output).toBe(`${ESC}[51mabc${ESC}[0m\n${ESC}[51mdef${ESC}[0m`);
});

test("preserve coexisting fallback SGR that share the generic reset", () => {
  const content = `${ESC}[51m${ESC}[73mcombined${ESC}[0m`;
  const output = renderToString(
    defineComponent(() => () => <Text>{content}</Text>),
    { color: "truecolor", width: 100 },
  );

  expect(output).toBe(content);
});

test.each([
  ["truecolor", "\x1b[38;2;300;100;0mcolor\x1b[39m", "\x1b[38;2;300;100;0m"],
  ["indexed color", "\x1b[38;5;300mcolor\x1b[39m", "\x1b[38;5;300m"],
] as const)("preserve authored out-of-range %s as fallback SGR", (_name, content, open) => {
  const output = renderToString(
    defineComponent(() => () => <Text>{content}</Text>),
    { color: "truecolor", width: 100 },
  );

  expect(output).toBe(`${open}color\x1b[39m`);
});

test("switches from slow to rapid blink without clearing the fallback first", () => {
  const output = renderToString(
    defineComponent(() => () => <Text>{"\x1b[5mA\x1b[6mB\x1b[0mC"}</Text>),
    { color: "truecolor", width: 100 },
  );

  expect(output).toBe("\x1b[5mA\x1b[6mB\x1b[25mC");
});

// ESC#8 (DECALN) is an Fe-type sequence with an intermediate byte that sanitizeAnsi
// strips at PAINT time. This is a WIDTH mis-measure: raw string-width("A\x1b#8BC") is
// 2, but paint strips ESC#8 and emits the 3-column "ABC". Measuring the raw string
// would under-size the Yoga cell and clip the trailing C at a tight width. Measure
// and paint must both use the sanitized visible text.
test("strip complete ESC#8 (DECALN) sequence without clipping at a tight width", async () => {
  // width 3 is exactly the SANITIZED visible width ("ABC"); the raw string measures
  // narrower (2), so a raw measure undersizes the cell and drops the trailing "C".
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={3}>
        <Text>{`A${ESC}#8BC`}</Text>
      </Box>
    )),
    { width: 3 },
  );
  expect(output).not.toContain(`${ESC}#8`);
  expect(stripAnsi(output)).toBe("ABC");
});

test("do not wrap text with BEL-terminated OSC hyperlinks", async () => {
  const hyperlink = "\x1b]8;;https://example.com\x07Click here\x1b]8;;\x07";
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={20}>
        <Text wrap="wrap">{hyperlink}</Text>
      </Box>
    )),
    { width: 20 },
  );
  expect(stripAnsi(output)).toBe("Click here");
});

test("do not wrap text with ST-terminated OSC hyperlinks", async () => {
  const hyperlink = "\x1b]8;;https://example.com\x1b\\Click here\x1b]8;;\x1b\\";
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={20}>
        <Text wrap="wrap">{hyperlink}</Text>
      </Box>
    )),
    { width: 20 },
  );
  expect(stripAnsi(output)).toBe("Click here");
});

test("do not wrap text with non-hyperlink OSC (BEL-terminated) sequences", async () => {
  const text = "\x1b]0;My Title\x07Some text";
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={20}>
        <Text wrap="wrap">{text}</Text>
      </Box>
    )),
    { width: 20 },
  );
  expect(stripAnsi(output)).toBe("Some text");
});

test("do not wrap text with non-hyperlink OSC (ST-terminated) sequences", async () => {
  const text = "\x1b]0;My Title\x1b\\Some text";
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={20}>
        <Text wrap="wrap">{text}</Text>
      </Box>
    )),
    { width: 20 },
  );
  expect(stripAnsi(output)).toBe("Some text");
});

// wrap-ansi@10 protects OSC 8 hyperlinks but can split generic OSC commands
// into visible fragments. The geometry-safe text path therefore drops a title
// command before wrapping and lays out only the visible text.
test("drop non-hyperlink OSC before hard-wrapping visible text", async () => {
  const text = "\x1b]0;My Title\x07abcdefghij";
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={5}>
        <Text wrap="wrap">{text}</Text>
      </Box>
    )),
    { width: 5 },
  );
  expect(stripAnsi(output)).toBe("abcde\nfghij");
});

test("hard-wrap single-word BEL-terminated OSC hyperlink", async () => {
  const hyperlink = "\x1b]8;;https://example.com\x07abcdefghij\x1b]8;;\x07";
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={5}>
        <Text wrap="wrap">{hyperlink}</Text>
      </Box>
    )),
    { width: 5 },
  );
  expect(stripAnsi(output)).toBe("abcde\nfghij");
});

// This exercises sanitize-before-measure through the nested-leaf squash path. The
// text "ab" + green "CD" + "\x1b[2K" (erase-line CSI) + "ef" sanitizes to the
// 6-visible-column "abCDef". Unlike the ESC#8 case, this is NOT a width mis-measure:
// raw and sanitized string-width are EQUAL (both count \x1b[2K as zero). The break is
// in the wrap step: wrap-ansi doesn't recognise the \x1b[2K CSI and would treat
// the raw "abCD\x1b[2Kef" as one unwrapped line. At width 4
// the trailing "ef" overflowed the single-line cell and was clipped. The sanitized
// "abCDef" instead wraps at width 4 to "abCD\nef". This proves the contract flows
// through flattenLeaves' nested squash recursion,
// not just the single-leaf path.
test("hard-wrap text containing an inline erase-line (\\x1b[2K) sequence across nested Text", async () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={4}>
        <Text bold>
          ab<Text color="green">CD</Text>
          {"\x1b[2K"}ef
        </Text>
      </Box>
    )),
    { color: "truecolor", width: 4 },
  );
  expect(stripAnsi(output)).toBe("abCD\nef");
  // Exact-byte lock against an SGR-ordering / reset regression: each wrapped line must
  // re-open and close its own bold (\x1b[1m … \x1b[22m), and the nested green must open
  // and reset (\x1b[32m … \x1b[39m) inside line 1's bold span.
  const line1 = chalk.bold(`ab${chalk.green("CD")}`);
  const line2 = chalk.bold("ef");
  expect(output).toBe(`${line1}\n${line2}`);
});

// ST-terminated (ESC\) OSC-8 hyperlink, single long word, hard-wrapped at width 5.
// The wrap protection covers both OSC terminators (BEL and ST), so the word breaks
// at the cell boundary exactly like its BEL-terminated sibling above: "abcde\nfghij".
test("hard-wrap single-word ST-terminated OSC hyperlink", async () => {
  const hyperlink = "\x1b]8;;https://example.com\x1b\\abcdefghij\x1b]8;;\x1b\\";
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={5}>
        <Text wrap="wrap">{hyperlink}</Text>
      </Box>
    )),
    { width: 5 },
  );
  expect(stripAnsi(output)).toBe("abcde\nfghij");
});

test("ensure wrap-ansi doesn't trim leading whitespace", async () => {
  const output = renderToString(
    defineComponent(() => () => <Text color="red">{" ERROR "}</Text>),
    { color: "truecolor", width: 100 },
  );
  expect(output).toBe(chalk.red(" ERROR "));
});

test("link ansi escapes are closed properly", async () => {
  const output = renderToString(
    defineComponent(() => () => <Text>{ansiEscapes.link("Example", "https://example.com")}</Text>),
    { width: 100 },
  );
  // Lock the exact bytes: the OSC-8 hyperlink must round-trip unchanged.
  expect(output).toBe(ansiEscapes.link("Example", "https://example.com"));
});

// ── Nested Text props against content SGR ─────────────
//
// Composition is one left-to-right state machine over a Text's joined content:
// entering a nested Text resolves the channels its own props set, content SGR
// resolves a channel from where it is written onward, and leaving a nested Text
// closes the channels it set. The byte locks below are what the renderer wrote
// before the runs became cells; a composition that let an enclosing content
// colour outrank a nested Text's own prop breaks every one of them.

test("a nested Text colour outranks content colour opened outside it", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Text>
        {`${ESC}[31mA`}
        <Text color="blue">B</Text>
        {`C${ESC}[39m`}
      </Text>
    )),
    { color: "truecolor", width: 20 },
  );

  // B is blue, and the enclosing content's red does not resume after it: the
  // nested Text closed the channel it opened.
  expect(output).toBe(`${ESC}[31mA${ESC}[34mB${ESC}[39mC`);
});

test("a nested Text default colour outranks content colour opened outside it", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Text>
        {`${ESC}[31mA`}
        <Text color="default">B</Text>
        {`C${ESC}[39m`}
      </Text>
    )),
    { color: "truecolor", width: 20 },
  );

  expect(output).toBe(`${ESC}[31mA${ESC}[39mBC`);
});

test("two nested Texts under one content colour each keep their own", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Text>
        {`${ESC}[31mA`}
        <Text color="blue">B</Text>
        <Text color="green">C</Text>
        {`D${ESC}[39m`}
      </Text>
    )),
    { color: "truecolor", width: 20 },
  );

  expect(output).toBe(`${ESC}[31mA${ESC}[34mB${ESC}[32mC${ESC}[39mD`);
});

test("a nested Text closes only the channels its props set", () => {
  const colour = renderToString(
    defineComponent(() => () => (
      <Text>
        {`${ESC}[1mA`}
        <Text color="blue">B</Text>
        {`C${ESC}[22m`}
      </Text>
    )),
    { color: "truecolor", width: 20 },
  );
  // Bold was opened by the content and the child sets no attribute, so bold
  // spans all three runs while the child's blue closes with the child.
  expect(colour).toBe(`${ESC}[1mA${ESC}[34mB${ESC}[39mC${ESC}[22m`);

  const attribute = renderToString(
    defineComponent(() => () => (
      <Text>
        {`${ESC}[31mA`}
        <Text bold>B</Text>
        {`C${ESC}[39m`}
      </Text>
    )),
    { color: "truecolor", width: 20 },
  );
  // The content's red is not a channel the child sets, so it survives the child
  // and continues after it. The generic reset here is the frame encoder's own
  // repair while opening bold beside an unmodelled span, not authored content.
  expect(attribute).toBe(`${ESC}[31mA${ESC}[1m${ESC}[0m${ESC}[1m${ESC}[31mB${ESC}[22mC${ESC}[39m`);
});

test("leaving a nested Text restores the enclosing Text's own colour", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Text>
        {`${ESC}[31mA`}
        <Text color="blue">
          B<Text color="green">C</Text>D
        </Text>
        {`E${ESC}[39m`}
      </Text>
    )),
    { color: "truecolor", width: 20 },
  );

  // D is back to the enclosing Text's blue prop; E has no prop to fall back to,
  // so it is the terminal default rather than the content's red.
  expect(output).toBe(`${ESC}[31mA${ESC}[34mB${ESC}[32mC${ESC}[34mD${ESC}[39mE`);
});

test("three levels of Text props resolve innermost first", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Text color="red">
        A
        <Text color="blue" bold>
          B
          <Text color="green" italic>
            C
          </Text>
          D
        </Text>
        E
      </Text>
    )),
    { color: "truecolor", width: 20 },
  );

  expect(output).toBe(
    `${ESC}[31mA${ESC}[1m${ESC}[34mB${ESC}[3m${ESC}[32mC${ESC}[23m${ESC}[34mD${ESC}[22m${ESC}[31mE${ESC}[39m`,
  );
});

test("content SGR inside a Text overrides its props from that point on", () => {
  const output = renderToString(
    defineComponent(() => () => <Text color="red">{`A${ESC}[32mB${ESC}[39mC`}</Text>),
    { color: "truecolor", width: 20 },
  );

  // The authored end code puts the Text's own colour back, not the terminal's.
  expect(output).toBe(`${ESC}[31mA${ESC}[32mB${ESC}[31mC${ESC}[39m`);
});

test("a mounted host paints a nested Text colour over content colour", async () => {
  const App = defineComponent(() => () => (
    <Text>
      {`${ESC}[31mA`}
      <Text color="blue">B</Text>
      {`C${ESC}[39m`}
    </Text>
  ));
  const { lastFrame } = await render(App, { columns: 20, color: "truecolor" });

  expect(lastFrame()).toBe(`${ESC}[31mA${ESC}[34mB${ESC}[39mC`);
});
