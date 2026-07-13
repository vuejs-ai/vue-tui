import { defineComponent, shallowRef, type ComponentPublicInstance } from "vue";
import { describe, expect, test } from "vite-plus/test";
import { Box, createApp, Text, useFocus, useInput, type RenderMode } from "@vue-tui/runtime";
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
  test("runs application globals before Tab traversal and leaves Escape without a focus default", async () => {
    const observed: string[] = [];
    let currentFocus = () => "unmounted";
    const App = defineComponent(() => {
      const firstHost = shallowRef<ComponentPublicInstance | null>(null);
      const secondHost = shallowRef<ComponentPublicInstance | null>(null);
      const first = useFocus(firstHost, { autoFocus: true });
      const second = useFocus(secondHost);
      currentFocus = () =>
        first.isFocused.value ? "first" : second.isFocused.value ? "second" : "none";
      useInput((event) => {
        if (event.kind === "key" && event.key.name === "tab") {
          observed.push(`tab:${currentFocus()}`);
        }
        if (event.kind === "key" && event.key.name === "escape") {
          observed.push(`escape:${currentFocus()}`);
        }
        return "continue";
      });
      return () => (
        <Box>
          <Box ref={firstHost}>
            <Text>first</Text>
          </Box>
          <Box ref={secondHost}>
            <Text>second</Text>
          </Box>
        </Box>
      );
    });

    const streams = mountOptions(mode);
    const app = createApp(App);
    app.mount({ ...streams.mount });
    try {
      streams.stdin.push("\t");
      expect(observed).toEqual(["tab:first"]);
      expect(currentFocus()).toBe("second");

      streams.stdin.push("\x1b");
      await new Promise((resolve) => setTimeout(resolve, 30));
      expect(observed).toEqual(["tab:first", "escape:second"]);
      expect(currentFocus()).toBe("second");
    } finally {
      app.unmount();
    }
  });

  test("delays Ctrl+C exit until after application-global input delivery", async () => {
    const observed: string[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        if (event.kind === "key" && event.key.modifiers.ctrl && event.key.name === "c") {
          observed.push("handler");
        }
        return "continue";
      });
      return () => <Text>ready</Text>;
    });

    const streams = mountOptions(mode);
    const app = createApp(App);
    app.mount({ ...streams.mount });
    streams.stdin.push("\x03");
    await app.waitUntilExit();
    expect(observed).toEqual(["handler"]);
  });

  test("ends logical defaults immediately while coalescing the final physical release", async () => {
    const isActive = shallowRef(true);
    const observed: string[] = [];
    const App = defineComponent(() => {
      useInput(
        (event) => {
          observed.push(event.sequence);
          return "continue";
        },
        { isActive },
      );
      return () => <Text>ready</Text>;
    });

    const streams = mountOptions(mode);
    const app = createApp(App);
    app.mount({ ...streams.mount });
    let exited = false;
    void app.waitUntilExit().then(() => {
      exited = true;
    });
    try {
      isActive.value = false;
      // The raw/listener lease remains until a microtask so a same-tick
      // replacement can acquire it without terminal mode churn. Input that
      // begins in this physical-only window has no logical route or default.
      streams.stdin.push("\x03");
      await Promise.resolve();
      await Promise.resolve();

      expect(observed).toEqual([]);
      expect(exited).toBe(false);
    } finally {
      app.unmount();
    }
  });

  test("publishes a global before acquisition input can gain logical defaults", async () => {
    const isActive = shallowRef(false);
    const observed: string[] = [];
    const App = defineComponent(() => {
      useInput(
        (event) => {
          observed.push(event.sequence);
          return "consume";
        },
        { isActive },
      );
      return () => <Text>ready</Text>;
    });

    const streams = mountOptions(mode);
    const originalOn = streams.stdin.on.bind(streams.stdin) as (
      event: string | symbol,
      listener: (...args: never[]) => void,
    ) => NodeJS.ReadStream;
    let emitOnDataAttach = false;
    streams.stdin.on = ((event: string | symbol, listener: (...args: never[]) => void) => {
      const result = originalOn(event, listener);
      if (event === "data" && emitOnDataAttach) {
        emitOnDataAttach = false;
        streams.stdin.emit("data", Buffer.from("\x03"));
      }
      return result;
    }) as NodeJS.ReadStream["on"];

    const app = createApp(App);
    app.mount({ ...streams.mount });
    let exited = false;
    void app.waitUntilExit().then(() => {
      exited = true;
    });
    try {
      emitOnDataAttach = true;
      isActive.value = true;
      streams.stdin.push("x");
      await Promise.resolve();
      await Promise.resolve();

      expect(observed).toEqual(["x"]);
      expect(exited).toBe(false);
    } finally {
      app.unmount();
    }
  });
});
