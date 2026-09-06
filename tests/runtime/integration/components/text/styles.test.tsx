import { defineComponent, h, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, renderToString, Text } from "@vue-tui/runtime";
import { Chalk } from "chalk";
import stripAnsi from "strip-ansi";

const chalk = new Chalk({ level: 3 });

test("text with standard color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text color="green">Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.green("Test"));
});

type TestForeground = "default" | "red" | "green" | "blue" | "other";

function foregroundCharacters(
  value: string,
): Array<{ character: string; foreground: TestForeground }> {
  const result: Array<{ character: string; foreground: TestForeground }> = [];
  const sgr = /\x1b\[([0-9;]*)m/g;
  let foreground: TestForeground = "default";
  let cursor = 0;

  const append = (text: string) => {
    for (const character of text) {
      if (character !== "\n") result.push({ character, foreground });
    }
  };

  for (let match = sgr.exec(value); match; match = sgr.exec(value)) {
    append(value.slice(cursor, match.index));
    for (const parameter of (match[1] || "0").split(";").map(Number)) {
      if (parameter === 0 || parameter === 39) foreground = "default";
      else if (parameter === 31) foreground = "red";
      else if (parameter === 32) foreground = "green";
      else if (parameter === 34) foreground = "blue";
      else if ((parameter >= 30 && parameter <= 37) || parameter === 38) foreground = "other";
    }
    cursor = match.index + match[0].length;
  }
  append(value.slice(cursor));
  return result;
}

type TestBackground = "default" | "red" | "green" | "blue" | "other";
type TestModifier = "dimColor" | "bold" | "italic" | "underline" | "strikethrough" | "inverse";

interface StyledCharacter {
  character: string;
  foreground: TestForeground;
  background: TestBackground;
  modifiers: TestModifier[];
}

function styledCharacters(value: string): StyledCharacter[] {
  const result: StyledCharacter[] = [];
  const sgr = /\x1b\[([0-9;]*)m/g;
  let foreground: TestForeground = "default";
  let background: TestBackground = "default";
  const modifiers = new Set<TestModifier>();
  let cursor = 0;

  const append = (text: string) => {
    for (const character of text) {
      if (character === "\n") continue;
      result.push({
        character,
        foreground,
        background,
        modifiers: [...modifiers].sort(),
      });
    }
  };

  const reset = () => {
    foreground = "default";
    background = "default";
    modifiers.clear();
  };

  for (let match = sgr.exec(value); match; match = sgr.exec(value)) {
    append(value.slice(cursor, match.index));
    for (const parameter of (match[1] || "0").split(";").map(Number)) {
      if (parameter === 0) reset();
      else if (parameter === 1) modifiers.add("bold");
      else if (parameter === 2) modifiers.add("dimColor");
      else if (parameter === 3) modifiers.add("italic");
      else if (parameter === 4) modifiers.add("underline");
      else if (parameter === 7) modifiers.add("inverse");
      else if (parameter === 9) modifiers.add("strikethrough");
      else if (parameter === 22) {
        modifiers.delete("bold");
        modifiers.delete("dimColor");
      } else if (parameter === 23) modifiers.delete("italic");
      else if (parameter === 24) modifiers.delete("underline");
      else if (parameter === 27) modifiers.delete("inverse");
      else if (parameter === 29) modifiers.delete("strikethrough");
      else if (parameter === 39) foreground = "default";
      else if (parameter === 49) background = "default";
      else if (parameter === 31) foreground = "red";
      else if (parameter === 32) foreground = "green";
      else if (parameter === 34) foreground = "blue";
      else if (parameter === 41) background = "red";
      else if (parameter === 42) background = "green";
      else if (parameter === 44) background = "blue";
      else if ((parameter >= 30 && parameter <= 37) || parameter === 38) foreground = "other";
      else if ((parameter >= 40 && parameter <= 47) || parameter === 48) background = "other";
    }
    cursor = match.index + match[0].length;
  }
  append(value.slice(cursor));
  return result;
}

test("nested Text color=default keeps terminal-default foreground through wrapping", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text>
        <Text color="red">
          AA<Text color="default">BBB</Text>CC
        </Text>
        <Text color="blue">Z</Text>
      </Text>
    )),
    { columns: 4 },
  );

  const frame = lastFrame({ trimLines: true });
  expect(stripAnsi(frame)).toBe("AABB\nBCCZ");
  expect(foregroundCharacters(frame)).toEqual([
    { character: "A", foreground: "red" },
    { character: "A", foreground: "red" },
    { character: "B", foreground: "default" },
    { character: "B", foreground: "default" },
    { character: "B", foreground: "default" },
    { character: "C", foreground: "red" },
    { character: "C", foreground: "red" },
    { character: "Z", foreground: "blue" },
  ]);
});

test("nested Text terminal-default colors reset foreground and background independently", () => {
  const output = renderToString(
    defineComponent(
      () => () =>
        h(
          Text,
          { color: "red", backgroundColor: "blue" },
          {
            default: () => [
              "A",
              h(Text, { color: "default" }, { default: () => "B" }),
              h(Text, { backgroundColor: "default" }, { default: () => "C" }),
              "D",
            ],
          },
        ),
    ),
    { color: "truecolor", width: 4 },
  );

  expect(stripAnsi(output)).toBe("ABCD");
  expect(styledCharacters(output)).toEqual([
    {
      character: "A",
      foreground: "red",
      background: "blue",
      modifiers: [],
    },
    {
      character: "B",
      foreground: "default",
      background: "blue",
      modifiers: [],
    },
    {
      character: "C",
      foreground: "red",
      background: "default",
      modifiers: [],
    },
    {
      character: "D",
      foreground: "red",
      background: "blue",
      modifiers: [],
    },
  ]);
});

test("removing nested Text color keys restores both inherited channels", async () => {
  const explicit = shallowRef(true);
  const App = defineComponent(
    () => () =>
      h(
        Text,
        { color: "red", backgroundColor: "blue" },
        {
          default: () => [
            "A",
            h(Text, explicit.value ? { color: "green", backgroundColor: "red" } : {}, {
              default: () => "B",
            }),
            "C",
          ],
        },
      ),
  );
  const { lastFrame, waitUntilRenderFlush } = await render(App, { columns: 3 });

  const stylesFor = (character: string) =>
    styledCharacters(lastFrame())
      .filter((entry) => entry.character === character)
      .map(({ foreground, background }) => ({ foreground, background }));

  expect(stylesFor("B")).toEqual([{ foreground: "green", background: "red" }]);

  // The next VNode has neither key. Vue sends null to the host patcher for
  // each removal; both channels must become unspecified and inherit again.
  explicit.value = false;
  await waitUntilRenderFlush();
  expect(stylesFor("B")).toEqual([{ foreground: "red", background: "blue" }]);
});

test("nested Text inherits the enclosing Text background over the surrounding Box", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Box backgroundColor="blue" width={3}>
        <Text backgroundColor="red">
          A<Text>B</Text>C
        </Text>
      </Box>
    )),
    { color: "truecolor", width: 3 },
  );

  expect(stripAnsi(output)).toBe("ABC");
  expect(
    styledCharacters(output)
      .filter(({ character }) => "ABC".includes(character))
      .map(({ character, background }) => ({ character, background })),
  ).toEqual([
    { character: "A", background: "red" },
    { character: "B", background: "red" },
    { character: "C", background: "red" },
  ]);
});

const textModifiers = [
  "dimColor",
  "bold",
  "italic",
  "underline",
  "strikethrough",
  "inverse",
] as const satisfies readonly TestModifier[];

test.each(textModifiers)(
  "nested Text %s supports true, false, and withdrawal back to inheritance",
  async (modifier) => {
    const childMode = shallowRef<"false" | "true" | "omitted">("false");
    const App = defineComponent(
      () => () =>
        h(Text, { [modifier]: true } as never, {
          default: () => [
            "A",
            h(
              Text,
              (childMode.value === "omitted"
                ? {}
                : { [modifier]: childMode.value === "true" }) as never,
              { default: () => "B" },
            ),
            h(Text, { [modifier]: false } as never, {
              default: () =>
                h(Text, { [modifier]: true } as never, {
                  default: () => "C",
                }),
            }),
            "D",
          ],
        }),
    );
    const { lastFrame, waitUntilRenderFlush } = await render(App, { columns: 4 });

    const expectModifiers = (expected: Record<"A" | "B" | "C" | "D", boolean>) => {
      const characters = styledCharacters(lastFrame()!).filter(({ character }) =>
        "ABCD".includes(character),
      );
      expect(
        characters.map(({ character, modifiers }) => ({
          character,
          active: modifiers.includes(modifier),
        })),
      ).toEqual(
        Object.entries(expected).map(([character, active]) => ({
          character,
          active,
        })),
      );
    };

    // Explicit false blocks the true ancestor, while a deeper explicit true
    // re-enables the same channel.
    expectModifiers({ A: true, B: false, C: true, D: true });

    childMode.value = "true";
    await waitUntilRenderFlush();
    expectModifiers({ A: true, B: true, C: true, D: true });

    // Withdrawing the key entirely restores ordinary inheritance. This is
    // intentionally different from retaining the key with an undefined value:
    // Vue patches a removed v-bind key to the host as null.
    childMode.value = "omitted";
    await waitUntilRenderFlush();
    expectModifiers({ A: true, B: true, C: true, D: true });
  },
);

test("bold and dimColor remain independently overridable despite sharing SGR 22", async () => {
  const { lastFrame } = await render(
    defineComponent(
      () => () =>
        h(
          Text,
          { bold: true, dimColor: true },
          {
            default: () => [
              "A",
              h(Text, { bold: false }, { default: () => "B" }),
              h(Text, { dimColor: false }, { default: () => "C" }),
              "D",
            ],
          },
        ),
    ),
    { columns: 4 },
  );

  expect(
    styledCharacters(lastFrame()).map(({ character, modifiers }) => ({
      character,
      modifiers,
    })),
  ).toEqual([
    { character: "A", modifiers: ["bold", "dimColor"] },
    { character: "B", modifiers: ["dimColor"] },
    { character: "C", modifiers: ["bold"] },
    { character: "D", modifiers: ["bold", "dimColor"] },
  ]);
});

test("foreground reset preserves literal private-use characters and nested reset semantics", async () => {
  const privateUse = "\uE000\uE001";
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text color="red">
        A{privateUse}
        <Text color="default">
          B<Text color="green">C</Text>
          <Text color="default">D</Text>E
        </Text>
        F
      </Text>
    )),
    { columns: 100 },
  );

  const frame = lastFrame();
  expect(stripAnsi(frame)).toBe(`A${privateUse}BCDEF`);
  expect(foregroundCharacters(frame)).toEqual([
    { character: "A", foreground: "red" },
    { character: "\uE000", foreground: "red" },
    { character: "\uE001", foreground: "red" },
    { character: "B", foreground: "default" },
    { character: "C", foreground: "green" },
    { character: "D", foreground: "default" },
    { character: "E", foreground: "default" },
    { character: "F", foreground: "red" },
  ]);
});

test("renderToString preserves nested terminal-default foreground through a narrow wrap", () => {
  const output = renderToString(
    defineComponent(() => () => (
      <Text color="red">
        AA<Text color="default">BBB</Text>CC
      </Text>
    )),
    { color: "truecolor", width: 4 },
  );
  expect(stripAnsi(output)).toBe("AABB\nBCC");
  expect(foregroundCharacters(output)).toEqual([
    { character: "A", foreground: "red" },
    { character: "A", foreground: "red" },
    { character: "B", foreground: "default" },
    { character: "B", foreground: "default" },
    { character: "B", foreground: "default" },
    { character: "C", foreground: "red" },
    { character: "C", foreground: "red" },
  ]);
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
  expect(lastFrame()).toBe("\x1b[2m\x1b[32mTest\x1b[39m\x1b[22m");
});

test("text with hex color", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Text color="#FF8800">Test</Text>),
    { columns: 100 },
  );
  expect(lastFrame()).toBe(chalk.hex("#FF8800")("Test"));
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
