import { defineComponent, nextTick, shallowRef } from "vue";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { createApp, Text, useInput, type TuiInputEvent } from "@vue-tui/runtime";
import { eventLabel, makeTrackedStreams, PASTE_ON } from "./harness.ts";

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
