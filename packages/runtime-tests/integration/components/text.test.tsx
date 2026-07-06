import { defineComponent, shallowRef, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { renderToString, Box, Text } from "@vue-tui/runtime";
import chalk from "chalk";
import stripAnsi from "strip-ansi";
import ansiEscapes from "ansi-escapes";

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

test("text with standard color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text color="green">Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.green("Test"));
});

test('nested Text color="revert" resets foreground to terminal default', async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text color="red">
        Red
        <Text color="revert">Default</Text>
      </Text>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("\x1b[31mRed\x1b[39mDefault");
});

test("text with dim+bold", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text dimColor bold>
        Test
      </Text>
    )),
    { columns: 100 },
  );
  expect(stripAnsi(lastFrame()!)).toBe("Test");
  expect(lastFrame()).not.toBe("Test");
});

test("text with dimmed color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text dimColor color="green">
        Test
      </Text>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.green.dim("Test"));
});

test("text with hex color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text color="#FF8800">Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.hex("#FF8800")("Test"));
});

test("text with rgb color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text color="rgb(255, 136, 0)">Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.rgb(255, 136, 0)("Test"));
});

test("text with ansi256 color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text color="ansi256(194)">Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.ansi256(194)("Test"));
});

test("text with standard background color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text backgroundColor="green">Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.bgGreen("Test"));
});

test("text with hex background color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text backgroundColor="#FF8800">Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.bgHex("#FF8800")("Test"));
});

test("text with rgb background color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text backgroundColor="rgb(255, 136, 0)">Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.bgRgb(255, 136, 0)("Test"));
});

test("text with ansi256 background color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text backgroundColor="ansi256(194)">Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.bgAnsi256(194)("Test"));
});

test("text with inversion", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text inverse>Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.inverse("Test"));
});

test("text with empty-to-nonempty sibling does not wrap", async () => {
  const show = shallowRef(false);
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box>
        <Text>{show.value ? "x" : ""}hello</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("hello");
  show.value = true;
  await nextTick();
  expect(lastFrame()).toBe("xhello");
});

test("remeasure text when text is changed", async () => {
  const add = shallowRef(false);
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box>
        <Text>{add.value ? "abcx" : "abc"}</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("abc");
  add.value = true;
  await nextTick();
  expect(lastFrame()).toBe("abcx");
});

test("remeasure text when text nodes are changed", async () => {
  const add = shallowRef(false);
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="column">
        <Text>abc{add.value ? <Text>x</Text> : null}</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("abc");
  add.value = true;
  await nextTick();
  expect(lastFrame()).toBe("abcx");
});

// Ink reconciler.tsx:328-344 / components.tsx:715-731 ("replace child node with
// text"): an outer <Text> whose only child is a colored <Text> is replaced across
// a rerender by a plain string. The frame must flip from the colored "test" to a
// bare "x" — the nested styled child node is fully torn down and the text-leaf
// takes its place.
test("replace a colored <Text> child with a plain string across a rerender", async () => {
  const replace = shallowRef(false);
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text>{replace.value ? "x" : <Text color="green">test</Text>}</Text>
    )),
    { columns: 100 },
  );
  // Before: the nested green child is the only content → chalk.green("test").
  expect(lastFrame()).toBe(chalk.green("test"));

  replace.value = true;
  await nextTick();
  // After: the styled child is gone, replaced by a plain text-leaf → "x".
  expect(lastFrame()).toBe("x");
});

// Locks the node-ops setElementText host op + remeasure: flipping <Text>A</Text>
// to <Text>B</Text> goes through Vue's setElementText fast path (a single static
// text child), which clears the leaf, inserts the new one, and dirties the text
// measure owner so yoga remeasures. The frame must update A -> B.
test("setElementText path updates A to B and remeasures", async () => {
  const flip = shallowRef(false);
  const { lastFrame } = await render(
    defineComponent(() => () => <Text>{flip.value ? "B" : "A"}</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("A");

  flip.value = true;
  await nextTick();
  expect(lastFrame()).toBe("B");
});

// The text-context guard fires only for NON-EMPTY raw text directly inside a
// <Box>. Vue materializes the empty branch of `cond ? 'oops' : ''` as an empty
// text-leaf (a fragment anchor), which node-ops insert() deliberately skips — so
// the empty case renders "" without throwing, while the non-empty "oops" throws.
test("<Box>{cond ? 'oops' : ''}</Box> throws for the non-empty branch only", async () => {
  // `cond` drives the ternary at runtime (a literal true/false here is flagged as
  // a constant condition by the linter; shallowRef keeps the exact two-branch shape).
  const oopsCond = shallowRef(true);
  const oops = defineComponent(() => () => <Box>{oopsCond.value ? "oops" : ""}</Box>);
  await expect(render(oops)).rejects.toThrow(
    /^Text string "oops" must be rendered inside <Text> component$/,
  );

  // The empty branch is a skipped fragment anchor — no text reaches the Box, so
  // it renders an empty frame without tripping the guard.
  const emptyCond = shallowRef(false);
  const empty = defineComponent(() => () => <Box>{emptyCond.value ? "oops" : ""}</Box>);
  const { lastFrame } = await render(empty, { columns: 100 });
  expect(lastFrame()).toBe("");
});

test("text with content 'constructor' wraps correctly", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text>constructor</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("constructor");
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

test("hard wrap text", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={7}>
        <Text wrap="hard">Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Hello W\norld");
});

test("hard wrap with long word", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={5}>
        <Text wrap="hard">aaaaaaaaaa</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("aaaaa\naaaaa");
});

test("hard wrap inside a zero-width Box does not reserve invisible child rows", async () => {
  // A Box whose resolved inner content width is 0 has no legal child paint area.
  // The child text should therefore neither paint nor inflate the row height, even
  // though Ink's zero-width hard-wrap path produces extra invisible rows.
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Box width={0}>
          <Text wrap="hard">a b c</Text>
        </Box>
        <Text>X</Text>
      </Box>
    )),
    { columns: 100 },
  );
  const lines = stripAnsi(lastFrame()!).split("\n");
  expect(lines).toEqual(["X"]);
});

test("don't hard wrap text if there is enough space", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={20}>
        <Text wrap="hard">Hello World</Text>
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

test("truncate text in the middle", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={7}>
        <Text wrap="truncate-middle">Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("Hel…rld");
});

test("truncate text in the beginning", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box width={7}>
        <Text wrap="truncate-start">Hello World</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("… World");
});

// --- Ink ANSI sanitization tests ---

const ESC = "\x1b";
const BEL = "\x07";
const C1_DCS = "\x90";
const C1_SOS = "\x98";
const C1_CSI = "\x9b";
const C1_ST = "\x9c";
const C1_OSC = "\x9d";
const C1_PM = "\x9e";
const C1_APC = "\x9f";

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

test("strip ANSI cursor position and erase sequences from text", async () => {
  const frame = await renderText(`Hello${ESC}[5;10HWorld${ESC}[2J!`);
  expect(frame).not.toContain(`${ESC}[5;10H`);
  expect(frame).not.toContain(`${ESC}[2J`);
  expect(stripAnsi(frame)).toBe("HelloWorld!");
});

test("preserve SGR color sequences in text", async () => {
  const frame = await renderText(`${ESC}[32mgreen${ESC}[0m normal`);
  expect(frame).toContain(`${ESC}[`);
  expect(stripAnsi(frame)).toBe("green normal");
});

test("preserve OSC hyperlink sequences in text", async () => {
  const frame = await renderText(`${ESC}]8;;https://example.com${BEL}link${ESC}]8;;${BEL}`);
  expect(frame).toContain(`${ESC}]8;;`);
  expect(stripAnsi(frame)).toBe("link");
});

test("preserve OSC hyperlink sequences with ST terminator in text", async () => {
  const frame = await renderText(`${ESC}]8;;https://example.com${ESC}\\link${ESC}]8;;${ESC}\\`);
  expect(frame).toContain(`${ESC}]8;;`);
  expect(frame).toContain(`${ESC}\\`);
  expect(stripAnsi(frame)).toBe("link");
});

test("preserve SGR sequences with colon parameters", async () => {
  const frame = await renderText(`A${ESC}[38:2::255:100:0mcolor${ESC}[0mB`);
  expect(frame).toContain(`${ESC}[38:2::255:100:0m`);
  expect(stripAnsi(frame)).toBe("AcolorB");
});

test("strip complete non-SGR CSI sequences without leaking parameters", async () => {
  const frame = await renderText(`A${ESC}[>4;2mB${ESC}[2 qC`);
  expect(frame).not.toContain("4;2m");
  expect(frame).not.toContain(" q");
  expect(stripAnsi(frame)).toBe("ABC");
});

test("strip C1 SOS control strings as complete units", async () => {
  const frame = await renderText(`A${C1_SOS}payload${ESC}\\B${C1_SOS}payload${C1_ST}C`);
  expect(frame).not.toContain("payload");
  expect(stripAnsi(frame)).toBe("ABC");
});

test("strip tmux DCS passthrough wrappers without leaking payload", async () => {
  const wrappedStart = `${ESC}Ptmux;${ESC}${ESC}]8;;https://example.com${BEL}${ESC}\\`;
  const wrappedEnd = `${ESC}Ptmux;${ESC}${ESC}]8;;${BEL}${ESC}\\`;
  const frame = await renderText(`${wrappedStart}link${wrappedEnd}`);
  expect(frame).not.toContain("tmux;");
  expect(frame).not.toContain(`${ESC}P`);
  expect(frame).not.toContain(`${ESC}\\`);
  expect(stripAnsi(frame)).toBe("link");
});

test("strip C1 DCS control strings as complete units", async () => {
  const frame = await renderText(`A${C1_DCS}payload${ESC}\\B${C1_DCS}payload${C1_ST}C`);
  expect(frame).not.toContain("payload");
  expect(stripAnsi(frame)).toBe("ABC");
});

test("strip PM and APC control strings as complete units", async () => {
  const frame = await renderText(`A${ESC}^pm-payload${ESC}\\B${ESC}_apc-payload${ESC}\\C`);
  expect(frame).not.toContain("pm-payload");
  expect(frame).not.toContain("apc-payload");
  expect(stripAnsi(frame)).toBe("ABC");
});

test("strip ESC SOS control strings as complete units", async () => {
  const frame = await renderText(`A${ESC}Xpayload${ESC}\\B`);
  expect(frame).not.toContain("payload");
  expect(stripAnsi(frame)).toBe("AB");
});

test("strip malformed SOS control strings to avoid payload leaks", async () => {
  const frame = await renderText(`A${ESC}Xpayload${BEL}B${C1_SOS}payload`);
  expect(frame).not.toContain("payload");
  expect(stripAnsi(frame)).toBe("A");
});

test("preserve SGR sequences around stripped SOS control strings", async () => {
  const frame = await renderText(`A${ESC}[32mgreen${ESC}[0m${ESC}Xpayload${ESC}\\B`);
  expect(frame).toContain(`${ESC}[`);
  expect(frame).not.toContain("payload");
  expect(stripAnsi(frame)).toBe("AgreenB");
});

test("strip standalone ST bytes from text output", async () => {
  const frame = await renderText(`A${C1_ST}B`);
  expect(frame).not.toContain(C1_ST);
  expect(stripAnsi(frame)).toBe("AB");
});

test("preserve C1 OSC sequences in text", async () => {
  const input = `${C1_OSC}8;;https://example.com${BEL}link${C1_OSC}8;;${BEL}`;
  const frame = await renderText(input);
  expect(frame).toContain(`${C1_OSC}8;;https://example.com`);
  expect(frame).toContain(`${C1_OSC}8;;${BEL}`);
  expect(frame).toBe(input);
});

test("preserve C1 OSC hyperlink sequences with ST terminator in text", async () => {
  const input = `${C1_OSC}8;;https://example.com${ESC}\\link${C1_OSC}8;;${ESC}\\`;
  const frame = await renderText(input);
  expect(frame).toContain(`${C1_OSC}8;;https://example.com`);
  expect(frame).toContain(`${ESC}\\`);
  expect(frame).toBe(input);
});

test("strip complete C1 non-SGR CSI sequences without leaking parameters", async () => {
  const frame = await renderText(`A${C1_CSI}>4;2mB${C1_CSI}2 qC`);
  expect(frame).not.toContain("4;2m");
  expect(frame).not.toContain(" q");
  expect(stripAnsi(frame)).toBe("ABC");
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
    { columns: 3 },
  );
  expect(output).not.toContain(`${ESC}#8`);
  expect(stripAnsi(output)).toBe("ABC");
});

// Mirrors Ink Text.tsx:277-283 ("strip complete ESC control sequences with
// intermediates"). The existing ESC#8-only test above misses the ESC-c (RIS, full
// terminal reset) leg: sanitizeAnsi must strip BOTH the intermediate-byte ESC#8 and
// the bare ESC c so neither leaks into the painted frame, leaving the visible "ABC".
test("strip complete ESC control sequences with intermediates (ESC#8 and ESC c / RIS)", async () => {
  const frame = await renderText(`A${ESC}#8B${ESC}cC`);
  expect(frame).not.toContain(`${ESC}#8`);
  expect(frame).not.toContain(`${ESC}c`);
  expect(stripAnsi(frame)).toBe("ABC");
});

test("strip tmux DCS passthrough wrappers with ST-terminated OSC payload", async () => {
  const wrappedStart = `${ESC}Ptmux;${ESC}${ESC}]8;;https://example.com${ESC}${ESC}\\${ESC}\\`;
  const wrappedEnd = `${ESC}Ptmux;${ESC}${ESC}]8;;${ESC}${ESC}\\${ESC}\\`;
  const frame = await renderText(`${wrappedStart}link${wrappedEnd}`);
  expect(frame).not.toContain("tmux;");
  expect(frame).not.toContain(`${ESC}\\`);
  expect(stripAnsi(frame)).toBe("link");
});

test("strip C1 PM and APC control strings as complete units", async () => {
  const frame = await renderText(`A${C1_PM}pm-payload${C1_ST}B${C1_APC}apc-payload${C1_ST}C`);
  expect(frame).not.toContain("pm-payload");
  expect(frame).not.toContain("apc-payload");
  expect(stripAnsi(frame)).toBe("ABC");
});

test("strip tmux DCS passthrough containing BEL until the final ST terminator", async () => {
  const input = `A${ESC}Ptmux;${ESC}${ESC}]0;title${BEL}${ESC}\\B`;
  const frame = await renderText(input);
  expect(frame).not.toContain("tmux;");
  expect(frame).not.toContain("title");
  expect(stripAnsi(frame)).toBe("AB");
});

test("strip incomplete DCS passthrough sequences to avoid payload leaks", async () => {
  const incompleteSequence = `${ESC}Ptmux;${ESC}`;
  const frame = await renderText(`${incompleteSequence}link`);
  expect(frame).not.toContain("tmux;");
  expect(stripAnsi(frame)).toBe("");
});

test("strip incomplete C1 DCS control strings to avoid payload leaks", async () => {
  const frame = await renderText(`A${C1_DCS}payload`);
  expect(frame).not.toContain("payload");
  expect(stripAnsi(frame)).toBe("A");
});

test("strip incomplete OSC control strings to avoid payload leaks", async () => {
  const frame = await renderText(`A${ESC}]8;;https://example.comlink`);
  expect(frame).not.toContain("https://example.com");
  expect(stripAnsi(frame)).toBe("A");
});

test("strip incomplete C1 OSC control strings to avoid payload leaks", async () => {
  const frame = await renderText(`A${C1_OSC}8;;https://example.comlink`);
  expect(frame).not.toContain("https://example.com");
  expect(stripAnsi(frame)).toBe("A");
});

test("strip incomplete ESC control sequences with intermediates to avoid payload leaks", async () => {
  const frame = await renderText(`A${ESC}#`);
  expect(frame).not.toContain(`${ESC}#`);
  expect(stripAnsi(frame)).toBe("A");
});

test("strip malformed ESC control sequences with intermediates and non-final bytes", async () => {
  const frame = await renderText(`A${ESC}#${BEL}payload`);
  expect(frame).not.toContain("payload");
  expect(stripAnsi(frame)).toBe("A");
});

test("strip standalone C1 control characters from text output", async () => {
  const frame = await renderText("A\x85B\x8eC");
  expect(frame).not.toContain("\x85");
  expect(frame).not.toContain("\x8e");
  expect(stripAnsi(frame)).toBe("ABC");
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

test("do not wrap text with BEL-terminated OSC hyperlinks", async () => {
  const hyperlink = "\x1b]8;;https://example.com\x07Click here\x1b]8;;\x07";
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={20}>
        <Text wrap="wrap">{hyperlink}</Text>
      </Box>
    )),
    { columns: 20 },
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
    { columns: 20 },
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
    { columns: 20 },
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
    { columns: 20 },
  );
  expect(stripAnsi(output)).toBe("Some text");
});

// NOT fixed by parity gap #9 (sanitize-before-measure) — verified separate root cause.
// sanitizeAnsi PRESERVES OSC sequences (Ink does too: sanitize-ansi.ts:17 keeps `osc`
// tokens), so the non-hyperlink OSC `]0;My Title\x07` survives the measure squash and
// still reaches wrap-ansi. wrap-ansi@10 only protects `]8;;` HYPERLINK OSCs, so it
// SPLITS this generic OSC across lines (`["\x1b]0;My ","Title","\x07abcde","fghij"]`).
// Ink's wrapText produces the IDENTICAL split lines (verified against Ink v7.0.4) —
// the divergence was downstream in the Output grid: vue used to clip chars at the grid
// right edge (the `offsetX + characterWidth > this.width` guard in paint.ts), and the
// now-visible BEL/broken-OSC bytes consumed a grid cell, pushing the trailing "e" past
// column 5 where vue DROPPED it ("abcd\nfghij"). Ink never clips in its Output write
// loop, so "e" survives ("abcde\nfghij"). FIXED by removing vue's two x-bounds guards
// to match Ink's Output loop exactly (the wide-char-at-edge parity fix) — un-skipped.
test("hard-wrap long word after non-hyperlink OSC sequence", async () => {
  const text = "\x1b]0;My Title\x07abcdefghij";
  const output = renderToString(
    defineComponent(() => () => (
      <Box width={5}>
        <Text wrap="wrap">{text}</Text>
      </Box>
    )),
    { columns: 5 },
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
    { columns: 5 },
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
// This proves the fix flows through flattenLeaves' nested squashTransformChild
// recursion, not just the single-leaf path.
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
    { columns: 4 },
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
    { columns: 5 },
  );
  expect(stripAnsi(output)).toBe("abcde\nfghij");
});

test("ensure wrap-ansi doesn't trim leading whitespace", async () => {
  const output = renderToString(
    defineComponent(() => () => <Text color="red">{" ERROR "}</Text>),
    { columns: 100 },
  );
  expect(output).toBe(chalk.red(" ERROR "));
});

test("link ansi escapes are closed properly", async () => {
  const output = renderToString(
    defineComponent(() => () => <Text>{ansiEscapes.link("Example", "https://example.com")}</Text>),
    { columns: 100 },
  );
  // Lock the EXACT bytes: the OSC-8 hyperlink must round-trip unchanged (open + label +
  // close). Ink components.tsx: t.is(output, ']8;;https://example.comExample]8;;') —
  // identical to ansiEscapes.link(...) byte-for-byte.
  expect(output).toBe(ansiEscapes.link("Example", "https://example.com"));
});
