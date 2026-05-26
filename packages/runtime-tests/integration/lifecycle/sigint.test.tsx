import { defineComponent } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useInput } from "@vue-tui/runtime";

test("exitOnCtrlC intercepts \\x03 and exits the app", async () => {
  const handler = vi.fn();
  const App = defineComponent(() => {
    useInput(handler);
    return () => <Text>x</Text>;
  });
  const { stdin, waitUntilExit } = await render(App, { exitOnCtrlC: true });

  await stdin.write("\x03");
  // \x03 is intercepted before reaching useInput handlers
  expect(handler).not.toHaveBeenCalled();
  await expect(waitUntilExit()).resolves.toBeUndefined();
});

test("exitOnCtrlC=false does not intercept \\x03", async () => {
  const calls: Array<{ input: string }> = [];
  const App = defineComponent(() => {
    useInput((input) => calls.push({ input }));
    return () => <Text>x</Text>;
  });
  const { stdin, unmount } = await render(App, { exitOnCtrlC: false });

  await stdin.write("\x03");
  // With exitOnCtrlC=false, Ctrl+C reaches the useInput handler
  expect(calls.length).toBe(1);
  expect(calls[0]?.input).toBe("c");
  unmount();
});
