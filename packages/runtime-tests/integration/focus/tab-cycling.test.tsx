import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useFocus } from "@vue-tui/runtime";

// Shared helper: a focusable item that shows a checkmark when focused.
// `disabled` controls `isActive` — disabled items are skipped by Tab/Shift+Tab.
const FocusItem = defineComponent({
  props: {
    label: { type: String, required: true as const },
    autoFocus: { type: Boolean, default: false },
    disabled: { type: Boolean, default: false },
  },
  setup(props) {
    const { isFocused } = useFocus({
      autoFocus: props.autoFocus,
      isActive: () => !props.disabled,
    });
    return () => (
      <Text>
        {props.label}
        {isFocused.value ? " ✔" : ""}
      </Text>
    );
  },
});

test("Tab cycles focus between three menu items", async () => {
  const Item = defineComponent({
    props: { id: { type: String, required: true } },
    setup(props) {
      const { isFocused } = useFocus({ id: props.id, autoFocus: props.id === "one" });
      return () => (
        <Text>
          {isFocused.value ? "▶ " : "  "}
          {props.id}
        </Text>
      );
    },
  });

  const { lastFrame, stdin } = await render(() => (
    <Box flexDirection="column">
      <Item id="one" />
      <Item id="two" />
      <Item id="three" />
    </Box>
  ));

  expect(lastFrame()).toContain("▶ one");

  await stdin.write("\t");
  expect(lastFrame()).toContain("▶ two");

  await stdin.write("\t");
  expect(lastFrame()).toContain("▶ three");

  await stdin.write("\t");
  expect(lastFrame()).toContain("▶ one");
});

test("Escape clears all focus", async () => {
  const Item = defineComponent({
    props: { id: { type: String, required: true } },
    setup(props) {
      const { isFocused } = useFocus({ id: props.id, autoFocus: props.id === "one" });
      return () => (
        <Text>
          {isFocused.value ? "▶ " : "  "}
          {props.id}
        </Text>
      );
    },
  });

  const { lastFrame, stdin } = await render(() => (
    <Box flexDirection="column">
      <Item id="one" />
      <Item id="two" />
    </Box>
  ));

  expect(lastFrame()).toContain("▶ one");

  await stdin.write("\x1b");
  expect(lastFrame()).not.toContain("▶");
});

test("does not focus on register when auto focus is off", async () => {
  const { lastFrame } = await render(() => (
    <Box flexDirection="column">
      <FocusItem label="First" />
      <FocusItem label="Second" />
      <FocusItem label="Third" />
    </Box>
  ));

  const frame = lastFrame()!;
  expect(frame).toContain("First");
  expect(frame).not.toContain("✔");
});

test("focus the first component to register (autoFocus)", async () => {
  const { lastFrame } = await render(() => (
    <Box flexDirection="column">
      <FocusItem label="First" autoFocus />
      <FocusItem label="Second" autoFocus />
      <FocusItem label="Third" autoFocus />
    </Box>
  ));

  expect(lastFrame()).toMatch(/First ✔/);
  expect(lastFrame()).not.toMatch(/Second ✔/);
  expect(lastFrame()).not.toMatch(/Third ✔/);
});

test("switch focus to first component on Tab", async () => {
  const { lastFrame, stdin } = await render(() => (
    <Box flexDirection="column">
      <FocusItem label="First" />
      <FocusItem label="Second" />
      <FocusItem label="Third" />
    </Box>
  ));

  await stdin.write("\t");
  expect(lastFrame()).toMatch(/First ✔/);
});

test("switch focus to the next component on Tab", async () => {
  const { lastFrame, stdin } = await render(() => (
    <Box flexDirection="column">
      <FocusItem label="First" />
      <FocusItem label="Second" />
      <FocusItem label="Third" />
    </Box>
  ));

  await stdin.write("\t");
  await stdin.write("\t");
  expect(lastFrame()).toMatch(/Second ✔/);
});

test("switch focus to the first component if currently focused component is the last one on Tab", async () => {
  const { lastFrame, stdin } = await render(() => (
    <Box flexDirection="column">
      <FocusItem label="First" autoFocus />
      <FocusItem label="Second" autoFocus />
      <FocusItem label="Third" autoFocus />
    </Box>
  ));

  await stdin.write("\t");
  await stdin.write("\t");
  expect(lastFrame()).toMatch(/Third ✔/);

  await stdin.write("\t");
  expect(lastFrame()).toMatch(/First ✔/);
});

test("skip disabled component on Tab", async () => {
  const { lastFrame, stdin } = await render(() => (
    <Box flexDirection="column">
      <FocusItem label="First" autoFocus />
      <FocusItem label="Second" autoFocus disabled />
      <FocusItem label="Third" autoFocus />
    </Box>
  ));

  await stdin.write("\t");
  expect(lastFrame()).toMatch(/Third ✔/);
  expect(lastFrame()).not.toMatch(/Second ✔/);
});

test("switch focus to the previous component on Shift+Tab", async () => {
  const { lastFrame, stdin } = await render(() => (
    <Box flexDirection="column">
      <FocusItem label="First" autoFocus />
      <FocusItem label="Second" autoFocus />
      <FocusItem label="Third" autoFocus />
    </Box>
  ));

  await stdin.write("\t");
  expect(lastFrame()).toMatch(/Second ✔/);

  await stdin.write("\x1b[Z");
  expect(lastFrame()).toMatch(/First ✔/);
});

test("switch focus to the last component if currently focused component is the first one on Shift+Tab", async () => {
  const { lastFrame, stdin } = await render(() => (
    <Box flexDirection="column">
      <FocusItem label="First" autoFocus />
      <FocusItem label="Second" autoFocus />
      <FocusItem label="Third" autoFocus />
    </Box>
  ));

  await stdin.write("\x1b[Z");
  expect(lastFrame()).toMatch(/Third ✔/);
});

test("skip disabled component on Shift+Tab", async () => {
  const { lastFrame, stdin } = await render(() => (
    <Box flexDirection="column">
      <FocusItem label="First" autoFocus />
      <FocusItem label="Second" autoFocus disabled />
      <FocusItem label="Third" autoFocus />
    </Box>
  ));

  await stdin.write("\x1b[Z");
  await stdin.write("\x1b[Z");
  expect(lastFrame()).toMatch(/First ✔/);
  expect(lastFrame()).not.toMatch(/Second ✔/);
});

test("focuses first non-disabled component on autoFocus", async () => {
  const { lastFrame } = await render(() => (
    <Box flexDirection="column">
      <FocusItem label="First" autoFocus disabled />
      <FocusItem label="Second" autoFocus disabled />
      <FocusItem label="Third" autoFocus />
    </Box>
  ));

  expect(lastFrame()).toMatch(/Third ✔/);
});

test("skips disabled elements when wrapping around (Tab)", async () => {
  const { lastFrame, stdin } = await render(() => (
    <Box flexDirection="column">
      <FocusItem label="First" autoFocus disabled />
      <FocusItem label="Second" autoFocus />
      <FocusItem label="Third" autoFocus />
    </Box>
  ));

  // Second is auto-focused (first enabled), Tab → Third, Tab → wraps back to Second
  await stdin.write("\t");
  await stdin.write("\t");
  expect(lastFrame()).toMatch(/Second ✔/);
  expect(lastFrame()).not.toMatch(/First ✔/);
});

test("skips disabled elements when wrapping around from the front (Shift+Tab)", async () => {
  const { lastFrame, stdin } = await render(() => (
    <Box flexDirection="column">
      <FocusItem label="First" autoFocus />
      <FocusItem label="Second" autoFocus />
      <FocusItem label="Third" autoFocus disabled />
    </Box>
  ));

  // First is auto-focused, Shift+Tab wraps backward skipping disabled Third → lands on Second
  await stdin.write("\x1b[Z");
  expect(lastFrame()).toMatch(/Second ✔/);
  expect(lastFrame()).not.toMatch(/Third ✔/);
});
