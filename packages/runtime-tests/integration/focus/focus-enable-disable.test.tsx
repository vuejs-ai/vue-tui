import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useFocus, useFocusManager } from "@vue-tui/runtime";

// Shared helper: a focusable item that shows a checkmark when focused.
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

// ---------------------------------------------------------------------------
// Ink-ported: toggle focus management (enableFocus / disableFocus)
// ---------------------------------------------------------------------------

test("toggle focus management — Tab does nothing while disabled", async () => {
  const focusDisabled = shallowRef(false);

  const App = defineComponent(() => {
    const { enableFocus, disableFocus } = useFocusManager();
    // React to the outer ref and call the manager API
    // We use a watcher-like approach: just call them directly during render
    // via a computed side-effect isn't idiomatic; use watchEffect instead.
    // Actually, call them from setup once and rely on reactivity via the ref.
    // The cleanest way in vue-tui: wire it up with a watch.
    return () => {
      // Call in render so it fires on every render triggered by focusDisabled
      if (focusDisabled.value) {
        disableFocus();
      } else {
        enableFocus();
      }
      return (
        <Box flexDirection="column">
          <FocusItem label="First" autoFocus />
          <FocusItem label="Second" autoFocus />
          <FocusItem label="Third" autoFocus />
        </Box>
      );
    };
  });

  const { lastFrame, stdin } = await render(App);
  expect(lastFrame()).toMatch(/First ✔/);

  // Disable focus management
  focusDisabled.value = true;
  await nextTick();
  // Tab should not move focus when focus management is disabled
  await stdin.write("\t");
  expect(lastFrame()).toMatch(/First ✔/);

  // Re-enable focus management
  focusDisabled.value = false;
  await nextTick();
  // Now Tab should move focus
  await stdin.write("\t");
  expect(lastFrame()).toMatch(/Second ✔/);
});

test("does not crash when focusing next on unmounted children", async () => {
  const unmountChildren = shallowRef(false);
  let doFocusNext!: () => void;

  const App = defineComponent(() => {
    const manager = useFocusManager();
    doFocusNext = manager.focusNext;
    return () => {
      if (unmountChildren.value) return null;
      return (
        <Box flexDirection="column">
          <FocusItem label="First" autoFocus />
          <FocusItem label="Second" autoFocus />
          <FocusItem label="Third" autoFocus />
        </Box>
      );
    };
  });

  const { lastFrame } = await render(App);
  expect(lastFrame()).toMatch(/First ✔/);

  unmountChildren.value = true;
  await nextTick();

  // Should not throw
  expect(() => doFocusNext()).not.toThrow();
  await nextTick();

  // Nothing rendered
  expect(lastFrame()?.trim() ?? "").toBe("");
});

test("does not crash when focusing previous on unmounted children", async () => {
  const unmountChildren = shallowRef(false);
  let doFocusPrevious!: () => void;

  const App = defineComponent(() => {
    const manager = useFocusManager();
    doFocusPrevious = manager.focusPrevious;
    return () => {
      if (unmountChildren.value) return null;
      return (
        <Box flexDirection="column">
          <FocusItem label="First" autoFocus />
          <FocusItem label="Second" autoFocus />
          <FocusItem label="Third" autoFocus />
        </Box>
      );
    };
  });

  const { lastFrame } = await render(App);
  expect(lastFrame()).toMatch(/First ✔/);

  unmountChildren.value = true;
  await nextTick();

  // Should not throw
  expect(() => doFocusPrevious()).not.toThrow();
  await nextTick();

  // Nothing rendered
  expect(lastFrame()?.trim() ?? "").toBe("");
});

// Concurrent-mode tests from Ink are React-specific and do not apply to vue-tui.
test.todo("focus component renders in concurrent mode — React-specific, N/A in vue-tui");
test.todo(
  "focus component with autoFocus renders in concurrent mode — React-specific, N/A in vue-tui",
);
