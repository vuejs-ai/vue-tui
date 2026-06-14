import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text } from "@vue-tui/runtime";

test("<Box> inside <Text> throws an error", async () => {
  const App = defineComponent(() => () => (
    <Text>
      <Box />
    </Text>
  ));

  await expect(render(App)).rejects.toThrow("can’t be nested inside <Text>");
});

test("fail when text nodes are not within <Text> component (mixed)", async () => {
  const App = defineComponent(() => () => (
    <Box>
      Hello
      <Text>World</Text>
    </Box>
  ));
  // Lock the EXACT message including the quoted offending string. Ink components.tsx.
  // Anchored regex (not a substring) so extra prefix/suffix text would fail too.
  await expect(render(App)).rejects.toThrow(
    /^Text string "Hello" must be rendered inside <Text> component$/,
  );
});

test("fail when text node is not within <Text> component (full)", async () => {
  const App = defineComponent(() => () => <Box>Hello World</Box>);
  // Lock the EXACT message: the whole offending string is quoted. Ink components.tsx.
  // Anchored regex (not a substring) so extra prefix/suffix text would fail too.
  await expect(render(App)).rejects.toThrow(
    /^Text string "Hello World" must be rendered inside <Text> component$/,
  );
});

// A text-leaf that mounts EMPTY (a Vue fragment anchor, which insert() exempts
// from the text-context guard) and LATER becomes non-empty via setText must be
// re-validated — otherwise non-empty bare text ends up directly under a <Box> and
// paint silently drops it. The sibling interpolation `{{ maybe }}` next to the
// <Text> reaches the host via setText (NOT setElementText, which only fires for a
// single-child Box and is already guarded). Same content, same error as if it had
// mounted non-empty — consistency is the whole point of the fix.
test("sibling interpolation ''->'hi' directly under <Box> rejects (setText path)", async () => {
  const maybe = shallowRef("");
  const App = defineComponent(() => () => (
    <Box>
      <Text>label</Text>
      {maybe.value}
    </Box>
  ));

  // Mounts fine: the empty leaf is a skipped fragment anchor.
  const { waitUntilExit } = await render(App, { columns: 100 });
  const exited = waitUntilExit();

  // The reactive update drives setText('', 'hi') on the already-mounted anchor.
  // The throw happens during Vue's patch (a host node-op), so vue-tui's error
  // boundary routes it through exit() → waitUntilExit() rejects.
  maybe.value = "hi";
  await nextTick();

  await expect(exited).rejects.toThrow(
    /^Text string "hi" must be rendered inside <Text> component$/,
  );
});

// Control: the SAME interpolation INSIDE a <Text> is valid inline text. Going
// ''->'hi' must render fine and NOT throw — rejectsTextLeaf() returns false for a
// leaf in a tui-text context, so the new setText re-validation is a no-op here.
test("sibling interpolation ''->'hi' inside <Text> renders and does not throw", async () => {
  const maybe = shallowRef("");
  const App = defineComponent(() => () => (
    <Box>
      <Text>{maybe.value}</Text>
    </Box>
  ));

  const { lastFrame, waitUntilExit } = await render(App, { columns: 100 });
  let rejected = false;
  void waitUntilExit().catch(() => {
    rejected = true;
  });
  expect(lastFrame()).toBe("");

  maybe.value = "hi";
  await nextTick();

  expect(lastFrame()).toBe("hi");
  // Give any (incorrect) error-boundary exit a microtask/tick to surface.
  await nextTick();
  await Promise.resolve();
  expect(rejected).toBe(false);
});
