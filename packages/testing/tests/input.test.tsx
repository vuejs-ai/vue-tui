import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { Text, useInput, type TuiInputEvent } from "@vue-tui/runtime";
import { render } from "../src/index.ts";

function inputApp(events: TuiInputEvent[]) {
  return defineComponent(() => {
    useInput((event) => {
      events.push(event);
    });
    return () => <Text>input</Text>;
  });
}

test("input writes settle complete text and finite Escape ambiguity", async () => {
  const events: TuiInputEvent[] = [];
  const result = await render(inputApp(events));
  try {
    await Promise.all([result.stdin.write("a"), result.stdin.write("b")]);
    await result.stdin.write("\x1b");

    expect(events).toEqual([
      { kind: "text", text: "a" },
      { kind: "text", text: "b" },
      { kind: "key", name: "escape", shift: false, alt: false, ctrl: false },
    ]);
  } finally {
    result.dispose();
  }
});

test("incomplete framing rejects without discarding bytes needed by a later write", async () => {
  const events: TuiInputEvent[] = [];
  const result = await render(inputApp(events));
  try {
    await expect(result.stdin.write("\x1b[200~partial")).rejects.toThrow(
      "incomplete terminal protocol frame",
    );
    expect(events).toEqual([]);

    await result.stdin.write("\x1b[201~");
    expect(events).toEqual([{ kind: "paste", text: "partial" }]);
  } finally {
    result.dispose();
  }
});

test("split UTF-8 bytes use the production decoder and retain an incomplete scalar", async () => {
  const events: TuiInputEvent[] = [];
  const result = await render(inputApp(events));
  try {
    await expect(result.stdin.write(Uint8Array.of(0xf0, 0x9f))).rejects.toThrow(
      "incomplete terminal protocol frame",
    );
    await result.stdin.write(Uint8Array.of(0x98, 0x80));
    expect(events).toEqual([{ kind: "text", text: "😀" }]);
  } finally {
    result.dispose();
  }
});

test("input writes fail while the modeled terminal is suspended", async () => {
  const events: TuiInputEvent[] = [];
  const result = await render(inputApp(events));
  try {
    await result.terminal.suspend();
    await expect(result.stdin.write("x")).rejects.toThrow("Test host bridge is suspended");
    await result.terminal.resume();
    await result.stdin.write("y");
    expect(events).toEqual([{ kind: "text", text: "y" }]);
  } finally {
    result.dispose();
  }
});
