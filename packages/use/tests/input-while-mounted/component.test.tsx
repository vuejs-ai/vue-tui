import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, Text } from "@vue-tui/runtime";
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
