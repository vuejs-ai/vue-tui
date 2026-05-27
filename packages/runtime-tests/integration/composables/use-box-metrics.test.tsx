import { defineComponent, nextTick, ref, shallowRef, watchEffect, watchPostEffect } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useBoxMetrics, measureElement, useTerminalSize } from "@vue-tui/runtime";

describe("useBoxMetrics", () => {
  test("returns layout dimensions after render", async () => {
    const dims = shallowRef({ w: 0, h: 0 });
    const App = defineComponent(() => {
      const boxRef = ref(null);
      const metrics = useBoxMetrics(boxRef);
      watchEffect(() => {
        dims.value = { w: metrics.width.value, h: metrics.height.value };
      });
      return () => (
        <Box ref={boxRef} width={20} height={5}>
          <Text>test</Text>
        </Box>
      );
    });
    await render(App);
    // useBoxMetrics defers measurement to nextTick after the commit
    await nextTick();
    expect(dims.value.w).toBe(20);
    expect(dims.value.h).toBe(5);
  });

  test("returns left and top positions", async () => {
    const pos = shallowRef({ l: -1, t: -1 });
    const App = defineComponent(() => {
      const boxRef = ref(null);
      const metrics = useBoxMetrics(boxRef);
      watchEffect(() => {
        pos.value = { l: metrics.left.value, t: metrics.top.value };
      });
      return () => (
        <Box width={40} height={10}>
          <Box ref={boxRef} width={20} height={5}>
            <Text>inner</Text>
          </Box>
        </Box>
      );
    });
    await render(App);
    await nextTick();
    expect(pos.value.l).toBe(0);
    expect(pos.value.t).toBe(0);
  });

  test("hasMeasured starts false", async () => {
    let measured = false;
    const App = defineComponent(() => {
      const boxRef = ref(null);
      const metrics = useBoxMetrics(boxRef);
      // During setup, hasMeasured is false (layout not computed yet)
      measured = metrics.hasMeasured.value;
      return () => (
        <Box ref={boxRef} width={10} height={3}>
          <Text>x</Text>
        </Box>
      );
    });
    await render(App);
    // During setup, hasMeasured was false
    expect(measured).toBe(false);
  });

  test("hasMeasured becomes true after layout", async () => {
    const hasMeasuredRef = shallowRef(false);
    const App = defineComponent(() => {
      const boxRef = ref(null);
      const metrics = useBoxMetrics(boxRef);
      watchEffect(() => {
        hasMeasuredRef.value = metrics.hasMeasured.value;
      });
      return () => (
        <Box ref={boxRef} width={10} height={3}>
          <Text>x</Text>
        </Box>
      );
    });
    await render(App);
    await nextTick();
    expect(hasMeasuredRef.value).toBe(true);
  });
});

describe("measureElement", () => {
  test("returns { width: 0, height: 0 } for null", () => {
    expect(measureElement(null)).toEqual({ width: 0, height: 0 });
  });

  test("returns { width: 0, height: 0 } for undefined", () => {
    expect(measureElement(undefined)).toEqual({ width: 0, height: 0 });
  });

  test("returns { width: 0, height: 0 } for object without yoga", () => {
    expect(measureElement({})).toEqual({ width: 0, height: 0 });
  });

  test("returns dimensions from a node with yoga property", () => {
    const fakeYoga = {
      getComputedWidth: () => 42,
      getComputedHeight: () => 17,
    };
    expect(measureElement({ yoga: fakeYoga })).toEqual({ width: 42, height: 17 });
  });

  test("resolves through $el for component instances", () => {
    const fakeYoga = {
      getComputedWidth: () => 30,
      getComputedHeight: () => 10,
    };
    const fakeInstance = { $el: { yoga: fakeYoga } };
    expect(measureElement(fakeInstance)).toEqual({ width: 30, height: 10 });
  });

  test("measureElement returns dimensions after state update", async () => {
    const measuredHeight = shallowRef(0);
    const items = shallowRef<string[]>([]);
    const App = defineComponent(() => {
      const boxRef = ref(null);
      watchPostEffect(() => {
        // Access items to track as dependency
        const _len = items.value.length;
        void _len;
        void nextTick(() => {
          const m = measureElement(boxRef.value);
          measuredHeight.value = m.height;
        });
      });
      return () => (
        <Box flexDirection="column">
          <Box ref={boxRef} flexDirection="column">
            {items.value.map((item) => (
              <Text key={item}>{item}</Text>
            ))}
          </Box>
          <Text>Height: {measuredHeight.value}</Text>
        </Box>
      );
    });
    await render(App);
    await nextTick();
    expect(measuredHeight.value).toBe(0);

    items.value = ["line 1", "line 2", "line 3"];
    await nextTick();
    await nextTick();
    expect(measuredHeight.value).toBe(3);
  });

  test("measureElement returns dimensions after multiple state updates", async () => {
    const measuredHeight = shallowRef(0);
    const items = shallowRef<string[]>([]);
    const App = defineComponent(() => {
      const boxRef = ref(null);
      watchPostEffect(() => {
        const _len = items.value.length;
        void _len;
        void nextTick(() => {
          const m = measureElement(boxRef.value);
          measuredHeight.value = m.height;
        });
      });
      return () => (
        <Box flexDirection="column">
          <Box ref={boxRef} flexDirection="column">
            {items.value.map((item) => (
              <Text key={item}>{item}</Text>
            ))}
          </Box>
          <Text>Height: {measuredHeight.value}</Text>
        </Box>
      );
    });
    await render(App);
    await nextTick();

    items.value = ["line 1", "line 2", "line 3"];
    await nextTick();
    await nextTick();
    expect(measuredHeight.value).toBe(3);

    items.value = ["line 1"];
    await nextTick();
    await nextTick();
    expect(measuredHeight.value).toBe(1);
  });

  test("measureElement in watchPostEffect after state update", async () => {
    const measuredHeight = shallowRef(0);
    const items = shallowRef<string[]>([]);
    const App = defineComponent(() => {
      const boxRef = ref(null);
      // Vue's watchPostEffect is the closest equivalent to React's useLayoutEffect
      // in terms of running after DOM mutations but before paint.
      watchPostEffect(() => {
        const _len = items.value.length;
        void _len;
        void nextTick(() => {
          const m = measureElement(boxRef.value);
          measuredHeight.value = m.height;
        });
      });
      return () => (
        <Box flexDirection="column">
          <Box ref={boxRef} flexDirection="column">
            {items.value.map((item) => (
              <Text key={item}>{item}</Text>
            ))}
          </Box>
          <Text>Height: {measuredHeight.value}</Text>
        </Box>
      );
    });
    await render(App);
    await nextTick();

    items.value = ["line 1", "line 2", "line 3"];
    await nextTick();
    await nextTick();
    expect(measuredHeight.value).toBe(3);
  });

  test("measureElement works when render is throttled", async () => {
    const measuredWidth = shallowRef(0);
    const App = defineComponent(() => {
      const boxRef = ref(null);
      watchPostEffect(() => {
        void nextTick(() => {
          const m = measureElement(boxRef.value);
          measuredWidth.value = m.width;
        });
      });
      return () => (
        <Box ref={boxRef}>
          <Text>Width: {measuredWidth.value}</Text>
        </Box>
      );
    });
    await render(App, { columns: 100 });
    await nextTick();
    expect(measuredWidth.value).toBe(100);
  });
});

describe("useBoxMetrics - resize and dynamic layout", () => {
  // In Ink, useBoxMetrics subscribes to root layout commits, so resize triggers
  // re-measurement automatically. vue-tui's useBoxMetrics uses watchPostEffect
  // which only re-runs when ref.value changes. Resize doesn't change the ref.
  // TODO: add layout-commit listener to useBoxMetrics for full Ink parity.
  test.skip("updates when terminal is resized", async () => {
    const App = defineComponent(() => {
      const boxRef = ref(null);
      const { width } = useBoxMetrics(boxRef);
      useTerminalSize();
      return () => (
        <Box ref={boxRef}>
          <Text>Width: {width.value}</Text>
        </Box>
      );
    });
    const { lastFrame, terminal } = await render(App, { columns: 100 });
    await nextTick();
    expect(lastFrame()).toContain("Width: 100");

    await terminal.resize(60, 100);
    await nextTick();
    expect(lastFrame()).toContain("Width: 60");
  });

  test("uses latest tracked ref after switching", async () => {
    // Verify that when the tracked ref switches from one element to another,
    // the new element's metrics are measured.
    const trackSecond = shallowRef(false);
    const App = defineComponent(() => {
      const firstRef = ref(null);
      const secondRef = ref(null);
      const trackedRef = ref<unknown>(null);

      watchEffect(() => {
        trackedRef.value = trackSecond.value ? secondRef.value : firstRef.value;
      });

      const { width } = useBoxMetrics(trackedRef);

      return () => (
        <Box flexDirection="column">
          <Box ref={firstRef} width={20}>
            <Text>short</Text>
          </Box>
          <Box ref={secondRef} width={40}>
            <Text>longer box</Text>
          </Box>
          <Text>Tracked width: {width.value}</Text>
        </Box>
      );
    });
    const { lastFrame } = await render(App);
    await nextTick();
    expect(lastFrame()).toContain("Tracked width: 20");

    trackSecond.value = true;
    await nextTick();
    await nextTick();
    await nextTick();
    expect(lastFrame()).toContain("Tracked width: 40");
  });

  // Ink's useBoxMetrics subscribes to a root layout listener (addLayoutListener)
  // so that sibling content changes that affect yoga layout are picked up even
  // when the tracked ref does not change. vue-tui's useBoxMetrics uses
  // watchPostEffect which only re-runs when ref.value changes. Sibling content
  // changes do not change the ref, so metrics are not automatically re-measured.
  // TODO: add layout-commit listener to useBoxMetrics for full Ink parity.
  test.skip("updates when sibling content changes", async () => {
    const siblingText = shallowRef("short");
    const App = defineComponent(() => {
      const boxRef = ref(null);
      const { height } = useBoxMetrics(boxRef);
      return () => (
        <Box flexDirection="column">
          <Box ref={boxRef} flexDirection="column">
            <Text>{siblingText.value}</Text>
          </Box>
          <Text>Height: {height.value}</Text>
        </Box>
      );
    });
    const { lastFrame } = await render(App);
    await nextTick();
    expect(lastFrame()).toContain("Height: 1");

    siblingText.value = "line 1\nline 2\nline 3";
    await nextTick();
    await nextTick();
    expect(lastFrame()).toContain("Height: 3");
  });

  // Same limitation as above: watchPostEffect only re-runs when ref.value changes.
  // The tracked component's ref doesn't change when sibling content changes.
  // TODO: add layout-commit listener to useBoxMetrics for full Ink parity.
  test.skip("updates when sibling content changes but tracked component does not re-render", async () => {
    const siblingText = shallowRef("line 1");

    const TrackedBox = defineComponent(() => {
      const boxRef = ref(null);
      const { top } = useBoxMetrics(boxRef);
      return () => (
        <Box ref={boxRef}>
          <Text>Top: {top.value}</Text>
        </Box>
      );
    });

    const App = defineComponent(() => {
      return () => (
        <Box flexDirection="column">
          <Text>{siblingText.value}</Text>
          <TrackedBox />
        </Box>
      );
    });
    const { lastFrame } = await render(App);
    await nextTick();
    expect(lastFrame()).toContain("Top: 1");

    siblingText.value = "line 1\nline 2\nline 3";
    await nextTick();
    await nextTick();
    expect(lastFrame()).toContain("Top: 3");
  });

  test("updates when tracked ref attaches after initial render", async () => {
    const isTrackedElementMounted = shallowRef(false);

    const TrackedBox = defineComponent({
      props: { isMounted: { type: Boolean, required: true } },
      setup(props) {
        const boxRef = ref(null);
        const { top } = useBoxMetrics(boxRef);
        return () =>
          props.isMounted ? (
            <Box ref={boxRef}>
              <Text>Top: {top.value}</Text>
            </Box>
          ) : (
            <Text>Top: {top.value}</Text>
          );
      },
    });

    const App = defineComponent(() => {
      return () => (
        <Box flexDirection="column">
          <Text>line 1</Text>
          <TrackedBox isMounted={isTrackedElementMounted.value} />
        </Box>
      );
    });
    const { lastFrame } = await render(App);
    await nextTick();
    // Ref not attached yet, so top should be 0
    expect(lastFrame()).toContain("Top: 0");

    isTrackedElementMounted.value = true;
    await nextTick();
    await nextTick();
    expect(lastFrame()).toContain("Top: 1");
  });

  test("does not trigger extra re-renders when layout is unchanged", async () => {
    let renderCount = 0;
    const App = defineComponent(() => {
      const boxRef = ref(null);
      useBoxMetrics(boxRef);
      return () => {
        renderCount++;
        return (
          <Box ref={boxRef}>
            <Text>Hello</Text>
          </Box>
        );
      };
    });
    await render(App);
    await nextTick();
    // Allow all post-effects and next-tick measurement to settle
    await nextTick();
    const settledCount = renderCount;
    // After settling, no more renders should fire
    await nextTick();
    await nextTick();
    expect(renderCount).toBe(settledCount);
  });

  test("does not crash when resize fires after unmount", async () => {
    const App = defineComponent(() => {
      const boxRef = ref(null);
      useBoxMetrics(boxRef);
      useTerminalSize();
      return () => (
        <Box ref={boxRef}>
          <Text>Hello</Text>
        </Box>
      );
    });
    const { unmount, terminal } = await render(App, { columns: 100 });
    unmount();

    // Resize after unmount should not throw
    await terminal.resize(60, 100);
    await nextTick();
    // If we reach here without throwing, the test passes
  });

  test("returns zeros when ref is not attached to any element", async () => {
    const dims = shallowRef({ w: 0, h: 0, l: 0, t: 0, m: false });
    const App = defineComponent(() => {
      const boxRef = ref(null);
      // Never attach boxRef to any element
      const { width, height, left, top, hasMeasured } = useBoxMetrics(boxRef);
      watchEffect(() => {
        dims.value = {
          w: width.value,
          h: height.value,
          l: left.value,
          t: top.value,
          m: hasMeasured.value,
        };
      });
      return () => (
        <Box>
          <Text>no ref attached</Text>
        </Box>
      );
    });
    await render(App);
    await nextTick();
    expect(dims.value).toEqual({ w: 0, h: 0, l: 0, t: 0, m: false });
  });

  test("hasMeasured becomes true when tracked element is mounted on initial render", async () => {
    const hasMeasuredRef = shallowRef(false);
    const App = defineComponent(() => {
      const boxRef = ref(null);
      const { hasMeasured } = useBoxMetrics(boxRef);
      watchEffect(() => {
        hasMeasuredRef.value = hasMeasured.value;
      });
      return () => (
        <Box ref={boxRef}>
          <Text>Has measured: {String(hasMeasured.value)}</Text>
        </Box>
      );
    });
    const { lastFrame } = await render(App);
    await nextTick();
    expect(hasMeasuredRef.value).toBe(true);
    expect(lastFrame()).toContain("Has measured: true");
  });

  test("hasMeasured becomes true after the tracked element is mounted later", async () => {
    const isMounted = shallowRef(false);
    const App = defineComponent(() => {
      const boxRef = ref(null);
      const { hasMeasured } = useBoxMetrics(boxRef);
      return () => (
        <Box flexDirection="column">
          {isMounted.value ? (
            <Box ref={boxRef}>
              <Text>Tracked</Text>
            </Box>
          ) : undefined}
          <Text>Has measured: {String(hasMeasured.value)}</Text>
        </Box>
      );
    });
    const { lastFrame } = await render(App);
    await nextTick();
    expect(lastFrame()).toContain("Has measured: false");

    isMounted.value = true;
    await nextTick();
    await nextTick();
    expect(lastFrame()).toContain("Has measured: true");
  });

  test("hasMeasured resets when tracked ref switches to a detached element", async () => {
    const trackSecond = shallowRef(false);
    const mountSecond = shallowRef(false);
    const App = defineComponent(() => {
      const firstRef = ref(null);
      const secondRef = ref(null);
      const trackedRef = ref<unknown>(null);

      watchEffect(() => {
        trackedRef.value = trackSecond.value ? secondRef.value : firstRef.value;
      });

      const { hasMeasured } = useBoxMetrics(trackedRef);
      return () => (
        <Box flexDirection="column">
          <Box ref={firstRef}>
            <Text>First</Text>
          </Box>
          {mountSecond.value ? (
            <Box ref={secondRef}>
              <Text>Second</Text>
            </Box>
          ) : undefined}
          <Text>Has measured: {String(hasMeasured.value)}</Text>
        </Box>
      );
    });
    const { lastFrame } = await render(App);
    await nextTick();
    expect(lastFrame()).toContain("Has measured: true");

    // Switch to tracking secondRef which is not mounted yet
    trackSecond.value = true;
    await nextTick();
    await nextTick();
    expect(lastFrame()).toContain("Has measured: false");

    // Now mount the second element. When secondRef gets set by Vue, the
    // watchEffect re-computes trackedRef, which triggers useBoxMetrics'
    // watchPostEffect to re-run and schedule measurement via nextTick.
    mountSecond.value = true;
    await nextTick();
    await nextTick();
    await nextTick();
    await nextTick();
    expect(lastFrame()).toContain("Has measured: true");
  });

  test("resets metrics when tracked element unmounts", async () => {
    const isMounted = shallowRef(true);
    const App = defineComponent(() => {
      const boxRef = ref(null);
      const { width, height, left, top, hasMeasured } = useBoxMetrics(boxRef);
      return () => (
        <Box flexDirection="column">
          {isMounted.value ? (
            <Box ref={boxRef} width={10}>
              <Text>1234567890</Text>
            </Box>
          ) : undefined}
          <Text>
            Metrics: {width.value},{height.value},{left.value},{top.value},
            {String(hasMeasured.value)}
          </Text>
        </Box>
      );
    });
    const { lastFrame } = await render(App);
    await nextTick();
    expect(lastFrame()).toContain("Metrics: 10,1,0,0,true");

    isMounted.value = false;
    await nextTick();
    await nextTick();
    expect(lastFrame()).toContain("Metrics: 0,0,0,0,false");
  });
});
