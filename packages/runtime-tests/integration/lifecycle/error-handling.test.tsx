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

// --- Ink error validation tests ---
// In Ink these tests use React error boundaries to validate that:
// 1. Raw text strings inside <Box> (not inside <Text>) throw an error
// 2. A <Box> nested inside <Text> throws an error
//
// In vue-tui:
// - Raw text-leaf nodes inside <Box> are silently allowed (no validation yet)
// - <Box> inside <Text> causes a WASM yoga crash (table index out of bounds)
// All three are marked todo until the runtime adds proper validation.

test.todo(
  "fail when text nodes are not within <Text> component — vue-tui silently allows text-leaf inside box; validation not yet implemented",
);

test.todo(
  "fail when text node is not within <Text> component — vue-tui silently allows text-leaf inside box; validation not yet implemented",
);

test.todo(
  "fail when <Box> is inside <Text> component — causes WASM table index out of bounds crash; yoga does not safely reject this nesting",
);
