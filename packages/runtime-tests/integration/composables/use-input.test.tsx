import { defineComponent, nextTick, shallowRef } from "vue";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { createApp, renderToString, Text, useInput, type TuiInputEvent } from "@vue-tui/runtime";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "../lifecycle/test-streams.ts";

const PASTE_ON = "\x1b[?2004h";
const PASTE_OFF = "\x1b[?2004l";

function eventLabel(event: TuiInputEvent): string {
  if (event.kind === "text" || event.kind === "paste") {
    return `${event.kind}:${event.text}`;
  }
  return event.name ? `key:${event.name}` : `key:${event.character}`;
}

function makeTrackedStreams() {
  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const rawModeCalls: boolean[] = [];
  Object.assign(stdin, {
    isRaw: false,
    setRawMode(this: NodeJS.ReadStream & { isRaw: boolean }, value: boolean) {
      rawModeCalls.push(value);
      this.isRaw = value;
      return this;
    },
  });
  return {
    stdout,
    stderr,
    stdin,
    rawModeCalls,
    stdoutWrites: captureWrites(stdout),
    destroy() {
      stdin.destroy();
      stdout.destroy();
      stderr.destroy();
    },
  };
}

describe("minimum normalized public input", () => {
  test("delivers one immutable fact to every captured application handler", async () => {
    const events: TuiInputEvent[] = [];
    const order: string[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        order.push("first");
        events.push(event);
        return { preventDefault: true };
      });
      useInput((event) => {
        order.push("second");
        events.push(event);
      });
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("\x03");

    expect(order).toEqual(["first", "second"]);
    expect(events[0]).toBe(events[1]);
    expect(events[0]).toEqual({
      kind: "key",
      character: "c",
      shift: false,
      alt: false,
      ctrl: true,
    });
    expect(Object.isFrozen(events[0])).toBe(true);
    expect(result.terminal.rawMode.current).toBe(true);
    result.unmount();
  });

  test("delivers insertion text, complete paste, named keys, and shortcut identities", async () => {
    const events: TuiInputEvent[] = [];
    const payload = "\x03\x1b[A\x1b[?31u";
    const App = defineComponent(() => {
      useInput((event) => {
        events.push(event);
      });
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("hello");
    await result.stdin.write(`\x1b[200~${payload}\x1b[201~`);
    await result.stdin.write("\x1b[A");
    await result.stdin.write("\x1bA");

    expect(events).toEqual([
      { kind: "text", text: "hello" },
      { kind: "paste", text: payload },
      { kind: "key", name: "up", shift: false, alt: false, ctrl: false },
      { kind: "key", character: "a", shift: true, alt: true, ctrl: false },
    ]);
    result.unmount();
  });

  test("does not expose release, unsupported, unsafe-modifier, uninterpreted, or pointer facts", async () => {
    const handler = vi.fn<(event: TuiInputEvent) => void>();
    const App = defineComponent(() => {
      useInput(handler);
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    for (const sequence of [
      "\x1b[99;5:3u",
      "\x1bOP",
      "\x1b[57430u",
      "\x1b[97;33u",
      "\x1b[?25h",
      "\x1b[<0;4;5M",
    ]) {
      await result.stdin.write(sequence);
    }

    expect(handler).not.toHaveBeenCalled();
    result.unmount();
  });

  test("keeps an active string-render registration inert", () => {
    const handler = vi.fn<(event: TuiInputEvent) => void>();
    const App = defineComponent(() => {
      useInput(handler);
      return () => <Text>string input</Text>;
    });

    expect(renderToString(App)).toContain("string input");
    expect(handler).not.toHaveBeenCalled();
  });
});

describe("handler and activation contract", () => {
  test("respects reactive activation and releases input while dormant", async () => {
    const events: string[] = [];
    const active = shallowRef(false);
    const App = defineComponent(() => {
      useInput(
        (event) => {
          events.push(eventLabel(event));
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
    expect(events).toEqual(["text:b"]);

    active.value = false;
    await nextTick();
    await Promise.resolve();
    expect(result.terminal.rawMode.current).toBe(false);
    await result.stdin.write("c");
    expect(events).toEqual(["text:b"]);
    result.unmount();
  });

  test("freezes active subscription membership at fact start", async () => {
    const calls: string[] = [];
    const secondActive = shallowRef(true);
    const App = defineComponent(() => {
      useInput((event) => {
        calls.push(`first:${eventLabel(event)}`);
        secondActive.value = false;
      });
      useInput(
        (event) => {
          calls.push(`second:${eventLabel(event)}`);
        },
        { isActive: secondActive },
      );
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("a");
    await result.stdin.write("b");

    expect(calls).toEqual(["first:text:a", "second:text:a", "first:text:b"]);
    result.unmount();
  });

  test("a closure can select a current handler without a reactive handler API", async () => {
    const calls: string[] = [];
    let current = (event: TuiInputEvent) => {
      calls.push(`first:${eventLabel(event)}`);
    };
    const App = defineComponent(() => {
      useInput((event) => {
        current(event);
      });
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("a");
    current = (event) => {
      calls.push(`second:${eventLabel(event)}`);
    };
    await result.stdin.write("b");

    expect(calls).toEqual(["first:text:a", "second:text:b"]);
    result.unmount();
  });

  test.each([
    ["null", null],
    ["object", {}],
    ["handler ref", shallowRef(() => undefined)],
  ])(
    "rejects a non-function initial handler (%s) before acquiring input",
    async (_label, handler) => {
      const streams = makeTrackedStreams();
      const App = defineComponent(() => {
        useInput(handler as never);
        return () => <Text>unreachable</Text>;
      });
      const app = createApp(App);

      try {
        app.mount({
          stdin: streams.stdin,
          stdout: streams.stdout,
          stderr: streams.stderr,
          patchConsole: false,
        });
        await expect(app.waitUntilExit()).rejects.toThrow("useInput() handler must be a function");
        expect(streams.rawModeCalls).toEqual([]);
        expect(streams.stdin.listenerCount("data")).toBe(0);
        expect(streams.stdoutWrites).not.toContain(PASTE_ON);
      } finally {
        app.unmount();
        streams.destroy();
      }
    },
  );

  test.each([
    ["null", null],
    ["array", []],
    ["function", () => undefined],
    ["inherited", Object.create({ isActive: true })],
    ["unknown field", { active: true }],
  ])("rejects invalid options (%s) before acquiring input", async (_label, options) => {
    const streams = makeTrackedStreams();
    const App = defineComponent(() => {
      useInput(() => undefined, options as never);
      return () => <Text>unreachable</Text>;
    });
    const app = createApp(App);

    try {
      app.mount({
        stdin: streams.stdin,
        stdout: streams.stdout,
        stderr: streams.stderr,
        patchConsole: false,
      });
      await expect(app.waitUntilExit()).rejects.toThrow(/useInput\(\) options/);
      expect(streams.rawModeCalls).toEqual([]);
      expect(streams.stdin.listenerCount("data")).toBe(0);
      expect(streams.stdoutWrites).not.toContain(PASTE_ON);
    } finally {
      app.unmount();
      streams.destroy();
    }
  });

  test.each([
    ["string", "yes"],
    ["number", 1],
    ["null", null],
    ["ref resolving to undefined", shallowRef<unknown>(undefined)],
  ])(
    "rejects an initially non-boolean isActive value (%s) before acquiring input",
    async (_label, isActive) => {
      const streams = makeTrackedStreams();
      const App = defineComponent(() => {
        useInput(() => undefined, { isActive: isActive as never });
        return () => <Text>unreachable</Text>;
      });
      const app = createApp(App);

      try {
        app.mount({
          stdin: streams.stdin,
          stdout: streams.stdout,
          stderr: streams.stderr,
          patchConsole: false,
        });
        await expect(app.waitUntilExit()).rejects.toThrow(
          "useInput() isActive must resolve to a boolean",
        );
        expect(streams.rawModeCalls).toEqual([]);
        expect(streams.stdin.listenerCount("data")).toBe(0);
        expect(streams.stdoutWrites).not.toContain(PASTE_ON);
      } finally {
        app.unmount();
        streams.destroy();
      }
    },
  );

  test("a later invalid activation enters fatal cleanup without publishing a partial state", async () => {
    const streams = makeTrackedStreams();
    const active = shallowRef<unknown>(true);
    const App = defineComponent(() => {
      useInput(() => undefined, { isActive: active as never });
      return () => <Text>listening</Text>;
    });
    const app = createApp(App);
    const exited = app.waitUntilExit();

    try {
      app.mount({
        stdin: streams.stdin,
        stdout: streams.stdout,
        stderr: streams.stderr,
        patchConsole: false,
      });
      expect(streams.rawModeCalls).toEqual([true]);

      active.value = "invalid";
      await nextTick().catch(() => undefined);
      await expect(exited).rejects.toThrow("useInput() isActive must resolve to a boolean");
      expect(streams.rawModeCalls).toEqual([true, false]);
      expect(streams.stdin.listenerCount("data")).toBe(0);
    } finally {
      app.unmount();
      streams.destroy();
    }
  });
});

describe("Ctrl+C delayed default", () => {
  test("ordinary undefined lets the Runtime default exit after every handler runs", async () => {
    const calls: string[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        calls.push(eventLabel(event));
      });
      return () => <Text>running</Text>;
    });

    const result = await render(App);
    await result.stdin.write("\x03");

    expect(calls).toEqual(["key:c"]);
    await expect(result.waitUntilExit()).resolves.toBeUndefined();
    result.dispose();
  });

  test("the exact preventDefault result keeps the app active without stopping peers", async () => {
    const calls: string[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        calls.push(`first:${eventLabel(event)}`);
        return event.kind === "key" && event.character === "c" && event.ctrl
          ? { preventDefault: true }
          : undefined;
      });
      useInput((event) => {
        calls.push(`second:${eventLabel(event)}`);
      });
      return () => <Text>running</Text>;
    });

    const result = await render(App);
    await result.stdin.write("\x03");
    await result.stdin.write("x");

    expect(calls).toEqual(["first:key:c", "second:key:c", "first:text:x", "second:text:x"]);
    expect(result.terminal.rawMode.current).toBe(true);
    result.unmount();
  });

  test("a distinguishable Kitty Ctrl+Shift+C does not trigger the Runtime default", async () => {
    const events: TuiInputEvent[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        events.push(event);
      });
      return () => <Text>running</Text>;
    });

    const result = await render(App);
    await result.stdin.write("\x1b[99;6:1u");
    await result.stdin.write("x");

    expect(events).toEqual([
      { kind: "key", character: "c", shift: true, alt: false, ctrl: true },
      { kind: "text", text: "x" },
    ]);
    expect(result.terminal.rawMode.current).toBe(true);
    result.unmount();
  });

  test.each([
    ["Promise", Promise.resolve(undefined)],
    ["false", false],
    ["extra field", { preventDefault: true, extra: true }],
  ])("fails the fact closed for an invalid %s handler result", async (_label, invalidResult) => {
    const laterHandler = vi.fn<(event: TuiInputEvent) => void>();
    const App = defineComponent(() => {
      useInput((() => invalidResult) as never);
      useInput(laterHandler);
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await expect(result.stdin.write("\x03")).rejects.toThrow(
      "useInput() handlers must synchronously return undefined or the exact object { preventDefault: true }.",
    );
    expect(laterHandler).not.toHaveBeenCalled();
    result.unmount();
  });

  test.each([
    [
      "a thrown handler error",
      (() => {
        throw new Error("handler failed");
      }) as never,
      "handler failed",
    ],
    [
      "an invalid handler result",
      (() => false) as never,
      "useInput() handlers must synchronously return undefined or the exact object { preventDefault: true }.",
    ],
  ])(
    "%s exits only the failing app after the shared fact reaches its peer",
    async (_label, failingHandler, expectedMessage) => {
      const streams = makeTrackedStreams();
      const peerStdout = makeFakeWritable();
      const peerStderr = makeFakeWritable();
      const peerCalls: string[] = [];
      const FailingApp = defineComponent(() => {
        useInput(failingHandler);
        return () => <Text>failing</Text>;
      });
      const PeerApp = defineComponent(() => {
        useInput((event) => {
          peerCalls.push(eventLabel(event));
        });
        return () => <Text>peer</Text>;
      });
      const failing = createApp(FailingApp);
      const peer = createApp(PeerApp);

      try {
        failing.mount({
          stdin: streams.stdin,
          stdout: streams.stdout,
          stderr: streams.stderr,
          patchConsole: false,
        });
        peer.mount({
          stdin: streams.stdin,
          stdout: peerStdout,
          stderr: peerStderr,
          patchConsole: false,
        });
        const exited = failing.waitUntilExit();

        expect(() => streams.stdin.emit("data", "x")).toThrow(expectedMessage);
        expect(peerCalls).toEqual(["text:x"]);
        await expect(exited).rejects.toThrow(expectedMessage);

        expect(streams.rawModeCalls).toEqual([true]);
        expect(streams.stdin.listenerCount("data")).toBe(1);
        expect(() => streams.stdin.emit("data", "y")).not.toThrow();
        expect(peerCalls).toEqual(["text:x", "text:y"]);

        peer.unmount();
        expect(streams.rawModeCalls).toEqual([true, false]);
        expect(streams.stdin.listenerCount("data")).toBe(0);
      } finally {
        failing.unmount();
        peer.unmount();
        peerStdout.destroy();
        peerStderr.destroy();
        streams.destroy();
      }
    },
  );
});

describe("semantic input terminal ownership", () => {
  test("multiple active handlers share one paste/raw lifetime", async () => {
    const streams = makeTrackedStreams();
    const firstActive = shallowRef(true);
    const secondActive = shallowRef(true);
    const App = defineComponent(() => {
      useInput(() => undefined, { isActive: firstActive });
      useInput(() => undefined, { isActive: secondActive });
      return () => <Text>listening</Text>;
    });
    const app = createApp(App);

    try {
      app.mount({
        stdin: streams.stdin,
        stdout: streams.stdout,
        stderr: streams.stderr,
        patchConsole: false,
      });
      await nextTick();
      expect(streams.rawModeCalls).toEqual([true]);
      expect(streams.stdoutWrites.filter((write) => write === PASTE_ON)).toHaveLength(1);

      firstActive.value = false;
      await nextTick();
      await Promise.resolve();
      expect(streams.rawModeCalls).toEqual([true]);
      expect(streams.stdoutWrites).not.toContain(PASTE_OFF);

      secondActive.value = false;
      await nextTick();
      await Promise.resolve();
      expect(streams.rawModeCalls).toEqual([true, false]);
      expect(streams.stdoutWrites.filter((write) => write === PASTE_OFF)).toHaveLength(1);
    } finally {
      app.unmount();
      streams.destroy();
    }
  });
});
