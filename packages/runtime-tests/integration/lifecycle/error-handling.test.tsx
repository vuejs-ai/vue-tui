import { defineComponent, nextTick, ref } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text } from "@vue-tui/runtime";

test("setup() throw rejects render()", async () => {
  const Boom = defineComponent(() => {
    throw new Error("setup boom");
  });
  await expect(render(Boom)).rejects.toThrow("setup boom");
});

test("render-time throw does not prevent unmount", async () => {
  const trigger = ref(false);
  const App = defineComponent(() => {
    return () => {
      if (trigger.value) throw new Error("render boom");
      return <Text>ok</Text>;
    };
  });

  const { lastFrame, unmount } = await render(App);
  expect(lastFrame()).toContain("ok");

  trigger.value = true;
  try {
    await nextTick();
  } catch {
    // swallow the render error
  }

  expect(() => unmount()).not.toThrow();
});
