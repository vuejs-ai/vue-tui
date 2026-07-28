import {
  defineComponent,
  h,
  onMounted,
  shallowRef,
  vShow,
  watch,
  withDirectives,
  type ComponentPublicInstance,
} from "vue";
import { describe, expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useFocus, type UseFocusReturn } from "@vue-tui/runtime";
import { flushAcceptedRender } from "./harness.ts";

describe("component-root boundary normalization", () => {
  const DirectBox = defineComponent(() => () => <Box />);
  const DirectText = defineComponent(() => () => <Text>text</Text>);
  const Inner = defineComponent(() => () => <Box />);
  const ComponentChain = defineComponent(() => () => <Inner />);
  const MultiRoot = defineComponent(() => () => [<Box key="a" />, <Box key="b" />]);
  const EmptyFragment = defineComponent(() => () => []);
  const CommentRoot = defineComponent(() => () => null);

  test.each([
    ["direct Box", DirectBox],
    ["direct Text", DirectText],
    ["stateful component chain", ComponentChain],
    ["true multi-root Fragment", MultiRoot],
    ["empty Fragment", EmptyFragment],
  ] as const)("accepts a %s as one component boundary", async (_label, Target) => {
    let focus!: UseFocusReturn;
    const App = defineComponent(() => {
      const target = shallowRef<ComponentPublicInstance | null>(null);
      focus = useFocus(target);
      onMounted(() => focus.focus());
      return () => h(Target, { ref: target });
    });

    const result = await render(App);
    try {
      expect(focus.isFocused.value).toBe(true);
    } finally {
      result.dispose();
      expect(focus.isFocused.value).toBe(false);
    }
  });

  test("treats a Comment root as unavailable without disturbing another owner", async () => {
    let logical!: UseFocusReturn;
    let comment!: UseFocusReturn;
    const App = defineComponent(() => {
      const target = shallowRef<ComponentPublicInstance | null>(null);
      logical = useFocus();
      comment = useFocus(target);
      logical.focus();
      onMounted(() => comment.focus());
      return () => h(CommentRoot, { ref: target });
    });

    const result = await render(App);
    try {
      expect(logical.isFocused.value).toBe(true);
      expect(comment.isFocused.value).toBe(false);
    } finally {
      result.dispose();
    }
  });

  test("does not reinterpret child visibility inside a true Fragment boundary", async () => {
    const firstShown = shallowRef(true);
    const secondShown = shallowRef(true);
    const ancestorShown = shallowRef(true);
    let focus!: UseFocusReturn;
    const Multi = defineComponent(() => () => [
      withDirectives(h(Box, { key: "first" }), [[vShow, firstShown.value]]),
      withDirectives(h(Box, { key: "second" }), [[vShow, secondShown.value]]),
    ]);
    const App = defineComponent(() => {
      const target = shallowRef<ComponentPublicInstance | null>(null);
      focus = useFocus(target);
      onMounted(() => focus.focus());
      return () =>
        withDirectives(
          h(Box, null, () => h(Multi, { ref: target })),
          [[vShow, ancestorShown.value]],
        );
    });

    const result = await render(App);
    try {
      expect(focus.isFocused.value).toBe(true);
      firstShown.value = false;
      secondShown.value = false;
      await flushAcceptedRender(result);
      expect(focus.isFocused.value).toBe(true);

      ancestorShown.value = false;
      await flushAcceptedRender(result);
      expect(focus.isFocused.value).toBe(false);

      ancestorShown.value = true;
      await flushAcceptedRender(result);
      expect(focus.isFocused.value).toBe(false);
    } finally {
      result.dispose();
    }
  });
});

test("preserves one identity across valid keyed roots but clears an accepted missing state", async () => {
  const alternate = shallowRef(false);
  const mounted = shallowRef(true);
  const changes: boolean[] = [];
  let focus!: UseFocusReturn;
  const First = defineComponent(() => () => <Box />);
  const Second = defineComponent(() => () => <Text>second</Text>);
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    focus = useFocus(target);
    watch(focus.isFocused, (value) => changes.push(value), { flush: "sync" });
    onMounted(() => focus.focus());
    return () =>
      mounted.value
        ? h(alternate.value ? Second : First, {
            key: alternate.value ? "second" : "first",
            ref: target,
          })
        : null;
  });

  const result = await render(App);
  try {
    expect(focus.isFocused.value).toBe(true);
    changes.length = 0;

    alternate.value = true;
    await flushAcceptedRender(result);
    expect(focus.isFocused.value).toBe(true);
    expect(changes).toEqual([]);

    mounted.value = false;
    await flushAcceptedRender(result);
    expect(focus.isFocused.value).toBe(false);

    mounted.value = true;
    await flushAcceptedRender(result);
    expect(focus.isFocused.value).toBe(false);
  } finally {
    result.dispose();
  }
});

test.each([
  ["Inline TTY", {}],
  ["Fullscreen TTY", { mode: "fullscreen" as const }],
  ["Inline non-TTY", { stdout: "stream" as const }],
] as const)("uses the same logical focus model on %s", async (_label, options) => {
  let focus!: UseFocusReturn;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    focus = useFocus(target);
    onMounted(() => focus.focus());
    return () => <Box ref={target} />;
  });

  const result = await render(App, options);
  try {
    expect(focus.isFocused.value).toBe(true);
  } finally {
    result.dispose();
    expect(focus.isFocused.value).toBe(false);
  }
});
