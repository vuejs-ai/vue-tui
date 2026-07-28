import { defineComponent } from "vue";
import { describe, expect, test, vi } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { createApp, Text, useInput, type TuiInputEvent } from "@vue-tui/runtime";
import { makeFakeWritable } from "../../lifecycle/test-streams.ts";
import { eventLabel, makeTrackedStreams } from "./harness.ts";

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

  test("a thrown handler does not block peers captured in the same app", async () => {
    const streams = makeTrackedStreams();
    const peerCalls: string[] = [];
    const App = defineComponent(() => {
      useInput(() => {
        throw new Error("handler failed");
      });
      useInput((event) => {
        peerCalls.push(eventLabel(event));
      });
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
      const exited = app.waitUntilExit();

      expect(() => streams.stdin.emit("data", "x")).toThrow("handler failed");
      expect(peerCalls).toEqual(["text:x"]);
      await expect(exited).rejects.toThrow("handler failed");
    } finally {
      app.unmount();
      streams.destroy();
    }
  });
});
