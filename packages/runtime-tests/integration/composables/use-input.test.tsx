import { defineComponent, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
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
  const App = defineComponent(() => {
    const { write } = useStdout();
    write("Hello from vue-tui to stdout");
    return () => <Text>Hello World</Text>;
  });

  const { frames } = await render(App);
  // The direct write appears as a raw data chunk in the frames list
  const allOutput = frames.join("");
  expect(allOutput).toContain("Hello from vue-tui to stdout");
});

// --- todo: modifier+arrow keys not yet testable via render API ---
test.todo("useInput - handle meta + up arrow");
test.todo("useInput - handle meta + down arrow");
test.todo("useInput - handle meta + left arrow");
test.todo("useInput - handle meta + right arrow");
test.todo("useInput - handle ctrl + up arrow");
test.todo("useInput - handle ctrl + down arrow");
test.todo("useInput - handle ctrl + left arrow");
test.todo("useInput - handle ctrl + right arrow");
test.todo("useInput - handle home");
test.todo("useInput - handle end");
test.todo("useInput - handle page up");
test.todo("useInput - handle page down");
