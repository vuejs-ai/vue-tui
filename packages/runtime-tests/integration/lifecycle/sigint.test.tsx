import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text } from "@vue-tui/runtime";

test("exitOnCtrlC registers a SIGINT handler that unmount removes", async () => {
  const before = process.listenerCount("SIGINT");

  const App = defineComponent(() => () => <Text>x</Text>);
  const { unmount } = await render(App, { exitOnCtrlC: true });

  expect(process.listenerCount("SIGINT")).toBe(before + 1);
  unmount();
  expect(process.listenerCount("SIGINT")).toBe(before);
});

test("exitOnCtrlC=false registers no SIGINT handler", async () => {
  const before = process.listenerCount("SIGINT");

  const App = defineComponent(() => () => <Text>x</Text>);
  const { unmount } = await render(App, { exitOnCtrlC: false });

  expect(process.listenerCount("SIGINT")).toBe(before);
  unmount();
});
