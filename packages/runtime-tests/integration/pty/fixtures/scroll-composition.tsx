import assert from "node:assert/strict";
import process from "node:process";
import { ScrollBox, type ScrollBoxExpose } from "@vue-tui/components";
import {
  Box,
  Text,
  createApp,
  useApp,
  useElementGeometry,
  useFocus,
  useFocusedInput,
  useFocusScope,
  useFocusScopeInput,
  useInput,
  type InputHandlerResult,
  type InputRouteDecision,
  type TuiInputEvent,
} from "@vue-tui/runtime";
import { useMouseEvent, type TuiMouseWheelEvent } from "@vue-tui/runtime/fullscreen";
import { defineComponent, h, nextTick, shallowRef, watch, type ComponentPublicInstance } from "vue";

type ScrollOperation = "up" | "down" | "pageup" | "pagedown" | "home" | "end";
type AssertionJourney = "keyboard" | "wheel";

const requestedMode = process.argv[2] === "fullscreen" ? "fullscreen" : "inline";
const requestedJourney = process.argv[3];
const assertionJourney: AssertionJourney | null =
  requestedJourney === "keyboard" || requestedJourney === "wheel" ? requestedJourney : null;
const outerLines = ["outer 0", "outer 1"] as const;
const innerLines = Array.from({ length: 8 }, (_, index) => `inner ${index}`);
const outerTail = Array.from({ length: 4 }, (_, index) => `outer tail ${index}`);
const expectedCalls: Readonly<Record<AssertionJourney, readonly string[]>> = {
  keyboard: [
    "inner:down:moved",
    "inner:end:moved",
    "inner:down:unchanged",
    "outer:down:moved",
    "inner:up:moved",
    "inner:home:moved",
    "inner:home:unchanged",
    "outer:home:moved",
  ],
  wheel: [
    "inner:down:moved",
    "inner:target:down:moved",
    "inner:end:moved",
    "inner:target:down:unchanged",
    "outer:bubble:down:moved",
    "inner:target:up:moved",
  ],
};
const continueOwnedKey: InputRouteDecision = Object.freeze({
  action: "none",
  routing: "continue",
  defaultAction: "prevent",
  external: "block",
});
const stopOwnedKey: InputRouteDecision = Object.freeze({
  action: "none",
  routing: "stop",
  defaultAction: "prevent",
  external: "block",
});
let completedCalls: readonly string[] = [];

function keyOperation(event: TuiInputEvent): ScrollOperation | null {
  if (event.kind !== "key" || event.key.phase === "release") return null;
  switch (event.key.name) {
    case "up":
    case "down":
    case "pageup":
    case "pagedown":
    case "home":
    case "end":
      return event.key.name;
    default:
      return null;
  }
}

function perform(handle: ScrollBoxExpose, operation: ScrollOperation, pageLines: number): boolean {
  switch (operation) {
    case "up":
      return handle.scrollByLines(-1);
    case "down":
      return handle.scrollByLines(1);
    case "pageup":
      return handle.scrollByLines(-pageLines);
    case "pagedown":
      return handle.scrollByLines(pageLines);
    case "home":
      return handle.scrollToTop();
    case "end":
      return handle.scrollToBottom();
  }
}

const App = defineComponent(() => {
  const { exit } = useApp();
  const outer = shallowRef<ScrollBoxExpose | null>(null);
  const inner = shallowRef<ScrollBoxExpose | null>(null);
  const outerTarget = shallowRef<ComponentPublicInstance | null>(null);
  const innerTarget = shallowRef<ComponentPublicInstance | null>(null);
  const outerGeometry = useElementGeometry(outerTarget);
  const innerGeometry = useElementGeometry(innerTarget);
  const outerScope = useFocusScope();
  const innerFocus = useFocus(innerTarget, {
    scope: outerScope,
    autoFocus: true,
    tabIndex: -1,
  });
  const initialized = shallowRef(false);
  let initializing = false;
  const source = shallowRef("initial");
  const route = shallowRef<readonly string[]>(["ready"]);
  const calls: string[] = [];

  const visibleHeight = (projection: typeof innerGeometry, owner: "inner" | "outer"): number => {
    const geometry = projection.geometry.value;
    if (geometry.status !== "visible") {
      throw new Error(`${owner} scroll target must be visible before input delivery`);
    }
    return geometry.parent.height;
  };
  const record = (entry: string, nextSource: string, reset: boolean): void => {
    source.value = nextSource;
    route.value = reset ? [entry] : [...route.value, entry];
    calls.push(entry);
  };

  useInput((event) => {
    if (event.kind !== "text" || event.text !== "q") return "continue";
    if (assertionJourney) assert.deepEqual(calls, expectedCalls[assertionJourney]);
    completedCalls = [...calls];
    exit();
    return "consume";
  });
  useFocusedInput(innerFocus, (event): InputHandlerResult => {
    const operation = keyOperation(event);
    if (!operation) return "continue";
    const handle = inner.value;
    if (!handle) throw new Error("inner ScrollBox handle must be available before input delivery");
    const moved = perform(handle, operation, visibleHeight(innerGeometry, "inner"));
    record(`inner:${operation}:${moved ? "moved" : "unchanged"}`, `keyboard:${operation}`, true);
    return moved ? "consume" : continueOwnedKey;
  });
  useFocusScopeInput(outerScope, (event): InputHandlerResult => {
    const operation = keyOperation(event);
    if (!operation) return "continue";
    const handle = outer.value;
    if (!handle) throw new Error("outer ScrollBox handle must be available before input delivery");
    const moved = perform(handle, operation, visibleHeight(outerGeometry, "outer"));
    record(`outer:${operation}:${moved ? "moved" : "unchanged"}`, `keyboard:${operation}`, false);
    return moved ? "consume" : stopOwnedKey;
  });

  const wheel = (
    owner: "inner" | "outer",
    handle: ScrollBoxExpose | null,
    event: TuiMouseWheelEvent,
  ) => {
    if (!handle)
      throw new Error(`${owner} ScrollBox handle must be available before wheel delivery`);
    const direction = event.delta.y > 0 ? "down" : "up";
    const moved = handle.scrollByLines(event.delta.y);
    record(
      `${owner}:${event.delivery}:${direction}:${moved ? "moved" : "unchanged"}`,
      `wheel:${direction}`,
      event.delivery === "target",
    );
    return moved ? ("consume" as const) : ("continue" as const);
  };
  if (requestedMode === "fullscreen") {
    useMouseEvent(innerTarget, "wheel", (event) => wheel("inner", inner.value, event));
    useMouseEvent(outerTarget, "wheel", (event) => wheel("outer", outer.value, event));
  }

  watch(
    [outerGeometry.geometry, innerGeometry.geometry],
    ([nextOuter, nextInner]) => {
      if (
        initialized.value ||
        initializing ||
        nextOuter.status !== "visible" ||
        nextInner.status !== "visible" ||
        !outer.value ||
        !inner.value
      ) {
        return;
      }
      initializing = true;
      void nextTick().then(async () => {
        const outerHandle = outer.value;
        const innerHandle = inner.value;
        if (!outerHandle || !innerHandle) {
          throw new Error("ScrollBox handles detached during initial offset setup");
        }
        if (!outerHandle.scrollToLine(1) || !innerHandle.scrollToLine(2)) {
          throw new Error("ScrollBox initial offsets must move from their sticky-bottom positions");
        }
        initialized.value = true;
        await nextTick();
        if (assertionJourney) process.stdout.write("__READY__");
      });
    },
    { flush: "post", immediate: true },
  );

  const line = (value: string) => h(Text, { key: value }, { default: () => value });

  return () =>
    h(
      Box,
      { width: 64, flexDirection: "column" },
      {
        default: () => [
          h(Text, { bold: true }, { default: () => `Scroll composition (${requestedMode})` }),
          h(Text, null, {
            default: () =>
              `focus=${innerFocus.isFocused.value ? "inner" : "none"} mouse=${requestedMode === "fullscreen" ? "button" : "off"}`,
          }),
          h(Text, null, { default: () => `source=${source.value}` }),
          h(Text, null, { default: () => `route=${route.value.join(" > ")}` }),
          h(
            Box,
            {
              ref: outerTarget,
              width: 40,
              height: 6,
              flexDirection: "column",
              flexShrink: 0,
            },
            {
              default: () =>
                h(
                  ScrollBox,
                  { ref: outer },
                  {
                    default: () => [
                      ...outerLines.map(line),
                      h(
                        Box,
                        {
                          ref: innerTarget,
                          height: 3,
                          flexDirection: "column",
                          flexShrink: 0,
                        },
                        {
                          default: () =>
                            h(ScrollBox, { ref: inner }, { default: () => innerLines.map(line) }),
                        },
                      ),
                      ...outerTail.map(line),
                    ],
                  },
                ),
            },
          ),
        ],
      },
    );
});

const app = createApp(App);
app.mount({
  mode: requestedMode,
  maxFps: 0,
  patchConsole: false,
  kittyKeyboard: { mode: "enabled" },
});
await app.waitUntilExit();
if (assertionJourney) {
  process.stdout.write(`__TRACE__${JSON.stringify(completedCalls)}__`);
  process.stdout.write("__SCROLL_COMPOSITION_OK__");
}
