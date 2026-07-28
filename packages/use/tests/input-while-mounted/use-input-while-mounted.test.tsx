import { defineComponent, nextTick, shallowRef, vShow, withDirectives } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, Text, type TuiInputEvent } from "@vue-tui/runtime";
import { render } from "@vue-tui/testing";
import { useInputWhileMounted } from "../../src/input-while-mounted/use-input-while-mounted.ts";

test("the function ref activates input only while its target is mounted", async () => {
  const targetMounted = shallowRef(false);
  const received: string[] = [];
  const Target = defineComponent(() => () => (
    <Box>
      <Text>target</Text>
    </Box>
  ));
  const App = defineComponent(() => {
    const targetRef = useInputWhileMounted((event) => {
      if (event.type === "text") received.push(event.text);
    });
    return () => <Box>{targetMounted.value ? <Target ref={targetRef} /> : <Text>idle</Text>}</Box>;
  });
  const result = await render(App);

  try {
    expect(result.terminal.rawMode.current).toBe(false);
    await result.stdin.write("a");
    expect(received).toEqual([]);

    targetMounted.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.terminal.rawMode.current).toBe(true);
    await result.stdin.write("b");
    expect(received).toEqual(["b"]);

    targetMounted.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.terminal.rawMode.current).toBe(false);
    await result.stdin.write("c");
    expect(received).toEqual(["b"]);

    targetMounted.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();
    await result.stdin.write("d");
    expect(received).toEqual(["b", "d"]);
  } finally {
    result.dispose();
  }
});

test("the function ref tracks mount lifecycle, not v-show visibility", async () => {
  const visible = shallowRef(true);
  const received: TuiInputEvent[] = [];
  const App = defineComponent(() => {
    const targetRef = useInputWhileMounted((event) => received.push(event));
    return () =>
      withDirectives(
        <Box ref={targetRef}>
          <Text>target</Text>
        </Box>,
        [[vShow, visible.value]],
      );
  });
  const result = await render(App);

  try {
    visible.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.terminal.rawMode.current).toBe(true);
    await result.stdin.write("x");
    expect(received).toHaveLength(1);
  } finally {
    result.dispose();
  }
});
