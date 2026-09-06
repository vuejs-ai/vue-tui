import { defineComponent, h, onMounted, shallowRef, type ComponentPublicInstance } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, useFocus, type UseFocusReturn } from "@vue-tui/runtime";
import { flushAcceptedRender } from "./harness.ts";

// A zero-content Box has its children hidden for the duration of one layout
// transaction so they cannot claim space. That hiding is not the application's,
// and focus must survive it: it is undone before the next frame.
test("keeps focus through an ancestor that is briefly zero-height", async () => {
  const height = shallowRef(3);
  let focus!: UseFocusReturn;

  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    focus = useFocus(target);
    onMounted(() => focus.focus());
    return () => h(Box, { height: height.value }, () => h(Box, { ref: target }));
  });

  const result = await render(App);
  try {
    expect(focus.isFocused.value).toBe(true);

    height.value = 0;
    await flushAcceptedRender(result);

    height.value = 3;
    await flushAcceptedRender(result);
    expect(focus.isFocused.value).toBe(true);
  } finally {
    result.dispose();
  }
});
