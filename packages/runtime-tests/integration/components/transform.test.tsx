import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Newline, Text, Transform } from "@vue-tui/runtime";

test("Transform uppercases descendant text", async () => {
  const { lastFrame } = await render(() => (
    <Transform transform={(line: string) => line.toUpperCase()}>
      <Text>abc</Text>
    </Transform>
  ));
  expect(lastFrame()).toContain("ABC");
});

test("Newline inside Transform renders inline (text context via provide)", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Transform transform={(line) => line.toUpperCase()}>
        x<Newline />y
      </Transform>
    )),
    { columns: 100 },
  );
  // Newline injects Transform's TextContextKey → inline virtual-text → "x","y" on
  // two lines (both uppercased by the transform). Without Transform's provide,
  // Newline would render as a standalone yoga `text` node and the output differs.
  expect(lastFrame()).toBe("X\nY");
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

// P13: an EMPTY <Transform> (no children) must create NO host node, so in a flex
// row with gap it consumes NO gap slot. Ink's <Transform> (Transform.tsx:28-30)
// returns null when `children === undefined || children === null`, so an empty
// <Transform> sibling adds neither a node nor a gap. Ink reference (v7.0.4,
// gap=2 row): `a + <Transform/> + b` → "a  b" (a single gap), IDENTICAL to the
// no-transform control. Previously vue-tui always created a {0,0} transform host
// node, which ate a gap slot → "a    b".
test("P13: empty <Transform> in a gap row consumes no gap slot", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" gap={2}>
        <Text>a</Text>
        <Transform transform={(s: string) => s} />
        <Text>b</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Ink reference: empty Transform = no node = no gap slot → one gap of 2 spaces.
  expect(lastFrame({ trimLines: true })).toBe("a  b");
});

test("P13 control: gap row with no transform sibling is the same width", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" gap={2}>
        <Text>a</Text>
        <Text>b</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Pairs with the case above: an empty Transform must match this exactly.
  expect(lastFrame({ trimLines: true })).toBe("a  b");
});

// DELIBERATE divergence (documented in ink-divergences.md — the comment-anchor model):
// a literal `{false}` / `{cond && <x/>}`-false child. In React `false !== null`, so Ink
// renders an empty ink-text node that EATS a gap slot → "a    b". Vue materializes
// `false`, `null`, `undefined`, and `v-if=false` into the SAME Comment vnode and cannot
// tell them apart, so <Transform> treats them all as "no children" (omit the node) —
// rendering "a  b", consistent with how every other component (e.g. <Box>) treats a
// false/v-if child. Locking vue's principled side so it can't silently change.
test("a `{cond && x}`-false <Transform> child omits the node (vue comment-anchor divergence)", async () => {
  const show = false;
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" gap={2}>
        <Text>a</Text>
        <Transform transform={(s: string) => s}>{show && <Text>x</Text>}</Transform>
        <Text>b</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // vue: false child = comment anchor = no node = no gap slot. (Ink would render "a    b".)
  expect(lastFrame({ trimLines: true })).toBe("a  b");
});

test("P13 control: NON-empty <Transform> in a gap row DOES take a gap slot", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" gap={2}>
        <Text>a</Text>
        <Transform transform={(s: string) => s}>
          <Text>x</Text>
        </Transform>
        <Text>b</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // A Transform WITH children is a real node → two gap slots. Proves the fix only
  // drops the empty case. Ink reference: "a  x  b".
  expect(lastFrame({ trimLines: true })).toBe("a  x  b");
});

// P13 boundary: an empty-STRING child is NOT null — Ink's guard is exactly
// `children === undefined || children === null`, so `<Transform>{''}</Transform>`
// (children === '') renders a real (0-width) node and DOES take a gap slot. Ink
// reference (gap=2 row): "a    b" (two gap slots). The Vue analogue: an empty
// string materializes as a TEXT vnode (not a comment), so it must NOT be treated
// as "no children".
test("P13 boundary: empty-string-child <Transform> still takes a gap slot (matches Ink)", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row" gap={2}>
        <Text>a</Text>
        <Transform transform={(s: string) => s}>{""}</Transform>
        <Text>b</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Ink: empty STRING child (≠ null) → real node → two gap slots → "a    b".
  expect(lastFrame({ trimLines: true })).toBe("a    b");
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

// G52 sibling case — an EMPTY-STRING child (`{''}`) is not a counted childNode in
// Ink either: React renders neither `null` nor `''` as a DOM childNode, so an empty
// `''` sibling must NOT shift a following <Transform>'s positional line index. Vue
// materializes `''` as an EMPTY text-leaf host node that DOES occupy a positional
// slot, so the squash/transform-index loops must skip it exactly like a comment.
// This is the same anchor a template `<slot/>` boundary inserts, which is why a
// template-authored <Text> needs this fix. Verified against real Ink v7.0.4:
// `a{''}<Transform>b` → "a1:b" (index 1, after "a"), NOT "a2:b".
test("empty-string child does not shift a sibling Transform's line index (Ink parity)", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Text>
        {"a"}
        {""}
        <Transform transform={(line, i) => `${i}:${line}`}>b</Transform>
      </Text>
    )),
    { columns: 40 },
  );
  // Ink v7.0.4: the empty "" is not a counted child, so the Transform sees line
  // index 1 (after "a"), giving "1:b" → "a1:b".
  expect(lastFrame()).toBe("a1:b");
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

// G58: a STANDALONE <Transform> (NOT wrapped in <Text>) with DIRECT bare-string
// children must render that text with the transform applied — matching Ink, where
// <Transform> IS an ink-text host node (Transform.tsx renders <ink-text
// internal_transform={fn}>), so bare-string children render inline within that
// ink-text and the transform applies per line via Output. Previously vue-tui's
// transform host was a non-text yoga carrier whose direct text-leaf children hit
// the paint no-op branch, so the content was silently dropped. This is the
// canonical Ink README pattern `<Transform transform={fn}>Hello World</Transform>`.
test("G58: standalone <Transform> with bare-string children applies the transform", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <>
        <Transform transform={(s: string) => `<${s}>`}>ab</Transform>
        <Text>after</Text>
      </>
    )),
    { columns: 40 },
  );
  // Ink reference (v7.0.4, columns=40): "<ab>\nafter".
  expect(lastFrame()).toBe("<ab>\nafter");
});

// G58 (Newline sub-symptom): a <Newline> directly inside a standalone
// <Transform> (no <Text> wrapper) must emit an inline line break inside the
// transform's text, and the transform applies PER LINE (via Output). Ink
// reference: `<Transform transform={s=>`<${s}>`}>a<Newline/>b</Transform>` →
// "<a>\n<b>" (transform applied to each line "a" and "b" separately). Previously
// the <Newline> rendered as a standalone "text" yoga node (name-based
// isInsideText saw no <Text> ancestor) and the bare strings were dropped, so the
// transform was applied to EMPTY lines giving "<>\n<>".
test("G58: standalone <Transform> with <Newline> applies the transform per line", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Transform transform={(s: string) => `<${s}>`}>
        a<Newline />b
      </Transform>
    )),
    { columns: 40 },
  );
  // Ink reference (v7.0.4, columns=40): "<a>\n<b>".
  expect(lastFrame()).toBe("<a>\n<b>");
});

test("G58: standalone <Transform> with <Newline> and identity transform keeps both lines", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Transform transform={(s: string) => s}>
        a<Newline />b
      </Transform>
    )),
    { columns: 40 },
  );
  // Ink reference (v7.0.4): identity transform → "a\nb".
  expect(lastFrame()).toBe("a\nb");
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

// G58 follow-up — MUST-FIX 1: an INLINE <Transform> (inside a <Text>) does NOT
// own the <Text>'s yoga measure func, so a reactive change to its child text
// must dirty the ENCLOSING <Text> (the measure owner), not stop at the inline
// transform. Ink climbs to the nearest node WITH a yoga node (dom.ts
// findClosestYogaNode) — an inline transform renders as ink-virtual-text which
// has NO yoga node, so the climb passes through it to the ink-text. Previously
// the dirty-bubble stopped at the inline transform, leaving the <Text> stale, so
// "b"→"long" only repainted within the old (narrow) measured width.
test("G58 MF1: reactive update inside inline <Transform> dirties enclosing <Text> (width grows)", async () => {
  const s = shallowRef("b");
  const { lastFrame, waitUntilRenderFlush } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Text>
          a<Transform transform={(x: string) => `<${x}>`}>{s.value}</Transform>
        </Text>
        <Text>|</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Initial: measured width of "a<b>" = 4, sibling "|" lands at col 4.
  expect(lastFrame()).toBe("a<b>|");
  s.value = "long";
  await nextTick();
  await waitUntilRenderFlush();
  // Ink reference: the enclosing <Text> remeasures "a<long>" (7 cols) so "|"
  // lands at col 7 and the full transformed text is visible. RED on cb68dd2
  // produced "a<lo|" (stale layout — width never grew).
  expect(lastFrame()).toBe("a<long>|");
});

// G58 follow-up — MUST-FIX 2: a <Transform> nested DIRECTLY inside another
// STANDALONE <Transform> (no <Text> wrapper) is INLINE — it must NOT be inserted
// as a yoga child of the outer transform. Instead the outer (standalone) measures
// the whole squashed text, applying the inner CHILD transform's fn (Ink's
// squashTextNodes applies child internal_transform), but NOT the outer's own fn
// (that runs at Output paint). So the reserved width = width of "<IxI>" (5), and
// the painted "[O<IxI>O]" overflows past that — a sibling overwrites the overflow.
test("G58 MF2: nested <Transform>-in-standalone-<Transform> reserves inner-applied width", async () => {
  const { lastFrame } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Transform transform={(s: string) => `[O${s}O]`}>
          <Transform transform={(s: string) => `<I${s}I>`}>x</Transform>
        </Transform>
        <Text>|</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Ink reference (v40b3a75): "[O<Ix|>O]" — measured width = 5 ("<IxI>", inner
  // child fn applied, outer fn not), so "|" lands at col 5 and overwrites the
  // outer-applied overflow. RED on cb68dd2 produced "[|<IxI>O]" (inner transform
  // became a yoga child → width 0 reserved, "|" at col 1).
  expect(lastFrame()).toBe("[O<Ix|>O]");
});

// G58 follow-up — STRUCTURAL-DIRTY: inserting/removing an inline child under a
// plain <Text> (or virtual-text) parent must dirty the enclosing <Text>'s yoga
// measure owner so the layout re-measures. Ink marks the parent dirty in
// appendChildNode / insertBeforeNode / removeChildNode for ink-text AND
// ink-virtual-text parents (dom.ts:132,165,185), then climbs to the closest yoga
// node (dom.ts:248). The previous vue-tui code only dirtied when the parent was a
// <Transform>, so a STRUCTURAL change (v-if inserting/removing an inline
// <Transform>, or inserting a bare-text child) under a <Text> left STALE LAYOUT.
test("structural dirty: v-if inserting an inline <Transform> into <Text> grows width", async () => {
  const show = shallowRef(false);
  const { lastFrame, waitUntilRenderFlush } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Text>
          a{show.value ? <Transform transform={(s: string) => `<${s}>`}>long</Transform> : null}
        </Text>
        <Text>|</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Initial: only "a" → width 1, sibling "|" at col 1.
  expect(lastFrame()).toBe("a|");
  show.value = true;
  await nextTick();
  await waitUntilRenderFlush();
  // Ink reference (v40b3a75): the <Text> remeasures "a<long>" (7 cols) so "|"
  // lands at col 7. RED before the fix: stayed "a|" (stale layout — the
  // structural insert never dirtied the enclosing <Text>).
  expect(lastFrame()).toBe("a<long>|");
});

test("structural dirty: v-if removing an inline <Transform> from <Text> shrinks width", async () => {
  const show = shallowRef(true);
  const { lastFrame, waitUntilRenderFlush } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Text>
          a{show.value ? <Transform transform={(s: string) => `<${s}>`}>long</Transform> : null}
        </Text>
        <Text>|</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Initial: "a<long>" → width 7, sibling "|" at col 7.
  expect(lastFrame()).toBe("a<long>|");
  show.value = false;
  await nextTick();
  await waitUntilRenderFlush();
  // Ink reference (v40b3a75): the <Text> remeasures "a" (1 col) so "|" lands at
  // col 1. RED before the fix: stayed "a<long>|" with stale width (painted
  // "a      |" — trailing blanks from the un-shrunk measured width).
  expect(lastFrame()).toBe("a|");
});

test("structural dirty: inserting a bare-text child into <Text> grows width", async () => {
  const show = shallowRef(false);
  const { lastFrame, waitUntilRenderFlush } = await render(
    defineComponent(() => () => (
      <Box flexDirection="row">
        <Text>a{show.value ? "long" : null}</Text>
        <Text>|</Text>
      </Box>
    )),
    { columns: 100 },
  );
  // Initial: only "a" → width 1, sibling "|" at col 1.
  expect(lastFrame()).toBe("a|");
  show.value = true;
  await nextTick();
  await waitUntilRenderFlush();
  // Ink reference (v40b3a75): the <Text> remeasures "along" (5 cols) so "|"
  // lands at col 5. RED before the fix: stayed "a|" (stale layout).
  expect(lastFrame()).toBe("along|");
});

// G58 follow-up — SHOULD-FIX: a standalone <Transform> is a text context (Ink
// models it as ink-text → isInsideText), so a <Box> directly inside it must
// throw the SAME dev error as a <Box> inside a <Text>. Ink reconciler.ts:205
// throws `<Box> can't be nested inside <Text> component` from createInstance.
test("G58 should-fix: <Box> directly inside standalone <Transform> throws like <Box> in <Text>", async () => {
  await expect(
    render(
      defineComponent(() => () => (
        <Transform transform={(s: string) => s}>
          <Box>
            <Text>hi</Text>
          </Box>
        </Transform>
      )),
      { columns: 40 },
    ),
  ).rejects.toThrow("<Box> can’t be nested inside <Text> component");
});
