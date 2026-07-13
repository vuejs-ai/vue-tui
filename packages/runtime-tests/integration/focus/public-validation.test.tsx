import { defineComponent, shallowRef, type ComponentPublicInstance } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import {
  Box,
  Text,
  useExternalInput,
  useFocus,
  useFocusScope,
  useFocusedInput,
  type UseFocusScopeReturn,
  type UseFocusReturn,
} from "@vue-tui/runtime";

test.each([
  [{ disabled: "no" }, "useFocus() disabled must resolve to a boolean"],
  [{ tabIndex: 1 }, "useFocus() tabIndex must resolve to 0 or -1"],
  [{ autoFocus: "yes" }, "useFocus() autoFocus must resolve to a boolean"],
  [{ scope: null }, "Focus scope belongs to another application or has been disposed"],
  [{ scope: false }, "Focus scope belongs to another application or has been disposed"],
  [{ scope: 0 }, "Focus scope belongs to another application or has been disposed"],
  [{ scope: "" }, "Focus scope belongs to another application or has been disposed"],
] as const)("invalid JavaScript focus options fail during setup", async (options, message) => {
  const App = defineComponent(() => {
    const host = shallowRef<ComponentPublicInstance | null>(null);
    useFocus(host, options as never);
    return () => <Box ref={host} />;
  });

  await expect(render(App)).rejects.toThrow(message);
});

test("a target handle cannot be attached to another application", async () => {
  let foreign!: UseFocusReturn;
  const First = defineComponent(() => {
    const host = shallowRef<ComponentPublicInstance | null>(null);
    foreign = useFocus(host, { autoFocus: true });
    return () => (
      <Box ref={host}>
        <Text>first</Text>
      </Box>
    );
  });
  const first = await render(First);
  try {
    const Second = defineComponent(() => {
      useFocusedInput(foreign, () => "continue");
      return () => <Text>second</Text>;
    });
    await expect(render(Second)).rejects.toThrow(
      "Focus target belongs to another application or has been disposed",
    );
  } finally {
    first.dispose();
  }
});

test("scope handles reject cross-application and disposed attachments", async () => {
  let foreign!: UseFocusScopeReturn;
  const First = defineComponent(() => {
    foreign = useFocusScope();
    return () => <Text>first</Text>;
  });
  const first = await render(First);

  const Consumer = defineComponent(() => {
    const host = shallowRef<ComponentPublicInstance | null>(null);
    useFocus(host, { scope: foreign });
    return () => <Box ref={host} />;
  });
  try {
    await expect(render(Consumer)).rejects.toThrow(
      "Focus scope belongs to another application or has been disposed",
    );
  } finally {
    first.dispose();
  }

  await expect(render(Consumer)).rejects.toThrow(
    "Focus scope belongs to another application or has been disposed",
  );
});

test("disposed target handles reject new input attachments", async () => {
  let disposed!: UseFocusReturn;
  const First = defineComponent(() => {
    const host = shallowRef<ComponentPublicInstance | null>(null);
    disposed = useFocus(host);
    return () => <Box ref={host} />;
  });
  const first = await render(First);
  first.dispose();

  const Consumer = defineComponent(() => {
    useFocusedInput(disposed, () => "continue");
    return () => <Text>consumer</Text>;
  });
  await expect(render(Consumer)).rejects.toThrow(
    "Focus target belongs to another application or has been disposed",
  );
});

test("a second external receiver fails without replacing the first", async () => {
  const firstCalls: string[] = [];
  const App = defineComponent(() => {
    const host = shallowRef<ComponentPublicInstance | null>(null);
    const target = useFocus(host, { autoFocus: true });
    useExternalInput(target, ({ sequence }) => firstCalls.push(sequence));
    useExternalInput(target, () => {});
    return () => <Box ref={host} />;
  });

  await expect(render(App)).rejects.toThrow(
    "A focus target cannot own more than one external input receiver",
  );
  expect(firstCalls).toEqual([]);
});
