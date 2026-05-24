import { defineComponent, nextTick, ref } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useFocus } from "@vue-tui/runtime";

test("swapping focusable components never disables raw mode", async () => {
  const showA = ref(true);

  const Item = defineComponent(() => {
    useFocus();
    return () => <Text>x</Text>;
  });

  const Root = defineComponent(() => {
    return () => (showA.value ? <Item key="a" /> : <Item key="b" />);
  });

  const { terminal, unmount } = await render(Root);
  expect(terminal.rawMode.current).toBe(true);
  const historyBefore = terminal.rawMode.history.length;

  showA.value = false;
  await nextTick();

  expect(terminal.rawMode.current).toBe(true);
  const swapHistory = terminal.rawMode.history.slice(historyBefore);
  expect(swapHistory).not.toContain(false);

  unmount();
});
