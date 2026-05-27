import { defineComponent, type FunctionalComponent } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { renderToString, Box, Text, Transform } from "@vue-tui/runtime";
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
});
