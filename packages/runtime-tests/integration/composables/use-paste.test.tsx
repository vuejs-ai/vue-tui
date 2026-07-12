import { defineComponent, nextTick, shallowRef, toRef, type PropType } from "vue";
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

  test("paste fallback never runs the application Ctrl+C default", async () => {
    const received: Array<{ input: string; ctrl: boolean }> = [];
    const App = defineComponent(() => {
      useInput((input, key) => received.push({ input, ctrl: key.ctrl }));
      return () => <Text>listening</Text>;
    });
    const { stdin, unmount } = await render(App, { exitOnCtrlC: true });

    await stdin.write("\x1b[200~\x03\x1b[201~");

    expect(received).toEqual([{ input: "\x03", ctrl: false }]);
    unmount();
  });

  test("paste fallback preserves escape and query-like payload as text", async () => {
    const received: Array<{ input: string; upArrow: boolean }> = [];
    const App = defineComponent(() => {
      useInput((input, key) => received.push({ input, upArrow: key.upArrow }));
      return () => <Text>listening</Text>;
    });
    const { stdin } = await render(App);
    const text = "\x1b[A\x1b[?31u";

    await stdin.write(`\x1b[200~${text}\x1b[201~`);

    expect(received).toEqual([{ input: text, upArrow: false }]);
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

  test("accepts a handler ref and calls the latest function", async () => {
    const calls: string[] = [];
    const firstHandler = (text: string) => calls.push(`first:${text}`);
    const secondHandler = (text: string) => calls.push(`second:${text}`);
    const currentHandler = shallowRef(firstHandler);

    const Child = defineComponent({
      props: {
        onPaste: {
          type: Function as PropType<(text: string) => void>,
          required: true,
        },
      },
      setup(props) {
        usePaste(toRef(props, "onPaste"));
        return () => <Text>child</Text>;
      },
    });

    const App = defineComponent(() => {
      return () => <Child onPaste={currentHandler.value} />;
    });

    const { stdin } = await render(App);
    await stdin.write("\x1b[200~alpha\x1b[201~");
    expect(calls).toEqual(["first:alpha"]);

    currentHandler.value = secondHandler;
    await nextTick();
    await stdin.write("\x1b[200~beta\x1b[201~");
    expect(calls).toEqual(["first:alpha", "second:beta"]);
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
