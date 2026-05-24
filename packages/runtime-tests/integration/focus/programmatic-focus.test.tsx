import { defineComponent, nextTick, ref } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useFocus } from "@vue-tui/runtime";

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
  const active = ref(false);

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
  const active = ref(false);

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
  const active = ref(true);

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
