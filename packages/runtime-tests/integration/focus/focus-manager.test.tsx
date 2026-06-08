import { defineComponent, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useFocus, useFocusManager } from "@vue-tui/runtime";

test("useFocusManager().activeId tracks the currently focused component", async () => {
  let activeId!: ReturnType<typeof useFocusManager>["activeId"];

  const Item = defineComponent({
    props: { id: { type: String, required: true } },
    setup(props) {
      const { isFocused } = useFocus({ id: props.id, autoFocus: props.id === "a" });
      return () => (
        <Text>
          {isFocused.value ? "▶ " : "  "}
          {props.id}
        </Text>
      );
    },
  });

  const App = defineComponent(() => {
    const manager = useFocusManager();
    activeId = manager.activeId;
    return () => (
      <Box flexDirection="column">
        <Item id="a" />
        <Item id="b" />
      </Box>
    );
  });

  const { stdin } = await render(App);

  expect(activeId.value).toBe("a");

  await stdin.write("\t");
  expect(activeId.value).toBe("b");

  await stdin.write("\t");
  expect(activeId.value).toBe("a");
});

test("useFocus autoFocus prop update focuses when no item is focused", async () => {
  let activeId!: ReturnType<typeof useFocusManager>["activeId"];
  const autoFocus = shallowRef(false);

  const Item = defineComponent({
    props: {
      id: { type: String, required: true },
      autoFocus: Boolean,
    },
    setup(props) {
      const { isFocused } = useFocus(props);
      return () => <Text>{isFocused.value ? "focused" : "unfocused"}</Text>;
    },
  });

  const App = defineComponent(() => {
    activeId = useFocusManager().activeId;
    return () => <Item id="item" autoFocus={autoFocus.value} />;
  });

  const { lastFrame, waitUntilRenderFlush } = await render(App);

  expect(activeId.value).toBeNull();
  expect(lastFrame()).toContain("unfocused");

  autoFocus.value = true;
  await waitUntilRenderFlush();

  expect(activeId.value).toBe("item");
  expect(lastFrame()).toContain("focused");
});

// Locks the vue API-surface sentinel: `activeId` is a ShallowRef whose EMPTY
// value is `null` (Ink's equivalent is `undefined`). See ink-divergences.md
// ("`useFocusManager().activeId` empty value is `null`, not `undefined`").
test("useFocusManager().activeId is null when nothing is focused", async () => {
  let activeId!: ReturnType<typeof useFocusManager>["activeId"];

  const App = defineComponent(() => {
    const manager = useFocusManager();
    activeId = manager.activeId;
    // No <useFocus> children → no focusables → nothing active.
    return () => (
      <Box>
        <Text>no focusables</Text>
      </Box>
    );
  });

  await render(App);

  expect(activeId.value).toBeNull();
});

// LOCK: Esc resets activeId. Mirrors Ink focus.tsx:621-646 ("activeId resets to
// undefined on Esc"), with vue's sentinel `null` where Ink uses `undefined`.
test("useFocusManager().activeId resets to null on Esc", async () => {
  let activeId!: ReturnType<typeof useFocusManager>["activeId"];

  const Item = defineComponent({
    props: { id: { type: String, required: true } },
    setup(props) {
      const { isFocused } = useFocus({ id: props.id, autoFocus: props.id === "first" });
      return () => (
        <Text>
          {isFocused.value ? "▶ " : "  "}
          {props.id}
        </Text>
      );
    },
  });

  const App = defineComponent(() => {
    const manager = useFocusManager();
    activeId = manager.activeId;
    return () => (
      <Box flexDirection="column">
        <Item id="first" />
      </Box>
    );
  });

  const { stdin } = await render(App);

  expect(activeId.value).toBe("first");

  // Bare Esc (\x1b) — the harness write() waits out the pending-escape flush.
  await stdin.write("\x1b");
  expect(activeId.value).toBeNull();
});

// LOCK: programmatic focus(id) updates activeId. Mirrors Ink focus.tsx:670-706
// ("activeId updates when focus is changed programmatically").
test("useFocusManager().activeId updates on programmatic focus(id)", async () => {
  let activeId!: ReturnType<typeof useFocusManager>["activeId"];
  let focus!: ReturnType<typeof useFocusManager>["focus"];

  const Item = defineComponent({
    props: { id: { type: String, required: true } },
    setup(props) {
      const { isFocused } = useFocus({ id: props.id });
      return () => (
        <Text>
          {isFocused.value ? "▶ " : "  "}
          {props.id}
        </Text>
      );
    },
  });

  const App = defineComponent(() => {
    const manager = useFocusManager();
    activeId = manager.activeId;
    focus = manager.focus;
    return () => (
      <Box flexDirection="column">
        <Item id="first" />
        <Item id="second" />
      </Box>
    );
  });

  await render(App);

  // No autoFocus → nothing active initially.
  expect(activeId.value).toBeNull();

  focus("second");
  expect(activeId.value).toBe("second");

  focus("first");
  expect(activeId.value).toBe("first");
});

test("duplicate explicit focus ids participate in focus order like Ink", async () => {
  let activeId!: ReturnType<typeof useFocusManager>["activeId"];

  const Item = defineComponent({
    props: {
      id: { type: String, required: true },
      label: { type: String, required: true },
      autoFocus: Boolean,
    },
    setup(props) {
      const { isFocused } = useFocus({
        id: props.id,
        autoFocus: props.autoFocus,
      });
      return () => (
        <Text>
          {isFocused.value ? "▶ " : "  "}
          {props.label}
        </Text>
      );
    },
  });

  const App = defineComponent(() => {
    activeId = useFocusManager().activeId;
    return () => (
      <Box flexDirection="column">
        <Item id="dup" label="first duplicate" autoFocus />
        <Item id="dup" label="second duplicate" />
        <Item id="next" label="next" />
      </Box>
    );
  });

  const { lastFrame, stdin } = await render(App);

  expect(activeId.value).toBe("dup");
  expect(lastFrame()).toContain("▶ first duplicate");
  expect(lastFrame()).toContain("▶ second duplicate");

  await stdin.write("\t");

  // Ink keeps duplicate explicit ids as separate registry entries. Moving from
  // the first duplicate to the second duplicate leaves the public activeId
  // unchanged, so both components with that id still report focused.
  expect(activeId.value).toBe("dup");
  expect(lastFrame()).toContain("▶ first duplicate");
  expect(lastFrame()).toContain("▶ second duplicate");
  expect(lastFrame()).not.toContain("▶ next");

  await stdin.write("\t");

  // The duplicate ids are two registry entries, so the next Tab advances past
  // the second duplicate to the following distinct focusable.
  expect(activeId.value).toBe("next");
  expect(lastFrame()).not.toContain("▶ first duplicate");
  expect(lastFrame()).not.toContain("▶ second duplicate");
  expect(lastFrame()).toContain("▶ next");

  await stdin.write("\x1b[Z");

  expect(activeId.value).toBe("dup");
  expect(lastFrame()).toContain("▶ first duplicate");
  expect(lastFrame()).toContain("▶ second duplicate");
  expect(lastFrame()).not.toContain("▶ next");
});

// LOCK: unmounting the focused item resets activeId. Mirrors Ink focus.tsx:708-742
// ("activeId resets to undefined when focused component unmounts"). Vue uses a
// v-if (`show`) toggle in place of Ink's rerender-without-the-child.
test("useFocusManager().activeId resets to null when the focused item unmounts", async () => {
  let activeId!: ReturnType<typeof useFocusManager>["activeId"];
  const showFirst = shallowRef(true);

  const Item = defineComponent({
    props: { id: { type: String, required: true }, autoFocus: Boolean },
    setup(props) {
      const { isFocused } = useFocus({ id: props.id, autoFocus: props.autoFocus });
      return () => (
        <Text>
          {isFocused.value ? "▶ " : "  "}
          {props.id}
        </Text>
      );
    },
  });

  const App = defineComponent(() => {
    const manager = useFocusManager();
    activeId = manager.activeId;
    return () => (
      <Box flexDirection="column">
        {showFirst.value ? <Item id="first" autoFocus /> : null}
        <Item id="second" />
      </Box>
    );
  });

  const { waitUntilRenderFlush } = await render(App);

  expect(activeId.value).toBe("first");

  // Unmount the focused item — remove() clears activeId when it was active.
  showFirst.value = false;
  await waitUntilRenderFlush();

  expect(activeId.value).toBeNull();
});

// LOCK: initial activeId is null and Tab from no-focus lands on the first
// focusable, then advances. Mirrors Ink focus.tsx:591-619 ("activeId from
// useFocusManager reflects currently focused component"); vue's empty sentinel
// is `null` where Ink starts at `undefined`.
test("initial activeId is null; Tab from no focus lands on the first focusable then advances", async () => {
  let activeId!: ReturnType<typeof useFocusManager>["activeId"];

  const Item = defineComponent({
    props: { id: { type: String, required: true } },
    setup(props) {
      const { isFocused } = useFocus({ id: props.id });
      return () => (
        <Text>
          {isFocused.value ? "▶ " : "  "}
          {props.id}
        </Text>
      );
    },
  });

  const App = defineComponent(() => {
    const manager = useFocusManager();
    activeId = manager.activeId;
    return () => (
      <Box flexDirection="column">
        <Item id="a" />
        <Item id="b" />
      </Box>
    );
  });

  const { stdin } = await render(App);

  // No autoFocus → nothing active.
  expect(activeId.value).toBeNull();

  await stdin.write("\t");
  expect(activeId.value).toBe("a");

  await stdin.write("\t");
  expect(activeId.value).toBe("b");
});

// LOCK: Esc must NOT clear focus while focus management is disabled. Mirrors Ink
// App.tsx:250-252 — the Esc reset is gated on `isFocusEnabled`. After
// disableFocus(), the bare Esc handler is a no-op and the focused item stays
// focused.
test("Esc does not clear focus while focus management is disabled", async () => {
  let activeId!: ReturnType<typeof useFocusManager>["activeId"];
  let disableFocus!: ReturnType<typeof useFocusManager>["disableFocus"];

  const Item = defineComponent({
    props: { id: { type: String, required: true } },
    setup(props) {
      const { isFocused } = useFocus({ id: props.id, autoFocus: props.id === "first" });
      return () => (
        <Text>
          {isFocused.value ? "▶ " : "  "}
          {props.id}
        </Text>
      );
    },
  });

  const App = defineComponent(() => {
    const manager = useFocusManager();
    activeId = manager.activeId;
    disableFocus = manager.disableFocus;
    return () => (
      <Box flexDirection="column">
        <Item id="first" />
      </Box>
    );
  });

  const { stdin } = await render(App);

  expect(activeId.value).toBe("first");

  disableFocus();
  await stdin.write("\x1b");

  // Focus is disabled → Esc is a no-op → focus is STILL shown.
  expect(activeId.value).toBe("first");
});

// LOCK: focus(id) targets a DEACTIVATED (isActive=false) item. Mirrors Ink
// App.tsx:519-531 — `focus` only checks membership (`hasFocusableId`), NOT
// isActive, so a programmatically-focused item that is currently inactive still
// becomes the active focus. (Tab navigation, by contrast, skips inactive items.)
test("focus(id) targets a deactivated (isActive=false) item", async () => {
  let activeId!: ReturnType<typeof useFocusManager>["activeId"];
  let focus!: ReturnType<typeof useFocusManager>["focus"];

  const Item = defineComponent({
    props: { id: { type: String, required: true }, active: { type: Boolean, default: true } },
    setup(props) {
      const { isFocused } = useFocus({ id: props.id, isActive: () => props.active });
      return () => (
        <Text>
          {isFocused.value ? "▶ " : "  "}
          {props.id}
        </Text>
      );
    },
  });

  const App = defineComponent(() => {
    const manager = useFocusManager();
    activeId = manager.activeId;
    focus = manager.focus;
    return () => (
      <Box flexDirection="column">
        <Item id="first" />
        <Item id="middle" active={false} />
        <Item id="last" />
      </Box>
    );
  });

  await render(App);

  // Nothing active initially.
  expect(activeId.value).toBeNull();

  // focus() ignores isActive — the deactivated middle item still becomes active.
  focus("middle");
  expect(activeId.value).toBe("middle");
});
