import { PassThrough } from "node:stream";
import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp } from "./render.ts";
import { createTestHostBridge } from "./testing.ts";

function makeInput(): NodeJS.ReadStream {
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

function makeOutput(): NodeJS.WriteStream {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, { isTTY: false, columns: 80 });
  return stream;
}

test("validates the complete test-host bridge option surface", () => {
  expect(() => createTestHostBridge(null as never)).toThrow(
    "test host bridge options must be an object",
  );
  expect(() => createTestHostBridge({ unknown: true } as never)).toThrow(
    'Unknown test host bridge option "unknown"',
  );
  expect(() => createTestHostBridge({ onFrame: true } as never)).toThrow(
    "test host bridge onFrame must be a function",
  );
});

test("rejects bridge operations before mount", async () => {
  const bridge = createTestHostBridge();

  await expect(bridge.writeInput("x")).rejects.toThrow(
    "Test host bridge has not mounted an application",
  );
  await expect(bridge.suspend()).rejects.toThrow("Test host bridge has not mounted an application");
  await expect(bridge.resume()).rejects.toThrow("Test host bridge is not suspended");
});

test("owns one mount and exposes active, suspended, and inactive phases", async () => {
  const frames: string[] = [];
  const bridge = createTestHostBridge({ onFrame: (frame) => frames.push(frame.dynamic) });
  const app = createApp(defineComponent(() => () => null));
  const stdin = makeInput();
  const stdout = makeOutput();
  const stderr = makeOutput();

  try {
    bridge.mount(app, { stdin, stdout, stderr, patchConsole: false });
    expect(() => bridge.mount(app)).toThrow("Test host bridge mount() can be called only once");
    expect(frames).toEqual([""]);

    await bridge.suspend();
    await expect(bridge.writeInput("x")).rejects.toThrow("Test host bridge is suspended");
    await bridge.resume();

    app.unmount();
    await app.waitUntilExit();
    await expect(bridge.writeInput("x")).rejects.toThrow(
      "Test host bridge application is no longer mounted",
    );
    await expect(bridge.suspend()).rejects.toThrow(
      "Test host bridge application is no longer mounted",
    );
    await expect(bridge.resume()).rejects.toThrow("Test host bridge is not suspended");
  } finally {
    app.unmount();
    await Promise.allSettled([app.waitUntilExit()]);
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("does not pass repository-only controls through the caller-owned mount property", async () => {
  const bridge = createTestHostBridge();
  const app = createApp(defineComponent(() => () => null));
  const originalMount = app.mount.bind(app);
  let interceptedOptions: unknown;
  app.mount = ((options) => {
    interceptedOptions = options;
    return originalMount(options);
  }) as typeof app.mount;
  const stdin = makeInput();
  const stdout = makeOutput();
  const stderr = makeOutput();

  try {
    bridge.mount(app, { stdin, stdout, stderr, patchConsole: false });
    expect(interceptedOptions).toBeUndefined();
  } finally {
    app.unmount();
    await Promise.allSettled([app.waitUntilExit()]);
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});
