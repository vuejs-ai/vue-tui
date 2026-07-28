// Sequential: these tests replace process-level stdin raw-mode ownership.
import { defineComponent, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, useInput } from "@vue-tui/runtime";
import { createInternalMountOptions } from "../../../../packages/runtime/dist/internal.mjs";
import { makeRawTrackingStdin, makeTtyWritable } from "./test-streams.ts";

test.sequential("raw-mode teardown restores a pre-existing raw stdin baseline", () => {
  const stdout = makeTtyWritable();
  const stderr = makeTtyWritable();
  const { stream: stdin } = makeRawTrackingStdin(true);
  const app = createApp(defineComponent(() => () => null));

  app.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin,
      maxFps: 0,
      patchConsole: false,
    }),
  );
  app.unmount();

  expect(stdin.isRaw).toBe(true);
});

test.sequential("raw-mode acquisition rolls back when stdin.ref throws after taking a lease", () => {
  const stdout = makeTtyWritable();
  const stderr = makeTtyWritable();
  const { stream: stdin, calls: rawModeCalls } = makeRawTrackingStdin();
  let refBalance = 0;
  stdin.ref = (() => {
    refBalance++;
    throw new Error("stdin.ref failed");
  }) as NodeJS.ReadStream["ref"];
  stdin.unref = () => {
    refBalance--;
    return stdin;
  };
  const inputActive = shallowRef(false);
  const App = defineComponent(() => {
    useInput(() => undefined, { isActive: inputActive });
    return () => null;
  });
  const app = createApp(App);

  app.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin,
      maxFps: 0,
      patchConsole: false,
    }),
  );
  expect(() => {
    inputActive.value = true;
  }).toThrow("stdin.ref failed");

  expect({ isRaw: stdin.isRaw, rawModeCalls, refBalance }).toEqual({
    isRaw: false,
    rawModeCalls: [true, false],
    refBalance: 0,
  });
  app.unmount();
});

test.sequential("raw-byte ingress never installs a stream-level text decoder", () => {
  const stdout = makeTtyWritable();
  const stderr = makeTtyWritable();
  const { stream: stdin, calls: rawModeCalls } = makeRawTrackingStdin();
  let refBalance = 0;
  let setEncodingCalls = 0;
  stdin.ref = () => {
    refBalance++;
    return stdin;
  };
  stdin.unref = () => {
    refBalance--;
    return stdin;
  };
  stdin.setEncoding = (() => {
    setEncodingCalls++;
    throw new Error("stdin.setEncoding failed");
  }) as NodeJS.ReadStream["setEncoding"];
  const app = createApp(
    defineComponent(() => {
      useInput(() => undefined);
      return () => null;
    }),
  );

  app.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin,
      maxFps: 0,
      patchConsole: false,
    }),
  );

  expect({ isRaw: stdin.isRaw, rawModeCalls, refBalance, setEncodingCalls }).toEqual({
    isRaw: true,
    rawModeCalls: [true],
    refBalance: 1,
    setEncodingCalls: 0,
  });

  app.unmount();

  expect({ isRaw: stdin.isRaw, rawModeCalls, refBalance, setEncodingCalls }).toEqual({
    isRaw: false,
    rawModeCalls: [true, false],
    refBalance: 0,
    setEncodingCalls: 0,
  });
});

test.sequential("raw-mode teardown restores a custom stdin without ref or unref", () => {
  const stdout = makeTtyWritable();
  const stderr = makeTtyWritable();
  const { stream: stdin, calls: rawModeCalls } = makeRawTrackingStdin();
  Object.defineProperties(stdin, {
    ref: { configurable: true, value: undefined },
    unref: { configurable: true, value: undefined },
  });
  const app = createApp(
    defineComponent(() => {
      useInput(() => undefined);
      return () => null;
    }),
  );

  app.mount(
    createInternalMountOptions({
      stdout,
      stderr,
      stdin,
      maxFps: 0,
      patchConsole: false,
    }),
  );
  app.unmount();

  expect({ isRaw: stdin.isRaw, rawModeCalls }).toEqual({
    isRaw: false,
    rawModeCalls: [true, false],
  });
});
