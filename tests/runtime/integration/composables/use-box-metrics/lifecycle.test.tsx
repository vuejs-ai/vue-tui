import { defineComponent, nextTick, shallowRef, vShow, withDirectives } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, useBoxMetrics } from "@vue-tui/runtime";

test("distinguishes zero size, clipping, hidden state, and detachment", async () => {
  const visible = shallowRef(true);
  const hidden = shallowRef(false);
  const clipped = shallowRef(false);
  const zero = shallowRef(true);
  let metrics!: ReturnType<typeof useBoxMetrics>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    metrics = useBoxMetrics(target);
    return () =>
      visible.value ? (
        <Box width={5} height={1} overflowY="hidden">
          {withDirectives(
            <Box
              ref={target}
              position={clipped.value ? "absolute" : undefined}
              top={clipped.value ? 2 : undefined}
              width={zero.value ? 0 : 3}
              height={zero.value ? 0 : 1}
            />,
            [[vShow, !hidden.value]],
          )}
        </Box>
      ) : null;
  });

  const result = await render(App, { columns: 10, rows: 3 });
  try {
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 0, height: 0, hasMeasured: true });

    zero.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 3, height: 1, hasMeasured: true });

    clipped.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 3, height: 1, hasMeasured: true });

    hidden.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(metrics.hasMeasured.value).toBe(false);
    expect(metrics.width.value).toBe(0);
    expect(metrics.height.value).toBe(0);

    hidden.value = false;
    clipped.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 3, height: 1, hasMeasured: true });

    visible.value = false;
    await nextTick();
    expect(metrics.hasMeasured.value).toBe(false);
    expect(metrics.width.value).toBe(0);
    expect(metrics.height.value).toBe(0);
  } finally {
    result.dispose();
  }
});

test("clears a previous size while a replacement Box awaits accepted paint", async () => {
  const replacement = shallowRef(false);
  let metrics!: ReturnType<typeof useBoxMetrics>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    metrics = useBoxMetrics(target);
    return () =>
      replacement.value ? (
        <Box key="second" ref={target} width={7} height={2} />
      ) : (
        <Box key="first" ref={target} width={3} height={1} />
      );
  });

  const result = await render(App, { columns: 10, rows: 3 });
  try {
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 3, height: 1, hasMeasured: true });
    replacement.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 7, height: 2, hasMeasured: true });
  } finally {
    result.dispose();
  }
});

test("a retained size becomes null when its setup scope is disposed", async () => {
  let metrics!: ReturnType<typeof useBoxMetrics>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    metrics = useBoxMetrics(target);
    return () => <Box ref={target} width={3} height={1} />;
  });

  const result = await render(App, { columns: 10, rows: 3 });
  expect({
    width: metrics.width.value,
    height: metrics.height.value,
    hasMeasured: metrics.hasMeasured.value,
  }).toEqual({ width: 3, height: 1, hasMeasured: true });
  result.dispose();
  expect(metrics.hasMeasured.value).toBe(false);
  expect(metrics.width.value).toBe(0);
  expect(metrics.height.value).toBe(0);
});

test("publishes accepted Box size for a visual non-TTY document host", async () => {
  let metrics!: ReturnType<typeof useBoxMetrics>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    metrics = useBoxMetrics(target);
    return () => <Box ref={target} width={6} height={2} />;
  });

  const result = await render(App, {
    columns: 30,
    rows: 8,
    stdout: "stream",
  });
  try {
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 6, height: 2, hasMeasured: true });
  } finally {
    result.dispose();
  }
});

test("retains accepted size while suspended and settles queued changes on resume", async () => {
  const width = shallowRef(4);
  const visible = shallowRef(true);
  let metrics!: ReturnType<typeof useBoxMetrics>;
  const App = defineComponent(() => {
    const target = shallowRef<InstanceType<typeof Box> | null>(null);
    metrics = useBoxMetrics(target);
    return () => (visible.value ? <Box ref={target} width={width.value} height={1} /> : null);
  });

  const result = await render(App, { columns: 20, rows: 4 });
  try {
    expect({
      width: metrics.width.value,
      height: metrics.height.value,
      hasMeasured: metrics.hasMeasured.value,
    }).toEqual({ width: 4, height: 1, hasMeasured: true });
    const snapshot = () => ({
      width: metrics.width.value,
      height: metrics.height.value,
      left: metrics.left.value,
      top: metrics.top.value,
      hasMeasured: metrics.hasMeasured.value,
    });
    const accepted = snapshot();

    await result.terminal.suspend();
    width.value = 7;
    await nextTick();
    // Pending suspension retains the last accepted metrics.
    expect(snapshot()).toEqual(accepted);

    await result.terminal.resume();
    expect(snapshot()).toEqual({
      width: 7,
      height: 1,
      left: accepted.left,
      top: accepted.top,
      hasMeasured: true,
    });

    await result.terminal.suspend();
    const resized = snapshot();
    visible.value = false;
    await nextTick();
    expect(snapshot()).toEqual(resized);

    await result.terminal.resume();
    expect(metrics.hasMeasured.value).toBe(false);
    expect(metrics.width.value).toBe(0);
    expect(metrics.height.value).toBe(0);
  } finally {
    result.dispose();
  }
});
