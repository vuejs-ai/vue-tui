import { defineComponent, shallowRef, type ComponentPublicInstance } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useFocus, useFocusManager, type UseFocusReturn } from "@vue-tui/runtime";

test("manager and target operations expose exact handles and truthful booleans", async () => {
  let first!: UseFocusReturn;
  let second!: UseFocusReturn;
  let manager!: ReturnType<typeof useFocusManager>;

  const App = defineComponent(() => {
    const firstHost = shallowRef<ComponentPublicInstance | null>(null);
    const secondHost = shallowRef<ComponentPublicInstance | null>(null);
    first = useFocus(firstHost);
    second = useFocus(secondHost);
    manager = useFocusManager();
    return () => (
      <Box flexDirection="column">
        <Box ref={firstHost}>
          <Text>first</Text>
        </Box>
        <Box ref={secondHost}>
          <Text>second</Text>
        </Box>
      </Box>
    );
  });

  const result = await render(App);
  try {
    expect(manager.focusedTarget.value).toBeNull();
    expect(manager.blur()).toBe(false);

    expect(manager.focusNext()).toBe(true);
    expect(manager.focusedTarget.value).toBe(first);
    expect(first.isFocused.value).toBe(true);
    expect(first.focus()).toBe(true);
    expect(second.blur()).toBe(false);

    expect(first.blur()).toBe(true);
    expect(manager.focusedTarget.value).toBeNull();
    expect(manager.focusPrevious()).toBe(true);
    expect(manager.focusedTarget.value).toBe(second);
    expect(manager.blur()).toBe(true);
    expect(manager.blur()).toBe(false);
  } finally {
    result.dispose();
  }
});

test("removing a focused target selects its rendered successor and leaves its handle inert", async () => {
  const showFirst = shallowRef(true);
  let first!: UseFocusReturn;
  let second!: UseFocusReturn;
  let manager!: ReturnType<typeof useFocusManager>;

  const First = defineComponent(() => {
    const host = shallowRef<ComponentPublicInstance | null>(null);
    first = useFocus(host, { autoFocus: true });
    return () => (
      <Box ref={host}>
        <Text>first</Text>
      </Box>
    );
  });
  const Second = defineComponent(() => {
    const host = shallowRef<ComponentPublicInstance | null>(null);
    second = useFocus(host);
    return () => (
      <Box ref={host}>
        <Text>second</Text>
      </Box>
    );
  });
  const App = defineComponent(() => {
    manager = useFocusManager();
    return () => (
      <Box flexDirection="column">
        {showFirst.value ? <First /> : null}
        <Second />
      </Box>
    );
  });

  const result = await render(App);
  try {
    expect(manager.focusedTarget.value).toBe(first);
    showFirst.value = false;
    await result.waitUntilRenderFlush();

    expect(manager.focusedTarget.value).toBe(second);
    expect(first.isFocused.value).toBe(false);
    expect(first.focus()).toBe(false);
    expect(first.blur()).toBe(false);
  } finally {
    result.dispose();
  }
});
