import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useFocus, useFocusManager } from "@vue-tui/runtime";

test("focus(id) programmatically focuses another component", async () => {
  let focusFn!: (id: string) => void;

  const Item = defineComponent({
    props: { id: { type: String, required: true } },
    setup(props) {
      const { isFocused, focus } = useFocus({ id: props.id });
      if (props.id === "a") focusFn = focus;
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
      <Item id="a" />
      <Item id="b" />
      <Item id="c" />
    </Box>
  ));

  // Need to send a Tab to activate focus system (raw mode)
  await stdin.write("\t");

  focusFn("c");
  // Need to wait for Vue reactivity
  const { nextTick } = await import("vue");
  await nextTick();

  expect(lastFrame()).toContain("▶ c");
  expect(lastFrame()).not.toContain("▶ a");
});

test("isActive=false prevents component from receiving focus", async () => {
  const active = shallowRef(false);

  const Item = defineComponent({
    props: { id: { type: String, required: true } },
    setup(props) {
      const opts = props.id === "skip" ? { id: props.id, isActive: active } : { id: props.id };
      const { isFocused } = useFocus(opts);
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
      <Item id="first" />
      <Item id="skip" />
      <Item id="last" />
    </Box>
  ));

  // Tab to first
  await stdin.write("\t");
  expect(lastFrame()).toContain("▶ first");

  // Tab should skip "skip" and go to "last"
  await stdin.write("\t");
  expect(lastFrame()).toContain("▶ last");
  expect(lastFrame()).not.toContain("▶ skip");
});

test("autoFocus + isActive=false does not focus at mount", async () => {
  const active = shallowRef(false);

  const App = defineComponent(() => {
    const { isFocused } = useFocus({ id: "item", autoFocus: true, isActive: active });
    return () => <Text>{isFocused.value ? "focused" : "unfocused"}</Text>;
  });

  const { lastFrame } = await render(App);
  expect(lastFrame()).toContain("unfocused");

  active.value = true;
  await nextTick();
  // Becoming active doesn't auto-focus retroactively
  expect(lastFrame()).toContain("unfocused");
});

test("flipping isActive to false on focused item blurs it", async () => {
  const active = shallowRef(true);

  const App = defineComponent(() => {
    const { isFocused } = useFocus({ id: "item", autoFocus: true, isActive: active });
    return () => <Text>{isFocused.value ? "focused" : "unfocused"}</Text>;
  });

  const { lastFrame } = await render(App);
  expect(lastFrame()).toContain("focused");

  active.value = false;
  await nextTick();
  expect(lastFrame()).toContain("unfocused");
});

// ---------------------------------------------------------------------------
// Ink-ported: programmatic focus, unregister, focusNext/focusPrevious
// ---------------------------------------------------------------------------

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

test("reset focus when focused component unregisters", async () => {
  const showFirst = shallowRef(true);

  const App = defineComponent(() => {
    return () => (
      <Box flexDirection="column">
        {showFirst.value ? <FocusItem label="First" autoFocus /> : null}
        <FocusItem label="Second" autoFocus />
        <FocusItem label="Third" autoFocus />
      </Box>
    );
  });

  const { lastFrame } = await render(App);
  expect(lastFrame()).toMatch(/First ✔/);

  showFirst.value = false;
  await nextTick();

  expect(lastFrame()).not.toMatch(/✔/);
});

test("focus first component after focused component unregisters", async () => {
  const showFirst = shallowRef(true);

  const App = defineComponent(() => {
    return () => (
      <Box flexDirection="column">
        {showFirst.value ? <FocusItem label="First" autoFocus /> : null}
        <FocusItem label="Second" autoFocus />
        <FocusItem label="Third" autoFocus />
      </Box>
    );
  });

  const { lastFrame, stdin } = await render(App);
  expect(lastFrame()).toMatch(/First ✔/);

  showFirst.value = false;
  await nextTick();
  expect(lastFrame()).not.toMatch(/✔/);

  await stdin.write("\t");
  expect(lastFrame()).toMatch(/Second ✔/);
});

test("manually focus next component via focusNext()", async () => {
  let doFocusNext!: () => void;

  const App = defineComponent(() => {
    const manager = useFocusManager();
    doFocusNext = manager.focusNext;
    return () => (
      <Box flexDirection="column">
        <FocusItem label="First" autoFocus />
        <FocusItem label="Second" autoFocus />
        <FocusItem label="Third" autoFocus />
      </Box>
    );
  });

  const { lastFrame } = await render(App);
  expect(lastFrame()).toMatch(/First ✔/);

  doFocusNext();
  await nextTick();
  expect(lastFrame()).toMatch(/Second ✔/);
});

test("manually focus previous component via focusPrevious()", async () => {
  let doFocusPrevious!: () => void;

  const App = defineComponent(() => {
    const manager = useFocusManager();
    doFocusPrevious = manager.focusPrevious;
    return () => (
      <Box flexDirection="column">
        <FocusItem label="First" autoFocus />
        <FocusItem label="Second" autoFocus />
        <FocusItem label="Third" autoFocus />
      </Box>
    );
  });

  const { lastFrame } = await render(App);
  expect(lastFrame()).toMatch(/First ✔/);

  doFocusPrevious();
  await nextTick();
  expect(lastFrame()).toMatch(/Third ✔/);
});

// Ink parity (use-focus.ts: id via useMemo([customId]), add/remove effect keyed on
// [id]): changing the id prop must re-register the component under the new id.
// Focus is driven purely by focus(id) here (no Tab) so the assertions reflect
// id-addressed focus, not position-based Tab cycling.
test("useFocus reacts to id prop changes (Ink parity)", async () => {
  const dynId = shallowRef("alpha");
  let focusFn!: (id: string) => void;

  const Other = defineComponent(() => {
    const { isFocused } = useFocus({ id: "other", autoFocus: true });
    return () => <Text>O:{isFocused.value ? "1" : "0"}</Text>;
  });
  const Dynamic = defineComponent(() => {
    const { isFocused, focus } = useFocus({ id: () => dynId.value });
    focusFn = focus;
    return () => <Text>D:{isFocused.value ? "1" : "0"}</Text>;
  });

  const { lastFrame } = await render(() => (
    <Box flexDirection="column">
      <Other />
      <Dynamic />
    </Box>
  ));

  // Other autoFocuses at mount; Dynamic is not focused.
  expect(lastFrame()).toContain("O:1");
  expect(lastFrame()).toContain("D:0");

  // Focus Dynamic by its current id.
  focusFn("alpha");
  await nextTick();
  expect(lastFrame()).toContain("D:1");

  // Change the id → Dynamic must re-register under "beta".
  dynId.value = "beta";
  await nextTick();

  // Focusing by the NEW id focuses it.
  focusFn("beta");
  await nextTick();
  expect(lastFrame()).toContain("D:1");

  // Move focus away by a known id, then the OLD id must NOT refocus Dynamic.
  focusFn("other");
  await nextTick();
  expect(lastFrame()).toContain("D:0");
  focusFn("alpha");
  await nextTick();
  expect(lastFrame()).toContain("D:0");
});
