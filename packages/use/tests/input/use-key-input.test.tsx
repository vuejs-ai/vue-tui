import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { Text, useInput, type TuiInputEvent } from "@vue-tui/runtime";
import { render } from "@vue-tui/testing";
import { useKeyInput } from "../../src/input/use-key-input.ts";

type KeyInputEvent = Extract<TuiInputEvent, { readonly type: "key" }>;

const noModifiers = {
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
  super: false,
  hyper: false,
} as const;

test("delivers a key event without replacing the frozen event", async () => {
  const allEvents: TuiInputEvent[] = [];
  const keyEvents: KeyInputEvent[] = [];
  const App = defineComponent(() => {
    useInput((event) => allEvents.push(event));
    useKeyInput((event) => keyEvents.push(event));
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    await result.stdin.write("\x1b[A");

    expect(keyEvents).toEqual([{ type: "key", key: { name: "up", ...noModifiers } }]);
    expect(keyEvents[0]).toBe(allEvents[0]);
    expect(Object.isFrozen(keyEvents[0])).toBe(true);
    expect(Object.isFrozen(keyEvents[0]?.key)).toBe(true);
  } finally {
    result.dispose();
  }
});

test("does not deliver text events even when they include key information", async () => {
  const handler = vi.fn<(event: KeyInputEvent) => void>();
  const App = defineComponent(() => {
    useKeyInput(handler);
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    await result.stdin.write("\x1b[97:65;2;65u");

    expect(handler).not.toHaveBeenCalled();
  } finally {
    result.dispose();
  }
});

test("does not deliver paste events", async () => {
  const handler = vi.fn<(event: KeyInputEvent) => void>();
  const App = defineComponent(() => {
    useKeyInput(handler);
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
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
    useKeyInput(null as never, options);
    return () => <Text>unreachable</Text>;
  });

  await expect(render(App)).rejects.toThrow("useKeyInput() handler must be a function");
  expect(readIsActive).not.toHaveBeenCalled();
});

test("treats a callable ref-like function as the direct handler", async () => {
  const valueHandler = vi.fn<(event: KeyInputEvent) => void>();
  const directHandler = vi.fn<(event: KeyInputEvent) => void>();
  const valueGetter = vi.fn(() => valueHandler);
  Object.defineProperties(directHandler, {
    __v_isRef: { value: true },
    value: { get: valueGetter },
  });
  const App = defineComponent(() => {
    useKeyInput(directHandler);
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    await result.stdin.write("a");
    await result.stdin.write("\x1b[A");

    expect(directHandler).toHaveBeenCalledTimes(1);
    expect(directHandler.mock.calls[0]?.[0]).toEqual({
      type: "key",
      key: { name: "up", ...noModifiers },
    });
    expect(valueGetter).not.toHaveBeenCalled();
    expect(valueHandler).not.toHaveBeenCalled();
  } finally {
    result.dispose();
  }
});

test("resolves a live handler ref for each matching event", async () => {
  const firstHandler = vi.fn<(event: KeyInputEvent) => void>();
  const secondHandler = vi.fn<(event: KeyInputEvent) => void>();
  const handler = shallowRef<(event: KeyInputEvent) => void>(firstHandler);
  const App = defineComponent(() => {
    useKeyInput(handler);
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    await result.stdin.write("\x1b[A");
    handler.value = secondHandler;
    await result.stdin.write("\x1b[B");

    expect(firstHandler.mock.calls.map(([event]) => event.key.name)).toEqual(["up"]);
    expect(secondHandler.mock.calls.map(([event]) => event.key.name)).toEqual(["down"]);
  } finally {
    result.dispose();
  }
});

test("reads an invalid live handler only after a key event arrives", async () => {
  const handler = shallowRef<((event: KeyInputEvent) => void) | null>(null);
  const App = defineComponent(() => {
    useKeyInput(handler as never);
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    await result.stdin.write("a");
    await result.stdin.write("\x1b[200~pasted\x1b[201~");

    const exited = result.waitUntilExit();
    await expect(result.stdin.write("\x1b[A")).rejects.toThrow(
      "useKeyInput() handler must be a function",
    );
    await expect(exited).rejects.toThrow("useKeyInput() handler must be a function");
  } finally {
    result.dispose();
  }
});

test("reactively activates and deactivates through the original options", async () => {
  const isActive = shallowRef(false);
  const handler = vi.fn<(event: KeyInputEvent) => void>();
  const App = defineComponent(() => {
    useKeyInput(handler, { isActive });
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    expect(result.terminal.rawMode.current).toBe(false);
    await result.stdin.write("\x1b[A");

    isActive.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.terminal.rawMode.current).toBe(true);
    await result.stdin.write("\x1b[B");

    isActive.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.terminal.rawMode.current).toBe(false);
    await result.stdin.write("\x1b[C");

    expect(handler.mock.calls.map(([event]) => event.key.name)).toEqual(["down"]);
  } finally {
    result.dispose();
  }
});
