import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, Transform } from "@vue-tui/runtime";

test("Transform uppercases descendant text", async () => {
  const { lastFrame } = await render(() => (
    <Transform transform={(line: string) => line.toUpperCase()}>
      <Text>abc</Text>
    </Transform>
  ));
  expect(lastFrame()).toContain("ABC");
});

// --- Ink transform tests ---

test("transform children — <Transform> inside <Text>", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Transform transform={(s: string, idx: number) => `[${idx}: ${s}]`}>
        <Text>
          <Transform transform={(s: string, idx: number) => `{${idx}: ${s}}`}>
            <Text>test</Text>
          </Transform>
        </Text>
      </Transform>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("[0: {0: test}]");
});

test("squash multiple text nodes — <Transform> inside <Text>", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Transform transform={(s: string, idx: number) => `[${idx}: ${s}]`}>
        <Text>
          <Transform transform={(s: string, idx: number) => `{${idx}: ${s}}`}>
            <Text>hello world</Text>
          </Transform>
        </Text>
      </Transform>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("[0: {0: hello world}]");
});

// G21: a nested <Transform> receives its POSITIONAL sibling index among the
// parent <Text>'s children, matching Ink squash-text-nodes.ts:13,38 (the index
// is the plain loop counter over ALL childNodes, including text-leaf siblings).
test("nested <Transform> as 2nd child of <Text> gets index 1", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text>
        a<Transform transform={(s: string, i: number) => `${s}[${i}]`}>b</Transform>
      </Text>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("ab[1]");
});

test("nested <Transform> as 3rd child of <Text> gets index 2", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text>
        a<Text>b</Text>
        <Transform transform={(s: string, i: number) => `${s}[${i}]`}>c</Transform>
      </Text>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("abc[2]");
});

test("sole/first-child nested <Transform> still gets index 0", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text>
        <Transform transform={(s: string, i: number) => `${s}[${i}]`}>a</Transform>b
      </Text>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("a[0]b");
});

// Resolved: Transform nodes are now yoga carriers, so multi-line text
// under a Transform node is properly laid out. See transform-yoga.test.tsx.

test("squash multiple nested text nodes — <Transform> inside <Text>", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Transform transform={(s: string, idx: number) => `[${idx}: ${s}]`}>
        <Text>
          <Transform transform={(s: string, idx: number) => `{${idx}: ${s}}`}>
            hello
            <Text> world</Text>
          </Transform>
        </Text>
      </Transform>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("[0: {0: hello world}]");
});

test("squash empty <Text> nodes — <Transform> inside <Text>", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Transform transform={(s: string) => `[${s}]`}>
        <Text>
          <Transform transform={(s: string) => `{${s}}`}>
            <Text>{[]}</Text>
          </Transform>
        </Text>
      </Transform>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("");
});

test("<Transform> with undefined children", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Transform transform={(s: string) => s} />),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("");
});

test("<Transform> with null children", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => <Transform transform={(s: string) => s} />),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("");
});

test("nested transforms apply inner-first: outer wraps inner result", async () => {
  const outer = (s: string) => `(${s})`;
  const inner = (s: string) => `{${s}}`;

  const App = defineComponent(() => () => (
    <Transform transform={outer}>
      <Transform transform={inner}>
        <Text>x</Text>
      </Transform>
    </Transform>
  ));
  const { lastFrame } = await render(App, { columns: 100 });
  // With prepend [node.transform, ...transformers]:
  // Inner: transformers = [inner, outer]
  // Apply left-to-right: inner("x") = "{x}", then outer("{x}") = "({x})"
  expect(lastFrame()).toBe("({x})");
});

// G32: a <Transform> nested DIRECTLY inside another <Transform> (both inside a
// <Text>) must be recursed into during squash so BOTH transforms run. Ink's
// squash-text-nodes.ts:22-39 recurses generically into any ink-text/ink-virtual-text
// child (a <Transform> renders an ink-text with internal_transform) — inner applied
// first, then outer. Previously vue-tui dropped the inner transform's content
// entirely (silent total content loss + 0-width measurement).
test("nested <Transform> directly inside <Transform> in <Text> — both apply", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text>
        <Transform transform={(s: string) => `[O${s}O]`}>
          <Transform transform={(s: string) => `<I${s}I>`}>x</Transform>
        </Transform>
      </Text>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("[O<IxI>O]");
});

test("triple-nested <Transform> in <Text> — all three apply to any depth", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text>
        <Transform transform={(s: string) => `A${s}A`}>
          <Transform transform={(s: string) => `B${s}B`}>
            <Transform transform={(s: string) => `C${s}C`}>x</Transform>
          </Transform>
        </Transform>
      </Text>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("ABCxCBA");
});

test("nested <Transform>-in-<Transform> reserves correct width (measurement)", async () => {
  // The whole box must be wide enough to hold "[O<IxI>O]" (9 cols) — if the inner
  // transform were dropped at measure time the box would reserve width 0/3 and the
  // sibling marker would overlap. Place a sibling after the text and assert it lands
  // at the expected column, proving measurement counted the full transformed width.
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Text>
          <Transform transform={(s: string) => `[O${s}O]`}>
            <Transform transform={(s: string) => `<I${s}I>`}>x</Transform>
          </Transform>
        </Text>
        <Text>|</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("[O<IxI>O]|");
});

// G52: Vue materializes a `null`/`false`/`v-if` render as a COMMENT host node
// that occupies a positional slot in `node.children`. React never produces a
// childNode for such children, so Ink's squash loop (squash-text-nodes.ts:13)
// never advances `index` past them. The transform index must therefore advance
// only for children React would have rendered — comment nodes must be skipped.
// Reproduces "A{null}<Transform>B</Transform>" → "A1:B" (NOT "A2:B").
test("G52: null sibling does not shift nested <Transform> index (paint)", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text>
        A{null}
        <Transform transform={(s: string, i: number) => `${i}:${s}`}>B</Transform>
      </Text>
    )),
    { columns: 100 },
  );
  // "A" = index 0, the null produces a comment that must NOT take a slot, so the
  // Transform stays at index 1.
  expect(lastFrame()).toBe("A1:B");
});

test("G52 control: no null sibling — <Transform> still gets index 1 (paint)", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text>
        A<Transform transform={(s: string, i: number) => `${i}:${s}`}>B</Transform>
      </Text>
    )),
    { columns: 100 },
  );
  // Without the null sibling the Transform is the 2nd child → index 1. Pairing
  // this with the case above proves the null is what (wrongly) shifts the index.
  expect(lastFrame()).toBe("A1:B");
});

test("G52: multiple null siblings don't shift index (paint)", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text>
        {null}A{null}
        {false}
        <Transform transform={(s: string, i: number) => `${i}:${s}`}>B</Transform>
      </Text>
    )),
    { columns: 100 },
  );
  // Three comment nodes (one before A, two after) must all be skipped: A=0,
  // Transform=1.
  expect(lastFrame()).toBe("A1:B");
});

test("G52: null sibling does not shift measured width (measurement)", async () => {
  // If measurement counted the comment slot the Transform index would differ
  // between paint and measure, desyncing reserved width. A trailing sibling
  // marker pins the measured width: "A1:B" is 4 cols, so "|" must land at col 4.
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Text>
          A{null}
          <Transform transform={(s: string, i: number) => `${i}:${s}`}>B</Transform>
        </Text>
        <Text>|</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("A1:B|");
});

// G52 (recursive twin): the comment-skip must also apply to the RECURSIVE
// grandchild loop that recurses transform-in-transform (G32's domain). A
// `{null}`/comment inside an OUTER <Transform> must NOT shift an INNER
// <Transform>'s index. Ink iterates the outer transform's real childNodes
// (squash-text-nodes.ts:13); React produces no node for `{null}`, so the inner
// transform stays at index 0. Reproduces
// "A<Transform outer>{null}<Transform inner>B</Transform></Transform>" so the
// inner transform sees index 0 (output "0:B", NOT "1:B").
test("G52 recursive: null inside outer <Transform> does not shift inner index (paint)", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text>
        A
        <Transform transform={(s: string) => `O${s}`}>
          {null}
          <Transform transform={(s: string, i: number) => `${i}:${s}`}>B</Transform>
        </Transform>
      </Text>
    )),
    { columns: 100 },
  );
  // Inside the outer transform: the {null} comment must not take a slot, so the
  // inner transform stays at index 0 → "0:B", wrapped by outer → "O0:B".
  expect(lastFrame()).toBe("AO0:B");
});

test("G52 recursive control: no null inside outer <Transform> — inner still index 0 (paint)", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text>
        A
        <Transform transform={(s: string) => `O${s}`}>
          <Transform transform={(s: string, i: number) => `${i}:${s}`}>B</Transform>
        </Transform>
      </Text>
    )),
    { columns: 100 },
  );
  // Sole child of the outer transform → index 0. Pairs with the case above to
  // prove the null is what (wrongly) shifts the recursive index.
  expect(lastFrame()).toBe("AO0:B");
});

test("G52 recursive: null inside outer <Transform> does not shift measured width (measurement)", async () => {
  // If measurement counted the comment slot, the inner transform index would
  // differ between paint and measure, desyncing reserved width. A trailing
  // sibling marker pins the measured width: "AO0:B" is 5 cols, so "|" lands at
  // col 5.
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Text>
          A
          <Transform transform={(s: string) => `O${s}`}>
            {null}
            <Transform transform={(s: string, i: number) => `${i}:${s}`}>B</Transform>
          </Transform>
        </Text>
        <Text>|</Text>
      </Box>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("AO0:B|");
});

test("transform with multiple lines", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Transform transform={(s: string, idx: number) => `[${idx}: ${s}]`}>
        <Text>{"hello world\ngoodbye world"}</Text>
      </Transform>
    )),
    { columns: 100 },
  );
  expect(lastFrame()).toBe("[0: hello world]\n[1: goodbye world]");
});
