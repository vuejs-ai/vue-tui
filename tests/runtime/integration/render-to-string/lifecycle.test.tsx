import {
  defineComponent,
  onMounted,
  onScopeDispose,
  onUnmounted,
  shallowRef,
  watchSyncEffect,
} from "vue";
import { describe, expect, test } from "vite-plus/test";
import { Box, renderToString, Text } from "@vue-tui/runtime";

describe("renderToString lifecycle", () => {
  test("captures initial render before onMounted state updates", () => {
    const App = defineComponent(() => {
      const text = shallowRef("Initial");
      onMounted(() => {
        text.value = "Mounted";
      });
      return () => <Text>{text.value}</Text>;
    });
    const output = renderToString(App);
    expect(output).toBe("Initial");
  });

  test("watchSyncEffect state updates are reflected in output", () => {
    const App = defineComponent(() => {
      const text = shallowRef("Initial");
      // watchSyncEffect runs synchronously during setup, analogous to
      // React's useLayoutEffect — state updates are flushed before paint.
      watchSyncEffect(() => {
        text.value = "Sync Updated";
      });
      return () => <Text>{text.value}</Text>;
    });
    const output = renderToString(App);
    expect(output).toBe("Sync Updated");
  });

  test("runs onScopeDispose cleanup on teardown", () => {
    let cleanupRan = false;
    const App = defineComponent(() => {
      onScopeDispose(() => {
        cleanupRan = true;
      });
      return () => <Text>Cleanup test</Text>;
    });
    const output = renderToString(App);
    expect(output).toBe("Cleanup test");
    expect(cleanupRan).toBe(true);
  });

  test("rethrows an unmount lifecycle error after host cleanup", () => {
    const unmountError = new Error("unmount failed");
    const App = defineComponent(() => {
      onUnmounted(() => {
        throw unmountError;
      });
      return () => <Text>cleanup error</Text>;
    });
    let caught: unknown;

    try {
      renderToString(App);
    } catch (error) {
      caught = error;
    }

    expect(caught).toBe(unmountError);
  });

  // ── Error handling ─────────────────────────────────────

  test("text outside Text component throws", () => {
    const App = defineComponent(() => () => <Box>{"raw text"}</Box>);
    expect(() => renderToString(App)).toThrow(/must be rendered inside <Text>/);
  });

  test("subsequent calls work after a component error", () => {
    const Broken = defineComponent(() => {
      throw new Error("Boom");
    });
    expect(() => renderToString(Broken)).toThrow();
    const Ok = defineComponent(() => () => <Text>Still works</Text>);
    const output = renderToString(Ok);
    expect(output).toBe("Still works");
  });

  // ── Independence ───────────────────────────────────────

  test("can be called multiple times independently", () => {
    const First = defineComponent(() => () => <Text>First</Text>);
    const Second = defineComponent(() => () => <Text>Second</Text>);
    const output1 = renderToString(First);
    const output2 = renderToString(Second);
    expect(output1).toBe("First");
    expect(output2).toBe("Second");
  });

  // ── Deeply nested tree ────────────────────────────────
});
