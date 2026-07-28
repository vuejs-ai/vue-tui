import type { Readable } from "node:stream";
import { defineComponent, shallowRef } from "vue";
import { describe, expect, test } from "vite-plus/test";
import {
  Box,
  renderToString,
  Text,
  useApp,
  useBoxMetrics,
  useInput,
  useStdin,
} from "@vue-tui/runtime";
import { useStderr, useStdout } from "../../../../packages/runtime/dist/internal.mjs";

describe("renderToString terminal context", () => {
  test("useInput does not throw in renderToString", () => {
    const App = defineComponent(() => {
      useInput(() => undefined);
      return () => <Text>with input</Text>;
    });
    const output = renderToString(App);
    expect(output).toContain("with input");
  });

  test("useApp does not throw in renderToString", () => {
    const App = defineComponent(() => {
      const { exit } = useApp();
      // exit is a function but calling it is a no-op
      void exit;
      return () => <Text>with exit</Text>;
    });
    const output = renderToString(App);
    expect(output).toContain("with exit");
  });

  test("useApp exit is inert in a string render", () => {
    let inspected = 0;
    const hostile = new Proxy(
      {},
      {
        get() {
          inspected++;
          throw new Error("string-host exit must not inspect its argument");
        },
      },
    );
    const App = defineComponent(() => {
      const exit = useApp().exit as (value?: unknown) => void;
      exit();
      exit(new Error("ignored"));
      exit("invalid but ignored");
      exit(null);
      exit(hostile);
      return () => <Text>still rendered</Text>;
    });

    expect(renderToString(App)).toBe("still rendered");
    expect(inspected).toBe(0);
  });

  test("useStdin does not throw in renderToString", () => {
    let captured: ReturnType<typeof useStdin> | undefined;
    const App = defineComponent(() => {
      captured = useStdin();
      return () => <Text>with stdin</Text>;
    });
    const output = renderToString(App);
    expect(output).toContain("with stdin");
    expect(Reflect.ownKeys(captured!)).toEqual(["stdin", "isRawModeSupported", "setRawMode"]);
    expect(Reflect.get(captured!.stdin, "isTTY")).toBe(false);
    expect(captured?.isRawModeSupported).toBe(false);
    expect(() => captured?.setRawMode(true)).not.toThrow();
  });

  test("useStdout does not throw in renderToString", () => {
    const App = defineComponent(() => {
      const stdout = useStdout();
      void stdout;
      return () => <Text>with stdout</Text>;
    });
    const output = renderToString(App);
    expect(output).toContain("with stdout");
  });

  test("useStderr does not throw in renderToString", () => {
    const App = defineComponent(() => {
      const stderr = useStderr();
      void stderr;
      return () => <Text>with stderr</Text>;
    });
    const output = renderToString(App);
    expect(output).toContain("with stderr");
  });

  test("string terminal streams are isolated and direct writes remain inert", () => {
    let capturedStdin: Readable | undefined;
    let capturedStdout: NodeJS.WriteStream | undefined;
    let capturedStderr: NodeJS.WriteStream | undefined;
    const App = defineComponent(() => {
      capturedStdin = useStdin().stdin;
      capturedStdout = useStdout().stdout;
      capturedStderr = useStderr().stderr;
      capturedStdout.write("discard stdout");
      capturedStderr.write("discard stderr");
      return () => <Text>isolated</Text>;
    });

    expect(renderToString(App, { width: 29 })).toBe("isolated");
    expect(capturedStdin).not.toBe(process.stdin);
    expect(capturedStdout).not.toBe(process.stdout);
    expect(capturedStderr).not.toBe(process.stderr);
    expect(Reflect.get(capturedStdin!, "isTTY")).toBe(false);
    expect(capturedStdout?.isTTY).toBe(false);
    expect(capturedStdout?.columns).toBe(29);
  });

  // ── B29: renderToString serves the TERMINAL composables with inert no-op
  // contexts ──────────────────────────────────────────────────────────────
  //
  // renderToString runs with NO terminal session: it provides no-op AppContext +
  // StdinContext. The
  // existing suite covers useInput/useApp/useStdin/useStdout/useStderr. These
  // pin the remaining common terminal composables — semantic input and
  // useBoxMetrics — so that
  // rendering a component which CALLS them degrades to inert values instead of
  // throwing (they must still return a string).
  describe("terminal composables degrade to no-ops (do not throw)", () => {
    test("paste handling through useInput stays inert in renderToString", () => {
      let pasted = "";
      const App = defineComponent(() => {
        useInput((event) => {
          if (event.type === "paste") pasted = event.text;
        });
        return () => <Text>with paste</Text>;
      });
      const output = renderToString(App);
      expect(output).toBe("with paste");
      // The no-op stdin never emits a paste, so the handler stayed inert.
      expect(pasted).toBe("");
    });

    test("useBoxMetrics reports unmeasured state in renderToString", () => {
      const App = defineComponent(() => {
        const boxRef = shallowRef<InstanceType<typeof Box> | null>(null);
        const metrics = useBoxMetrics(boxRef);
        return () => (
          <Box ref={boxRef}>
            <Text>{metrics.hasMeasured.value ? "measured" : "unavailable"}</Text>
          </Box>
        );
      });
      const output = renderToString(App, { width: 40 });
      expect(output).toContain("unavailable");
    });

    test("input and box size render together without throwing", () => {
      const App = defineComponent(() => {
        useInput(() => undefined);
        const boxRef = shallowRef<InstanceType<typeof Box> | null>(null);
        useBoxMetrics(boxRef);
        return () => (
          <Box ref={boxRef}>
            <Text>all</Text>
          </Box>
        );
      });
      const output = renderToString(App, { width: 40 });
      expect(output).toContain("all");
    });
  });
});
