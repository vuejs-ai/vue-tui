import {
  defineComponent,
  h,
  isReadonly,
  nextTick,
  onMounted,
  shallowRef,
  vShow,
  watch,
  withDirectives,
  type Component,
  type ComponentPublicInstance,
} from "vue";
import { describe, expect, test } from "vite-plus/test";
import { render, type RenderResult } from "@vue-tui/testing";
import {
  Box,
  createApp,
  renderToString,
  Text,
  useFocus,
  useInput,
  type UseFocusReturn,
} from "@vue-tui/runtime";
import { makeFakeStdin, makeFakeWritable } from "../lifecycle/test-streams.ts";

async function flushAcceptedRender(result: RenderResult): Promise<void> {
  await nextTick();
  await result.waitUntilRenderFlush();
}

test("creates distinct logical and rendered identities with synchronous void operations", async () => {
  let logical!: UseFocusReturn;
  let rendered!: UseFocusReturn;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    logical = useFocus();
    rendered = useFocus(target);
    logical.focus();
    onMounted(() => rendered.focus());
    return () => <Box ref={target} />;
  });

  const result = await render(App);
  try {
    expect(logical.isFocused.value).toBe(false);
    expect(rendered.isFocused.value).toBe(true);
    expect(isReadonly(logical.isFocused)).toBe(true);
    expect(isReadonly(rendered.isFocused)).toBe(true);

    expect(logical.focus()).toBeUndefined();
    expect(logical.isFocused.value).toBe(true);
    expect(rendered.isFocused.value).toBe(false);

    expect(rendered.focus()).toBeUndefined();
    expect(rendered.isFocused.value).toBe(true);
    expect(logical.isFocused.value).toBe(false);

    expect(logical.blur()).toBeUndefined();
    expect(rendered.isFocused.value).toBe(true);
    expect(rendered.blur()).toBeUndefined();
    expect(rendered.isFocused.value).toBe(false);
  } finally {
    result.dispose();
  }
});

test("keeps focus ownership independent across mounted apps", async () => {
  let first!: UseFocusReturn;
  let second!: UseFocusReturn;
  const FirstApp = defineComponent(() => {
    first = useFocus();
    first.focus();
    return () => <Text>first app</Text>;
  });
  const SecondApp = defineComponent(() => {
    second = useFocus();
    second.focus();
    return () => <Text>second app</Text>;
  });

  const firstResult = await render(FirstApp);
  const secondResult = await render(SecondApp);
  try {
    expect(first.isFocused.value).toBe(true);
    expect(second.isFocused.value).toBe(true);

    first.blur();
    expect(first.isFocused.value).toBe(false);
    expect(second.isFocused.value).toBe(true);

    first.focus();
    second.blur();
    expect(first.isFocused.value).toBe(true);
    expect(second.isFocused.value).toBe(false);

    firstResult.dispose();
    expect(first.isFocused.value).toBe(false);
    expect(second.isFocused.value).toBe(false);

    second.focus();
    expect(first.isFocused.value).toBe(false);
    expect(second.isFocused.value).toBe(true);
  } finally {
    firstResult.dispose();
    secondResult.dispose();
  }
});

test("does not queue unavailable acquisition or restore focus after target loss", async () => {
  const shown = shallowRef(false);
  let logical!: UseFocusReturn;
  let rendered!: UseFocusReturn;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    logical = useFocus();
    rendered = useFocus(target);
    logical.focus();
    return () => (shown.value ? <Box ref={target} /> : null);
  });

  const result = await render(App);
  try {
    rendered.focus();
    expect(logical.isFocused.value).toBe(true);
    expect(rendered.isFocused.value).toBe(false);

    shown.value = true;
    await flushAcceptedRender(result);
    expect(logical.isFocused.value).toBe(true);
    expect(rendered.isFocused.value).toBe(false);

    rendered.focus();
    expect(logical.isFocused.value).toBe(false);
    expect(rendered.isFocused.value).toBe(true);

    shown.value = false;
    await flushAcceptedRender(result);
    expect(rendered.isFocused.value).toBe(false);
    expect(logical.isFocused.value).toBe(false);

    shown.value = true;
    await flushAcceptedRender(result);
    expect(rendered.isFocused.value).toBe(false);
    expect(logical.isFocused.value).toBe(false);
  } finally {
    result.dispose();
  }
});

test("keeps multiple handles for one boundary distinct", async () => {
  let first!: UseFocusReturn;
  let second!: UseFocusReturn;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    first = useFocus(target);
    second = useFocus(target);
    onMounted(() => first.focus());
    return () => <Box ref={target} />;
  });

  const result = await render(App);
  try {
    expect(first.isFocused.value).toBe(true);
    expect(second.isFocused.value).toBe(false);
    second.focus();
    expect(first.isFocused.value).toBe(false);
    expect(second.isFocused.value).toBe(true);
  } finally {
    result.dispose();
  }
});

test("keeps targetless focus through ancestor v-show and clears it on scope disposal", async () => {
  const shown = shallowRef(true);
  const mounted = shallowRef(true);
  let focus!: UseFocusReturn;
  const Probe = defineComponent(() => {
    focus = useFocus();
    focus.focus();
    return () => <Text>logical</Text>;
  });
  const App = defineComponent(
    () => () =>
      withDirectives(
        h(Box, null, () => (mounted.value ? h(Probe) : null)),
        [[vShow, shown.value]],
      ),
  );

  const result = await render(App);
  try {
    expect(focus.isFocused.value).toBe(true);
    shown.value = false;
    await flushAcceptedRender(result);
    expect(focus.isFocused.value).toBe(true);

    mounted.value = false;
    await flushAcceptedRender(result);
    expect(focus.isFocused.value).toBe(false);
    focus.focus();
    expect(focus.isFocused.value).toBe(false);
  } finally {
    result.dispose();
  }
});

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
  ["Fullscreen TTY", { host: { mode: "fullscreen" as const } }],
  ["Inline non-TTY", { host: { stdout: "stream" as const } }],
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

test("preserves focus across suspend and resume", async () => {
  let focus!: UseFocusReturn;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    focus = useFocus(target);
    onMounted(() => focus.focus());
    return () => <Box ref={target} />;
  });

  const result = await render(App);
  try {
    expect(focus.isFocused.value).toBe(true);
    await result.terminal.suspend();
    expect(focus.isFocused.value).toBe(true);
    await result.terminal.resume();
    expect(focus.isFocused.value).toBe(true);
  } finally {
    result.dispose();
  }
});

test("clears targeted focus when its boundary becomes hidden during suspension", async () => {
  const shown = shallowRef(true);
  let focus!: UseFocusReturn;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    focus = useFocus(target);
    onMounted(() => focus.focus());
    return () => withDirectives(h(Box, { ref: target }), [[vShow, shown.value]]);
  });

  const result = await render(App);
  try {
    expect(focus.isFocused.value).toBe(true);
    await result.terminal.suspend();

    shown.value = false;
    await flushAcceptedRender(result);
    expect(focus.isFocused.value).toBe(false);

    shown.value = true;
    await flushAcceptedRender(result);
    expect(focus.isFocused.value).toBe(false);

    await result.terminal.resume();
    expect(focus.isFocused.value).toBe(false);
  } finally {
    result.dispose();
  }
});

test("keeps focus inert in renderToString and clears retained handles after rollback", () => {
  let logical!: UseFocusReturn;
  let rendered!: UseFocusReturn;
  const App = defineComponent(() => {
    const target = shallowRef<ComponentPublicInstance | null>(null);
    logical = useFocus();
    rendered = useFocus(target);
    logical.focus();
    onMounted(() => rendered.focus());
    return () => (
      <Box ref={target}>
        <Text>string focus</Text>
      </Box>
    );
  });

  expect(renderToString(App)).toBe("string focus");
  expect(logical.isFocused.value).toBe(false);
  expect(rendered.isFocused.value).toBe(false);
  logical.focus();
  rendered.focus();
  expect(logical.isFocused.value).toBe(false);
  expect(rendered.isFocused.value).toBe(false);

  let rolledBack!: UseFocusReturn;
  const Failing = defineComponent(() => {
    rolledBack = useFocus();
    rolledBack.focus();
    throw new Error("focus rollback");
  });
  expect(() => renderToString(Failing)).toThrow("focus rollback");
  expect(rolledBack.isFocused.value).toBe(false);
  rolledBack.focus();
  expect(rolledBack.isFocused.value).toBe(false);
});

test("clears retained focus handles when initial live output fails", async () => {
  const outputError = new Error("focus initial output failure");
  let retained!: UseFocusReturn;
  const App = defineComponent(() => {
    retained = useFocus();
    retained.focus();
    return () => <Text>FOCUS_INITIAL_OUTPUT_FAILURE</Text>;
  });

  const stdout = makeFakeWritable();
  const stderr = makeFakeWritable();
  const { stream: stdin } = makeFakeStdin();
  const originalWrite = stdout.write.bind(stdout);
  let failedOutput = false;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    if (!failedOutput && chunk.includes("FOCUS_INITIAL_OUTPUT_FAILURE")) {
      failedOutput = true;
      throw outputError;
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

  const app = createApp(App);
  try {
    app.mount({ stdout, stdin, stderr, patchConsole: false });
    expect(retained.isFocused.value).toBe(true);

    await expect(app.waitUntilExit()).rejects.toBe(outputError);
    expect(failedOutput).toBe(true);
    expect(retained.isFocused.value).toBe(false);

    expect(retained.focus()).toBeUndefined();
    expect(retained.blur()).toBeUndefined();
    expect(retained.isFocused.value).toBe(false);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("rejects wrong and cross-app component target values", async () => {
  const UndefinedArgument = defineComponent(() => {
    (useFocus as (target: unknown) => UseFocusReturn)(undefined);
    return () => <Text>invalid</Text>;
  });
  await expect(render(UndefinedArgument)).rejects.toThrow(
    "useFocus() target must be a Vue ref to a component instance",
  );

  const Invalid = defineComponent(() => {
    useFocus(shallowRef(42) as never);
    return () => <Text>invalid</Text>;
  });
  await expect(render(Invalid)).rejects.toThrow(
    "useFocus() target must resolve to a stateful Vue component instance",
  );

  const foreign = shallowRef<ComponentPublicInstance | null>(null);
  const Owner = defineComponent(() => () => <Box ref={foreign} />);
  const Observer = defineComponent(() => {
    useFocus(foreign);
    return () => <Text>observer</Text>;
  });
  const owner = await render(Owner);
  try {
    await expect(render(Observer)).rejects.toThrow(
      "useFocus() target belongs to a different vue-tui app",
    );
  } finally {
    owner.dispose();
  }
});

test("composes isFocused with broadcast useInput activation without routing policy", async () => {
  const trace: string[] = [];
  let first!: UseFocusReturn;
  let second!: UseFocusReturn;
  const App: Component = defineComponent(() => {
    first = useFocus();
    second = useFocus();
    first.focus();
    useInput(
      () => {
        trace.push("first");
      },
      { isActive: first.isFocused },
    );
    useInput(
      () => {
        trace.push("second");
      },
      { isActive: second.isFocused },
    );
    useInput(() => {
      trace.push("broadcast");
    });
    return () => <Text>input focus</Text>;
  });

  const result = await render(App);
  try {
    await result.stdin.write("a");
    expect(trace).toHaveLength(2);
    expect(trace).toEqual(expect.arrayContaining(["first", "broadcast"]));

    trace.length = 0;
    second.focus();
    await result.stdin.write("b");
    expect(trace).toHaveLength(2);
    expect(trace).toEqual(expect.arrayContaining(["second", "broadcast"]));
  } finally {
    result.dispose();
  }
});
