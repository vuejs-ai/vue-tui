import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";
import { Chalk } from "chalk";

const chalk = new Chalk({ level: 3 });

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
