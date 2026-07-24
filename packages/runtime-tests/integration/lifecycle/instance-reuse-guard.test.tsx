import { defineComponent } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

const App = defineComponent(() => () => <Text>Hello</Text>);

test("a busy stdout throws without warning or consuming the blocked app", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const warning = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  const owner = createApp(App);
  owner.mount({ stdout, stderr, stdin, patchConsole: false });

  const blocked = createApp(App);
  expect(() => blocked.mount({ stdout, stderr, stdin, patchConsole: false })).toThrow(
    "selected stdout already has a live app",
  );
  expect(warning).not.toHaveBeenCalled();

  owner.unmount();
  await owner.waitUntilExit();

  blocked.mount({ stdout, stderr, stdin, patchConsole: false });
  await blocked.waitUntilRenderFlush();
  expect(warning).not.toHaveBeenCalled();

  blocked.unmount();
  await blocked.waitUntilExit();
  warning.mockRestore();
});

test("a deterministic stream preflight failure does not consume the app", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(App);
  expect(() =>
    app.mount(
      Object.defineProperty({ stdout }, "stdin", {
        enumerable: true,
        get() {
          throw new Error("stdin getter failed");
        },
      }),
    ),
  ).toThrow("stdin getter failed");

  let readStdout = false;
  const retry = Object.defineProperty({}, "stdout", {
    enumerable: true,
    get() {
      readStdout = true;
      return stdout;
    },
  });
  Object.assign(retry, { stdin, stderr, patchConsole: false });
  app.mount(retry);
  expect(readStdout).toBe(true);
  app.unmount();
  await app.waitUntilExit();
});

test("patchConsole is snapshotted and validated before a mount attempt is consumed", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const app = createApp(App);
  const getterFailure = new Error("patchConsole getter failed");
  const throwingOptions = Object.defineProperty({ stdout, stderr, stdin }, "patchConsole", {
    enumerable: true,
    get() {
      throw getterFailure;
    },
  });

  expect(() => app.mount(throwingOptions)).toThrow(getterFailure);
  expect(() =>
    app.mount({
      stdout,
      stderr,
      stdin,
      patchConsole: "yes" as unknown as boolean,
    }),
  ).toThrow('Mount option "patchConsole" must be a boolean.');

  app.mount({ stdout, stderr, stdin, patchConsole: false });
  app.unmount();
  await app.waitUntilExit();
});

test("stdout ownership wins before Fullscreen capability and leaves both failures retryable", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  Object.assign(stdout, { isTTY: false, columns: 0, rows: 0 });
  const owner = createApp(App);
  const blocked = createApp(App);

  owner.mount({ stdout, stderr, stdin, patchConsole: false });
  let readOwnedCapability = false;
  Object.defineProperty(stdout, "columns", {
    configurable: true,
    get() {
      readOwnedCapability = true;
      throw new Error("owned stdout capability must not be read");
    },
  });
  expect(() =>
    blocked.mount({
      stdout,
      stderr,
      stdin,
      mode: "fullscreen",
      patchConsole: false,
    }),
  ).toThrow("selected stdout already has a live app");
  expect(readOwnedCapability).toBe(false);
  Object.defineProperty(stdout, "columns", {
    configurable: true,
    writable: true,
    value: 0,
  });

  owner.unmount();
  await owner.waitUntilExit();

  // Fullscreen on non-TTY is the supported document host after ownership releases.
  blocked.mount({
    stdout,
    stderr,
    stdin,
    mode: "fullscreen",
    patchConsole: false,
  });
  blocked.unmount();
  await blocked.waitUntilExit();
});
