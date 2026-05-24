import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useFocus } from "@vue-tui/runtime";

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
