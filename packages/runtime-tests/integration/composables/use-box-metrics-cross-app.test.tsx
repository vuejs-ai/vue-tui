import { PassThrough } from "node:stream";
import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, createApp, Text, useBoxMetrics } from "@vue-tui/runtime";
import { createInternalMountOptions } from "../../../runtime/dist/internal.mjs";

function makeTtyOutput(): NodeJS.WriteStream {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, { isTTY: true, columns: 20, rows: 4 });
  return stream;
}

function makeTtyInput(): NodeJS.ReadStream {
  const stream = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stream, {
    isTTY: true,
    setRawMode() {
      return stream;
    },
    setEncoding() {
      return stream;
    },
    ref() {},
    unref() {},
  });
  return stream;
}

async function within<T>(promise: Promise<T>, label: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      promise,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(new Error(`${label} timed out`)), 500);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function mountPlainApp(label: string): Promise<void> {
  const stdout = makeTtyOutput();
  const stderr = makeTtyOutput();
  const stdin = makeTtyInput();
  const App = defineComponent(() => () => <Text>{label}</Text>);
  const app = createApp(App);

  try {
    app.mount(
      createInternalMountOptions({
        stdout,
        stderr,
        stdin,
        liveUpdates: true,
        maxFps: 0,
        patchConsole: false,
      }),
    );
    await within(app.waitUntilRenderFlush(), `${label} render flush`);
  } finally {
    app.unmount();
    await within(Promise.allSettled([app.waitUntilExit()]), `${label} exit`);
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
}

test("rejects a foreign Box without contaminating later apps", async () => {
  const foreignTarget = shallowRef<InstanceType<typeof Box> | null>(null);
  const Owner = defineComponent(() => () => (
    <Box ref={foreignTarget}>
      <Text>owner</Text>
    </Box>
  ));
  const Observer = defineComponent(() => {
    useBoxMetrics(foreignTarget);
    return () => <Text>observer</Text>;
  });

  const ownerStdout = makeTtyOutput();
  const ownerStderr = makeTtyOutput();
  const ownerStdin = makeTtyInput();
  const observerStdout = makeTtyOutput();
  const observerStderr = makeTtyOutput();
  const observerStdin = makeTtyInput();
  const owner = createApp(Owner);
  const observer = createApp(Observer);
  observer.config.warnHandler = () => {};

  try {
    owner.mount(
      createInternalMountOptions({
        stdout: ownerStdout,
        stderr: ownerStderr,
        stdin: ownerStdin,
        liveUpdates: true,
        maxFps: 0,
        patchConsole: false,
      }),
    );
    await owner.waitUntilRenderFlush();

    const observerExited = within(observer.waitUntilExit(), "foreign target exit");
    expect(() =>
      observer.mount(
        createInternalMountOptions({
          stdout: observerStdout,
          stderr: observerStderr,
          stdin: observerStdin,
          liveUpdates: true,
          maxFps: 0,
          patchConsole: false,
        }),
      ),
    ).toThrow("useBoxMetrics() target belongs to a different vue-tui app");
    await expect(observerExited).rejects.toThrow(
      "useBoxMetrics() target belongs to a different vue-tui app",
    );
  } finally {
    observer.unmount();
    owner.unmount();
    await Promise.allSettled([observer.waitUntilExit(), owner.waitUntilExit()]);
    ownerStdin.destroy();
    ownerStdout.destroy();
    ownerStderr.destroy();
    observerStdin.destroy();
    observerStdout.destroy();
    observerStderr.destroy();
  }

  await mountPlainApp("after foreign target");
});

test("rejects a dynamic non-Box retarget through Vue's update", async () => {
  const target = shallowRef<InstanceType<typeof Box> | null>(null);
  const renderBox = shallowRef(true);
  const Invalid = defineComponent(() => {
    useBoxMetrics(target);
    return () =>
      renderBox.value ? (
        <Box ref={target}>
          <Text>box</Text>
        </Box>
      ) : (
        <Text ref={target}>wrong target</Text>
      );
  });
  const stdout = makeTtyOutput();
  const stderr = makeTtyOutput();
  const stdin = makeTtyInput();
  const app = createApp(Invalid);
  app.config.warnHandler = () => {};

  try {
    app.mount(
      createInternalMountOptions({
        stdout,
        stderr,
        stdin,
        liveUpdates: true,
        maxFps: 0,
        patchConsole: false,
      }),
    );
    await app.waitUntilRenderFlush();
    renderBox.value = false;
    await expect(nextTick()).rejects.toThrow(
      "useBoxMetrics() target must be a ref bound directly to <Box>",
    );
    app.unmount();
    await expect(within(app.waitUntilExit(), "dynamic non-Box target clean exit")).resolves.toBe(
      undefined,
    );
  } finally {
    app.unmount();
    await Promise.allSettled([app.waitUntilExit()]);
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});
