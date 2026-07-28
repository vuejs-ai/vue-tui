import { defineComponent } from "vue";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { renderToString, Text, useInput, type TuiInputEvent } from "@vue-tui/runtime";
import { noModifiers } from "./harness.ts";

describe("minimum normalized public input", () => {
  test("broadcasts one immutable event to every active subscriber without an ordering contract", async () => {
    const firstEvents: TuiInputEvent[] = [];
    const secondEvents: TuiInputEvent[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        firstEvents.push(event);
        return "ignored";
      });
      useInput((event) => {
        secondEvents.push(event);
        return Promise.resolve("ignored");
      });
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("\x03");

    expect(firstEvents).toHaveLength(1);
    expect(secondEvents).toHaveLength(1);
    expect(firstEvents[0]).toBe(secondEvents[0]);
    expect(firstEvents[0]).toEqual({
      type: "key",
      key: {
        character: "c",
        ...noModifiers,
        ctrl: true,
      },
    });
    expect(Object.isFrozen(firstEvents[0])).toBe(true);
    expect(Object.isFrozen(firstEvents[0]?.type === "key" ? firstEvents[0].key : undefined)).toBe(
      true,
    );
    expect(result.terminal.rawMode.current).toBe(true);
    result.unmount();
  });

  test("delivers insertion text, complete paste, named keys, and shortcut identities", async () => {
    const events: TuiInputEvent[] = [];
    const payload = "\x03\x1b[A\x1b[?31u";
    const App = defineComponent(() => {
      useInput((event) => {
        events.push(event);
      });
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("hello");
    await result.stdin.write(`\x1b[200~${payload}\x1b[201~`);
    await result.stdin.write("\x1b[A");
    await result.stdin.write("\x1bA");

    expect(events).toEqual([
      { type: "text", text: "hello" },
      { type: "paste", text: payload },
      { type: "key", key: { name: "up", ...noModifiers } },
      {
        type: "key",
        key: { character: "a", ...noModifiers, shift: true, alt: true },
      },
    ]);
    result.unmount();
  });

  test("does not expose release, unknown private, uninterpreted, or pointer facts", async () => {
    const handler = vi.fn<(event: TuiInputEvent) => void>();
    const App = defineComponent(() => {
      useInput(handler);
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    for (const sequence of [
      "\x1b[0;1:3;229u",
      "\x1b[99;5:3u",
      "\x1b[58000u",
      "\x1b[?25h",
      "\x1b[<0;4;5M",
    ]) {
      await result.stdin.write(sequence);
    }

    expect(handler).not.toHaveBeenCalled();
    result.unmount();
  });

  test("delivers a Kitty key repeat as another ordinary event", async () => {
    const events: TuiInputEvent[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        events.push(event);
      });
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("\x1b[1;5:1A");
    await result.stdin.write("\x1b[1;5:2A");

    const expected = {
      type: "key",
      key: { name: "up", ...noModifiers, ctrl: true },
    };
    expect(events).toEqual([expected, expected]);
    result.unmount();
  });

  test("keeps an active string-render registration inert", () => {
    const handler = vi.fn<(event: TuiInputEvent) => void>();
    const App = defineComponent(() => {
      useInput(handler);
      return () => <Text>string input</Text>;
    });

    expect(renderToString(App)).toContain("string input");
    expect(handler).not.toHaveBeenCalled();
  });
});
