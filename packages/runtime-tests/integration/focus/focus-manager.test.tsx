import { defineComponent } from "vue";
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
