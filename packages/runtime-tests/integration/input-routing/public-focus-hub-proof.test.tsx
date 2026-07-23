import {
  defineComponent,
  inject,
  nextTick,
  onMounted,
  onScopeDispose,
  provide,
  shallowRef,
  vShow,
  withDirectives,
  type ComponentPublicInstance,
  type InjectionKey,
} from "vue";
import { describe, expect, test } from "vite-plus/test";
import { render, type RenderResult } from "@vue-tui/testing";
import {
  Box,
  Text,
  useFocus,
  useInput,
  type MountOptions,
  type TuiInputEvent,
  type UseFocusReturn,
} from "@vue-tui/runtime";

type RenderMode = NonNullable<MountOptions["mode"]>;

interface LocalFocusRegistry {
  readonly handles: Map<string, UseFocusReturn>;
  readonly order: string[];
  focusByName(name: string): void;
  focusNext(): void;
}

const RegistryKey: InjectionKey<LocalFocusRegistry> = Symbol("test-local-focus-registry");

function createLocalFocusRegistry(): LocalFocusRegistry {
  const handles = new Map<string, UseFocusReturn>();
  const order: string[] = [];
  const focusByName = (name: string): void => {
    handles.get(name)?.focus();
  };
  return {
    handles,
    order,
    focusByName,
    focusNext() {
      const current = order.findIndex((name) => handles.get(name)?.isFocused.value);
      for (let offset = 1; offset <= order.length; offset++) {
        const name = order[(current + offset + order.length) % order.length];
        if (!name) continue;
        const candidate = handles.get(name);
        candidate?.focus();
        // Runtime keeps an unavailable request inert, so a higher layer can
        // skip it without access to renderer presence or traversal internals.
        if (candidate?.isFocused.value) return;
      }
    },
  };
}

function useRegisteredFocus(
  name: string,
  target: ReturnType<typeof shallowRef<ComponentPublicInstance | null>>,
): UseFocusReturn {
  const registry = inject(RegistryKey);
  if (!registry) throw new Error("A local focus registry provider is required");
  const focus = useFocus(target);
  registry.handles.set(name, focus);
  registry.order.push(name);
  onScopeDispose(() => {
    registry.handles.delete(name);
    const index = registry.order.indexOf(name);
    if (index !== -1) registry.order.splice(index, 1);
  });
  return focus;
}

function isTab(event: TuiInputEvent): boolean {
  return event.type === "key" && event.key.name === "tab";
}

async function flushAcceptedRender(result: RenderResult): Promise<void> {
  await nextTick();
  await result.waitUntilRenderFlush();
}

async function runPublicFocusJourney(mode: RenderMode): Promise<void> {
  const secondShown = shallowRef(true);
  const trace: string[] = [];
  let registry!: LocalFocusRegistry;
  let first!: UseFocusReturn;
  let second!: UseFocusReturn;

  const First = defineComponent(() => {
    const host = shallowRef<ComponentPublicInstance | null>(null);
    first = useRegisteredFocus("first", host);
    useInput(
      () => {
        trace.push("first");
      },
      { isActive: first.isFocused },
    );
    onMounted(() => first.focus());
    return () => (
      <Box ref={host}>
        <Text>first</Text>
      </Box>
    );
  });

  const Second = defineComponent(() => {
    const host = shallowRef<ComponentPublicInstance | null>(null);
    second = useRegisteredFocus("second", host);
    useInput(
      () => {
        trace.push("second");
      },
      { isActive: second.isFocused },
    );
    return () => (
      <Box ref={host}>
        <Text>second</Text>
      </Box>
    );
  });

  const Provider = defineComponent((_props, { slots }) => {
    registry = createLocalFocusRegistry();
    provide(RegistryKey, registry);
    useInput((event) => {
      if (isTab(event)) registry.focusNext();
    });
    return () => slots.default?.();
  });

  const App = defineComponent(() => () => (
    <Provider>
      <First />
      {withDirectives(
        <Box>
          <Second />
        </Box>,
        [[vShow, secondShown.value]],
      )}
    </Provider>
  ));

  const result = await render(App, { host: { mode } });
  try {
    expect(first.isFocused.value).toBe(true);
    expect(second.isFocused.value).toBe(false);

    trace.length = 0;
    await result.stdin.write("a");
    expect(trace).toEqual(["first"]);

    await result.stdin.write("\t");
    expect(first.isFocused.value).toBe(false);
    expect(second.isFocused.value).toBe(true);

    registry.focusByName("first");
    expect(first.isFocused.value).toBe(true);
    expect(second.isFocused.value).toBe(false);

    secondShown.value = false;
    registry.focusByName("second");
    await flushAcceptedRender(result);
    expect(first.isFocused.value).toBe(false);
    expect(second.isFocused.value).toBe(false);

    await result.stdin.write("\t");
    expect(first.isFocused.value).toBe(true);
    expect(second.isFocused.value).toBe(false);

    secondShown.value = true;
    await flushAcceptedRender(result);
    expect(second.isFocused.value).toBe(false);
    registry.focusByName("second");
    expect(first.isFocused.value).toBe(false);
    expect(second.isFocused.value).toBe(true);
  } finally {
    result.dispose();
  }
}

describe("public-only higher-layer focus composition", () => {
  test.each(["inline", "fullscreen"] as const)(
    "builds string lookup and traversal without Runtime internals in %s mode",
    runPublicFocusJourney,
  );
});
