import { defineComponent, nextTick, ref, shallowRef, watchEffect } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useBoxMetrics, measureElement } from "@vue-tui/runtime";

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
});
