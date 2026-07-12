import { defineComponent, nextTick, shallowRef, toRef, type PropType } from "vue";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { createApp, Text, useInput, type InputHandler, type TuiInputEvent } from "@vue-tui/runtime";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "../lifecycle/test-streams.ts";

const PASTE_ON = "\x1b[?2004h";
const PASTE_OFF = "\x1b[?2004l";

describe("normalized public input", () => {
  test("delivers one immutable key event object to every captured global handler", async () => {
    const events: TuiInputEvent[] = [];
    const order: string[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        order.push("first");
        events.push(event);
        return "consume";
      });
      useInput((event) => {
        order.push("second");
        events.push(event);
        return "continue";
      });
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("\x03");

    expect(order).toEqual(["first", "second"]);
    expect(events[0]).toBe(events[1]);
    expect(events[0]).toEqual({
      kind: "key",
      sequence: "\x03",
      fidelity: "normalized-utf8-sequence",
      key: {
        protocol: "legacy",
        name: "c",
        code: null,
        primaryCodepoint: null,
        shiftedCodepoint: null,
        baseLayoutCodepoint: null,
        functionalCode: null,
        modifiers: {
          shift: false,
          alt: false,
          ctrl: true,
          super: false,
          hyper: false,
          meta: false,
          capsLock: false,
          numLock: false,
        },
        phase: null,
        printable: true,
        reportedText: null,
      },
    });
    const keyEvent = events[0];
    if (keyEvent?.kind !== "key") throw new Error("Expected a key event");
    expect(Object.isFrozen(keyEvent)).toBe(true);
    expect(Object.isFrozen(keyEvent.key)).toBe(true);
    expect(Object.isFrozen(keyEvent.key.modifiers)).toBe(true);
    result.unmount();
  });

  test("preserves plain text as one text fact", async () => {
    const events: TuiInputEvent[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        events.push(event);
        return "continue";
      });
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("hello");

    expect(events).toEqual([
      {
        kind: "text",
        sequence: "hello",
        fidelity: "normalized-utf8-sequence",
        text: "hello",
        protocol: "plain",
        phase: null,
        primaryCodepoint: null,
        textOrigin: null,
      },
    ]);
    result.unmount();
  });

  test("preserves rich Kitty key fields without collapsing modifiers", async () => {
    const events: TuiInputEvent[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        events.push(event);
        return "continue";
      });
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("\x1b[97:65:99;6:2;65u");

    expect(events).toEqual([
      {
        kind: "key",
        sequence: "\x1b[97:65:99;6:2;65u",
        fidelity: "normalized-utf8-sequence",
        key: {
          protocol: "kitty",
          name: "a",
          code: null,
          primaryCodepoint: 97,
          shiftedCodepoint: 65,
          baseLayoutCodepoint: 99,
          functionalCode: null,
          modifiers: {
            shift: true,
            alt: false,
            ctrl: true,
            super: false,
            hyper: false,
            meta: false,
            capsLock: false,
            numLock: false,
          },
          phase: "repeat",
          printable: true,
          reportedText: "A",
        },
      },
    ]);
    result.unmount();
  });

  test("preserves Kitty-reported text and its release phase", async () => {
    const events: TuiInputEvent[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        events.push(event);
        return "continue";
      });
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("\x1b[0;1:3;229u");

    expect(events).toEqual([
      {
        kind: "text",
        sequence: "\x1b[0;1:3;229u",
        fidelity: "normalized-utf8-sequence",
        text: "å",
        protocol: "kitty",
        phase: "release",
        primaryCodepoint: 0,
        textOrigin: "reported",
      },
    ]);
    result.unmount();
  });

  test("delivers bracketed paste as one paste fact with opaque payload", async () => {
    const events: TuiInputEvent[] = [];
    const payload = "\x03\x1b[A\x1b[?31u";
    const App = defineComponent(() => {
      useInput((event) => {
        events.push(event);
        return "continue";
      });
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write(`\x1b[200~${payload}\x1b[201~`);

    expect(events).toEqual([
      {
        kind: "paste",
        sequence: `\x1b[200~${payload}\x1b[201~`,
        fidelity: "normalized-utf8-sequence",
        text: payload,
      },
    ]);

    // Ctrl+C inside a paste is data, so the delayed Ctrl+C default must not exit.
    await result.stdin.write("x");
    expect(events).toHaveLength(2);
    result.unmount();
  });

  test("delivers unknown terminal input as uninterpreted without losing bytes", async () => {
    const events: TuiInputEvent[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        events.push(event);
        return "continue";
      });
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("\x1b[?25h");

    expect(events).toEqual([
      {
        kind: "uninterpreted",
        sequence: "\x1b[?25h",
        fidelity: "normalized-utf8-sequence",
      },
    ]);
    result.unmount();
  });

  test("does not expose pointer facts through useInput", async () => {
    const handler = vi.fn<InputHandler>(() => "continue");
    const App = defineComponent(() => {
      useInput(handler);
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("\x1b[<0;4;5M");

    expect(handler).not.toHaveBeenCalled();
    result.unmount();
  });
});

describe("handler lifetime and routing results", () => {
  test("respects a reactive isActive source", async () => {
    const events: string[] = [];
    const active = shallowRef(false);
    const App = defineComponent(() => {
      useInput(
        (event) => {
          events.push(event.sequence);
          return "continue";
        },
        { isActive: active },
      );
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    expect(result.terminal.rawMode.current).toBe(false);
    await result.stdin.write("a");
    expect(events).toEqual([]);

    active.value = true;
    await nextTick();
    expect(result.terminal.rawMode.current).toBe(true);
    await result.stdin.write("b");
    expect(events).toEqual(["b"]);

    active.value = false;
    await nextTick();
    await Promise.resolve();
    expect(result.terminal.rawMode.current).toBe(false);
    await result.stdin.write("c");
    expect(events).toEqual(["b"]);
    result.unmount();
  });

  test("accepts a handler ref and invokes the latest function", async () => {
    const calls: string[] = [];
    const firstHandler: InputHandler = (event) => {
      calls.push(`first:${event.sequence}`);
      return "continue";
    };
    const secondHandler: InputHandler = (event) => {
      calls.push(`second:${event.sequence}`);
      return "continue";
    };
    const currentHandler = shallowRef<InputHandler>(firstHandler);

    const Child = defineComponent({
      props: {
        onInput: {
          type: Function as PropType<InputHandler>,
          required: true,
        },
      },
      setup(props) {
        useInput(toRef(props, "onInput"));
        return () => <Text>child</Text>;
      },
    });
    const App = defineComponent(() => () => <Child onInput={currentHandler.value} />);

    const result = await render(App);
    await result.stdin.write("a");
    currentHandler.value = secondHandler;
    await nextTick();
    await result.stdin.write("b");

    expect(calls).toEqual(["first:a", "second:b"]);
    result.unmount();
  });

  test("freezes the global handler set at fact start", async () => {
    const calls: string[] = [];
    const secondActive = shallowRef(true);
    const App = defineComponent(() => {
      useInput((event) => {
        calls.push(`first:${event.sequence}`);
        secondActive.value = false;
        return "continue";
      });
      useInput(
        (event) => {
          calls.push(`second:${event.sequence}`);
          return "continue";
        },
        { isActive: secondActive },
      );
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("a");
    await result.stdin.write("b");

    expect(calls).toEqual(["first:a", "second:a", "first:b"]);
    result.unmount();
  });

  test("accepts a complete decision whose fields remain independent", async () => {
    const calls: string[] = [];
    const decision = {
      action: "performed",
      routing: "continue",
      defaultAction: "prevent",
      external: "allow",
    } as const;
    const App = defineComponent(() => {
      useInput((event) => {
        calls.push(event.sequence);
        return decision;
      });
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("\x03");
    await result.stdin.write("x");

    expect(calls).toEqual(["\x03", "x"]);
    result.unmount();
  });

  test.each([
    ["missing", undefined],
    ["asynchronous", Promise.resolve("continue")],
    ["partial", { action: "none", routing: "continue" }],
  ])("fails the app closed for an %s handler result", async (_label, invalidResult) => {
    const laterHandler = vi.fn<InputHandler>(() => "continue");
    const App = defineComponent(() => {
      useInput((() => invalidResult) as unknown as InputHandler);
      useInput(laterHandler);
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await expect(result.stdin.write("\x03")).rejects.toThrow(
      'useInput() handlers must synchronously return "continue", "consume", or a complete InputRouteDecision.',
    );
    expect(laterHandler).not.toHaveBeenCalled();
    expect(result.terminal.rawMode.current).toBe(true);
    result.unmount();
  });
});

describe("Ctrl+C delayed default", () => {
  test("continue lets the default run after the handler", async () => {
    const phases: string[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        phases.push(`handler:${event.sequence}`);
        return "continue";
      });
      return () => <Text>running</Text>;
    });

    const result = await render(App);
    await result.stdin.write("\x03");

    expect(phases).toEqual(["handler:\x03"]);
    await expect(result.waitUntilExit()).resolves.toBeUndefined();
    result.dispose();
  });

  test("consume prevents the default and keeps the app active", async () => {
    const sequences: string[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        sequences.push(event.sequence);
        return "consume";
      });
      return () => <Text>running</Text>;
    });

    const result = await render(App);
    await result.stdin.write("\x03");
    await result.stdin.write("x");

    expect(sequences).toEqual(["\x03", "x"]);
    expect(result.terminal.rawMode.current).toBe(true);
    result.unmount();
  });

  test("Kitty Ctrl+C release is observable but only a later press exits", async () => {
    const phases: Array<string | null> = [];
    const App = defineComponent(() => {
      useInput((event) => {
        if (event.kind === "key") phases.push(event.key.phase);
        return "continue";
      });
      return () => <Text>running</Text>;
    });

    const result = await render(App);
    await result.stdin.write("\x1b[99;5:3u");
    expect(phases).toEqual(["release"]);

    await result.stdin.write("\x1b[99;5:1u");
    expect(phases).toEqual(["release", "press"]);
    await expect(result.waitUntilExit()).resolves.toBeUndefined();
    result.dispose();
  });
});

describe("semantic input terminal ownership", () => {
  test("useInput enables bracketed paste while active and restores it on unmount", async () => {
    const stdout = makeFakeWritable();
    const stderr = makeFakeWritable();
    const { stream: stdin } = makeFakeStdin();
    const writes = captureWrites(stdout);
    const App = defineComponent(() => {
      useInput(() => "continue");
      return () => <Text>listening</Text>;
    });
    const app = createApp(App);

    app.mount({ stdout, stderr, stdin, maxFps: 0, patchConsole: false });
    await nextTick();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(writes).toContain(PASTE_ON);

    app.unmount();
    await nextTick();
    await new Promise<void>((resolve) => setImmediate(resolve));
    expect(writes).toContain(PASTE_OFF);

    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  });

  test("multiple handlers share one physical paste-mode lifetime", async () => {
    const stdout = makeFakeWritable();
    const stderr = makeFakeWritable();
    const { stream: stdin } = makeFakeStdin();
    const writes = captureWrites(stdout);
    const firstActive = shallowRef(true);
    const secondActive = shallowRef(true);
    const App = defineComponent(() => {
      useInput(() => "continue", { isActive: firstActive });
      useInput(() => "continue", { isActive: secondActive });
      return () => <Text>listening</Text>;
    });
    const app = createApp(App);

    app.mount({ stdout, stderr, stdin, maxFps: 0, patchConsole: false });
    await nextTick();
    expect(writes.filter((write) => write === PASTE_ON)).toHaveLength(1);

    firstActive.value = false;
    await nextTick();
    await Promise.resolve();
    expect(writes).not.toContain(PASTE_OFF);

    secondActive.value = false;
    await nextTick();
    await Promise.resolve();
    expect(writes.filter((write) => write === PASTE_OFF)).toHaveLength(1);

    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  });
});
