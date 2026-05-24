import { defineComponent, ref } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useInput, type Key } from "@vue-tui/runtime";

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
  const active = ref(false);
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
