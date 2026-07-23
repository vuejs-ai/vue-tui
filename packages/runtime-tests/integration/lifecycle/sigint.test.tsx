import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useInput, type TuiInputEvent } from "@vue-tui/runtime";

const noModifiers = {
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
  super: false,
  hyper: false,
} as const;

test.each([
  ["omitted", undefined],
  ["false", false],
] as const)("exitOnCtrlC %s delivers Ctrl+C as ordinary input", async (_label, exitOnCtrlC) => {
  const events: TuiInputEvent[] = [];
  const App = defineComponent(() => {
    useInput((event) => {
      events.push(event);
    });
    return () => <Text>x</Text>;
  });
  const host = exitOnCtrlC === undefined ? {} : { exitOnCtrlC };
  const result = await render(App, { host });

  await result.stdin.write("\x03");
  await result.stdin.write("x");

  expect(events).toEqual([
    {
      type: "key",
      key: { character: "c", ...noModifiers, ctrl: true },
    },
    { type: "text", text: "x" },
  ]);
  expect(result.terminal.rawMode.current).toBe(true);
  result.unmount();
});

test.each(["inline", "fullscreen"] as const)(
  "exitOnCtrlC true exits %s before delivering the exact key",
  async (mode) => {
    const events: TuiInputEvent[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        events.push(event);
      });
      return () => <Text>x</Text>;
    });
    const result = await render(App, { host: { mode, exitOnCtrlC: true } });

    await result.stdin.write("\x03");

    expect(events).toEqual([]);
    await expect(result.waitUntilExit()).resolves.toBeUndefined();
    expect(result.terminal.rawMode.current).toBe(false);
    result.dispose();
  },
);

test("exitOnCtrlC true delivers Ctrl+C with any other command modifier", async () => {
  const events: TuiInputEvent[] = [];
  const App = defineComponent(() => {
    useInput((event) => {
      events.push(event);
    });
    return () => <Text>x</Text>;
  });
  const result = await render(App, { host: { exitOnCtrlC: true } });

  for (const encodedModifiers of [6, 7, 13, 21, 37]) {
    await result.stdin.write(`\x1b[99;${encodedModifiers}u`);
  }

  expect(events).toEqual([
    {
      type: "key",
      key: { character: "c", ...noModifiers, shift: true, ctrl: true },
    },
    {
      type: "key",
      key: { character: "c", ...noModifiers, alt: true, ctrl: true },
    },
    {
      type: "key",
      key: { character: "c", ...noModifiers, ctrl: true, super: true },
    },
    {
      type: "key",
      key: { character: "c", ...noModifiers, ctrl: true, hyper: true },
    },
    {
      type: "key",
      key: { character: "c", ...noModifiers, ctrl: true, meta: true },
    },
  ]);

  await result.stdin.write("\x03");
  expect(events).toHaveLength(5);
  await expect(result.waitUntilExit()).resolves.toBeUndefined();
  result.dispose();
});

test("exitOnCtrlC uses logical primary identity rather than Kitty base-layout metadata", async () => {
  const events: TuiInputEvent[] = [];
  const App = defineComponent(() => {
    useInput((event) => {
      events.push(event);
    });
    return () => <Text>x</Text>;
  });
  const result = await render(App, { host: { exitOnCtrlC: true } });

  await result.stdin.write("\x1b[1089::99;5u");
  await result.stdin.write("x");

  expect(events).toEqual([
    {
      type: "key",
      key: { character: "с", ...noModifiers, ctrl: true },
    },
    { type: "text", text: "x" },
  ]);
  expect(result.terminal.rawMode.current).toBe(true);
  result.unmount();
});

test("exitOnCtrlC never interprets pasted Ctrl+C as the exit shortcut", async () => {
  const events: TuiInputEvent[] = [];
  const App = defineComponent(() => {
    useInput((event) => {
      events.push(event);
    });
    return () => <Text>x</Text>;
  });
  const result = await render(App, { host: { exitOnCtrlC: true } });

  await result.stdin.write("\x1b[200~\x03\x1b[201~");
  await result.stdin.write("x");

  expect(events).toEqual([
    { type: "paste", text: "\x03" },
    { type: "text", text: "x" },
  ]);
  expect(result.terminal.rawMode.current).toBe(true);
  result.unmount();
});
