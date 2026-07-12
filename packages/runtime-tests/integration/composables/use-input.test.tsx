import { defineComponent, nextTick, shallowRef, toRef, type PropType } from "vue";
import { expect, test, vi } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useInput, useStdout, type Key } from "@vue-tui/runtime";

test("useInput receives keyboard input", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });

  const { stdin } = await render(App);
  await stdin.write("x");
  expect(calls[0]?.input).toBe("x");
});

test("useInput receives arrow keys", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });

  const { stdin } = await render(App);
  await stdin.write("\x1b[A");
  expect(calls[0]?.key.upArrow).toBe(true);
});

test("useInput respects isActive ref", async () => {
  const calls: string[] = [];
  const active = shallowRef(false);
  const App = defineComponent(() => {
    useInput((input) => calls.push(input), { isActive: active });
    return () => <Text>x</Text>;
  });

  const { stdin } = await render(App);
  await stdin.write("a");
  expect(calls.length).toBe(0);

  active.value = true;
  await stdin.write("b");
  expect(calls).toEqual(["b"]);
});

test("useInput accepts a handler ref and calls the latest function", async () => {
  const calls: string[] = [];
  const firstHandler = (input: string) => calls.push(`first:${input}`);
  const secondHandler = (input: string) => calls.push(`second:${input}`);
  const currentHandler = shallowRef(firstHandler);

  const Child = defineComponent({
    props: {
      onInput: {
        type: Function as PropType<(input: string, key: Key) => void>,
        required: true,
      },
    },
    setup(props) {
      useInput(toRef(props, "onInput"));
      return () => <Text>child</Text>;
    },
  });

  const App = defineComponent(() => {
    return () => <Child onInput={currentHandler.value} />;
  });

  const { stdin } = await render(App);
  await stdin.write("a");
  expect(calls).toEqual(["first:a"]);

  currentHandler.value = secondHandler;
  await nextTick();
  await stdin.write("b");
  expect(calls).toEqual(["first:a", "second:b"]);
});

test("two useInput hooks both receive the same input", async () => {
  const a: string[] = [];
  const b: string[] = [];
  const App = defineComponent(() => {
    useInput((c) => a.push(c));
    useInput((c) => b.push(c));
    return () => <Text>x</Text>;
  });

  const { stdin } = await render(App);
  await stdin.write("z");
  expect(a).toEqual(["z"]);
  expect(b).toEqual(["z"]);
});

test("current useInput listeners receive isolated mutable Key projections", async () => {
  let secondCtrl: boolean | undefined;
  const App = defineComponent(() => {
    useInput((_input, key) => {
      key.ctrl = true;
    });
    useInput((_input, key) => {
      secondCtrl = key.ctrl;
    });
    return () => <Text>x</Text>;
  });

  const { stdin } = await render(App);
  await stdin.write("a");
  expect(secondCtrl).toBe(false);
});

// --- Basic key input tests (ported from Ink term()-based tests) ---

test("useInput - return key sets key.return", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });

  const { stdin } = await render(App);
  await stdin.write("\r");
  expect(calls[0]?.key.return).toBe(true);
});

test("useInput - escape key sets key.escape", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });

  const { stdin } = await render(App);
  await stdin.write("\x1b");
  expect(calls[0]?.key.escape).toBe(true);
});

test("useInput - backspace key sets key.backspace", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });

  const { stdin } = await render(App);
  await stdin.write("\x7f");
  expect(calls[0]?.key.backspace).toBe(true);
});

test("useInput - tab key sets key.tab", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });

  const { stdin } = await render(App);
  await stdin.write("\t");
  expect(calls[0]?.key.tab).toBe(true);
});

// --- Arrow key navigation tests (ported from hooks-use-input-navigation.tsx) ---

test("useInput - handle up arrow", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });

  const { stdin } = await render(App);
  await stdin.write("\x1b[A");
  expect(calls[0]?.key.upArrow).toBe(true);
  // Ink fixtures/use-input.tsx:111 gate on `key.upArrow && !key.meta`; lock that
  // a plain arrow never spuriously sets meta.
  expect(calls[0]?.key.meta).toBe(false);
});

test("useInput - handle down arrow", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });

  const { stdin } = await render(App);
  await stdin.write("\x1b[B");
  expect(calls[0]?.key.downArrow).toBe(true);
  // Ink fixtures/use-input.tsx:116 gate on `key.downArrow && !key.meta`.
  expect(calls[0]?.key.meta).toBe(false);
});

test("useInput - handle right arrow", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });

  const { stdin } = await render(App);
  await stdin.write("\x1b[C");
  expect(calls[0]?.key.rightArrow).toBe(true);
  // Ink fixtures/use-input.tsx:126 gate on `key.rightArrow && !key.meta`.
  expect(calls[0]?.key.meta).toBe(false);
});

test("useInput - handle left arrow", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });

  const { stdin } = await render(App);
  await stdin.write("\x1b[D");
  expect(calls[0]?.key.leftArrow).toBe(true);
  // Ink fixtures/use-input.tsx:121 gate on `key.leftArrow && !key.meta`.
  expect(calls[0]?.key.meta).toBe(false);
});

test("useInput - handles rapid arrows and enter in one chunk per write", async () => {
  const keys: Key[] = [];
  const App = defineComponent(() => {
    useInput((_input, key) => keys.push(key));
    return () => <Text>listening</Text>;
  });

  const { stdin } = await render(App);
  // Each escape sequence is written separately to match the render API
  await stdin.write("\x1b[B");
  await stdin.write("\x1b[B");
  await stdin.write("\x1b[B");
  await stdin.write("\r");
  expect(keys.filter((k) => k.downArrow).length).toBe(3);
  expect(keys.some((k) => k.return)).toBe(true);
});

// --- useInput isActive (from hooks.tsx) ---

test("useInput - ignore input if not active (isActive: false)", async () => {
  const calls: string[] = [];
  const App = defineComponent(() => {
    useInput((input) => calls.push(input), { isActive: false });
    return () => <Text>x</Text>;
  });

  const { stdin } = await render(App);
  await stdin.write("x");
  expect(calls.length).toBe(0);
});

test("useInput - ignore input if not active (isActive ref toggled)", async () => {
  const calls: string[] = [];
  const active = shallowRef(false);
  const App = defineComponent(() => {
    useInput((input) => calls.push(input), { isActive: active });
    return () => <Text>x</Text>;
  });

  const { stdin } = await render(App);
  await stdin.write("first");
  expect(calls.length).toBe(0);

  active.value = true;
  await stdin.write("second");
  expect(calls).toEqual(["second"]);
});

// --- useStdout (from hooks.tsx) ---

test("useStdout - write to stdout", async () => {
  let writeOutput: ((data: string) => void) | undefined;
  const App = defineComponent(() => {
    const { write } = useStdout();
    writeOutput = write;
    return () => <Text>Hello World</Text>;
  });

  const result = await render(App);
  writeOutput?.("Hello from vue-tui to stdout\n");
  // Direct output changes the emulated terminal, not renderer content frames.
  const screen = await result.screen();
  const allOutput = [...screen.scrollback, ...screen.lines].join("\n");
  expect(allOutput).toContain("Hello from vue-tui to stdout");
});

// --- modifier+arrow keys, home, end, page up/down ---

test("useInput - handle meta + up arrow", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });
  const { stdin } = await render(App);
  await stdin.write("\x1b\x1b[A");
  expect(calls[0]?.key.upArrow).toBe(true);
  expect(calls[0]?.key.meta).toBe(true);
});

test("useInput - handle meta + down arrow", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });
  const { stdin } = await render(App);
  await stdin.write("\x1b\x1b[B");
  expect(calls[0]?.key.downArrow).toBe(true);
  expect(calls[0]?.key.meta).toBe(true);
});

test("useInput - handle meta + left arrow", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });
  const { stdin } = await render(App);
  await stdin.write("\x1b\x1b[D");
  expect(calls[0]?.key.leftArrow).toBe(true);
  expect(calls[0]?.key.meta).toBe(true);
});

test("useInput - handle meta + right arrow", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });
  const { stdin } = await render(App);
  await stdin.write("\x1b\x1b[C");
  expect(calls[0]?.key.rightArrow).toBe(true);
  expect(calls[0]?.key.meta).toBe(true);
});

test("useInput - handle ctrl + up arrow", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });
  const { stdin } = await render(App);
  await stdin.write("\x1b[1;5A");
  expect(calls[0]?.key.upArrow).toBe(true);
  expect(calls[0]?.key.ctrl).toBe(true);
});

test("useInput - handle ctrl + down arrow", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });
  const { stdin } = await render(App);
  await stdin.write("\x1b[1;5B");
  expect(calls[0]?.key.downArrow).toBe(true);
  expect(calls[0]?.key.ctrl).toBe(true);
});

test("useInput - handle ctrl + left arrow", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });
  const { stdin } = await render(App);
  await stdin.write("\x1b[1;5D");
  expect(calls[0]?.key.leftArrow).toBe(true);
  expect(calls[0]?.key.ctrl).toBe(true);
});

test("useInput - handle ctrl + right arrow", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });
  const { stdin } = await render(App);
  await stdin.write("\x1b[1;5C");
  expect(calls[0]?.key.rightArrow).toBe(true);
  expect(calls[0]?.key.ctrl).toBe(true);
});

test("useInput - handle home", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });
  const { stdin } = await render(App);
  await stdin.write("\x1b[H");
  expect(calls[0]?.key.home).toBe(true);
});

test("useInput - handle end", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });
  const { stdin } = await render(App);
  await stdin.write("\x1b[F");
  expect(calls[0]?.key.end).toBe(true);
});

test("useInput - handle page up", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });
  const { stdin } = await render(App);
  await stdin.write("\x1b[5~");
  expect(calls[0]?.key.pageUp).toBe(true);
});

test("useInput - handle page down", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });
  const { stdin } = await render(App);
  await stdin.write("\x1b[6~");
  expect(calls[0]?.key.pageDown).toBe(true);
});

// --- exitOnCtrlC ---

test("exitOnCtrlC runs after the compatibility handler in raw mode", async () => {
  const handler = vi.fn();
  const App = defineComponent(() => {
    useInput(handler);
    return () => <Text>running</Text>;
  });
  const { stdin, waitUntilExit } = await render(App, { exitOnCtrlC: true });
  await stdin.write("\x03");
  expect(handler).toHaveBeenCalledOnce();
  expect(handler).toHaveBeenCalledWith("c", expect.objectContaining({ ctrl: true }));
  await expect(waitUntilExit()).resolves.toBeUndefined();
});

// --- Kitty release events deliver the key, matching Ink (no release special-case) ---
// Ink (use-input.ts:204-217) classifies a kitty event purely by isPrintable /
// ctrl+letter, regardless of press/repeat/release. A printable release ('a' up,
// CSI 97;1:3 u) therefore delivers input "a", not "". vue-tui previously had an
// undocumented `eventType === "release"` guard that blanked input to ""; these
// tests lock the Ink-matching behavior.

test("useInput - kitty printable RELEASE delivers the key (input='a'), not ''", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });

  const { stdin } = await render(App);
  // 'a' release event (codepoint 97, modifier 1, eventType 3 = release)
  await stdin.write("\x1b[97;1:3u");
  expect(calls[0]?.input).toBe("a");
  expect(calls[0]?.key.eventType).toBe("release");
});

test("useInput - kitty ctrl+letter RELEASE delivers the letter name (input='a'), not ''", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });

  const { stdin } = await render(App);
  // Ctrl+A uses the printable key codepoint plus the Ctrl modifier in the
  // official Kitty grammar. The compatibility projection still flows the
  // name "a" through on release — same as Ink's current hook shape.
  await stdin.write("\x1b[97;5:3u");
  expect(calls[0]?.input).toBe("a");
  expect(calls[0]?.key.ctrl).toBe(true);
  expect(calls[0]?.key.eventType).toBe("release");
});

// The delayed controller default ignores release events. A Ctrl+C release is
// delivered without exit; a press is delivered first and then exits.
test("useInput - kitty Ctrl+C RELEASE does not exit (delivered to handler); press still exits", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>running</Text>;
  });
  const { stdin, waitUntilExit } = await render(App, { exitOnCtrlC: true });

  // Ctrl+C RELEASE (codepoint 99 'c', modifier 5 = ctrl, eventType 3 = release):
  // must NOT exit; flows to the handler with input "c".
  await stdin.write("\x1b[99;5:3u");
  expect(calls[0]?.input).toBe("c");
  expect(calls[0]?.key.ctrl).toBe(true);
  expect(calls[0]?.key.eventType).toBe("release");

  // Ctrl+C PRESS reaches the handler, then the delayed default exits.
  await stdin.write("\x1b[99;5:1u");
  await expect(waitUntilExit()).resolves.toBeUndefined();
  expect(calls).toHaveLength(2);
  expect(calls[1]).toMatchObject({ input: "c", key: { ctrl: true, eventType: "press" } });
});

test("useInput - richer Kitty facts keep the current hook projection", async () => {
  const calls: Array<{ input: string; key: Key }> = [];
  const App = defineComponent(() => {
    useInput((input, key) => calls.push({ input, key }));
    return () => <Text>listening</Text>;
  });
  const { stdin } = await render(App, { exitOnCtrlC: false });

  await stdin.write("\x1b[97:65:99;6:2;65u");
  await stdin.write("\x1b[0;;229u");
  await stdin.write("\x1b[0;1:3;229u");
  await stdin.write("\x1b[97;3u");

  expect(calls).toHaveLength(4);
  expect(calls[0]).toMatchObject({
    input: "A",
    key: { ctrl: true, shift: true, meta: false, eventType: "repeat" },
  });
  expect(calls[1]).toMatchObject({ input: "å", key: { ctrl: false, shift: false } });
  expect(calls[2]).toMatchObject({ input: "å", key: { eventType: "release" } });
  // The old public Key has one `meta` bit. Its compatibility projection still
  // represents exact internal Kitty Alt as meta until F3 selects a public API.
  expect(calls[3]).toMatchObject({ input: "a", key: { meta: true } });
});
