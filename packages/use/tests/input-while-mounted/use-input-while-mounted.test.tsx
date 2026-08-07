import { defineComponent, nextTick, shallowRef, vShow, withDirectives } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { Box, Text, type TuiInputEvent } from "@vue-tui/runtime";
import { render } from "@vue-tui/testing";
import { useInputWhileMounted } from "../../src/input-while-mounted/use-input-while-mounted.ts";

type KeyInputEvent = Extract<TuiInputEvent, { readonly type: "key" }>;
type TextInputEvent = Extract<TuiInputEvent, { readonly type: "text" }>;
type PasteInputEvent = Extract<TuiInputEvent, { readonly type: "paste" }>;

test("the function ref activates input only while its target is mounted", async () => {
  const targetMounted = shallowRef(false);
  const received: string[] = [];
  const Target = defineComponent(() => () => (
    <Box>
      <Text>target</Text>
    </Box>
  ));
  const App = defineComponent(() => {
    const targetRef = useInputWhileMounted((event) => {
      if (event.type === "text") received.push(event.text);
    });
    return () => <Box>{targetMounted.value ? <Target ref={targetRef} /> : <Text>idle</Text>}</Box>;
  });
  const result = await render(App);

  try {
    expect(result.terminal.rawMode.current).toBe(false);
    await result.stdin.write("a");
    expect(received).toEqual([]);

    targetMounted.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.terminal.rawMode.current).toBe(true);
    await result.stdin.write("b");
    expect(received).toEqual(["b"]);

    targetMounted.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.terminal.rawMode.current).toBe(false);
    await result.stdin.write("c");
    expect(received).toEqual(["b"]);

    targetMounted.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();
    await result.stdin.write("d");
    expect(received).toEqual(["b", "d"]);
  } finally {
    result.dispose();
  }
});

test("the function ref tracks mount lifecycle, not v-show visibility", async () => {
  const visible = shallowRef(true);
  const received: TuiInputEvent[] = [];
  const App = defineComponent(() => {
    const targetRef = useInputWhileMounted((event) => received.push(event));
    return () =>
      withDirectives(
        <Box ref={targetRef}>
          <Text>target</Text>
        </Box>,
        [[vShow, visible.value]],
      );
  });
  const result = await render(App);

  try {
    visible.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.terminal.rawMode.current).toBe(true);
    await result.stdin.write("x");
    expect(received).toHaveLength(1);
  } finally {
    result.dispose();
  }
});

test("the type option filters normalized input without replacing the event", async () => {
  const allEvents: TuiInputEvent[] = [];
  const keyEvents: KeyInputEvent[] = [];
  const textEvents: TextInputEvent[] = [];
  const pasteEvents: PasteInputEvent[] = [];
  const App = defineComponent(() => {
    const allRef = useInputWhileMounted((event) => allEvents.push(event));
    const keyRef = useInputWhileMounted((event) => keyEvents.push(event), { type: "key" });
    const textRef = useInputWhileMounted((event) => textEvents.push(event), { type: "text" });
    const pasteRef = useInputWhileMounted((event) => pasteEvents.push(event), { type: "paste" });

    return () => (
      <Box>
        <Box ref={allRef} />
        <Box ref={keyRef} />
        <Box ref={textRef} />
        <Box ref={pasteRef} />
      </Box>
    );
  });
  const result = await render(App);

  try {
    await result.stdin.write("a");
    await result.stdin.write("\x1b[A");
    await result.stdin.write("\x1b[200~first\nsecond\x1b[201~");

    expect(allEvents).toHaveLength(3);
    expect(textEvents).toEqual([{ type: "text", text: "a" }]);
    expect(keyEvents).toHaveLength(1);
    expect(keyEvents[0]?.key.name).toBe("up");
    expect(pasteEvents).toEqual([{ type: "paste", text: "first\nsecond" }]);
    expect(textEvents[0]).toBe(allEvents[0]);
    expect(keyEvents[0]).toBe(allEvents[1]);
    expect(pasteEvents[0]).toBe(allEvents[2]);
  } finally {
    result.dispose();
  }
});

test("a filtered handler ref resolves only for a matching event", async () => {
  const calls: string[] = [];
  const handler = shallowRef<((event: KeyInputEvent) => void) | null>(null);
  const App = defineComponent(() => {
    const targetRef = useInputWhileMounted(handler as never, { type: "key" });
    return () => <Box ref={targetRef} />;
  });
  const result = await render(App);

  try {
    await result.stdin.write("ignored text");
    expect(result.terminal.rawMode.current).toBe(true);

    handler.value = (event) => calls.push(event.key.name ?? "character");
    await result.stdin.write("\x1b[A");

    expect(calls).toEqual(["up"]);
  } finally {
    result.dispose();
  }
});

test("a filtered callable ref-like function remains a direct handler", async () => {
  const valueHandler = vi.fn<(event: KeyInputEvent) => void>();
  const directHandler = vi.fn<(event: KeyInputEvent) => void>();
  const valueGetter = vi.fn(() => valueHandler);
  Object.defineProperties(directHandler, {
    __v_isRef: { value: true },
    value: { get: valueGetter },
  });
  const App = defineComponent(() => {
    const targetRef = useInputWhileMounted(directHandler, { type: "key" });
    return () => <Box ref={targetRef} />;
  });
  const result = await render(App);

  try {
    await result.stdin.write("ignored text");
    await result.stdin.write("\x1b[A");

    expect(directHandler).toHaveBeenCalledTimes(1);
    expect(directHandler.mock.calls[0]?.[0].type).toBe("key");
    expect(valueGetter).not.toHaveBeenCalled();
    expect(valueHandler).not.toHaveBeenCalled();
  } finally {
    result.dispose();
  }
});

test("the hook snapshots its filtered type option", async () => {
  const options: { type: TuiInputEvent["type"] } = { type: "key" };
  const received: TuiInputEvent[] = [];
  const App = defineComponent(() => {
    const targetRef = useInputWhileMounted((event) => received.push(event), options);
    return () => <Box ref={targetRef} />;
  });
  const result = await render(App);

  try {
    options.type = "text";
    await result.stdin.write("ignored text");
    await result.stdin.write("\x1b[A");

    expect(received.map((event) => event.type)).toEqual(["key"]);
  } finally {
    result.dispose();
  }
});

test.each([
  ["non-object options", null, "useInputWhileMounted() options must be a plain object"],
  [
    "an unknown field",
    { type: "key", active: true },
    'useInputWhileMounted() options only supports the "type" property',
  ],
  [
    "an unknown type",
    { type: "mouse" },
    'useInputWhileMounted() type must be "text", "key", or "paste"',
  ],
] as const)("rejects %s", async (_label, options, message) => {
  const App = defineComponent(() => {
    useInputWhileMounted(() => undefined, options as never);
    return () => <Text>unreachable</Text>;
  });

  await expect(render(App)).rejects.toThrow(message);
});

test("rejects a non-function filtered handler before subscribing", async () => {
  const App = defineComponent(() => {
    useInputWhileMounted(null as never, { type: "key" });
    return () => <Text>unreachable</Text>;
  });

  await expect(render(App)).rejects.toThrow("useInputWhileMounted() handler must be a function");
});
