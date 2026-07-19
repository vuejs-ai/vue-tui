import {
  computed,
  defineComponent,
  h,
  inject,
  nextTick,
  onScopeDispose,
  provide,
  shallowRef,
  toValue,
  vShow,
  watch,
  withDirectives,
  type ComputedRef,
  type InjectionKey,
  type MaybeRefOrGetter,
  type Ref,
  type ShallowRef,
} from "vue";
import { expect, test } from "vite-plus/test";
import { render, type RenderResult } from "@vue-tui/testing";
import {
  Box,
  Text,
  useBoxPresence,
  useInput,
  type RenderMode,
  type TuiInputEvent,
} from "@vue-tui/runtime";

// This is deliberately test-local application code, not a proposed official
// focus API. It proves that a third party can build focus policy from one
// normalized input subscription, accepted Box presence, and ordinary Vue.

interface LocalRouteDecision {
  readonly stopPropagation?: true;
  readonly preventDefault?: true;
}

type LocalInputHandler = (event: TuiInputEvent) => void | LocalRouteDecision;

interface ScopeRegistration {
  readonly parent: ScopeRegistration | null;
  readonly active: ComputedRef<boolean>;
  readonly trapped: boolean;
  readonly handlers: Set<LocalInputHandler>;
  restoreTarget: TargetRegistration | null;
  restoreWasExplicit: boolean;
}

interface TargetRegistration {
  readonly id: string;
  readonly scope: ScopeRegistration;
  readonly order: number;
  readonly registrationOrder: number;
  readonly presence: Readonly<Ref<boolean>>;
  readonly handlers: Set<LocalInputHandler>;
}

interface LocalFocusTarget {
  readonly id: string;
  readonly isFocused: Readonly<Ref<boolean>>;
  focus(): boolean;
}

interface LocalFocusHub {
  readonly rootScope: ScopeRegistration;
  readonly focusedId: Readonly<Ref<string | null>>;
  unregisterScope(scope: ScopeRegistration): void;
  registerTarget(target: TargetRegistration): LocalFocusTarget;
  unregisterTarget(target: TargetRegistration): void;
  scopeActivityChanged(scope: ScopeRegistration, active: boolean): void;
  reconcile(): void;
  focusNext(): boolean;
  dispatch(event: TuiInputEvent): void | { readonly preventDefault: true };
  nextRegistrationOrder(): number;
}

const HubKey: InjectionKey<LocalFocusHub> = Symbol("test-local-focus-hub");
const ScopeKey: InjectionKey<ScopeRegistration> = Symbol("test-local-focus-scope");
const targetRegistrations = new WeakMap<LocalFocusTarget, TargetRegistration>();

function isInsideScope(target: TargetRegistration, boundary: ScopeRegistration): boolean {
  let scope: ScopeRegistration | null = target.scope;
  while (scope) {
    if (scope === boundary) return true;
    scope = scope.parent;
  }
  return false;
}

function createLocalFocusHub(): LocalFocusHub {
  const alwaysActive = computed(() => true);
  const rootScope: ScopeRegistration = {
    parent: null,
    active: alwaysActive,
    trapped: false,
    handlers: new Set(),
    restoreTarget: null,
    restoreWasExplicit: false,
  };
  const targets = new Set<TargetRegistration>();
  const activeTraps: ScopeRegistration[] = [];
  const focused: ShallowRef<TargetRegistration | null> = shallowRef(null);
  let focusWasExplicit = false;
  let registrationOrder = 0;

  const activeBoundary = (): ScopeRegistration | null => {
    for (let index = activeTraps.length - 1; index >= 0; index--) {
      const scope = activeTraps[index];
      if (scope?.active.value) return scope;
    }
    return null;
  };

  const eligibleTargets = (): TargetRegistration[] => {
    const boundary = activeBoundary();
    return [...targets]
      .filter(
        (target) =>
          target.presence.value &&
          target.scope.active.value &&
          (!boundary || isInsideScope(target, boundary)),
      )
      .sort(
        (left, right) =>
          left.order - right.order || left.registrationOrder - right.registrationOrder,
      );
  };

  const isEligible = (target: TargetRegistration | null): target is TargetRegistration =>
    target !== null && eligibleTargets().includes(target);

  const focus = (target: TargetRegistration): boolean => {
    if (!isEligible(target)) return false;
    focused.value = target;
    focusWasExplicit = true;
    return true;
  };

  const hub: LocalFocusHub = {
    rootScope,
    focusedId: computed(() => focused.value?.id ?? null),
    unregisterScope(scope) {
      const index = activeTraps.lastIndexOf(scope);
      if (index === -1) {
        hub.reconcile();
        return;
      }
      activeTraps.splice(index, 1);
      const restoreTarget = scope.restoreTarget;
      const restoreWasExplicit = scope.restoreWasExplicit;
      scope.restoreTarget = null;
      scope.restoreWasExplicit = false;
      if (isEligible(restoreTarget)) {
        focused.value = restoreTarget;
        focusWasExplicit = restoreWasExplicit;
      } else {
        focused.value = null;
        focusWasExplicit = false;
        hub.reconcile();
      }
    },
    registerTarget(target) {
      targets.add(target);
      const handle: LocalFocusTarget = Object.freeze({
        id: target.id,
        isFocused: computed(() => focused.value === target),
        focus: () => focus(target),
      });
      targetRegistrations.set(handle, target);
      hub.reconcile();
      return handle;
    },
    unregisterTarget(target) {
      targets.delete(target);
      if (focused.value === target) {
        focused.value = null;
        focusWasExplicit = false;
      }
      hub.reconcile();
    },
    scopeActivityChanged(scope, active) {
      if (!scope.trapped) {
        hub.reconcile();
        return;
      }

      const existingIndex = activeTraps.lastIndexOf(scope);
      if (active) {
        if (existingIndex !== -1) return;
        scope.restoreTarget = focused.value;
        scope.restoreWasExplicit = focusWasExplicit;
        activeTraps.push(scope);
        focused.value = null;
        focusWasExplicit = false;
        hub.reconcile();
        return;
      }

      if (existingIndex === -1) return;
      activeTraps.splice(existingIndex, 1);
      const restoreTarget = scope.restoreTarget;
      const restoreWasExplicit = scope.restoreWasExplicit;
      scope.restoreTarget = null;
      scope.restoreWasExplicit = false;
      if (isEligible(restoreTarget)) {
        focused.value = restoreTarget;
        focusWasExplicit = restoreWasExplicit;
      } else {
        focused.value = null;
        focusWasExplicit = false;
        hub.reconcile();
      }
    },
    reconcile() {
      const eligible = eligibleTargets();
      if (focusWasExplicit && focused.value && eligible.includes(focused.value)) return;
      focusWasExplicit = false;
      focused.value = eligible[0] ?? null;
    },
    focusNext() {
      const eligible = eligibleTargets();
      if (eligible.length === 0) {
        focused.value = null;
        return false;
      }
      const currentIndex = focused.value ? eligible.indexOf(focused.value) : -1;
      focused.value = eligible[(currentIndex + 1) % eligible.length]!;
      focusWasExplicit = true;
      return true;
    },
    dispatch(event) {
      hub.reconcile();
      const boundary = activeBoundary();
      const currentTarget = isEligible(focused.value) ? focused.value : null;
      const route: LocalInputHandler[] = [];

      if (currentTarget) route.push(...currentTarget.handlers);
      let scope = currentTarget?.scope ?? boundary;
      while (scope) {
        route.push(...scope.handlers);
        if (scope === boundary) break;
        scope = scope.parent;
      }

      // The complete handler list is captured before user callbacks run. A
      // callback may open or close a trap, remove a target, or register another
      // handler, but that change can only affect the next normalized fact.
      const routeSnapshot = [...route];
      let preventDefault = false;
      for (const handler of routeSnapshot) {
        const decision = handler(event);
        if (decision?.preventDefault) preventDefault = true;
        if (decision?.stopPropagation) break;
      }
      return preventDefault ? ({ preventDefault: true } as const) : undefined;
    },
    nextRegistrationOrder() {
      return registrationOrder++;
    },
  };

  return hub;
}

function useLocalFocusHub(): LocalFocusHub {
  const hub = inject(HubKey);
  if (!hub) throw new Error("A test-local FocusProvider is required");
  return hub;
}

function useLocalFocusScope(
  options: {
    readonly isActive?: MaybeRefOrGetter<boolean>;
    readonly trapped?: boolean;
  } = {},
): ScopeRegistration {
  const hub = useLocalFocusHub();
  const parent = inject(ScopeKey, hub.rootScope);
  const active = computed(
    () => parent.active.value && toValue(options.isActive === undefined ? true : options.isActive),
  );
  const scope: ScopeRegistration = {
    parent,
    active,
    trapped: options.trapped ?? false,
    handlers: new Set(),
    restoreTarget: null,
    restoreWasExplicit: false,
  };
  provide(ScopeKey, scope);

  watch(
    active,
    (value) => {
      hub.scopeActivityChanged(scope, value);
    },
    { immediate: true, flush: "sync" },
  );
  onScopeDispose(() => hub.unregisterScope(scope));
  return scope;
}

function useLocalFocusTarget(
  id: string,
  host: Readonly<Ref<InstanceType<typeof Box> | null>>,
  order: number,
): LocalFocusTarget {
  const hub = useLocalFocusHub();
  const scope = inject(ScopeKey, hub.rootScope);
  const target: TargetRegistration = {
    id,
    scope,
    order,
    registrationOrder: hub.nextRegistrationOrder(),
    presence: useBoxPresence(host),
    handlers: new Set(),
  };
  const handle = hub.registerTarget(target);
  watch(target.presence, () => hub.reconcile(), { immediate: true, flush: "sync" });
  onScopeDispose(() => hub.unregisterTarget(target));
  return handle;
}

function useLocalFocusedInput(target: LocalFocusTarget, handler: LocalInputHandler): void {
  const registration = targetRegistrations.get(target);
  if (!registration) throw new Error("Unknown test-local focus target");
  registration.handlers.add(handler);
  onScopeDispose(() => registration.handlers.delete(handler));
}

function useLocalScopeInput(scope: ScopeRegistration, handler: LocalInputHandler): void {
  scope.handlers.add(handler);
  onScopeDispose(() => scope.handlers.delete(handler));
}

const FocusProvider = defineComponent({
  name: "TestLocalFocusProvider",
  setup(_props, { slots }) {
    const hub = createLocalFocusHub();
    provide(HubKey, hub);
    provide(ScopeKey, hub.rootScope);
    // This is the only Runtime input subscription in the whole provider tree.
    useInput((event) => hub.dispatch(event));
    return () => slots.default?.();
  },
});

function eventLabel(event: TuiInputEvent): string {
  if (event.kind === "text" || event.kind === "paste") return event.text;
  const value = event.name ?? event.character;
  if (value === undefined) throw new Error("A public key event must identify one key");
  return value;
}

async function flushAcceptedRender(result: RenderResult): Promise<void> {
  await nextTick();
  await result.waitUntilRenderFlush();
}

async function runPublicFocusJourney(mode: RenderMode): Promise<void> {
  const modalActive = shallowRef(false);
  const modalTargetShown = shallowRef(true);
  const trace: string[] = [];
  let hub!: LocalFocusHub;
  let first!: LocalFocusTarget;
  let second!: LocalFocusTarget;

  const FirstTarget = defineComponent(() => {
    const host = shallowRef<InstanceType<typeof Box> | null>(null);
    first = useLocalFocusTarget("first", host, 10);
    useLocalFocusedInput(first, (event) => {
      const value = eventLabel(event);
      trace.push(`target:first:${value}`);
      if (value === "!") return { stopPropagation: true };
    });
    return () => (
      <Box ref={host}>
        <Text>first</Text>
      </Box>
    );
  });

  const SecondTarget = defineComponent(() => {
    const host = shallowRef<InstanceType<typeof Box> | null>(null);
    second = useLocalFocusTarget("second", host, 20);
    useLocalFocusedInput(second, (event) => {
      const value = eventLabel(event);
      trace.push(`target:second:${value}`);
      if (value === "o") modalActive.value = true;
    });
    return () => (
      <Box ref={host}>
        <Text>second</Text>
      </Box>
    );
  });

  const InnerScope = defineComponent(() => {
    const scope = useLocalFocusScope();
    useLocalScopeInput(scope, (event) => {
      trace.push(`scope:inner:${eventLabel(event)}`);
    });
    return () => <FirstTarget />;
  });

  const ModalScope = defineComponent(() => {
    const scope = useLocalFocusScope({ isActive: modalActive, trapped: true });
    useLocalScopeInput(scope, (event) => {
      trace.push(`scope:modal:${eventLabel(event)}`);
    });

    const ModalTarget = defineComponent(() => {
      const host = shallowRef<InstanceType<typeof Box> | null>(null);
      const target = useLocalFocusTarget("modal", host, 1);
      useLocalFocusedInput(target, (event) => {
        const value = eventLabel(event);
        trace.push(`target:modal:${value}`);
        if (value === "c") modalActive.value = false;
      });
      // This is the runtime contract generated for `<Box v-show="...">`.
      return () =>
        withDirectives(
          h(Box, { ref: host }, () => h(Text, null, () => "modal")),
          [[vShow, modalTargetShown.value]],
        );
    });

    return () => <ModalTarget />;
  });

  const Journey = defineComponent(() => {
    hub = useLocalFocusHub();
    const scope = useLocalFocusScope();
    useLocalScopeInput(scope, (event) => {
      trace.push(`scope:outer:${eventLabel(event)}`);
    });
    return () => (
      <Box flexDirection="column">
        {/* Render and register second first; explicit order still selects first. */}
        <SecondTarget />
        <InnerScope />
        <ModalScope />
      </Box>
    );
  });

  const App = defineComponent(() => () => (
    <FocusProvider>
      <Journey />
    </FocusProvider>
  ));

  const result = await render(App, { host: { mode } });
  try {
    expect(hub.focusedId.value).toBe("first");

    await result.stdin.write("x");
    expect(trace).toEqual(["target:first:x", "scope:inner:x", "scope:outer:x"]);

    trace.length = 0;
    await result.stdin.write("!");
    expect(trace).toEqual(["target:first:!"]);

    expect(second.focus()).toBe(true);
    expect(hub.focusedId.value).toBe("second");
    trace.length = 0;
    await result.stdin.write("y");
    expect(trace).toEqual(["target:second:y", "scope:outer:y"]);
    expect(hub.focusNext()).toBe(true);
    expect(hub.focusedId.value).toBe("first");

    // Opening the trap during the target callback does not change this fact's
    // captured target-and-scope route. It only changes the next fact.
    expect(second.focus()).toBe(true);
    trace.length = 0;
    await result.stdin.write("o");
    expect(trace).toEqual(["target:second:o", "scope:outer:o"]);
    expect(hub.focusedId.value).toBe("modal");

    // v-show keeps the Vue component alive but removes the Box from the last
    // accepted renderer tree. The active trap remains a targetless owner.
    modalTargetShown.value = false;
    await flushAcceptedRender(result);
    expect(hub.focusedId.value).toBeNull();
    trace.length = 0;
    await result.stdin.write("q");
    expect(trace).toEqual(["scope:modal:q"]);

    modalTargetShown.value = true;
    await flushAcceptedRender(result);
    expect(hub.focusedId.value).toBe("modal");

    // Closing during the target callback keeps the modal route for this fact,
    // then restores the exact target that was focused before activation.
    trace.length = 0;
    await result.stdin.write("c");
    expect(trace).toEqual(["target:modal:c", "scope:modal:c"]);
    expect(hub.focusedId.value).toBe("second");
    expect(first.isFocused.value).toBe(false);
    expect(second.isFocused.value).toBe(true);
  } finally {
    result.dispose();
  }
}

test.each(["inline", "fullscreen"] as const)(
  "a public-only focus hub composes targets, nested scopes, traps, and routing in %s",
  runPublicFocusJourney,
);

async function mountCtrlCJourney(preventDefault: boolean): Promise<{
  readonly result: RenderResult;
  readonly trace: string[];
}> {
  const trace: string[] = [];
  const Target = defineComponent(() => {
    const host = shallowRef<InstanceType<typeof Box> | null>(null);
    const target = useLocalFocusTarget("target", host, 0);
    useLocalFocusedInput(target, (event) => {
      trace.push(eventLabel(event));
      return preventDefault
        ? { stopPropagation: true, preventDefault: true }
        : { stopPropagation: true };
    });
    return () => (
      <Box ref={host}>
        <Text>target</Text>
      </Box>
    );
  });
  const App = defineComponent(() => () => (
    <FocusProvider>
      <Target />
    </FocusProvider>
  ));
  return { result: await render(App), trace };
}

test("local propagation control does not suppress the Runtime Ctrl+C default", async () => {
  const { result, trace } = await mountCtrlCJourney(false);
  try {
    await result.stdin.write("\x03");
    expect(trace).toEqual(["c"]);
    await expect(result.waitUntilExit()).resolves.toBeUndefined();
  } finally {
    result.dispose();
  }
});

test("the hub can explicitly translate preventDefault while keeping local routing private", async () => {
  const { result, trace } = await mountCtrlCJourney(true);
  try {
    await result.stdin.write("\x03");
    await result.stdin.write("x");
    expect(trace).toEqual(["c", "x"]);
    expect(result.terminal.rawMode.current).toBe(true);
  } finally {
    result.dispose();
  }
});
