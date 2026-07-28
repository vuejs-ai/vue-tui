import { defineComponent } from "vue";
import { Chalk } from "chalk";
import { expect, test } from "vite-plus/test";
import { renderToString, Text } from "@vue-tui/runtime";

const chalk = new Chalk({ level: 3 });

// ── Styling ────────────────────────────────────────────

test("defaults to plain output", () => {
  const App = defineComponent(() => () => <Text color="green">Green</Text>);
  const output = renderToString(App);
  expect(output).toBe("Green");
});

test("plain output removes authored SGR as well as component styling", () => {
  const App = defineComponent(() => () => <Text>{"\x1b[31mred\x1b[39m \x1b[1mbold\x1b[22m"}</Text>);

  expect(renderToString(App)).toBe("red bold");
  expect(renderToString(App, { color: false })).toBe("red bold");
});

test("renders an explicit truecolor profile", () => {
  const App = defineComponent(() => () => <Text color="#ff0080">Color</Text>);
  expect(renderToString(App, { color: "truecolor" })).toBe(chalk.hex("#ff0080")("Color"));
});

test.each([
  [false, 0],
  ["ansi16", 1],
  ["ansi256", 2],
  ["truecolor", 3],
] as const)("renders explicit color %s", (color, level) => {
  const App = defineComponent(() => () => (
    <Text bold color="#ff0080">
      Color
    </Text>
  ));
  const expected = new Chalk({ level }).bold(new Chalk({ level }).hex("#ff0080")("Color"));

  expect(renderToString(App, { color })).toBe(expected);
});

test.each([
  ["ansi16", 1],
  ["ansi256", 2],
] as const)("converts authored truecolor to the %s capability", (color, level) => {
  const App = defineComponent(() => () => <Text>{"\x1b[38;2;255;0;128mColor\x1b[39m"}</Text>);
  const expected = new Chalk({ level }).rgb(255, 0, 128)("Color");

  expect(renderToString(App, { color })).toBe(expected);
});

test("renders bold text", () => {
  const App = defineComponent(() => () => <Text bold>Bold</Text>);
  const output = renderToString(App, { color: "truecolor" });
  expect(output).toBe(chalk.bold("Bold"));
});

// ── Nested <Text> inherits ancestor styles (Ink wrapping model) ─────────
//
// Ink composes nested <Text> by WRAPPING: squash-text-nodes.ts concatenates a
// node's already-styled children, then the PARENT Text's internal_transform
// wraps the WHOLE concatenation. So a parent's retained styles (bold and dim)
// stay OPEN across a nested child — the child only
// ADDS its own style on top. The Ink composition is literally
// `chalk.<style>("A" + chalk.<childStyle>("B"))`, which is what we assert here.
// (The earlier merge-down + per-leaf model closed the parent SGR at the nested
// boundary, so bold/underline did NOT survive across the child — that was the
// bug this section pins.)

test("nested <Text> inherits ancestor bold across a colored child", () => {
  const App = defineComponent(() => () => (
    <Text bold>
      A<Text color="green">B</Text>
    </Text>
  ));
  expect(renderToString(App, { color: "truecolor" })).toBe(chalk.bold("A" + chalk.green("B")));
});

test("ancestor bold stays open across a PLAIN nested child", () => {
  const App = defineComponent(() => () => (
    <Text bold>
      A<Text>B</Text>
    </Text>
  ));
  expect(renderToString(App, { color: "truecolor" })).toBe(chalk.bold("A" + "B"));
});

test("nested <Text> inherits ancestor dim across a colored child", () => {
  const App = defineComponent(() => () => (
    <Text dimColor>
      A<Text color="green">B</Text>
    </Text>
  ));
  expect(renderToString(App, { color: "truecolor" })).toBe(chalk.dim("A" + chalk.green("B")));
});

test("ancestor bold survives leading/trailing parent text around a nested child", () => {
  const App = defineComponent(() => () => (
    <Text bold>
      A<Text color="green">B</Text>C
    </Text>
  ));
  expect(renderToString(App, { color: "truecolor" })).toBe(
    chalk.bold("A" + chalk.green("B") + "C"),
  );
});

test("nested child's own color composes on top of inherited bold (child stays bold too)", () => {
  // The child has BOTH its own color AND should still be bold (from the ancestor).
  // chalk.bold(chalk.green(...)) ⇒ the green run is emitted INSIDE the bold open/
  // close pair, so SGR-22 (bold off) comes only after the whole concatenation.
  const App = defineComponent(() => () => (
    <Text bold>
      <Text color="green">B</Text>
    </Text>
  ));
  expect(renderToString(App, { color: "truecolor" })).toBe(chalk.bold(chalk.green("B")));
});
