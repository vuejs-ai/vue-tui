import {
  defineComponent,
  isReadonly,
  nextTick,
  shallowReactive,
  shallowRef,
  type ComponentPublicInstance,
} from "vue";
import { describe, expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import {
  Box,
  Text,
  useCaret,
  useFocus,
  type UseCaretReturn,
  type UseFocusReturn,
} from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";

describe("useCaret", () => {
  test.each(["inline", "fullscreen"] as const)(
    "maps an inner Text cell through its focused ancestor in %s mode",
    async (mode) => {
      let caret!: UseCaretReturn;
      const App = defineComponent(() => {
        const focusTarget = shallowRef<ComponentPublicInstance | null>(null);
        const caretTarget = shallowRef<ComponentPublicInstance | null>(null);
        const focus = useFocus(focusTarget, { autoFocus: true });
        caret = useCaret(caretTarget, { focus, position: { x: 1, y: 0 } });
        return () => (
          <Box ref={focusTarget} marginLeft={2} width={8} height={1}>
            <Text ref={caretTarget}>abc</Text>
          </Box>
        );
      });

      const result = await render(App, { columns: 20, rows: 4, host: { mode } });
      try {
        expect(caret.state.value).toEqual({
          status: "visible",
          surface: { x: 3, y: 0 },
        });
        expect(Object.isFrozen(caret)).toBe(true);
        expect(isReadonly(caret.state)).toBe(true);
        expect(Object.isFrozen(caret.state.value)).toBe(true);
        if (caret.state.value.status === "visible") {
          expect(Object.isFrozen(caret.state.value.surface)).toBe(true);
        }
      } finally {
        result.dispose();
      }
    },
  );

  test("keeps independent owners and follows the effective F4 focus target", async () => {
    let focusA!: UseFocusReturn;
    let focusB!: UseFocusReturn;
    let caretA!: UseCaretReturn;
    let caretB!: UseCaretReturn;
    const showA = shallowRef(true);
    const App = defineComponent(() => {
      const boxA = shallowRef<ComponentPublicInstance | null>(null);
      const boxB = shallowRef<ComponentPublicInstance | null>(null);
      const textA = shallowRef<ComponentPublicInstance | null>(null);
      const textB = shallowRef<ComponentPublicInstance | null>(null);
      focusA = useFocus(boxA, { autoFocus: true });
      focusB = useFocus(boxB);
      caretA = useCaret(textA, { focus: focusA, position: { x: 1, y: 0 } });
      caretB = useCaret(textB, { focus: focusB, position: { x: 2, y: 0 } });
      return () => (
        <Box flexDirection="column">
          {showA.value ? (
            <Box ref={boxA} height={1}>
              <Text ref={textA}>aaa</Text>
            </Box>
          ) : null}
          <Box ref={boxB} height={1}>
            <Text ref={textB}>bbb</Text>
          </Box>
        </Box>
      );
    });

    const result = await render(App, { columns: 10, rows: 4 });
    try {
      expect(caretA.state.value.status).toBe("visible");
      expect(caretB.state.value).toEqual({ status: "inactive" });

      expect(focusB.focus()).toBe(true);
      await result.waitUntilRenderFlush();
      expect(caretA.state.value).toEqual({ status: "inactive" });
      expect(caretB.state.value).toEqual({
        status: "visible",
        surface: { x: 2, y: 1 },
      });

      showA.value = false;
      await nextTick();
      await result.waitUntilRenderFlush();
      expect(caretB.state.value).toEqual({
        status: "visible",
        surface: { x: 2, y: 0 },
      });
    } finally {
      result.dispose();
    }
  });

  test("fails closed for a later invalid reactive point and recovers after repaint", async () => {
    const position = shallowReactive<{ x: number; y: number }>({ x: 1, y: 0 });
    let caret!: UseCaretReturn;
    const App = defineComponent(() => {
      const target = shallowRef<ComponentPublicInstance | null>(null);
      const focus = useFocus(target, { autoFocus: true });
      caret = useCaret(target, { focus, position });
      return () => <Text ref={target}>abc</Text>;
    });

    const result = await render(App, { columns: 10, rows: 3 });
    try {
      expect(caret.state.value.status).toBe("visible");
      position.x = Number.NaN;
      expect(caret.state.value).toEqual({ status: "hidden", reason: "invalid-position" });
      position.x = 2;
      expect(caret.state.value).toEqual({ status: "hidden", reason: "pending" });
      await result.waitUntilRenderFlush();
      expect(caret.state.value).toEqual({
        status: "visible",
        surface: { x: 2, y: 0 },
      });
    } finally {
      result.dispose();
    }
  });

  test("reports detached and unrelated targets without retaining an old surface point", async () => {
    const showTarget = shallowRef(true);
    const related = shallowRef(true);
    let caret!: UseCaretReturn;
    const App = defineComponent(() => {
      const focusTarget = shallowRef<ComponentPublicInstance | null>(null);
      const caretTarget = shallowRef<ComponentPublicInstance | null>(null);
      const focus = useFocus(focusTarget, { autoFocus: true });
      caret = useCaret(caretTarget, { focus, position: { x: 0, y: 0 } });
      return () => (
        <Box flexDirection="column">
          <Box ref={focusTarget} height={1}>
            {related.value && showTarget.value ? <Text ref={caretTarget}>inside</Text> : null}
          </Box>
          {!related.value && showTarget.value ? <Text ref={caretTarget}>outside</Text> : null}
        </Box>
      );
    });

    const result = await render(App, { columns: 12, rows: 4 });
    try {
      expect(caret.state.value.status).toBe("visible");
      related.value = false;
      await nextTick();
      await result.waitUntilRenderFlush();
      expect(caret.state.value).toEqual({ status: "hidden", reason: "unrelated" });

      showTarget.value = false;
      await nextTick();
      expect(caret.state.value).toEqual({ status: "hidden", reason: "detached" });
    } finally {
      result.dispose();
    }
  });

  test.each(["inline", "fullscreen"] as const)(
    "reports unavailable and leaves the transcript cursor visible for a %s screen-reader request",
    async (mode) => {
      let caret!: UseCaretReturn;
      const App = defineComponent(() => {
        const target = shallowRef<ComponentPublicInstance | null>(null);
        const focus = useFocus(target, { autoFocus: true });
        caret = useCaret(target, { focus, position: { x: 1, y: 0 } });
        return () => <Text ref={target}>linear transcript</Text>;
      });

      const result = await render(App, {
        columns: 20,
        rows: 4,
        host: { mode, presentation: "screen-reader" },
      });
      try {
        expect(caret.state.value).toEqual({ status: "unavailable" });
        expect((await result.screen()).cursor.visible).toBe(true);
      } finally {
        result.dispose();
      }
    },
  );

  test("detaches an active request after its target moves into Static history", async () => {
    let caret!: UseCaretReturn;
    const App = defineComponent(() => {
      const focusTarget = shallowRef<ComponentPublicInstance | null>(null);
      const caretTarget = shallowRef<ComponentPublicInstance | null>(null);
      const focus = useFocus(focusTarget, { autoFocus: true });
      caret = useCaret(caretTarget, { focus, position: { x: 0, y: 0 } });
      return () => (
        <Box ref={focusTarget} flexDirection="column">
          <Static>
            <Text ref={caretTarget}>history</Text>
          </Static>
          <Text>live</Text>
        </Box>
      );
    });

    const result = await render(App, { columns: 20, rows: 4 });
    try {
      expect(caret.state.value).toEqual({ status: "hidden", reason: "detached" });
      expect((await result.screen()).cursor.visible).toBe(false);
    } finally {
      result.dispose();
    }
  });

  test("validates initial ownership synchronously", () => {
    expect(() => useCaret(undefined, {} as never)).toThrow(
      "useCaret() must be called inside a vue-tui render tree",
    );
  });
});
