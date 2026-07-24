import { defineComponent, nextTick, shallowRef } from "vue";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { createApp, renderToString, Text, useInput, type TuiInputEvent } from "@vue-tui/runtime";
import { captureWrites, makeFakeStdin, makeFakeWritable } from "../lifecycle/test-streams.ts";

const PASTE_ON = "\x1b[?2004h";
const PASTE_OFF = "\x1b[?2004l";

const noModifiers = {
  shift: false,
  alt: false,
  ctrl: false,
  meta: false,
  super: false,
  hyper: false,
} as const;

function eventLabel(event: TuiInputEvent): string {
  if (event.type === "text" || event.type === "paste") {
    return `${event.type}:${event.text}`;
  }
  return event.key.name ? `key:${event.key.name}` : `key:${event.key.character}`;
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
  test("broadcasts one immutable event to every active subscriber without an ordering contract", async () => {
    const firstEvents: TuiInputEvent[] = [];
    const secondEvents: TuiInputEvent[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        firstEvents.push(event);
        return "ignored";
      });
      useInput((event) => {
        secondEvents.push(event);
        return Promise.resolve("ignored");
      });
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("\x03");

    expect(firstEvents).toHaveLength(1);
    expect(secondEvents).toHaveLength(1);
    expect(firstEvents[0]).toBe(secondEvents[0]);
    expect(firstEvents[0]).toEqual({
      type: "key",
      key: {
        character: "c",
        ...noModifiers,
        ctrl: true,
      },
    });
    expect(Object.isFrozen(firstEvents[0])).toBe(true);
    expect(Object.isFrozen(firstEvents[0]?.type === "key" ? firstEvents[0].key : undefined)).toBe(
      true,
    );
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
      { type: "text", text: "hello" },
      { type: "paste", text: payload },
      { type: "key", key: { name: "up", ...noModifiers } },
      {
        type: "key",
        key: { character: "a", ...noModifiers, shift: true, alt: true },
      },
    ]);
    result.unmount();
  });

  test("does not expose release, unknown private, uninterpreted, or pointer facts", async () => {
    const handler = vi.fn<(event: TuiInputEvent) => void>();
    const App = defineComponent(() => {
      useInput(handler);
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    for (const sequence of [
      "\x1b[0;1:3;229u",
      "\x1b[99;5:3u",
      "\x1b[58000u",
      "\x1b[?25h",
      "\x1b[<0;4;5M",
    ]) {
      await result.stdin.write(sequence);
    }

    expect(handler).not.toHaveBeenCalled();
    result.unmount();
  });

  test("delivers a Kitty key repeat as another ordinary event", async () => {
    const events: TuiInputEvent[] = [];
    const App = defineComponent(() => {
      useInput((event) => {
        events.push(event);
      });
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("\x1b[1;5:1A");
    await result.stdin.write("\x1b[1;5:2A");

    const expected = {
      type: "key",
      key: { name: "up", ...noModifiers, ctrl: true },
    };
    expect(events).toEqual([expected, expected]);
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

  test("resolves a live handler ref when each event arrives", async () => {
    const calls: string[] = [];
    const handler = shallowRef<(event: TuiInputEvent) => void>((event) => {
      calls.push(`first:${eventLabel(event)}`);
    });
    const App = defineComponent(() => {
      useInput(handler);
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("a");
    handler.value = (event) => {
      calls.push(`second:${eventLabel(event)}`);
    };
    await result.stdin.write("b");

    expect(calls).toEqual(["first:text:a", "second:text:b"]);
    result.unmount();
  });

  test("treats a direct function as the handler rather than a handler getter", async () => {
    const returnedHandler = vi.fn<(event: TuiInputEvent) => void>();
    const directHandler = vi.fn((_event: TuiInputEvent) => returnedHandler);
    const App = defineComponent(() => {
      useInput(directHandler);
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("a");

    expect(directHandler).toHaveBeenCalledTimes(1);
    expect(directHandler.mock.calls[0]?.[0]).toEqual({ type: "text", text: "a" });
    expect(returnedHandler).not.toHaveBeenCalled();
    result.unmount();
  });

  test("keeps a callable ref-marked value classified as a direct handler", async () => {
    const valueHandler = vi.fn<(event: TuiInputEvent) => void>();
    const directHandler = vi.fn<(event: TuiInputEvent) => void>();
    const valueGetter = vi.fn(() => valueHandler);
    Object.defineProperties(directHandler, {
      __v_isRef: { value: true },
      value: { get: valueGetter },
    });
    const App = defineComponent(() => {
      useInput(directHandler);
      return () => <Text>listening</Text>;
    });

    const result = await render(App);
    await result.stdin.write("a");

    expect(directHandler).toHaveBeenCalledTimes(1);
    expect(directHandler.mock.calls[0]?.[0]).toEqual({ type: "text", text: "a" });
    expect(valueGetter).not.toHaveBeenCalled();
    expect(valueHandler).not.toHaveBeenCalled();
    result.unmount();
  });

  test.each([
    ["null", null],
    ["object", {}],
  ])(
    "rejects a non-function initial handler (%s) before acquiring input",
    async (_label, handler) => {
      const streams = makeTrackedStreams();
      const App = defineComponent(() => {
        useInput(handler as never);
        return () => <Text>unreachable</Text>;
      });
      const app = createApp(App);
      app.config.warnHandler = () => {};

      try {
        const exited = app.waitUntilExit();
        expect(() =>
          app.mount({
            stdin: streams.stdin,
            stdout: streams.stdout,
            stderr: streams.stderr,
            patchConsole: false,
          }),
        ).toThrow("useInput() handler must be a function");
        await expect(exited).rejects.toThrow("useInput() handler must be a function");
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
    app.config.warnHandler = () => {};

    try {
      const exited = app.waitUntilExit();
      expect(() =>
        app.mount({
          stdin: streams.stdin,
          stdout: streams.stdout,
          stderr: streams.stderr,
          patchConsole: false,
        }),
      ).toThrow(/useInput\(\) options/);
      await expect(exited).rejects.toThrow(/useInput\(\) options/);
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
  ])(
    "rejects an initially non-boolean isActive value (%s) before acquiring input",
    async (_label, isActive) => {
      const streams = makeTrackedStreams();
      const App = defineComponent(() => {
        useInput(() => undefined, { isActive: isActive as never });
        return () => <Text>unreachable</Text>;
      });
      const app = createApp(App);
      app.config.warnHandler = () => {};

      try {
        const exited = app.waitUntilExit();
        expect(() =>
          app.mount({
            stdin: streams.stdin,
            stdout: streams.stdout,
            stderr: streams.stderr,
            patchConsole: false,
          }),
        ).toThrow("useInput() isActive must resolve to a boolean");
        await expect(exited).rejects.toThrow("useInput() isActive must resolve to a boolean");
        expect(streams.rawModeCalls).toEqual([]);
        expect(streams.stdin.listenerCount("data")).toBe(0);
        expect(streams.stdoutWrites).not.toContain(PASTE_ON);
      } finally {
        app.unmount();
        streams.destroy();
      }
    },
  );

  test("an initially invalid reactive isActive source exits before acquiring input", async () => {
    const streams = makeTrackedStreams();
    const isActive = shallowRef<unknown>(undefined);
    const App = defineComponent(() => {
      useInput(() => undefined, { isActive: isActive as never });
      return () => <Text>unreachable</Text>;
    });
    const app = createApp(App);

    try {
      expect(() =>
        app.mount({
          stdin: streams.stdin,
          stdout: streams.stdout,
          stderr: streams.stderr,
          patchConsole: false,
        }),
      ).not.toThrow();
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
  });

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

describe("handler results and failures", () => {
  test.each([
    ["Promise", Promise.resolve(undefined)],
    ["false", false],
    ["legacy-looking object", { preventDefault: true }],
    ["arbitrary object", { status: "handled" }],
  ])(
    "ignores an arbitrary %s handler result and still broadcasts",
    async (_label, handlerResult) => {
      const firstHandler = vi.fn((_: TuiInputEvent) => handlerResult);
      const secondHandler = vi.fn<(event: TuiInputEvent) => void>();
      const App = defineComponent(() => {
        useInput(firstHandler);
        useInput(secondHandler);
        return () => <Text>listening</Text>;
      });

      const result = await render(App);
      await result.stdin.write("x");

      expect(firstHandler).toHaveBeenCalledTimes(1);
      expect(secondHandler).toHaveBeenCalledTimes(1);
      expect(firstHandler.mock.calls[0]?.[0]).toBe(secondHandler.mock.calls[0]?.[0]);
      expect(result.terminal.rawMode.current).toBe(true);
      result.unmount();
    },
  );

  test("a thrown handler error exits only the failing app after the shared fact reaches its peer", async () => {
    const streams = makeTrackedStreams();
    const peerStdout = makeFakeWritable();
    const peerStderr = makeFakeWritable();
    const peerCalls: string[] = [];
    const FailingApp = defineComponent(() => {
      useInput(() => {
        throw new Error("handler failed");
      });
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

      expect(() => streams.stdin.emit("data", "x")).toThrow("handler failed");
      expect(peerCalls).toEqual(["text:x"]);
      await expect(exited).rejects.toThrow("handler failed");

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
  });
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
