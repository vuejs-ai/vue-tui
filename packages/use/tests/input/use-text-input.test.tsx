import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { Text, useInput, type TuiInputEvent } from "@vue-tui/runtime";
import { render } from "@vue-tui/testing";
import { useTextInput } from "../../src/input/use-text-input.ts";

type TextInputEvent = Extract<TuiInputEvent, { readonly type: "text" }>;

const noModifiers = {
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
  super: false,
  hyper: false,
} as const;

test("delivers a plain text event without replacing the frozen event", async () => {
  const allEvents: TuiInputEvent[] = [];
  const textEvents: TextInputEvent[] = [];
  const App = defineComponent(() => {
    useInput((event) => allEvents.push(event));
    useTextInput((event) => textEvents.push(event));
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    await result.stdin.write("a");

    expect(textEvents).toEqual([{ type: "text", text: "a" }]);
    expect(textEvents[0]).toBe(allEvents[0]);
    expect(Object.isFrozen(textEvents[0])).toBe(true);
  } finally {
    result.dispose();
  }
});

test("keeps reliable logical-key information on enhanced text input", async () => {
  const allEvents: TuiInputEvent[] = [];
  const textEvents: TextInputEvent[] = [];
  const App = defineComponent(() => {
    useInput((event) => allEvents.push(event));
    useTextInput((event) => textEvents.push(event));
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    await result.stdin.write("\x1b[97:65;2;65u");

    expect(textEvents).toEqual([
      {
        type: "text",
        text: "A",
        key: { character: "a", ...noModifiers, shift: true },
      },
    ]);
    expect(textEvents[0]).toBe(allEvents[0]);
    expect(Object.isFrozen(textEvents[0]?.key)).toBe(true);
  } finally {
    result.dispose();
  }
});

test("does not deliver key or paste events", async () => {
  const handler = vi.fn<(event: TextInputEvent) => void>();
  const App = defineComponent(() => {
    useTextInput(handler);
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    await result.stdin.write("\x1b[A");
    await result.stdin.write("\x1b[200~pasted\x1b[201~");

    expect(handler).not.toHaveBeenCalled();
  } finally {
    result.dispose();
  }
});

test("rejects a non-function direct handler before input acquisition", async () => {
  const readIsActive = vi.fn(() => true);
  const options = Object.defineProperty({}, "isActive", {
    enumerable: true,
    get: readIsActive,
  }) as { readonly isActive: boolean };
  const App = defineComponent(() => {
    useTextInput(null as never, options);
    return () => <Text>unreachable</Text>;
  });

  await expect(render(App)).rejects.toThrow("useTextInput() handler must be a function");
  expect(readIsActive).not.toHaveBeenCalled();
});

test("treats a callable ref-like function as the direct handler", async () => {
  const valueHandler = vi.fn<(event: TextInputEvent) => void>();
  const directHandler = vi.fn<(event: TextInputEvent) => void>();
  const valueGetter = vi.fn(() => valueHandler);
  Object.defineProperties(directHandler, {
    __v_isRef: { value: true },
    value: { get: valueGetter },
  });
  const App = defineComponent(() => {
    useTextInput(directHandler);
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    await result.stdin.write("\x1b[A");
    await result.stdin.write("a");

    expect(directHandler).toHaveBeenCalledTimes(1);
    expect(directHandler.mock.calls[0]?.[0]).toEqual({ type: "text", text: "a" });
    expect(valueGetter).not.toHaveBeenCalled();
    expect(valueHandler).not.toHaveBeenCalled();
  } finally {
    result.dispose();
  }
});

test("resolves a live handler ref for each matching event", async () => {
  const firstHandler = vi.fn<(event: TextInputEvent) => void>();
  const secondHandler = vi.fn<(event: TextInputEvent) => void>();
  const handler = shallowRef<(event: TextInputEvent) => void>(firstHandler);
  const App = defineComponent(() => {
    useTextInput(handler);
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    await result.stdin.write("a");
    handler.value = secondHandler;
    await result.stdin.write("b");

    expect(firstHandler.mock.calls.map(([event]) => event.text)).toEqual(["a"]);
    expect(secondHandler.mock.calls.map(([event]) => event.text)).toEqual(["b"]);
  } finally {
    result.dispose();
  }
});

test("reads an invalid live handler only after a text event arrives", async () => {
  const handler = shallowRef<((event: TextInputEvent) => void) | null>(null);
  const App = defineComponent(() => {
    useTextInput(handler as never);
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    await result.stdin.write("\x1b[A");
    await result.stdin.write("\x1b[200~pasted\x1b[201~");

    const exited = result.waitUntilExit();
    await expect(result.stdin.write("a")).rejects.toThrow(
      "useTextInput() handler must be a function",
    );
    await expect(exited).rejects.toThrow("useTextInput() handler must be a function");
  } finally {
    result.dispose();
  }
});

test("reactively activates and deactivates through the original options", async () => {
  const isActive = shallowRef(false);
  const handler = vi.fn<(event: TextInputEvent) => void>();
  const App = defineComponent(() => {
    useTextInput(handler, { isActive });
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    expect(result.terminal.rawMode.current).toBe(false);
    await result.stdin.write("ignored");

    isActive.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.terminal.rawMode.current).toBe(true);
    await result.stdin.write("accepted");

    isActive.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.terminal.rawMode.current).toBe(false);
    await result.stdin.write("ignored again");

    expect(handler.mock.calls.map(([event]) => event.text)).toEqual(["accepted"]);
  } finally {
    result.dispose();
  }
});
