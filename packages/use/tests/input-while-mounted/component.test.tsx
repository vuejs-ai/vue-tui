import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, Text, type TuiInputEvent } from "@vue-tui/runtime";
import { render } from "@vue-tui/testing";
import { UseInputWhileMounted } from "../../src/components.ts";

test("UseInputWhileMounted emits only during its own mounted lifetime", async () => {
  const wrapperMounted = shallowRef(false);
  const received: string[] = [];
  const App = defineComponent(() => () => (
    <Box>
      {wrapperMounted.value ? (
        <UseInputWhileMounted
          onInput={(event) => {
            if (event.type === "text") received.push(event.text);
          }}
        >
          <Text>wrapped</Text>
        </UseInputWhileMounted>
      ) : (
        <Text>idle</Text>
      )}
    </Box>
  ));
  const result = await render(App);

  try {
    expect(result.terminal.rawMode.current).toBe(false);
    wrapperMounted.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.lastFrame()).toBe("wrapped");
    expect(result.terminal.rawMode.current).toBe(true);
    await result.stdin.write("a");
    expect(received).toEqual(["a"]);

    wrapperMounted.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.terminal.rawMode.current).toBe(false);
    await result.stdin.write("b");
    expect(received).toEqual(["a"]);
  } finally {
    result.dispose();
  }
});

test("UseInputWhileMounted filters input through its reactive type prop", async () => {
  const type = shallowRef<TuiInputEvent["type"]>("key");
  const received: TuiInputEvent[] = [];
  const App = defineComponent(() => () => (
    <UseInputWhileMounted type={type.value} onInput={(event) => received.push(event)}>
      <Text>wrapped</Text>
    </UseInputWhileMounted>
  ));
  const result = await render(App);

  try {
    await result.stdin.write("ignored text");
    await result.stdin.write("\x1b[A");
    expect(received.map((event) => event.type)).toEqual(["key"]);

    type.value = "text";
    await nextTick();
    await result.stdin.write("accepted text");
    await result.stdin.write("\x1b[A");
    expect(received.map((event) => event.type)).toEqual(["key", "text"]);

    type.value = "paste";
    await nextTick();
    await result.stdin.write("ignored text");
    await result.stdin.write("\x1b[200~accepted paste\x1b[201~");
    expect(received.map((event) => event.type)).toEqual(["key", "text", "paste"]);
  } finally {
    result.dispose();
  }
});
