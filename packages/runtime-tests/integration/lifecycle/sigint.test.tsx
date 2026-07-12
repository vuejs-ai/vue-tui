import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useInput, type TuiInputEvent } from "@vue-tui/runtime";

test("Ctrl+C reaches useInput before its delayed exit default", async () => {
  const events: TuiInputEvent[] = [];
  const App = defineComponent(() => {
    useInput((event) => {
      events.push(event);
      return "continue";
    });
    return () => <Text>x</Text>;
  });
  const { stdin, waitUntilExit } = await render(App);

  await stdin.write("\x03");
  expect(events).toHaveLength(1);
  expect(events[0]).toMatchObject({
    kind: "key",
    sequence: "\x03",
    key: { name: "c", modifiers: { ctrl: true } },
  });
  await expect(waitUntilExit()).resolves.toBeUndefined();
});

test("a handler can prevent the Ctrl+C default for one event", async () => {
  const events: TuiInputEvent[] = [];
  const App = defineComponent(() => {
    useInput((event) => {
      events.push(event);
      return {
        action: "performed",
        routing: "continue",
        defaultAction: "prevent",
        external: "block",
      };
    });
    return () => <Text>x</Text>;
  });
  const { stdin, unmount } = await render(App);

  await stdin.write("\x03");
  expect(events).toHaveLength(1);
  unmount();
});

test("Ctrl+C with another command modifier is not the exit shortcut", async () => {
  const sequences: string[] = [];
  const App = defineComponent(() => {
    useInput((event) => {
      sequences.push(event.sequence);
      return "continue";
    });
    return () => <Text>x</Text>;
  });
  const { stdin, unmount } = await render(App);

  for (const encodedModifiers of [7, 13, 21, 37]) {
    await stdin.write(`\x1b[99;${encodedModifiers}u`);
  }

  expect(sequences).toEqual(["\x1b[99;7u", "\x1b[99;13u", "\x1b[99;21u", "\x1b[99;37u"]);
  unmount();
});

test("Ctrl+C recognizes a Kitty base-layout codepoint", async () => {
  const events: TuiInputEvent[] = [];
  const App = defineComponent(() => {
    useInput((event) => {
      events.push(event);
      return "continue";
    });
    return () => <Text>x</Text>;
  });
  const { stdin, waitUntilExit } = await render(App);

  await stdin.write("\x1b[1089::99;5u");

  expect(events[0]).toMatchObject({
    kind: "key",
    key: { primaryCodepoint: 1089, baseLayoutCodepoint: 99, modifiers: { ctrl: true } },
  });
  await expect(waitUntilExit()).resolves.toBeUndefined();
});
