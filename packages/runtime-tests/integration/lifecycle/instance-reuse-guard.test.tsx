import { defineComponent } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { createApp, Text } from "@vue-tui/runtime";
import { makeFakeStdin, makeFakeWritable } from "./test-streams.ts";

const App = defineComponent(() => () => <Text>Hello</Text>);

test("a busy stdout does not consume the skipped app's one mount", async () => {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const warning = vi.spyOn(process.stderr, "write").mockImplementation(() => true);

  const owner = createApp(App);
  owner.mount({ stdout, stderr, stdin, patchConsole: false });

  const skipped = createApp(App);
  skipped.mount({ stdout, stderr, stdin, patchConsole: false });
  expect(warning.mock.calls.flat().join("")).toContain("already has a live app");

  owner.unmount();
  await owner.waitUntilExit();
  warning.mockClear();

  skipped.mount({ stdout, stderr, stdin, patchConsole: false });
  await skipped.waitUntilRenderFlush();
  expect(warning).not.toHaveBeenCalled();

  skipped.unmount();
  await skipped.waitUntilExit();
  warning.mockRestore();
});

test("a failed real mount cannot be retried and the retry reads no options", () => {
  const stdout = makeFakeWritable();
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
      return makeFakeWritable();
    },
  });
  expect(() => app.mount(retry)).toThrow("can only be mounted once");
  expect(readStdout).toBe(false);
});
