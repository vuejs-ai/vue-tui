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

// ESC#8 (DECALN) is an Fe-type sequence with an intermediate byte that sanitizeAnsi
// strips at PAINT time. This is a WIDTH mis-measure: raw string-width("A\x1b#8BC") is
// 2, but paint strips ESC#8 and emits the 3-column "ABC". Before parity gap #9 the
// MEASURE path flattened the RAW string, so the raw width (2) UNDER-sized the yoga
// cell; at a tight width the trailing "C" was clipped (vue rendered "AB"). Ink
// measures the SANITIZED squash (squash-text-nodes.ts:45 / dom.ts:227), so the cell
// is sized to the visible "ABC" and survives even at width 3.
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

// FIXED by parity gap #9 (sanitize-before-measure), exercising the NESTED-leaf squash
// path. The text "ab" + green "CD" + "\x1b[2K" (erase-line CSI) + "ef" sanitizes to the
// 6-visible-column "abCDef". Unlike the ESC#8 case, this is NOT a width mis-measure:
// raw and sanitized string-width are EQUAL (both count \x1b[2K as zero). The break is
// in the WRAP step — wrap-ansi doesn't recognise the \x1b[2K CSI, so before the fix it
// received the raw "abCD\x1b[2Kef" and returned it un-wrapped on one line; at width 4
// the trailing "ef" overflowed the single-line cell and was clipped (vue dropped it).
// Ink measures+wraps the SANITIZED squash → "abCDef" wraps at width 4 to "abCD\nef".
// This proves the fix flows through flattenLeaves' nested squash recursion,
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
  // and reset (\x1b[32m … \x1b[39m) INSIDE line 1's bold span. Byte-for-byte identical
  // to Ink v7.0.4's renderToString for this input (verified against /tmp/ink @ v7.0.4).
  const line1 = chalk.bold(`ab${chalk.green("CD")}`);
  const line2 = chalk.bold("ef");
  expect(output).toBe(`${line1}\n${line2}`);
});

// ST-terminated (ESC\) OSC-8 hyperlink, single long word, hard-wrapped at width 5.
// The wrap protection covers both OSC terminators (BEL and ST), so the word breaks
// at the cell boundary exactly like its BEL-terminated sibling above: "abcde\nfghij".
// Verified against Ink v7.0.4 (un-skipped — vue produces Ink's identical output).
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
  // Lock the EXACT bytes: the OSC-8 hyperlink must round-trip unchanged (open + label +
  // close). Ink components.tsx: t.is(output, ']8;;https://example.comExample]8;;') —
  // identical to ansiEscapes.link(...) byte-for-byte.
  expect(output).toBe(ansiEscapes.link("Example", "https://example.com"));
});
