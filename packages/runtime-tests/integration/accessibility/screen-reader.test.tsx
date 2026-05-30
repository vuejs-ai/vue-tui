import { defineComponent, nextTick, shallowRef, type FunctionalComponent } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { renderToString, Box, Text, Transform, Static, createApp } from "@vue-tui/runtime";
import { render } from "@vue-tui/testing";
import {
  createRoot,
  createBox,
  createText,
  createTextLeaf,
  attachYoga,
  renderScreenReaderOutput,
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
    stdout: process.stdout,
    stderr: process.stderr,
    stdin: process.stdin,
    debug: false,
    interactive: false,
    isScreenReaderEnabled: false,
    isRawModeSupported: false,
    setRawMode: () => {},
    writeToStdout: () => {},
    writeToStderr: () => {},
    cursorPosition: undefined,
    setCursorPosition: () => {},
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
    const output = renderToString(
      defineComponent(() => () => (
        <Text>
          a<Transform transform={(s: string, i: number) => `${s}[${i}]`}>b</Transform>
        </Text>
      )),
      { isScreenReaderEnabled: true },
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
    const output = renderToString(
      defineComponent(() => () => (
        <Box>
          <Transform transform={(s: string) => `[${s}]`}>
            <Text>a</Text>
            <Text>b</Text>
          </Transform>
        </Box>
      )),
      { isScreenReaderEnabled: true },
    );
    // Children are concatenated ("ab"), NOT newline-joined ("a\nb").
    expect(output).toBe("ab");
  });

  // G52: Vue materializes a null/v-if/false render as a COMMENT host node that
  // occupies a positional slot. React never produces a childNode for such
  // children (Ink squash-text-nodes.ts:13 never advances index past them), so
  // the SR squash path must skip comment nodes when indexing the transform —
  // staying in lockstep with paint and measurement.
  test("G52: null sibling does not shift nested <Transform> index in screen-reader mode", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Text>
          a{null}
          <Transform transform={(s: string, i: number) => `${s}[${i}]`}>b</Transform>
        </Text>
      )),
      { isScreenReaderEnabled: true },
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
    const output = renderToString(
      defineComponent(() => () => (
        <Box>
          <Text aria-label="Screen-reader only">visible text</Text>
        </Box>
      )),
      { isScreenReaderEnabled: true },
    );
    expect(output).toBe("Screen-reader only");
  });

  test("render aria-label on Box in screen-reader mode replaces children", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Box aria-label="Screen-reader only">
          <Text>Not visible to screen readers</Text>
        </Box>
      )),
      { isScreenReaderEnabled: true },
    );
    expect(output).toBe("Screen-reader only");
  });

  test("omit ANSI styling in screen-reader output", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Box>
          <Text bold color="green" inverse underline>
            Styled content
          </Text>
        </Box>
      )),
      { isScreenReaderEnabled: true },
    );
    expect(output).toBe("Styled content");
  });

  test("render multiple Text components", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Box flexDirection="column">
          <Text>Hello</Text>
          <Text>World</Text>
        </Box>
      )),
      { isScreenReaderEnabled: true },
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
    const output = renderToString(
      defineComponent(() => () => (
        <Box>
          <Text>Hello</Text>
          <Text>World</Text>
        </Box>
      )),
      { isScreenReaderEnabled: true },
    );
    expect(output).toBe("Hello World");
  });

  // G39 follow-up: pin the yoga-enum mapping + reverse-order branch that
  // resolveBoxFlexDirection / renderScreenReaderOutput now own. row-reverse must
  // join with a SPACE *and* reverse child order (Ink parity: reverse directions
  // flip the visual/announced order).
  test("render Box flexDirection=row-reverse joins with space and reverses children", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Box flexDirection="row-reverse">
          <Text>Hello</Text>
          <Text>World</Text>
        </Box>
      )),
      { isScreenReaderEnabled: true },
    );
    // row-reverse: space separator + reversed order → "World Hello".
    expect(output).toBe("World Hello");
  });

  // G39 follow-up: column-reverse must join with a NEWLINE (non-row separator)
  // *and* reverse child order.
  test("render Box flexDirection=column-reverse joins with newline and reverses children", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Box flexDirection="column-reverse">
          <Text>Hello</Text>
          <Text>World</Text>
        </Box>
      )),
      { isScreenReaderEnabled: true },
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
      exitOnCtrlC: false,
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
    const output = renderToString(
      defineComponent(() => () => (
        <Box flexDirection="column">
          <Text>Hello</Text>
          <Box>
            <Text>World</Text>
          </Box>
        </Box>
      )),
      { isScreenReaderEnabled: true },
    );
    expect(output).toBe("Hello\nWorld");
  });

  test("render component that returns null", () => {
    const NullComponent: FunctionalComponent = () => null;
    NullComponent.displayName = "NullComponent";

    const output = renderToString(
      defineComponent(() => () => (
        <Box flexDirection="column">
          <Text>Hello</Text>
          <NullComponent />
          <Text>World</Text>
        </Box>
      )),
      { isScreenReaderEnabled: true },
    );
    expect(output).toBe("Hello\nWorld");
  });

  test("render with aria-state.busy", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Box aria-state={{ busy: true }}>
          <Text>Loading</Text>
        </Box>
      )),
      { isScreenReaderEnabled: true },
    );
    expect(output).toBe("(busy) Loading");
  });

  test("render with aria-state.disabled", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Box aria-role="button" aria-state={{ disabled: true }}>
          <Text>Submit</Text>
        </Box>
      )),
      { isScreenReaderEnabled: true },
    );
    expect(output).toBe("button: (disabled) Submit");
  });

  test("render with aria-state.expanded", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Box aria-role="combobox" aria-state={{ expanded: true }}>
          <Text>Select</Text>
        </Box>
      )),
      { isScreenReaderEnabled: true },
    );
    expect(output).toBe("combobox: (expanded) Select");
  });

  test("render multi-line text with roles", () => {
    const output = renderToString(
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
      { isScreenReaderEnabled: true },
    );
    expect(output).toBe("list: listitem: Item 1\nlistitem: Item 2");
  });

  test("render text for screen readers with aria-hidden", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Box aria-hidden>
          <Text>Not visible to screen readers</Text>
        </Box>
      )),
      { isScreenReaderEnabled: true },
    );
    expect(output).toBe("");
  });

  test("render select input for screen readers", () => {
    const items = ["Red", "Green", "Blue"];
    const selectedIndex = 1;

    const output = renderToString(
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
      { isScreenReaderEnabled: true },
    );
    expect(output).toBe(
      "list: Select a color:\nlistitem: 1. Red\nlistitem: (selected) 2. Green\nlistitem: 3. Blue",
    );
  });

  test("render with aria-state.multiline", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Box aria-role="textbox" aria-state={{ multiline: true }}>
          <Text>Hello</Text>
        </Box>
      )),
      { isScreenReaderEnabled: true },
    );
    expect(output).toBe("textbox: (multiline) Hello");
  });

  test("render with aria-state.readonly", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Box aria-role="textbox" aria-state={{ readonly: true }}>
          <Text>Hello</Text>
        </Box>
      )),
      { isScreenReaderEnabled: true },
    );
    expect(output).toBe("textbox: (readonly) Hello");
  });

  test("render with aria-state.required", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Box aria-role="textbox" aria-state={{ required: true }}>
          <Text>Name</Text>
        </Box>
      )),
      { isScreenReaderEnabled: true },
    );
    expect(output).toBe("textbox: (required) Name");
  });

  test("render nested multi-line text", () => {
    const output = renderToString(
      defineComponent(() => () => (
        <Box flexDirection="row">
          <Box flexDirection="column">
            <Text>Line 1</Text>
            <Text>Line 2</Text>
          </Box>
        </Box>
      )),
      { isScreenReaderEnabled: true },
    );
    expect(output).toBe("Line 1\nLine 2");
  });

  test("render listbox with multiselectable options", () => {
    const output = renderToString(
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
      { isScreenReaderEnabled: true },
    );
    expect(output).toBe(
      "listbox: (multiselectable) option: (selected) Option 1\noption: Option 2\noption: (selected) Option 3",
    );
  });

  // G17 follow-up, finding 2 (Ink parity): SR renderToString must NOT drop
  // <Static> content. The SR static flush linearizes static items, but the SR
  // return branch previously returned only the dynamic output (rendered with
  // skipStaticElements:true), discarding the captured static output. Ink's SR
  // renderer returns staticOutput when node.staticNode exists (renderer.ts:24-33).
  test("renderToString in SR mode includes <Static> item text (does not drop it)", () => {
    const output = renderToString(
      defineComponent(() => {
        const items = ["First", "Second"];
        return () => (
          <Box flexDirection="column">
            <Static items={items}>
              {{
                default: ({ item }: { item: string }) => (
                  <Box key={item} borderStyle="round">
                    <Text>{item}</Text>
                  </Box>
                ),
              }}
            </Static>
            <Text>Live</Text>
          </Box>
        );
      }),
      { isScreenReaderEnabled: true },
    );
    // Static content must be present (it was previously discarded).
    expect(output).toContain("First");
    expect(output).toContain("Second");
    // Dynamic content still present.
    expect(output).toContain("Live");
    // SR mode linearizes — no border glyphs from the bordered static items.
    for (const glyph of ["╭", "╮", "╰", "╯", "─", "│"]) {
      expect(output).not.toContain(glyph);
    }
  });

  // G17 follow-up, finding 1 (Ink parity): the SR static linearization must
  // honor the <Static>'s resolved flexDirection for separator + child order,
  // matching how screen-reader.ts linearizes a container (row/row-reverse → " ",
  // *-reverse reverses children). The default column case still joins with "\n".
  test("renderToString in SR mode honors Static flexDirection=row (space separator)", () => {
    const output = renderToString(
      defineComponent(() => {
        const items = ["Alpha", "Beta"];
        return () => (
          <Static items={items} style={{ flexDirection: "row" }}>
            {{
              default: ({ item }: { item: string }) => <Text key={item}>{item}</Text>,
            }}
          </Static>
        );
      }),
      { isScreenReaderEnabled: true },
    );
    // Row direction uses a space separator (screen-reader.ts:76), not "\n".
    expect(output).toBe("Alpha Beta");
  });

  test("renderToString in SR mode honors Static flexDirection=row-reverse (reversed, space)", () => {
    const output = renderToString(
      defineComponent(() => {
        const items = ["Alpha", "Beta"];
        return () => (
          <Static items={items} style={{ flexDirection: "row-reverse" }}>
            {{
              default: ({ item }: { item: string }) => <Text key={item}>{item}</Text>,
            }}
          </Static>
        );
      }),
      { isScreenReaderEnabled: true },
    );
    // row-reverse reverses child order (screen-reader.ts:79-82) + space separator.
    expect(output).toBe("Beta Alpha");
  });

  test("renderToString in SR mode honors Static flexDirection=column-reverse (reversed, newline)", () => {
    const output = renderToString(
      defineComponent(() => {
        const items = ["Alpha", "Beta"];
        return () => (
          <Static items={items} style={{ flexDirection: "column-reverse" }}>
            {{
              default: ({ item }: { item: string }) => <Text key={item}>{item}</Text>,
            }}
          </Static>
        );
      }),
      { isScreenReaderEnabled: true },
    );
    // column-reverse reverses order, newline separator (default non-row).
    expect(output).toBe("Beta\nAlpha");
  });

  test("renderToString in SR mode default Static (column) joins with newline, forward order", () => {
    const output = renderToString(
      defineComponent(() => {
        const items = ["Alpha", "Beta"];
        return () => (
          <Static items={items}>
            {{
              default: ({ item }: { item: string }) => <Text key={item}>{item}</Text>,
            }}
          </Static>
        );
      }),
      { isScreenReaderEnabled: true },
    );
    // Default column: forward order, newline separator (unchanged behavior).
    expect(output).toBe("Alpha\nBeta");
  });
});
