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

test("exitOnCtrlC does not intercept Ctrl+C with another command modifier", async () => {
  const calls: string[] = [];
  const App = defineComponent(() => {
    useInput((input) => calls.push(input));
    return () => <Text>x</Text>;
  });
  const { stdin, unmount } = await render(App, { exitOnCtrlC: true });

  // Ctrl+Alt, Ctrl+Super, Ctrl+Hyper, and Ctrl+Meta are distinct shortcuts.
  for (const encodedModifiers of [7, 13, 21, 37]) {
    await stdin.write(`\x1b[99;${encodedModifiers}u`);
  }

  expect(calls).toEqual(["c", "c", "c", "c"]);
  unmount();
});

test("exitOnCtrlC recognizes a Kitty base-layout Ctrl+C", async () => {
  const handler = vi.fn();
  const App = defineComponent(() => {
    useInput(handler);
    return () => <Text>x</Text>;
  });
  const { stdin, waitUntilExit } = await render(App, { exitOnCtrlC: true });

  // The primary key follows the active layout; the protocol reports the US
  // base-layout key separately so framework shortcuts can remain stable.
  await stdin.write("\x1b[1089::99;5u");

  expect(handler).not.toHaveBeenCalled();
  await expect(waitUntilExit()).resolves.toBeUndefined();
});
