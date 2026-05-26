import { defineComponent, shallowRef } from "vue";
import { describe, test, expect } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useInput, usePaste } from "@vue-tui/runtime";

describe("usePaste", () => {
  test("receives pasted text from bracketed paste", async () => {
    const pasted = shallowRef("");
    const App = defineComponent(() => {
      usePaste((text) => {
        pasted.value = text;
      });
      return () => <Text>{pasted.value || "waiting"}</Text>;
    });
    const { stdin } = await render(App);
    await stdin.write("\x1b[200~hello world\x1b[201~");
    expect(pasted.value).toBe("hello world");
  });

  test("paste falls through to useInput when no paste listeners", async () => {
    const received = shallowRef("");
    const App = defineComponent(() => {
      useInput((input) => {
        received.value += input;
      });
      return () => <Text>{received.value || "waiting"}</Text>;
    });
    const { stdin } = await render(App);
    // Without usePaste, paste events fall through as regular input
    await stdin.write("\x1b[200~pasted\x1b[201~");
    expect(received.value).toBe("pasted");
  });

  test("respects isActive option", async () => {
    const pasted = shallowRef("");
    const active = shallowRef(false);
    const App = defineComponent(() => {
      usePaste(
        (text) => {
          pasted.value = text;
        },
        { isActive: active },
      );
      return () => <Text>{pasted.value || "waiting"}</Text>;
    });
    const { stdin } = await render(App);
    await stdin.write("\x1b[200~ignored\x1b[201~");
    expect(pasted.value).toBe("");

    active.value = true;
    await stdin.write("\x1b[200~captured\x1b[201~");
    expect(pasted.value).toBe("captured");
  });

  test("usePaste intercepts paste so useInput does not receive it", async () => {
    const inputReceived: string[] = [];
    const pasteReceived: string[] = [];
    const App = defineComponent(() => {
      useInput((input) => {
        inputReceived.push(input);
      });
      usePaste((text) => {
        pasteReceived.push(text);
      });
      return () => <Text>listening</Text>;
    });
    const { stdin } = await render(App);
    await stdin.write("\x1b[200~pasted text\x1b[201~");
    expect(pasteReceived).toEqual(["pasted text"]);
    expect(inputReceived).toEqual([]);
  });
});
