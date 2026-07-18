import { defineComponent, nextTick, shallowRef, type FunctionalComponent } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { Box, Text, Transform, Newline, createApp, renderToString } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { render } from "@vue-tui/testing";
import {
  createRoot,
  createBox,
  createText,
  createTextLeaf,
  attachYoga,
  renderScreenReaderOutput,
  renderToStringWithScreenReader,
  type AppContext,
} from "@vue-tui/runtime/internal";
import {
  makeFakeStdin,
  makeFakeWritable,
  captureWrites,
  getContentWrites,
} from "../lifecycle/test-streams.ts";

// Strip ANSI control sequences (cursor-hide, log-update erase codes) so the
// live screen-reader frames can be compared as plain text. The SR frame writer
// interleaves erase sequences between commits; we only care about the text.
// eslint-disable-next-line no-control-regex -- terminal ANSI escapes are control chars by definition
const stripAnsi = (s: string): string => s.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "");

// Yoga.DIRECTION_LTR = 0
const DIRECTION_LTR = 0;

function createTestAppContext(): AppContext {
  return {
    exit: () => {},
    waitUntilRenderFlush: async () => {},
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    isRawModeSupported: false,
    setRawMode: () => {},
    writeToStdout: () => ({ status: "accepted", writable: true }),
    writeToStderr: () => ({ status: "accepted", writable: true }),
  };
}

describe("renderScreenReaderOutput (unit)", () => {
  test("renders text content", () => {
    const root = createRoot(createTestAppContext());
    attachYoga(root);
    root.yoga.setWidth(80);

    const text = createText();
    attachYoga(text);
    const leaf = createTextLeaf("Hello");
    leaf.parent = text;
    text.children.push(leaf);
    text.parent = root;
    root.children.push(text);
    root.yoga.insertChild(text.yoga, 0);

    root.yoga.calculateLayout(80, undefined, DIRECTION_LTR);

    const output = renderScreenReaderOutput(root);
    expect(output).toBe("Hello");

    root.yoga.freeRecursive();
  });

  test("joins row children with space", () => {
    const root = createRoot(createTestAppContext());
    attachYoga(root);
    root.yoga.setWidth(80);

    const box = createBox();
    attachYoga(box);
    box.props["flexDirection"] = "row";
    // Yoga.FLEX_DIRECTION_ROW = 2
    box.yoga.setFlexDirection(2);
    box.parent = root;
    root.children.push(box);
    root.yoga.insertChild(box.yoga, 0);

    const text1 = createText();
    attachYoga(text1);
    const leaf1 = createTextLeaf("Hello");
    leaf1.parent = text1;
    text1.children.push(leaf1);
    text1.parent = box;
    box.children.push(text1);
    box.yoga.insertChild(text1.yoga, 0);

    const text2 = createText();
    attachYoga(text2);
    const leaf2 = createTextLeaf("World");
    leaf2.parent = text2;
    text2.children.push(leaf2);
    text2.parent = box;
    box.children.push(text2);
    box.yoga.insertChild(text2.yoga, 1);

    root.yoga.calculateLayout(80, undefined, DIRECTION_LTR);

    const output = renderScreenReaderOutput(root);
    expect(output).toBe("Hello World");

    root.yoga.freeRecursive();
  });

  test("prepends role annotation", () => {
    const root = createRoot(createTestAppContext());
    attachYoga(root);
    root.yoga.setWidth(80);

    const box = createBox();
    attachYoga(box);
    box.internal_accessibility = { role: "button" };
    box.parent = root;
    root.children.push(box);
    root.yoga.insertChild(box.yoga, 0);

    const text = createText();
    attachYoga(text);
    const leaf = createTextLeaf("Click me");
    leaf.parent = text;
    text.children.push(leaf);
    text.parent = box;
    box.children.push(text);
    box.yoga.insertChild(text.yoga, 0);

    root.yoga.calculateLayout(80, undefined, DIRECTION_LTR);

    const output = renderScreenReaderOutput(root);
    expect(output).toBe("button: Click me");

    root.yoga.freeRecursive();
  });

  test("prepends state annotation", () => {
    const root = createRoot(createTestAppContext());
    attachYoga(root);
    root.yoga.setWidth(80);

    const box = createBox();
    attachYoga(box);
    box.internal_accessibility = {
      role: "checkbox",
      state: { checked: true, disabled: false },
    };
    box.parent = root;
    root.children.push(box);
    root.yoga.insertChild(box.yoga, 0);

    const text = createText();
    attachYoga(text);
    const leaf = createTextLeaf("Option");
    leaf.parent = text;
    text.children.push(leaf);
    text.parent = box;
    box.children.push(text);
    box.yoga.insertChild(text.yoga, 0);

    root.yoga.calculateLayout(80, undefined, DIRECTION_LTR);

    const output = renderScreenReaderOutput(root);
    expect(output).toBe("checkbox: (checked) Option");

    root.yoga.freeRecursive();
  });

  test("skips display: none nodes", () => {
    const root = createRoot(createTestAppContext());
    attachYoga(root);
    root.yoga.setWidth(80);

    const box = createBox();
    attachYoga(box);
    // Yoga.DISPLAY_NONE = 1
    box.yoga.setDisplay(1);
    box.parent = root;
    root.children.push(box);
    root.yoga.insertChild(box.yoga, 0);

    const text = createText();
    attachYoga(text);
    const leaf = createTextLeaf("Hidden");
    leaf.parent = text;
    text.children.push(leaf);
    text.parent = box;
    box.children.push(text);
    box.yoga.insertChild(text.yoga, 0);

    root.yoga.calculateLayout(80, undefined, DIRECTION_LTR);

    const output = renderScreenReaderOutput(root);
    expect(output).toBe("");

    root.yoga.freeRecursive();
  });

  test("does not duplicate parent role on child with same role", () => {
    const root = createRoot(createTestAppContext());
    attachYoga(root);
    root.yoga.setWidth(80);

    const outerBox = createBox();
    attachYoga(outerBox);
    outerBox.internal_accessibility = { role: "list" };
    outerBox.parent = root;
    root.children.push(outerBox);
    root.yoga.insertChild(outerBox.yoga, 0);

    const innerBox = createBox();
    attachYoga(innerBox);
    innerBox.internal_accessibility = { role: "list" };
    innerBox.parent = outerBox;
    outerBox.children.push(innerBox);
    outerBox.yoga.insertChild(innerBox.yoga, 0);

    const text = createText();
    attachYoga(text);
    const leaf = createTextLeaf("Item");
    leaf.parent = text;
    text.children.push(leaf);
    text.parent = innerBox;
    innerBox.children.push(text);
    innerBox.yoga.insertChild(text.yoga, 0);

    root.yoga.calculateLayout(80, undefined, DIRECTION_LTR);

    const output = renderScreenReaderOutput(root);
    // Inner box has same role as parent, so role is only shown on outer
    expect(output).toBe("list: Item");

    root.yoga.freeRecursive();
  });

  // G22 (Ink parity): dedup is only against the IMMEDIATE parent's role.
  // A role-less intermediate box must reset the inherited parentRole to undefined
  // so a grandchild with the same role as the grandparent IS still announced.
  // Ink passes `node.internal_accessibility?.role` (no ?? fallback) to children.
  test("G22: grandchild with same role as grandparent IS announced when immediate parent has no role", () => {
    // Structure: grandparent[role=list] → middle(no role) → grandchild[role=list]
    // Expected: both "list" annotations appear (grandchild is NOT wrongly deduped
    // against the grandparent through the role-less intermediate).
    const root = createRoot(createTestAppContext());
    attachYoga(root);
    root.yoga.setWidth(80);

    const grandparent = createBox();
    attachYoga(grandparent);
    grandparent.internal_accessibility = { role: "list" };
    grandparent.parent = root;
    root.children.push(grandparent);
    root.yoga.insertChild(grandparent.yoga, 0);

    // Role-less intermediate box — must reset parentRole to undefined for its children.
    const middle = createBox();
    attachYoga(middle);
    // No internal_accessibility on middle (no role).
    middle.parent = grandparent;
    grandparent.children.push(middle);
    grandparent.yoga.insertChild(middle.yoga, 0);

    const grandchild = createBox();
    attachYoga(grandchild);
    grandchild.internal_accessibility = { role: "list" };
    grandchild.parent = middle;
    middle.children.push(grandchild);
    middle.yoga.insertChild(grandchild.yoga, 0);

    const text = createText();
    attachYoga(text);
    const leaf = createTextLeaf("Item");
    leaf.parent = text;
    text.children.push(leaf);
    text.parent = grandchild;
    grandchild.children.push(text);
    grandchild.yoga.insertChild(text.yoga, 0);

    root.yoga.calculateLayout(80, undefined, DIRECTION_LTR);

    const output = renderScreenReaderOutput(root);
    // grandchild shares role with grandparent but NOT with its immediate parent
    // (which has no role). It must NOT be deduped — both annotations must appear.
    expect(output).toBe("list: list: Item");

    root.yoga.freeRecursive();
  });

  // G22 control: immediate-parent dedup is still in effect.
  // A child whose DIRECT parent has the same role must still be suppressed.
  test("G22 control: child role matching immediate parent is still deduped", () => {
    // Structure: parent[role=nav] → child[role=nav]
    // Expected: only one "nav:" annotation (child is deduped against immediate parent).
    const root = createRoot(createTestAppContext());
    attachYoga(root);
    root.yoga.setWidth(80);

    const parent = createBox();
    attachYoga(parent);
    parent.internal_accessibility = { role: "nav" };
    parent.parent = root;
    root.children.push(parent);
    root.yoga.insertChild(parent.yoga, 0);

    const child = createBox();
    attachYoga(child);
    child.internal_accessibility = { role: "nav" };
    child.parent = parent;
    parent.children.push(child);
    parent.yoga.insertChild(child.yoga, 0);

    const text = createText();
    attachYoga(text);
    const leaf = createTextLeaf("Link");
    leaf.parent = text;
    text.children.push(leaf);
    text.parent = child;
    child.children.push(text);
    child.yoga.insertChild(text.yoga, 0);

    root.yoga.calculateLayout(80, undefined, DIRECTION_LTR);

    const output = renderScreenReaderOutput(root);
    // Child shares role with immediate parent — deduped to single annotation.
    expect(output).toBe("nav: Link");

    root.yoga.freeRecursive();
  });
});

describe("Box aria props", () => {
  test("renders aria-role and aria-state on box node", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Box aria-role="button" aria-state={{ disabled: true }}>
          <Text>Click</Text>
        </Box>
      )),
      { columns: 40 },
    );
    // The visual output should still contain the text
    expect(output).toContain("Click");
  });

  test("aria-label does not affect normal rendering (screen reader disabled)", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Box aria-label="my button">
          <Text>visible text</Text>
        </Box>
      )),
      { columns: 40 },
    );
    expect(output).toContain("visible text");
  });

  test("aria-hidden does not hide box when screen reader is disabled", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Box aria-hidden>
          <Text>still visible</Text>
        </Box>
      )),
      { columns: 40 },
    );
    expect(output).toContain("still visible");
  });
});

describe("Text aria props", () => {
  test("renders normally with aria-label when screen reader is disabled", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Box>
          <Text aria-label="replacement">original text</Text>
        </Box>
      )),
      { columns: 40 },
    );
    expect(output).toContain("original text");
  });

  test("renders normally with aria-hidden when screen reader is disabled", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Box>
          <Text aria-hidden>hidden text</Text>
        </Box>
      )),
      { columns: 40 },
    );
    expect(output).toContain("hidden text");
  });
});

describe("Transform accessibility", () => {
  // G21 follow-up, finding 2: squashTextContent must pass the transform's
  // positional sibling index (not hardcoded 0) so SR output matches paint.
  test("nested <Transform> as 2nd child of <Text> gets index 1 in screen-reader mode", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Text>
          a<Transform transform={(s: string, i: number) => `${s}[${i}]`}>b</Transform>
        </Text>
      )),
    );
    // Transform is the 2nd child (index 1) of the Text node — must receive 1,
    // not 0, matching paint.ts and Ink squash-text-nodes.ts:13,38 behavior.
    expect(output).toBe("ab[1]");
  });

  // G23: a <Transform> directly under a <Box> in screen-reader mode must
  // CONCATENATE its children with "" (not newline-join them). This matches Ink:
  // a <Transform> is an `ink-text` node, so the SR path squashes it via
  // squashTextNodes (squash-text-nodes.ts), which concatenates child text with
  // "". Verified empirically against Ink 7.0.4: the transform node's OWN
  // internal_transform is NOT applied when it is the top-level node handed to
  // squashTextNodes (squash only applies the internal_transform of *child*
  // nodes, line 34-39) — so a Transform directly under a Box yields the bare
  // concatenated children, no wrapping.
  test("<Transform> under <Box> concatenates children with no newline in screen-reader mode", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box>
          <Transform transform={(s: string) => `[${s}]`}>
            <Text>a</Text>
            <Text>b</Text>
          </Transform>
        </Box>
      )),
    );
    // Children are concatenated ("ab"), NOT newline-joined ("a\nb").
    expect(output).toBe("ab");
  });

  // G58 (SR twin): a standalone <Transform> with DIRECT bare-string children
  // must include that text in screen-reader output. Ink's SR path squashes the
  // ink-text via squashTextNodes, which includes #text children — the
  // transform's OWN fn is NOT applied at the top level (only child transforms
  // are). Ink reference: `<Transform transform={s=>`<${s}>`}>ab</Transform>` SR
  // → "ab". Previously vue-tui dropped bare text-leaf children of a transform in
  // the SR squash, yielding "".
  test("G58: standalone <Transform> with bare-string children appears in screen-reader output", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => <Transform transform={(s: string) => `<${s}>`}>ab</Transform>),
    );
    expect(output).toBe("ab");
  });

  // G58 follow-up — MUST-FIX 3: a CHILD (nested) <Transform> inside a standalone
  // outer <Transform> must have its OWN fn APPLIED in SR — it is a *child* being
  // squashed, and Ink's squashTextNodes applies child internal_transform
  // (squash-text-nodes.ts:34). The OUTER transform's own fn is still NOT applied
  // (it is the top-level node handed to squash). Ink reference: outer fn skipped,
  // inner fn `s=>`{${s}}`` applied to "x" → "{x}". Previously vue-tui rendered the
  // child transform via the top-level SR rule (which skips the child's own fn),
  // yielding "x".
  test("G58 MF3: nested <Transform>'s own fn IS applied inside a standalone <Transform> (SR)", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Transform transform={(s: string) => `(outer ${s})`}>
          <Transform transform={(s: string) => `{${s}}`}>x</Transform>
        </Transform>
      )),
    );
    // Inner (child) fn applied → "{x}"; outer (top-level) fn NOT applied.
    expect(output).toBe("{x}");
  });

  // G58 (SR Newline twin): a <Newline> directly inside a standalone <Transform>
  // contributes its line break to the squashed SR text. Ink reference:
  // `<Transform>a<Newline/>b</Transform>` SR → "a\nb".
  test("G58: standalone <Transform> with <Newline> appears in screen-reader output", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Transform transform={(s: string) => `<${s}>`}>
          a<Newline />b
        </Transform>
      )),
    );
    expect(output).toBe("a\nb");
  });

  // G52: Vue materializes a null/v-if/false render as a COMMENT host node that
  // occupies a positional slot. React never produces a childNode for such
  // children (Ink squash-text-nodes.ts:13 never advances index past them), so
  // the SR squash path must skip comment nodes when indexing the transform —
  // staying in lockstep with paint and measurement.
  test("G52: null sibling does not shift nested <Transform> index in screen-reader mode", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Text>
          a{null}
          <Transform transform={(s: string, i: number) => `${s}[${i}]`}>b</Transform>
        </Text>
      )),
    );
    // The null produces a comment that must NOT take a slot: a=0, Transform=1.
    expect(output).toBe("ab[1]");
  });

  test("renders children normally when screen reader is disabled", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Transform transform={(s: string) => s.toUpperCase()} accessibilityLabel="accessible label">
          <Text>lowercase</Text>
        </Transform>
      )),
      { columns: 40 },
    );
    expect(output).toContain("LOWERCASE");
  });

  // P19: Ink's null-children guard (Transform.tsx:28-30) runs BEFORE the
  // accessibilityLabel substitution, so a <Transform accessibilityLabel="Acc">
  // with NO children returns null even in screen-reader mode — it emits NOTHING.
  // Ink reference (v7.0.4, SR on): `<Transform accessibilityLabel="Acc"/>` → "".
  // Previously vue-tui ran the SR/label branch first and emitted "Acc".
  test("P19: childless <Transform accessibilityLabel> emits nothing in screen-reader mode", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Transform transform={(s: string) => s} accessibilityLabel="Acc" />
      )),
    );
    // Null guard fires first → no node → no label text.
    expect(output).toBe("");
  });

  // P19 control: WITH children the label substitution path is unchanged — a
  // <Transform accessibilityLabel="Acc"> that HAS children still emits the label
  // in SR mode. Ink reference (SR on): label substitutes for children → "Acc".
  test("P19 control: <Transform accessibilityLabel> WITH children still emits label in SR mode", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Transform transform={(s: string) => s} accessibilityLabel="Acc">
          <Text>x</Text>
        </Transform>
      )),
    );
    expect(output).toBe("Acc");
  });
});

describe("screen-reader ANSI sanitization (Ink parity)", () => {
  // Ink squashes every ink-text via squashTextNodes, which ALWAYS returns
  // sanitizeAnsi(text) (squash-text-nodes.ts:45) — stripping cursor/erase CSI
  // (e.g. `\x1b[2J`) while keeping SGR + OSC. vue-tui's SR squash previously
  // concatenated raw text-leaf values with NO sanitize, so an embedded control
  // sequence survived into screen-reader output. This is the SR twin of
  // text-measure.ts:54 (`return sanitizeAnsi(out)`).
  // eslint-disable-next-line no-control-regex -- ESC erase code is a control char by definition; testing it is the point
  const ERASE_SCREEN = "\x1b[2J";

  test("strips an erase CSI embedded in <Text> in screen-reader mode", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => <Text>{`a${ERASE_SCREEN}b`}</Text>),
    );
    // The erase sequence is stripped; visible chars survive.
    expect(output).toBe("ab");
  });

  test("strips an erase CSI in <Text> nested under <Box> in screen-reader mode", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box>
          <Text>{`x${ERASE_SCREEN}y`}</Text>
        </Box>
      )),
    );
    expect(output).toBe("xy");
  });

  test("strips an erase CSI inside a standalone <Transform> in screen-reader mode", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Transform transform={(s: string) => s}>{`p${ERASE_SCREEN}q`}</Transform>
      )),
    );
    expect(output).toBe("pq");
  });

  test("keeps SGR (color) sequences in screen-reader output, matching Ink's sanitizeAnsi", () => {
    // sanitizeAnsi strips cursor/erase CSI but KEEPS SGR + OSC — so this would
    // FAIL against a strip-everything replacement, proving we mirror Ink's
    // sanitizeAnsi (sanitize-ansi.ts), not a blanket ANSI strip.
    // eslint-disable-next-line no-control-regex -- SGR codes are control chars; asserting they survive is the point
    const colored = "a\x1b[31mb\x1b[39mc";
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => <Text>{`${colored}${ERASE_SCREEN}`}</Text>),
    );
    // SGR kept, trailing erase stripped.
    expect(output).toBe(colored);
  });
});

describe("integration: aria props via render", () => {
  test("no unknown prop warnings for aria props", async () => {
    // This test verifies that aria props don't trigger the "[vue-tui] unknown prop" warning
    const App = defineComponent(() => () => (
      <Box aria-role="button" aria-state={{ checked: true }} aria-label="test" aria-hidden={false}>
        <Text aria-label="text label" aria-hidden={false}>
          Hello
        </Text>
      </Box>
    ));

    const { lastFrame } = await render(App, { columns: 40 });
    expect(lastFrame()).toContain("Hello");
  });

  test("all aria props render without errors", async () => {
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        <Box aria-role="list" aria-state={{ busy: true }}>
          <Box aria-role="listitem">
            <Text>Item 1</Text>
          </Box>
          <Box aria-role="listitem">
            <Text>Item 2</Text>
          </Box>
        </Box>
        <Transform transform={(s: string) => s} accessibilityLabel="transform label">
          <Text>content</Text>
        </Transform>
      </Box>
    ));

    const { lastFrame } = await render(App, { columns: 40 });
    expect(lastFrame()).toContain("Item 1");
    expect(lastFrame()).toContain("Item 2");
    expect(lastFrame()).toContain("content");
  });
});

describe("screen reader enabled mode", () => {
  test("render aria-label on Text in screen-reader mode replaces children", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box>
          <Text aria-label="Screen-reader only">visible text</Text>
        </Box>
      )),
    );
    expect(output).toBe("Screen-reader only");
  });

  test("render aria-label on Box in screen-reader mode replaces children", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box aria-label="Screen-reader only">
          <Text>Not visible to screen readers</Text>
        </Box>
      )),
    );
    expect(output).toBe("Screen-reader only");
  });

  test("omit ANSI styling in screen-reader output", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box>
          <Text bold color="green" inverse underline>
            Styled content
          </Text>
        </Box>
      )),
    );
    expect(output).toBe("Styled content");
  });

  test("render multiple Text components", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box flexDirection="column">
          <Text>Hello</Text>
          <Text>World</Text>
        </Box>
      )),
    );
    expect(output).toBe("Hello\nWorld");
  });

  // G39 (Ink parity): a default <Box> (no explicit flexDirection) lays out as
  // a row (yoga/Box default is FLEX_DIRECTION_ROW), so its SR children must be
  // joined with a SPACE — matching Ink, which hardcodes flexDirection:'row' in
  // Box.tsx and derives the SR separator from style. The yoga row default is NOT
  // mirrored into node.props, so an absent flexDirection must be treated as
  // "row" in screen-reader.ts. (Buggy behavior joined with "\n".)
  test("render default Box (no flexDirection) joins children with space", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box>
          <Text>Hello</Text>
          <Text>World</Text>
        </Box>
      )),
    );
    expect(output).toBe("Hello World");
  });

  // G39 follow-up: pin the yoga-enum mapping + reverse-order branch that
  // resolveBoxFlexDirection / renderScreenReaderOutput now own. row-reverse must
  // join with a SPACE *and* reverse child order (Ink parity: reverse directions
  // flip the visual/announced order).
  test("render Box flexDirection=row-reverse joins with space and reverses children", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box flexDirection="row-reverse">
          <Text>Hello</Text>
          <Text>World</Text>
        </Box>
      )),
    );
    // row-reverse: space separator + reversed order → "World Hello".
    expect(output).toBe("World Hello");
  });

  // G39 follow-up: column-reverse must join with a NEWLINE (non-row separator)
  // *and* reverse child order.
  test("render Box flexDirection=column-reverse joins with newline and reverses children", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box flexDirection="column-reverse">
          <Text>Hello</Text>
          <Text>World</Text>
        </Box>
      )),
    );
    // column-reverse: newline separator + reversed order → "World\nHello".
    expect(output).toBe("World\nHello");
  });

  // G39 stale-read guard (the core reason resolveBoxFlexDirection reads yoga, not
  // node.props): when a Box's flexDirection is dynamically REMOVED, the yoga node
  // resets to its row default (host/yoga.ts: flexDirection == null → ROW). Since
  // node-ops never mirrors flexDirection into node.props (not a STYLE_PROP), the
  // SR separator MUST be derived from the live yoga state, not a stale prop. This
  // uses the live commit path (isScreenReaderEnabled mount) so the yoga reset is
  // real — the old pure-props logic would read undefined → "\n" and FAIL the
  // post-removal assertion below.
  test.sequential("live SR Box resolves to row default (space) after flexDirection is dynamically removed", async () => {
    // shallowRef holding the reactive flexDirection: start "column", then clear.
    // Typed as the Box FlexDirection union (not `string`) so the JSX prop
    // typechecks under `vp run ci` — FlexDirection isn't exported from the
    // public index, so we inline the literal union here.
    const flexDirection = shallowRef<
      "row" | "row-reverse" | "column" | "column-reverse" | undefined
    >("column");
    const App = defineComponent(() => () => (
      <Box flexDirection={flexDirection.value}>
        <Text>Hello</Text>
        <Text>World</Text>
      </Box>
    ));

    const app = createApp(App);
    const stdout = makeFakeWritable({ columns: 80 });
    const stderr = makeFakeWritable({ columns: 80 });
    const { stream: stdin } = makeFakeStdin();
    const writes = captureWrites(stdout);

    app.mount({
      stdout,
      stdin,
      stderr,
      isScreenReaderEnabled: true,
    });

    await nextTick();
    await nextTick();

    // column → newline separator, forward order.
    const beforeRemoval = stripAnsi(getContentWrites(writes).join(""));
    expect(beforeRemoval).toContain("Hello\nWorld");
    expect(beforeRemoval).not.toContain("Hello World");

    // Drop flexDirection. node-ops resets the yoga node to its row default;
    // node.props.flexDirection is undefined (never mirrored), so the SR path
    // must read yoga (ROW) → space separator.
    writes.length = 0;
    flexDirection.value = undefined;

    await nextTick();
    await nextTick();

    const afterRemoval = stripAnsi(getContentWrites(writes).join(""));
    // Yoga reset to row → SPACE separator. (Stale-prop logic would emit "\n".)
    expect(afterRemoval).toContain("Hello World");
    expect(afterRemoval).not.toContain("Hello\nWorld");

    app.unmount();
  });

  test("render nested Box components with Text", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box flexDirection="column">
          <Text>Hello</Text>
          <Box>
            <Text>World</Text>
          </Box>
        </Box>
      )),
    );
    expect(output).toBe("Hello\nWorld");
  });

  test("render component that returns null", () => {
    const NullComponent: FunctionalComponent = () => null;
    NullComponent.displayName = "NullComponent";

    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box flexDirection="column">
          <Text>Hello</Text>
          <NullComponent />
          <Text>World</Text>
        </Box>
      )),
    );
    expect(output).toBe("Hello\nWorld");
  });

  test("render with aria-state.busy", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box aria-state={{ busy: true }}>
          <Text>Loading</Text>
        </Box>
      )),
    );
    expect(output).toBe("(busy) Loading");
  });

  test("render with aria-state.disabled", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box aria-role="button" aria-state={{ disabled: true }}>
          <Text>Submit</Text>
        </Box>
      )),
    );
    expect(output).toBe("button: (disabled) Submit");
  });

  test("render with aria-state.expanded", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box aria-role="combobox" aria-state={{ expanded: true }}>
          <Text>Select</Text>
        </Box>
      )),
    );
    expect(output).toBe("combobox: (expanded) Select");
  });

  test("render multi-line text with roles", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box flexDirection="column" aria-role="list">
          <Box aria-role="listitem">
            <Text>Item 1</Text>
          </Box>
          <Box aria-role="listitem">
            <Text>Item 2</Text>
          </Box>
        </Box>
      )),
    );
    expect(output).toBe("list: listitem: Item 1\nlistitem: Item 2");
  });

  test("render text for screen readers with aria-hidden", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box aria-hidden>
          <Text>Not visible to screen readers</Text>
        </Box>
      )),
    );
    expect(output).toBe("");
  });

  test("render select input for screen readers", () => {
    const items = ["Red", "Green", "Blue"];
    const selectedIndex = 1;

    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box aria-role="list" flexDirection="column">
          <Text>Select a color:</Text>
          {items.map((item, index) => (
            <Box
              key={item}
              aria-label={`${index + 1}. ${item}`}
              aria-role="listitem"
              aria-state={{ selected: index === selectedIndex }}
            >
              <Text>{item}</Text>
            </Box>
          ))}
        </Box>
      )),
    );
    expect(output).toBe(
      "list: Select a color:\nlistitem: 1. Red\nlistitem: (selected) 2. Green\nlistitem: 3. Blue",
    );
  });

  test("render with aria-state.multiline", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box aria-role="textbox" aria-state={{ multiline: true }}>
          <Text>Hello</Text>
        </Box>
      )),
    );
    expect(output).toBe("textbox: (multiline) Hello");
  });

  test("render with aria-state.readonly", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box aria-role="textbox" aria-state={{ readonly: true }}>
          <Text>Hello</Text>
        </Box>
      )),
    );
    expect(output).toBe("textbox: (readonly) Hello");
  });

  test("render with aria-state.required", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box aria-role="textbox" aria-state={{ required: true }}>
          <Text>Name</Text>
        </Box>
      )),
    );
    expect(output).toBe("textbox: (required) Name");
  });

  test("render nested multi-line text", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box flexDirection="row">
          <Box flexDirection="column">
            <Text>Line 1</Text>
            <Text>Line 2</Text>
          </Box>
        </Box>
      )),
    );
    expect(output).toBe("Line 1\nLine 2");
  });

  test("render listbox with multiselectable options", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box flexDirection="column" aria-role="listbox" aria-state={{ multiselectable: true }}>
          <Box aria-role="option" aria-state={{ selected: true }}>
            <Text>Option 1</Text>
          </Box>
          <Box aria-role="option" aria-state={{ selected: false }}>
            <Text>Option 2</Text>
          </Box>
          <Box aria-role="option" aria-state={{ selected: true }}>
            <Text>Option 3</Text>
          </Box>
        </Box>
      )),
    );
    expect(output).toBe(
      "listbox: (multiselectable) option: (selected) Option 1\noption: Option 2\noption: (selected) Option 3",
    );
  });

  // G17 follow-up, finding 2 (Ink parity): SR renderToString must NOT drop
  // <Static> content. The SR static flush linearizes static blocks, but the SR
  // return branch previously returned only the dynamic output (rendered with
  // skipStaticElements:true), discarding the captured static output. Ink's SR
  // renderer returns staticOutput when node.staticNode exists (renderer.ts:24-33).
  test("renderToString in SR mode includes keyed <Static> blocks", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => {
        const items = ["First", "Second"];
        return () => (
          <Box flexDirection="column">
            {items.map((item) => (
              <Static key={item}>
                <Box borderStyle="round">
                  <Text>{item}</Text>
                </Box>
              </Static>
            ))}
            <Text>Live</Text>
          </Box>
        );
      }),
    );
    // Static content must be present (it was previously discarded).
    expect(output).toContain("First");
    expect(output).toContain("Second");
    // Dynamic content still present.
    expect(output).toContain("Live");
    // SR mode linearizes — no border glyphs from the bordered static blocks.
    for (const glyph of ["╭", "╮", "╰", "╯", "─", "│"]) {
      expect(output).not.toContain(glyph);
    }
  });

  // G17 follow-up, finding 1 (Ink parity): SR static linearization must honor
  // the ordinary Box layout composed inside one Static block.
  test("renderToString in SR mode honors a row Box inside Static", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Static>
          <Box flexDirection="row">
            <Text>Alpha</Text>
            <Text>Beta</Text>
          </Box>
        </Static>
      )),
    );
    // Row direction uses a space separator (screen-reader.ts:76), not "\n".
    expect(output).toBe("Alpha Beta");
  });

  test("renderToString in SR mode honors a row-reverse Box inside Static", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Static>
          <Box flexDirection="row-reverse">
            <Text>Alpha</Text>
            <Text>Beta</Text>
          </Box>
        </Static>
      )),
    );
    // row-reverse reverses child order (screen-reader.ts:79-82) + space separator.
    expect(output).toBe("Beta Alpha");
  });

  test("renderToString in SR mode honors a column-reverse Box inside Static", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Static>
          <Box flexDirection="column-reverse">
            <Text>Alpha</Text>
            <Text>Beta</Text>
          </Box>
        </Static>
      )),
    );
    // column-reverse reverses order, newline separator (default non-row).
    expect(output).toBe("Beta\nAlpha");
  });

  test("renderToString in SR mode uses Static's default column layout", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Static>
          <Text>Alpha</Text>
          <Text>Beta</Text>
        </Static>
      )),
    );
    // Default column: forward order, newline separator (unchanged behavior).
    expect(output).toBe("Alpha\nBeta");
  });
});

// Ink-parity LOCKS for the component (renderToString) SR path. Each mirrors an
// assertion in Ink's test/screen-reader.tsx (v7.0.4 @40b3a75) that the existing
// suite above did not already cover.
describe("screen reader: Ink test/screen-reader.tsx parity (component path)", () => {
  // Ink screen-reader.tsx:78-84 — aria-label-only <Text> (no children) emits the
  // label. Component path: text.ts substitutes ariaLabel for an absent default slot.
  test("aria-label-only Text (no children) emits the label", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => <Text aria-label="Screen-reader only" />),
    );
    expect(output).toBe("Screen-reader only");
  });

  // Ink screen-reader.tsx:86-92 — aria-label-only <Box> (no children) emits the
  // label. Component path: box.ts builds a label text node when SR + ariaLabel and
  // there is no default slot.
  test("aria-label-only Box (no children) emits the label", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => <Box aria-label="Screen-reader only" />),
    );
    expect(output).toBe("Screen-reader only");
  });

  // Ink screen-reader.tsx:110-122 — a display:none subtree is skipped in SR
  // output via the LIVE component path (renderToString runs a real yoga layout, so
  // the DISPLAY_NONE check in screen-reader.ts is exercised against live yoga, not
  // a hand-built fixture).
  test("display:none subtree is skipped (live component path)", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box>
          <Box display="none">
            <Text>Hidden</Text>
          </Box>
          <Text>Visible</Text>
        </Box>
      )),
    );
    expect(output).toBe("Visible");
  });

  // Ink screen-reader.tsx:320-334 ("render nested row") — a COLUMN parent whose
  // child is a ROW joins the grandchildren with a SPACE (the row separator),
  // distinct from the column case at :304-318 which joins with "\n".
  test("column parent containing a row child joins grandchildren with a space", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box flexDirection="column">
          <Box flexDirection="row">
            <Text>Line 1</Text>
            <Text>Line 2</Text>
          </Box>
        </Box>
      )),
    );
    expect(output).toBe("Line 1 Line 2");
  });

  // Ink screen-reader.tsx:186-196 — single box, checkbox role + checked state.
  test("single box checkbox + checked", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box aria-role="checkbox" aria-state={{ checked: true }}>
          <Text>Accept terms</Text>
        </Box>
      )),
    );
    expect(output).toBe("checkbox: (checked) Accept terms");
  });

  // Ink screen-reader.tsx:277-287 — single box, option role + selected state.
  test("single box option + selected", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box aria-role="option" aria-state={{ selected: true }}>
          <Text>Blue</Text>
        </Box>
      )),
    );
    expect(output).toBe("option: (selected) Blue");
  });

  // Ink screen-reader.tsx:238-248 — single box, listbox role + multiselectable.
  test("single box listbox + multiselectable", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box aria-role="listbox" aria-state={{ multiselectable: true }}>
          <Text>Options</Text>
        </Box>
      )),
    );
    expect(output).toBe("listbox: (multiselectable) Options");
  });

  // Multiple truthy aria-state keys join with ", " (screen-reader.ts:216). Insertion
  // order is preserved (Object.keys), so checked precedes disabled. This pins the
  // multi-state join format, which Ink derives the same way from its aria-state object.
  test("multiple truthy aria-state keys join with comma-space", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box aria-role="checkbox" aria-state={{ checked: true, disabled: true }}>
          <Text>X</Text>
        </Box>
      )),
    );
    expect(output).toBe("checkbox: (checked, disabled) X");
  });

  // Ink screen-reader.tsx:32-43 — role-only box (no state) via the component path
  // (the existing suite only covered this through the hand-built unit fixture).
  test("role-only box (button) via component path", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Box aria-role="button">
          <Text>Click me</Text>
        </Box>
      )),
    );
    expect(output).toBe("button: Click me");
  });

  // Ink Transform.tsx:37-39 — in SR mode, accessibilityLabel REPLACES the children,
  // and because the label is substituted as the transform node's content, the
  // transform's OWN fn is NOT applied at the top level (screen-reader.ts leaves the
  // top-level transform fn to its caller). So a lowercase child + an uppercasing
  // transform still yields the bare label, NOT "X" uppercased nor "LOWERCASE".
  test("Transform accessibilityLabel replaces children; transform not applied at top level", () => {
    const output = renderToStringWithScreenReader(
      defineComponent(() => () => (
        <Transform transform={(s: string) => s.toUpperCase()} accessibilityLabel="X">
          <Text>lowercase</Text>
        </Transform>
      )),
    );
    expect(output).toBe("X");
  });
});
