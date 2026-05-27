import { defineComponent, shallowRef, nextTick } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";
import chalk from "chalk";
import stripAnsi from "strip-ansi";

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

// ESC#8 (DECALN) and ESC c (RIS) are Fe-type sequences that should be stripped,
// but ESC c currently consumes the following character, producing "AB" instead of "ABC".
test.skip("strip complete ESC control sequences with intermediates — known rendering issue", async () => {
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
