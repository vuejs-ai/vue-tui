import { defineComponent, shallowRef, type ComponentPublicInstance } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import {
  Box,
  Text,
  useExternalInput,
  useFocus,
  useFocusedInput,
  useFocusManager,
  useFocusScope,
  useFocusScopeInput,
  useInput,
  type UseFocusScopeReturn,
  type UseFocusReturn,
} from "@vue-tui/runtime";

test("a focused route runs global, target, ancestor scope, then external input", async () => {
  const observed: string[] = [];

  const Target = defineComponent(() => {
    const host = shallowRef<ComponentPublicInstance | null>(null);
    const target = useFocus(host, { autoFocus: true });
    useFocusedInput(target, (event) => {
      observed.push(`target:${event.sequence}`);
      return "continue";
    });
    useExternalInput(target, (source) => {
      observed.push(`external:${source.sequence}`);
    });
    return () => (
      <Box ref={host}>
        <Text>target</Text>
      </Box>
    );
  });

  const Region = defineComponent(() => {
    const scope = useFocusScope();
    useFocusScopeInput(scope, (event) => {
      observed.push(`scope:${event.sequence}`);
      return "continue";
    });
    return () => <Target />;
  });

  const App = defineComponent(() => {
    useInput((event) => {
      observed.push(`global:${event.sequence}`);
      return "continue";
    });
    return () => <Region />;
  });

  const result = await render(App);
  try {
    await result.stdin.write("x");
    expect(observed).toEqual(["global:x", "target:x", "scope:x", "external:x"]);
  } finally {
    result.dispose();
  }
});

test("a trap restores its exact outer target and keeps opening and closing facts on their captured routes", async () => {
  const modalActive = shallowRef(false);
  const showModalTarget = shallowRef(true);
  const observed: string[] = [];
  let background!: UseFocusReturn;
  let modal!: UseFocusReturn;
  let manager!: ReturnType<typeof useFocusManager>;

  const App = defineComponent(() => {
    const backgroundHost = shallowRef<ComponentPublicInstance | null>(null);
    const modalHost = shallowRef<ComponentPublicInstance | null>(null);
    const modalScope = useFocusScope({ isActive: modalActive, trapped: true });
    background = useFocus(backgroundHost, { autoFocus: true });
    modal = useFocus(modalHost, { scope: modalScope, autoFocus: true });
    manager = useFocusManager();

    useInput((event) => {
      observed.push(`global:${event.sequence}`);
      if (event.sequence === "o") modalActive.value = true;
      return "continue";
    });
    useFocusedInput(background, (event) => {
      observed.push(`background:${event.sequence}`);
      return "continue";
    });
    useFocusScopeInput(modalScope, (event) => {
      observed.push(`boundary:${event.sequence}`);
      if (event.sequence === "c") modalActive.value = false;
      return "continue";
    });
    useFocusedInput(modal, (event) => {
      observed.push(`modal:${event.sequence}`);
      return "continue";
    });

    return () => (
      <Box flexDirection="column">
        <Box ref={backgroundHost}>
          <Text>background</Text>
        </Box>
        {showModalTarget.value ? (
          <Box ref={modalHost}>
            <Text>modal</Text>
          </Box>
        ) : null}
      </Box>
    );
  });

  const result = await render(App);
  try {
    expect(manager.focusedTarget.value).toBe(background);

    // The handler opens the trap synchronously, but the complete opening fact
    // remains on the background route captured at fact start.
    await result.stdin.write("o");
    expect(observed).toEqual(["global:o", "background:o"]);
    expect(manager.focusedTarget.value).toBe(modal);

    observed.length = 0;
    await result.stdin.write("x");
    expect(observed).toEqual(["global:x", "boundary:x", "modal:x"]);

    // The active boundary remains an input owner without an eligible target.
    showModalTarget.value = false;
    await result.waitUntilRenderFlush();
    expect(manager.focusedTarget.value).toBeNull();
    observed.length = 0;
    await result.stdin.write("q");
    expect(observed).toEqual(["global:q", "boundary:q"]);

    // Closing likewise keeps the current fact in the modal boundary and only
    // exposes the restored background target to the next fact.
    observed.length = 0;
    await result.stdin.write("c");
    expect(observed).toEqual(["global:c", "boundary:c"]);
    expect(manager.focusedTarget.value).toBe(background);

    observed.length = 0;
    await result.stdin.write("z");
    expect(observed).toEqual(["global:z", "background:z"]);
  } finally {
    result.dispose();
  }
});

test("a target that outlives its explicit scope becomes inert and detaches its reactive host", async () => {
  const showScope = shallowRef(true);
  const disabled = shallowRef(false);
  const hostKey = shallowRef("a");
  let scope!: UseFocusScopeReturn;
  let target!: UseFocusReturn;

  const ScopeOwner = defineComponent(() => {
    scope = useFocusScope();
    return () => null;
  });
  const Target = defineComponent(() => {
    const host = shallowRef<ComponentPublicInstance | null>(null);
    target = useFocus(host, { scope, autoFocus: true, disabled });
    return () => (
      <Box key={hostKey.value} ref={host}>
        <Text>target</Text>
      </Box>
    );
  });
  const App = defineComponent(() => () => (
    <Box>
      {showScope.value ? <ScopeOwner /> : null}
      <Target />
    </Box>
  ));

  const result = await render(App);
  try {
    expect(target.isFocused.value).toBe(true);

    showScope.value = false;
    await result.waitUntilRenderFlush();
    expect(target.isFocused.value).toBe(false);

    disabled.value = true;
    hostKey.value = "b";
    await expect(result.waitUntilRenderFlush()).resolves.toBeUndefined();
    expect(target.focus()).toBe(false);
    expect(target.blur()).toBe(false);
  } finally {
    result.dispose();
  }
});
