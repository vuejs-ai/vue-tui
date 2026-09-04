import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { Text, useInput, type TuiInputEvent } from "@vue-tui/runtime";
import { render } from "@vue-tui/testing";
import { usePasteInput } from "../../src/input/use-paste-input.ts";

type PasteInputEvent = Extract<TuiInputEvent, { readonly type: "paste" }>;

test("delivers a paste event without replacing the frozen event", async () => {
  const allEvents: TuiInputEvent[] = [];
  const pasteEvents: PasteInputEvent[] = [];
  const App = defineComponent(() => {
    useInput((event) => allEvents.push(event));
    usePasteInput((event) => pasteEvents.push(event));
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    await result.stdin.write("\x1b[200~pasted\x1b[201~");

    expect(pasteEvents).toEqual([{ type: "paste", text: "pasted" }]);
    expect(pasteEvents[0]).toBe(allEvents[0]);
    expect(Object.isFrozen(pasteEvents[0])).toBe(true);
  } finally {
    result.dispose();
  }
});

test("delivers an empty paste payload", async () => {
  const pasteEvents: PasteInputEvent[] = [];
  const App = defineComponent(() => {
    usePasteInput((event) => pasteEvents.push(event));
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    await result.stdin.write("\x1b[200~\x1b[201~");

    expect(pasteEvents).toEqual([{ type: "paste", text: "" }]);
  } finally {
    result.dispose();
  }
});

test("keeps newlines and control characters in the paste payload", async () => {
  const pasteEvents: PasteInputEvent[] = [];
  const payload = "first\nsecond\x03\x1b[A";
  const App = defineComponent(() => {
    usePasteInput((event) => pasteEvents.push(event));
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    await result.stdin.write(`\x1b[200~${payload}\x1b[201~`);

    expect(pasteEvents).toEqual([{ type: "paste", text: payload }]);
  } finally {
    result.dispose();
  }
});

test("does not deliver normal text events", async () => {
  const handler = vi.fn<(event: PasteInputEvent) => void>();
  const App = defineComponent(() => {
    usePasteInput(handler);
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    await result.stdin.write("text");

    expect(handler).not.toHaveBeenCalled();
  } finally {
    result.dispose();
  }
});

test("does not deliver key events", async () => {
  const handler = vi.fn<(event: PasteInputEvent) => void>();
  const App = defineComponent(() => {
    usePasteInput(handler);
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    await result.stdin.write("\x1b[A");

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
    usePasteInput(null as never, options);
    return () => <Text>unreachable</Text>;
  });

  await expect(render(App)).rejects.toThrow("usePasteInput() handler must be a function");
  expect(readIsActive).not.toHaveBeenCalled();
});

test("treats a callable ref-like function as the direct handler", async () => {
  const valueHandler = vi.fn<(event: PasteInputEvent) => void>();
  const directHandler = vi.fn<(event: PasteInputEvent) => void>();
  const valueGetter = vi.fn(() => valueHandler);
  Object.defineProperties(directHandler, {
    __v_isRef: { value: true },
    value: { get: valueGetter },
  });
  const App = defineComponent(() => {
    usePasteInput(directHandler);
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    await result.stdin.write("text");
    await result.stdin.write("\x1b[A");
    await result.stdin.write("\x1b[200~pasted\x1b[201~");

    expect(directHandler).toHaveBeenCalledTimes(1);
    expect(directHandler.mock.calls[0]?.[0]).toEqual({ type: "paste", text: "pasted" });
    expect(valueGetter).not.toHaveBeenCalled();
    expect(valueHandler).not.toHaveBeenCalled();
  } finally {
    result.dispose();
  }
});

test("resolves a live handler ref for each matching event", async () => {
  const firstHandler = vi.fn<(event: PasteInputEvent) => void>();
  const secondHandler = vi.fn<(event: PasteInputEvent) => void>();
  const handler = shallowRef<(event: PasteInputEvent) => void>(firstHandler);
  const App = defineComponent(() => {
    usePasteInput(handler);
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    await result.stdin.write("\x1b[200~first\x1b[201~");
    handler.value = secondHandler;
    await result.stdin.write("\x1b[200~second\x1b[201~");

    expect(firstHandler.mock.calls.map(([event]) => event.text)).toEqual(["first"]);
    expect(secondHandler.mock.calls.map(([event]) => event.text)).toEqual(["second"]);
  } finally {
    result.dispose();
  }
});

test("reads an invalid live handler only after a paste event arrives", async () => {
  const handler = shallowRef<((event: PasteInputEvent) => void) | null>(null);
  const App = defineComponent(() => {
    usePasteInput(handler as never);
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    await result.stdin.write("text");
    await result.stdin.write("\x1b[A");

    const exited = result.waitUntilExit();
    await expect(result.stdin.write("\x1b[200~pasted\x1b[201~")).rejects.toThrow(
      "usePasteInput() handler must be a function",
    );
    await expect(exited).rejects.toThrow("usePasteInput() handler must be a function");
  } finally {
    result.dispose();
  }
});

test("reactively activates and deactivates through the original options", async () => {
  const isActive = shallowRef(false);
  const handler = vi.fn<(event: PasteInputEvent) => void>();
  const App = defineComponent(() => {
    usePasteInput(handler, { isActive });
    return () => <Text>listening</Text>;
  });
  const result = await render(App);

  try {
    expect(result.terminal.rawMode.current).toBe(false);
    await result.stdin.write("\x1b[200~ignored\x1b[201~");

    isActive.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.terminal.rawMode.current).toBe(true);
    await result.stdin.write("\x1b[200~accepted\x1b[201~");

    isActive.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.terminal.rawMode.current).toBe(false);
    await result.stdin.write("\x1b[200~ignored again\x1b[201~");

    expect(handler.mock.calls.map(([event]) => event.text)).toEqual(["accepted"]);
  } finally {
    result.dispose();
  }
});
