import { test, expect } from "vite-plus/test";
import { PassThrough } from "node:stream";
import { connectDevtools, devState } from "./hmr.ts";
import { createApp } from "./render.ts";
import { createInternalMountOptions } from "./render.ts";
import { Text } from "./index.ts";
import { defineComponent, h, nextTick } from "vue";

test("dev overlay preserves the user root and full reload abandons stream observers", async () => {
  const out: string[] = [];
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdout, { isTTY: false });
  Object.assign(stderr, { isTTY: false });
  stdout.on("data", (chunk) => out.push(String(chunk)));
  const handlers = new Map<string, (payload: unknown) => void>();
  const sends: string[] = [];
  connectDevtools({
    on(event, callback) {
      handlers.set(event, callback);
    },
    send(event) {
      sends.push(event);
    },
  });
  const listenerBaseline = {
    stdoutError: stdout.listenerCount("error"),
    stdoutClose: stdout.listenerCount("close"),
    stderrError: stderr.listenerCount("error"),
    stdinError: stdin.listenerCount("error"),
    stdinClose: stdin.listenerCount("close"),
  };
  const Root = defineComponent({
    setup(_props, { expose }) {
      expose({ ping: () => "pong" });
      return () => h(Text, null, () => "hi");
    },
  });
  const app = createApp(Root);
  const instance = app.mount(
    createInternalMountOptions({
      stdin,
      stdout,
      stderr,
      liveUpdates: true,
      patchConsole: false,
      maxFps: 0,
    }),
  ) as unknown as { ping(): string };
  expect(instance.ping()).toBe("pong");

  devState.value = { type: "error", error: { message: "BUILD-FAIL-XYZ" } };
  await nextTick();
  await app.waitUntilRenderFlush();
  expect(out.join("")).toContain("BUILD-FAIL-XYZ"); // overlay rendered the error

  let exitSettled = false;
  void app.waitUntilExit().then(
    () => {
      exitSettled = true;
    },
    () => {
      exitSettled = true;
    },
  );
  handlers.get("vite:beforeFullReload")?.(undefined);
  for (let attempt = 0; attempt < 20; attempt++) {
    if (
      stdout.listenerCount("error") === listenerBaseline.stdoutError &&
      stdin.listenerCount("error") === listenerBaseline.stdinError
    ) {
      break;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  expect(sends).toContain("vue-tui:request-reload");
  expect(exitSettled).toBe(false);
  expect(stdout.listenerCount("error")).toBe(listenerBaseline.stdoutError);
  expect(stdout.listenerCount("close")).toBe(listenerBaseline.stdoutClose);
  expect(stderr.listenerCount("error")).toBe(listenerBaseline.stderrError);
  expect(stdin.listenerCount("error")).toBe(listenerBaseline.stdinError);
  expect(stdin.listenerCount("close")).toBe(listenerBaseline.stdinClose);
  stdout.destroy();
  stderr.destroy();
  stdin.destroy();
});

test("full reload synchronously abandons backpressure before the replacement mount", async () => {
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdout, { isTTY: false });
  Object.assign(stderr, { isTTY: false });
  const handlers = new Map<string, (payload: unknown) => void>();
  connectDevtools({
    on(event, callback) {
      handlers.set(event, callback);
    },
    send() {},
  });
  const listenerBaseline = {
    stdoutError: stdout.listenerCount("error"),
    stdoutClose: stdout.listenerCount("close"),
    stdinError: stdin.listenerCount("error"),
    stdinClose: stdin.listenerCount("close"),
  };
  const originalWrite = stdout.write.bind(stdout);
  let forceBackpressure = true;
  stdout.write = ((...args: unknown[]) => {
    const result = (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
    return forceBackpressure ? false : result;
  }) as NodeJS.WriteStream["write"];
  const Root = defineComponent(() => () => h(Text, null, () => "blocked"));
  const app = createApp(Root);

  app.mount(
    createInternalMountOptions({
      stdin,
      stdout,
      stderr,
      liveUpdates: true,
      patchConsole: false,
      maxFps: 0,
    }),
  );
  let exitSettled = false;
  void app.waitUntilExit().then(
    () => {
      exitSettled = true;
    },
    () => {
      exitSettled = true;
    },
  );

  handlers.get("vite:beforeFullReload")?.(undefined);
  forceBackpressure = false;
  stdout.write = originalWrite as NodeJS.WriteStream["write"];
  const replacement = createApp(Root);
  let replacementFailure: unknown;
  let replacementMounted = false;
  try {
    replacement.mount(
      createInternalMountOptions({
        stdin,
        stdout,
        stderr,
        liveUpdates: true,
        patchConsole: false,
        maxFps: 0,
      }),
    );
    replacementMounted = true;
  } catch (error) {
    replacementFailure = error;
  }

  if (replacementMounted) {
    replacement.unmount();
    await replacement.waitUntilExit();
  } else {
    // Let the pre-fix app finish its deferred teardown so a red regression
    // test does not leave process-global stream ownership behind.
    stdout.emit("drain");
    for (let attempt = 0; attempt < 20; attempt++) {
      if (
        stdout.listenerCount("error") === listenerBaseline.stdoutError &&
        stdin.listenerCount("error") === listenerBaseline.stdinError
      ) {
        break;
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  expect(replacementFailure).toBeUndefined();
  expect(exitSettled).toBe(false);
  expect(stdout.listenerCount("error")).toBe(listenerBaseline.stdoutError);
  expect(stdout.listenerCount("close")).toBe(listenerBaseline.stdoutClose);
  expect(stdin.listenerCount("error")).toBe(listenerBaseline.stdinError);
  expect(stdin.listenerCount("close")).toBe(listenerBaseline.stdinClose);
  stdout.destroy();
  stderr.destroy();
  stdin.destroy();
});
