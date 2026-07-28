import { defineComponent, shallowRef, type Component, type ComponentPublicInstance } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useFocus, useInput, type UseFocusReturn } from "@vue-tui/runtime";

test("rejects wrong and cross-app component target values", async () => {
  const UndefinedArgument = defineComponent(() => {
    (useFocus as (target: unknown) => UseFocusReturn)(undefined);
    return () => <Text>invalid</Text>;
  });
  await expect(render(UndefinedArgument)).rejects.toThrow(
    "useFocus() target must be a Vue ref to a component instance",
  );

  const Invalid = defineComponent(() => {
    useFocus(shallowRef(42) as never);
    return () => <Text>invalid</Text>;
  });
  await expect(render(Invalid)).rejects.toThrow(
    "useFocus() target must resolve to a stateful Vue component instance",
  );

  const foreign = shallowRef<ComponentPublicInstance | null>(null);
  const Owner = defineComponent(() => () => <Box ref={foreign} />);
  const Observer = defineComponent(() => {
    useFocus(foreign);
    return () => <Text>observer</Text>;
  });
  const owner = await render(Owner);
  try {
    await expect(render(Observer)).rejects.toThrow(
      "useFocus() target belongs to a different vue-tui app",
    );
  } finally {
    owner.dispose();
  }
});

test("composes isFocused with broadcast useInput activation without routing policy", async () => {
  const trace: string[] = [];
  let first!: UseFocusReturn;
  let second!: UseFocusReturn;
  const App: Component = defineComponent(() => {
    first = useFocus();
    second = useFocus();
    first.focus();
    useInput(
      () => {
        trace.push("first");
      },
      { isActive: first.isFocused },
    );
    useInput(
      () => {
        trace.push("second");
      },
      { isActive: second.isFocused },
    );
    useInput(() => {
      trace.push("broadcast");
    });
    return () => <Text>input focus</Text>;
  });

  const result = await render(App);
  try {
    await result.stdin.write("a");
    expect(trace).toHaveLength(2);
    expect(trace).toEqual(expect.arrayContaining(["first", "broadcast"]));

    trace.length = 0;
    second.focus();
    await result.stdin.write("b");
    expect(trace).toHaveLength(2);
    expect(trace).toEqual(expect.arrayContaining(["second", "broadcast"]));
  } finally {
    result.dispose();
  }
});
