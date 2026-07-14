import {
  defineComponent,
  nextTick,
  onErrorCaptured,
  shallowRef,
  type ComponentPublicInstance,
  type ShallowRef,
} from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import {
  Box,
  Text,
  useFocus,
  useFocusedInput,
  useFocusManager,
  useFocusScope,
  useInput,
  type RenderMode,
  type TuiInputEvent,
  type UseFocusReturn,
  type UseFocusScopeReturn,
} from "@vue-tui/runtime";

const modes = ["inline", "fullscreen"] as const satisfies readonly RenderMode[];

test("focused input directly receives normalized text, key, and paste facts", async () => {
  const events: TuiInputEvent[] = [];
  let target!: UseFocusReturn;

  const App = defineComponent(() => {
    const host = shallowRef<ComponentPublicInstance | null>(null);
    target = useFocus(host, { autoFocus: true });
    useFocusedInput(target, (event) => {
      events.push(event);
      return "continue";
    });
    return () => (
      <Box ref={host}>
        <Text>editor</Text>
      </Box>
    );
  });

  const result = await render(App);
  try {
    expect(target.isFocused.value).toBe(true);
    await result.stdin.write("hello");
    await result.stdin.write("\x1b[A");
    await result.stdin.write("\x1b[200~line 1\nline 2\x1b[201~");

    expect(events).toHaveLength(3);
    expect(events[0]).toMatchObject({
      kind: "text",
      sequence: "hello",
      text: "hello",
      protocol: "plain",
    });
    expect(events[1]).toMatchObject({
      kind: "key",
      sequence: "\x1b[A",
      key: { name: "up", protocol: "legacy" },
    });
    expect(events[2]).toEqual({
      kind: "paste",
      sequence: "\x1b[200~line 1\nline 2\x1b[201~",
      fidelity: "normalized-utf8-sequence",
      text: "line 1\nline 2",
    });
  } finally {
    result.dispose();
  }
});

async function runFinderJourney(mode: RenderMode): Promise<readonly string[]> {
  const editorActive = shallowRef(false);
  const activeItem = shallowRef("first");
  const calls: string[] = [];
  let query!: UseFocusReturn;
  let editor!: UseFocusReturn;
  let manager!: ReturnType<typeof useFocusManager>;

  const App = defineComponent(() => {
    const queryHost = shallowRef<ComponentPublicInstance | null>(null);
    const editorHost = shallowRef<ComponentPublicInstance | null>(null);
    const editorScope = useFocusScope({ isActive: editorActive, trapped: true });
    query = useFocus(queryHost, { autoFocus: true });
    editor = useFocus(editorHost, { scope: editorScope, autoFocus: true });
    manager = useFocusManager();

    useFocusedInput(query, (event) => {
      calls.push(`query:${event.sequence}`);
      if (event.sequence === "j") activeItem.value = "second";
      if (event.sequence === "e") editorActive.value = true;
      return "continue";
    });
    useFocusedInput(editor, (event) => {
      calls.push(`editor:${event.sequence}`);
      if (event.sequence === "q") editorActive.value = false;
      return "continue";
    });

    return () => (
      <Box flexDirection="column">
        <Box ref={queryHost}>
          <Text>query</Text>
        </Box>
        <Box ref={editorHost}>
          <Text>editor</Text>
        </Box>
      </Box>
    );
  });

  const result = await render(App, { host: { mode } });
  try {
    expect(manager.focusedTarget.value).toBe(query);
    await result.stdin.write("j");
    expect(activeItem.value).toBe("second");
    expect(manager.focusedTarget.value).toBe(query);

    await result.stdin.write("e");
    expect(calls).toEqual(["query:j", "query:e"]);
    expect(manager.focusedTarget.value).toBe(editor);

    await result.stdin.write("x");
    await result.stdin.write("q");
    expect(calls).toEqual(["query:j", "query:e", "editor:x", "editor:q"]);
    expect(activeItem.value).toBe("second");
    expect(manager.focusedTarget.value).toBe(query);

    await result.stdin.write("z");
    expect(calls.at(-1)).toBe("query:z");
  } finally {
    result.dispose();
  }
  return calls;
}

test("Inline and Fullscreen keep finder active items separate from nested editor focus", async () => {
  const traces = await Promise.all(modes.map((mode) => runFinderJourney(mode)));
  expect(traces[0]).toEqual(["query:j", "query:e", "editor:x", "editor:q", "query:z"]);
  expect(traces[1]).toEqual(traces[0]);
});

async function runCodingAgentJourney(mode: RenderMode): Promise<readonly string[]> {
  const approvalActive = shallowRef(false);
  const trace: string[] = [];
  let composer!: UseFocusReturn;
  let approval!: UseFocusReturn;
  let manager!: ReturnType<typeof useFocusManager>;

  const App = defineComponent(() => {
    const composerHost = shallowRef<ComponentPublicInstance | null>(null);
    const approvalHost = shallowRef<ComponentPublicInstance | null>(null);
    const approvalScope = useFocusScope({ isActive: approvalActive, trapped: true });
    composer = useFocus(composerHost, { autoFocus: true });
    approval = useFocus(approvalHost, { scope: approvalScope, autoFocus: true });
    manager = useFocusManager();

    useInput((event) => {
      trace.push(`global:${event.sequence}`);
      return "continue";
    });
    useFocusedInput(composer, (event) => {
      trace.push(`composer:${event.sequence}`);
      if (event.sequence === "s") approvalActive.value = true;
      return "continue";
    });
    useFocusedInput(approval, (event) => {
      trace.push(`approval:${event.sequence}`);
      if (event.sequence === "a") approvalActive.value = false;
      return "continue";
    });

    return () => (
      <Box flexDirection="column">
        <Box ref={composerHost}>
          <Text>composer</Text>
        </Box>
        {approvalActive.value ? (
          <Box ref={approvalHost}>
            <Text>approval</Text>
          </Box>
        ) : null}
      </Box>
    );
  });

  const result = await render(App, { host: { mode } });
  try {
    expect(manager.focusedTarget.value).toBe(composer);

    // The submit fact remains on the composer route captured before the trap opens.
    await result.stdin.write("s");
    expect(manager.focusedTarget.value).toBe(approval);
    await result.stdin.write("x");

    // The approval fact remains inside the captured trap, then restores the composer.
    await result.stdin.write("a");
    expect(manager.focusedTarget.value).toBe(composer);
    await result.stdin.write("z");

    // Reopening reuses the logical approval target after its v-if host attaches
    // again; its one-shot autofocus request was already consumed on the first open.
    await result.stdin.write("s");
    expect(manager.focusedTarget.value).toBe(approval);
    await result.stdin.write("y");
    await result.stdin.write("a");
    expect(manager.focusedTarget.value).toBe(composer);
  } finally {
    result.dispose();
  }

  return trace;
}

test("Inline and Fullscreen share the coding-agent composer, approval trap, and restoration route", async () => {
  const traces = await Promise.all(modes.map((mode) => runCodingAgentJourney(mode)));
  expect(traces[0]).toEqual([
    "global:s",
    "composer:s",
    "global:x",
    "approval:x",
    "global:a",
    "approval:a",
    "global:z",
    "composer:z",
    "global:s",
    "composer:s",
    "global:y",
    "approval:y",
    "global:a",
    "approval:a",
  ]);
  expect(traces[1]).toEqual(traces[0]);
});

async function runIndependentRegionJourney(mode: RenderMode): Promise<readonly string[]> {
  const firstRegionActive = shallowRef(true);
  const secondRegionActive = shallowRef(false);
  const trace: string[] = [];
  let firstRegion!: UseFocusScopeReturn;
  let secondRegion!: UseFocusScopeReturn;
  let firstA!: UseFocusReturn;
  let firstB!: UseFocusReturn;
  let secondA!: UseFocusReturn;
  let secondB!: UseFocusReturn;
  let manager!: ReturnType<typeof useFocusManager>;

  const App = defineComponent(() => {
    const firstAHost = shallowRef<ComponentPublicInstance | null>(null);
    const firstBHost = shallowRef<ComponentPublicInstance | null>(null);
    const secondAHost = shallowRef<ComponentPublicInstance | null>(null);
    const secondBHost = shallowRef<ComponentPublicInstance | null>(null);
    firstRegion = useFocusScope({ isActive: firstRegionActive });
    secondRegion = useFocusScope({ isActive: secondRegionActive });
    firstA = useFocus(firstAHost, { scope: firstRegion });
    firstB = useFocus(firstBHost, { scope: firstRegion, autoFocus: true });
    secondA = useFocus(secondAHost, { scope: secondRegion, autoFocus: true });
    secondB = useFocus(secondBHost, { scope: secondRegion });
    manager = useFocusManager();

    return () => (
      <Box flexDirection="column">
        <Box ref={firstAHost}>
          <Text>first-a</Text>
        </Box>
        <Box ref={firstBHost}>
          <Text>first-b</Text>
        </Box>
        <Box ref={secondAHost}>
          <Text>second-a</Text>
        </Box>
        <Box ref={secondBHost}>
          <Text>second-b</Text>
        </Box>
      </Box>
    );
  });

  const result = await render(App, { host: { mode } });
  try {
    expect(manager.focusedTarget.value).toBe(firstB);
    trace.push("first-b");
    expect(firstRegion.containsFocus.value).toBe(true);
    expect(secondRegion.containsFocus.value).toBe(false);
    expect(firstA.focus()).toBe(true);
    trace.push("first-a");

    firstRegionActive.value = false;
    secondRegionActive.value = true;
    expect(manager.focusedTarget.value).toBe(secondA);
    trace.push("second-a");
    expect(secondB.focus()).toBe(true);
    trace.push("second-b");
    expect(firstRegion.containsFocus.value).toBe(false);
    expect(secondRegion.containsFocus.value).toBe(true);

    secondRegionActive.value = false;
    firstRegionActive.value = true;
    expect(manager.focusedTarget.value).toBe(firstA);
    trace.push("first-a");

    firstRegionActive.value = false;
    secondRegionActive.value = true;
    expect(manager.focusedTarget.value).toBe(secondB);
    trace.push("second-b");
  } finally {
    result.dispose();
  }
  return trace;
}

test("Inline and Fullscreen restore each independently activated region's remembered descendant", async () => {
  const traces = await Promise.all(modes.map((mode) => runIndependentRegionJourney(mode)));
  expect(traces[0]).toEqual(["first-b", "first-a", "second-a", "second-b", "first-a", "second-b"]);
  expect(traces[1]).toEqual(traces[0]);
});

test("a duplicate rendered host preserves the accepted route and recovers after retargeting", async () => {
  const duplicateHost = shallowRef(false);
  const errors: unknown[] = [];
  const firstCalls: string[] = [];
  const secondCalls: string[] = [];
  let first!: UseFocusReturn;
  let second!: UseFocusReturn;
  let manager!: ReturnType<typeof useFocusManager>;

  const Targets = defineComponent(() => {
    const firstHost = shallowRef<ComponentPublicInstance | null>(null);
    const secondHost = shallowRef<ComponentPublicInstance | null>(null);
    first = useFocus(firstHost, { autoFocus: true });
    second = useFocus(() => (duplicateHost.value ? firstHost.value : secondHost.value));
    manager = useFocusManager();
    useFocusedInput(first, (event) => {
      firstCalls.push(event.sequence);
      return "continue";
    });
    useFocusedInput(second, (event) => {
      secondCalls.push(event.sequence);
      return "continue";
    });
    return () => (
      <Box flexDirection="column">
        <Box ref={firstHost}>
          <Text>first</Text>
        </Box>
        <Box ref={secondHost}>
          <Text>second</Text>
        </Box>
      </Box>
    );
  });
  const Boundary = defineComponent(() => {
    onErrorCaptured((error) => {
      errors.push(error);
      return false;
    });
    return () => <Targets />;
  });

  const result = await render(Boundary);
  try {
    expect(manager.focusedTarget.value).toBe(first);

    duplicateHost.value = true;
    await nextTick();
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatchObject({
      message: "A rendered host cannot own more than one focus target",
    });
    expect(manager.focusedTarget.value).toBe(first);
    await result.stdin.write("x");
    expect(firstCalls).toEqual(["x"]);
    expect(secondCalls).toEqual([]);

    duplicateHost.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(second.focus()).toBe(true);
    expect(manager.focusedTarget.value).toBe(second);
    await result.stdin.write("y");
    expect(firstCalls).toEqual(["x"]);
    expect(secondCalls).toEqual(["y"]);
  } finally {
    result.dispose();
  }
});

test("an invalid reactive option keeps the last accepted route and later valid updates recover", async () => {
  const disabled = shallowRef<boolean | string>(false);
  const errors: unknown[] = [];
  const calls: string[] = [];
  let target!: UseFocusReturn;
  let manager!: ReturnType<typeof useFocusManager>;

  const Target = defineComponent(() => {
    const host = shallowRef<ComponentPublicInstance | null>(null);
    target = useFocus(host, {
      autoFocus: true,
      disabled: disabled as ShallowRef<boolean>,
    });
    manager = useFocusManager();
    useFocusedInput(target, (event) => {
      calls.push(event.sequence);
      return "continue";
    });
    return () => (
      <Box ref={host}>
        <Text>target</Text>
      </Box>
    );
  });
  const Boundary = defineComponent(() => {
    onErrorCaptured((error) => {
      errors.push(error);
      return false;
    });
    return () => <Target />;
  });

  const result = await render(Boundary);
  try {
    expect(manager.focusedTarget.value).toBe(target);

    disabled.value = "invalid";
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatchObject({ message: "useFocus() disabled must resolve to a boolean" });
    expect(manager.focusedTarget.value).toBe(target);
    await result.stdin.write("x");
    expect(calls).toEqual(["x"]);

    disabled.value = false;
    disabled.value = true;
    expect(manager.focusedTarget.value).toBeNull();
    disabled.value = false;
    expect(manager.focusedTarget.value).toBe(target);
    await result.stdin.write("y");
    expect(calls).toEqual(["x", "y"]);
    expect(errors).toEqual([
      expect.objectContaining({ message: "useFocus() disabled must resolve to a boolean" }),
    ]);
  } finally {
    result.dispose();
  }
});

test("an invalid reactive scope option keeps its accepted branch and later valid updates recover", async () => {
  const isActive = shallowRef<boolean | string>(true);
  const errors: unknown[] = [];
  const calls: string[] = [];
  let scope!: UseFocusScopeReturn;
  let target!: UseFocusReturn;
  let manager!: ReturnType<typeof useFocusManager>;

  const Target = defineComponent(() => {
    const host = shallowRef<ComponentPublicInstance | null>(null);
    scope = useFocusScope({ isActive: isActive as ShallowRef<boolean> });
    target = useFocus(host, { scope, autoFocus: true });
    manager = useFocusManager();
    useFocusedInput(target, (event) => {
      calls.push(event.sequence);
      return "continue";
    });
    return () => (
      <Box ref={host}>
        <Text>target</Text>
      </Box>
    );
  });
  const Boundary = defineComponent(() => {
    onErrorCaptured((error) => {
      errors.push(error);
      return false;
    });
    return () => <Target />;
  });

  const result = await render(Boundary);
  try {
    expect(manager.focusedTarget.value).toBe(target);
    expect(scope.containsFocus.value).toBe(true);

    isActive.value = "invalid";
    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toMatchObject({
      message: "useFocusScope() isActive must resolve to a boolean",
    });
    expect(manager.focusedTarget.value).toBe(target);
    await result.stdin.write("x");
    expect(calls).toEqual(["x"]);

    isActive.value = true;
    isActive.value = false;
    expect(manager.focusedTarget.value).toBeNull();
    isActive.value = true;
    expect(manager.focusedTarget.value).toBe(target);
    await result.stdin.write("y");
    expect(calls).toEqual(["x", "y"]);
    expect(errors).toEqual([
      expect.objectContaining({ message: "useFocusScope() isActive must resolve to a boolean" }),
    ]);
  } finally {
    result.dispose();
  }
});

test("disposing an outer scope recursively ends nested scope and target handles", async () => {
  const showOuter = shallowRef(true);
  const targetHostKey = shallowRef("first");
  let outer!: UseFocusScopeReturn;
  let inner!: UseFocusScopeReturn;
  let target!: UseFocusReturn;
  let manager!: ReturnType<typeof useFocusManager>;

  const OutlivingTarget = defineComponent(() => {
    const host = shallowRef<ComponentPublicInstance | null>(null);
    target = useFocus(host, { scope: inner, autoFocus: true });
    return () => (
      <Box key={targetHostKey.value} ref={host}>
        <Text>nested</Text>
      </Box>
    );
  });
  const Inner = defineComponent(() => {
    inner = useFocusScope();
    return () => null;
  });
  const Outer = defineComponent(() => {
    outer = useFocusScope();
    return () => <Inner />;
  });
  const App = defineComponent(() => {
    manager = useFocusManager();
    return () => (
      <Box>
        {showOuter.value ? <Outer /> : null}
        <OutlivingTarget />
      </Box>
    );
  });

  const result = await render(App);
  try {
    expect(manager.focusedTarget.value).toBe(target);
    expect(outer.containsFocus.value).toBe(true);
    expect(inner.containsFocus.value).toBe(true);

    showOuter.value = false;
    await result.waitUntilRenderFlush();
    expect(manager.focusedTarget.value).toBeNull();
    expect(outer.containsFocus.value).toBe(false);
    expect(inner.containsFocus.value).toBe(false);
    expect(target.isFocused.value).toBe(false);
    expect(target.focus()).toBe(false);
    expect(target.blur()).toBe(false);
    targetHostKey.value = "replacement";
    await expect(result.waitUntilRenderFlush()).resolves.toBeUndefined();
  } finally {
    result.dispose();
  }
});
