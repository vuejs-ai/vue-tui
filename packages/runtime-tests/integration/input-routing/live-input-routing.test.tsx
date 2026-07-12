import { defineComponent } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { createApp, Text, useFocus, useInput, type RenderMode } from "@vue-tui/runtime";
import { makeFakeStdin, makeFakeWritable } from "../lifecycle/test-streams.ts";

const modes = ["inline", "fullscreen"] as const satisfies readonly RenderMode[];

function mountOptions(mode: RenderMode) {
  const { stream: stdin } = makeFakeStdin();
  const stdout = makeFakeWritable({ columns: 80, rows: 24 });
  const stderr = makeFakeWritable({ columns: 80, rows: 24 });
  return {
    stdin,
    stdout,
    stderr,
    mount: {
      mode,
      stdin,
      stdout,
      stderr,
      liveUpdates: true,
      maxFps: 0,
      patchConsole: false,
      kittyKeyboard: { mode: "disabled" as const },
    },
  };
}

describe.each(modes)("live input routing in %s mode", (mode) => {
  test("delays Tab and Escape defaults until after compatibility input delivery", async () => {
    const observed: string[] = [];
    let currentFocus = () => "unmounted";
    const App = defineComponent(() => {
      const first = useFocus({ id: "first", autoFocus: true });
      const second = useFocus({ id: "second" });
      currentFocus = () =>
        first.isFocused.value ? "first" : second.isFocused.value ? "second" : "none";
      useInput((_input, key) => {
        if (key.tab) {
          observed.push(`tab:${currentFocus()}`);
        }
        if (key.escape) {
          observed.push(`escape:${currentFocus()}`);
        }
      });
      return () => <Text>ready</Text>;
    });

    const streams = mountOptions(mode);
    const app = createApp(App);
    app.mount({ ...streams.mount, exitOnCtrlC: false });
    try {
      streams.stdin.push("\t");
      expect(observed).toEqual(["tab:first"]);
      expect(currentFocus()).toBe("second");

      streams.stdin.push("\x1b");
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(observed).toEqual(["tab:first", "escape:second"]);
      expect(currentFocus()).toBe("none");
    } finally {
      app.unmount();
    }
  });

  test("delays Ctrl+C exit until after compatibility input delivery", async () => {
    const observed: string[] = [];
    const App = defineComponent(() => {
      useInput((input, key) => {
        if (key.ctrl && input === "c") observed.push("handler");
      });
      return () => <Text>ready</Text>;
    });

    const streams = mountOptions(mode);
    const app = createApp(App);
    app.mount({ ...streams.mount, exitOnCtrlC: true });
    streams.stdin.push("\x03");
    await app.waitUntilExit();
    expect(observed).toEqual(["handler"]);
  });
});
