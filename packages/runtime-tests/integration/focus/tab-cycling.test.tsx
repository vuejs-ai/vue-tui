import { defineComponent, shallowRef, type ComponentPublicInstance } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import {
  Box,
  Text,
  useFocus,
  useFocusManager,
  type RenderMode,
  type UseFocusReturn,
} from "@vue-tui/runtime";

const modes = ["inline", "fullscreen"] as const satisfies readonly RenderMode[];
type ItemId = "a" | "b" | "c" | "d";

async function runTraversalJourney(mode: RenderMode): Promise<readonly string[]> {
  const order = shallowRef<readonly ItemId[]>(["a", "b", "c", "d"]);
  const disabledB = shallowRef(true);
  const tabIndexC = shallowRef<0 | -1>(-1);
  let handles!: Record<ItemId, UseFocusReturn>;
  let focusedTarget!: ReturnType<typeof useFocusManager>["focusedTarget"];

  const App = defineComponent(() => {
    const targets: Record<ItemId, ReturnType<typeof shallowRef<ComponentPublicInstance | null>>> = {
      a: shallowRef(null),
      b: shallowRef(null),
      c: shallowRef(null),
      d: shallowRef(null),
    };
    handles = {
      a: useFocus(targets.a, { autoFocus: true }),
      b: useFocus(targets.b, { disabled: disabledB }),
      c: useFocus(targets.c, { tabIndex: tabIndexC }),
      d: useFocus(targets.d),
    };
    focusedTarget = useFocusManager().focusedTarget;

    return () => (
      <Box flexDirection="column">
        {order.value.map((id) => (
          <Box key={id} ref={targets[id]}>
            <Text>
              {id}
              {handles[id].isFocused.value ? "*" : ""}
            </Text>
          </Box>
        ))}
      </Box>
    );
  });

  const result = await render(App, { host: { mode } });
  const trace: string[] = [];
  const record = () => {
    const entry = (Object.keys(handles) as ItemId[]).find((id) => handles[id].isFocused.value);
    trace.push(entry ?? "none");
  };

  try {
    expect(focusedTarget.value).toBe(handles.a);
    record();

    // Traversal follows the latest rendered-host preorder. The disabled and
    // programmatic-only targets are skipped.
    order.value = ["a", "d", "b", "c"];
    await result.waitUntilRenderFlush();
    await result.stdin.write("\t");
    expect(focusedTarget.value).toBe(handles.d);
    record();

    // Forward and backward traversal both wrap inside the current boundary.
    await result.stdin.write("\t");
    expect(focusedTarget.value).toBe(handles.a);
    record();
    await result.stdin.write("\x1b[Z");
    expect(focusedTarget.value).toBe(handles.d);
    record();

    // A reactive eligibility change takes effect without replacing the handle.
    disabledB.value = false;
    order.value = ["a", "b", "c", "d"];
    await result.waitUntilRenderFlush();
    await result.stdin.write("\t");
    expect(focusedTarget.value).toBe(handles.a);
    await result.stdin.write("\t");
    expect(focusedTarget.value).toBe(handles.b);
    record();

    disabledB.value = true;
    await result.waitUntilRenderFlush();
    expect(focusedTarget.value).toBe(handles.d);
    record();
  } finally {
    result.dispose();
  }

  return trace;
}

test("Inline and Fullscreen share rendered-order traversal and eligibility semantics", async () => {
  const traces = await Promise.all(modes.map((mode) => runTraversalJourney(mode)));
  expect(traces[0]).toEqual(["a", "d", "a", "d", "b", "d"]);
  expect(traces[1]).toEqual(traces[0]);
});
