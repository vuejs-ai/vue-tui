import { defineComponent, shallowRef, vShow, withDirectives } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, useBoxMetrics } from "@vue-tui/runtime";

// A zero-content Box collapses its whole subtree for one layout pass. Every node
// under it measures as an empty rectangle. That is not the same public state as
// `display: none`, which reports nothing measured at all, and the distinction
// must not depend on how deep under the zero-content Box a node sits.
test("every depth under a zero-content Box measures 0x0 rather than unmeasured", async () => {
  let child!: ReturnType<typeof useBoxMetrics>;
  let grandchild!: ReturnType<typeof useBoxMetrics>;

  const App = defineComponent(() => {
    const childRef = shallowRef<InstanceType<typeof Box> | null>(null);
    const grandchildRef = shallowRef<InstanceType<typeof Box> | null>(null);
    child = useBoxMetrics(childRef);
    grandchild = useBoxMetrics(grandchildRef);
    return () => (
      <Box width={0} height={3}>
        <Box ref={childRef}>
          <Box ref={grandchildRef} />
        </Box>
      </Box>
    );
  });

  const result = await render(App, { columns: 10, rows: 3 });
  try {
    for (const metrics of [child, grandchild]) {
      expect({
        width: metrics.width.value,
        height: metrics.height.value,
        hasMeasured: metrics.hasMeasured.value,
      }).toEqual({ width: 0, height: 0, hasMeasured: true });
    }
  } finally {
    result.dispose();
  }
});

// Guardedness stops at a node the application hid in its own right. Its state is
// `display: none`, and an ancestor that happens to be collapsed for one pass must
// not flip it to a measured empty rectangle.
test("a display:none node under a zero-content Box still reports nothing measured", async () => {
  let hidden!: ReturnType<typeof useBoxMetrics>;

  const App = defineComponent(() => {
    const hiddenRef = shallowRef<InstanceType<typeof Box> | null>(null);
    hidden = useBoxMetrics(hiddenRef);
    return () => (
      <Box width={0} height={3}>
        <Box>{withDirectives(<Box ref={hiddenRef} />, [[vShow, false]])}</Box>
      </Box>
    );
  });

  const result = await render(App, { columns: 10, rows: 3 });
  try {
    expect(hidden.hasMeasured.value).toBe(false);
  } finally {
    result.dispose();
  }
});
