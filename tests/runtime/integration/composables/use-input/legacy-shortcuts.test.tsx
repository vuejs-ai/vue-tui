import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useInput, type TuiInputEvent } from "@vue-tui/runtime";
import { noModifiers } from "./harness.ts";

test.each(["[", "]", "\\", "^", "_", "-", ".", "é", "É", "Ω", "İ", "🙂"])(
  "delivers legacy Alt+%s through the public subscription",
  async (character) => {
    const events: TuiInputEvent[] = [];
    const App = defineComponent(() => {
      useInput((event) => events.push(event));
      return () => <Text>listening</Text>;
    });
    const result = await render(App);
    try {
      await result.stdin.write(`\x1b${character}`);
      expect(events).toEqual([{ type: "key", key: { character, ...noModifiers, alt: true } }]);
      await result.stdin.write("\x1b[A");
      expect(events[1]).toEqual({ type: "key", key: { name: "up", ...noModifiers } });
    } finally {
      result.dispose();
    }
  },
);

test("delivers control punctuation and Alt-prefixed control keys", async () => {
  const events: TuiInputEvent[] = [];
  const App = defineComponent(() => {
    useInput((event) => events.push(event));
    return () => <Text>listening</Text>;
  });
  const result = await render(App);
  try {
    for (const sequence of ["\x1c", "\x1d", "\x1e", "\x1f", "\x1b\x03", "\x1b\r"]) {
      await result.stdin.write(sequence);
    }
    expect(events).toEqual([
      ...["\\", "]", "^", "_"].map((character) => ({
        type: "key",
        key: { character, ...noModifiers, ctrl: true },
      })),
      { type: "key", key: { character: "c", ...noModifiers, ctrl: true, alt: true } },
      { type: "key", key: { name: "enter", ...noModifiers, alt: true } },
    ]);
  } finally {
    result.dispose();
  }
});

test("delivers Escape before one complete UTF-8 paste", async () => {
  const events: TuiInputEvent[] = [];
  const App = defineComponent(() => {
    useInput((event) => events.push(event));
    return () => <Text>listening</Text>;
  });
  const result = await render(App);
  const payload = "hello 🙂 é\n".repeat(2_048);
  try {
    await result.stdin.write(Buffer.from(`\x1b\x1b[200~${payload}\x1b[201~`));
    expect(events).toEqual([
      { type: "key", key: { name: "escape", ...noModifiers } },
      { type: "paste", text: payload },
    ]);
  } finally {
    result.dispose();
  }
});
