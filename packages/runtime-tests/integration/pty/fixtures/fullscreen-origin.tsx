import {
  computed,
  defineComponent,
  nextTick,
  onMounted,
  shallowRef,
  type ComponentPublicInstance,
  type VNodeChild,
} from "vue";
import {
  Box,
  Text,
  Transform,
  createApp,
  useApp,
  useCaret,
  useElementGeometry,
  useFocus,
  useInput,
  useStderr,
  useStdout,
} from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { ScrollBox, type ScrollBoxExpose } from "@vue-tui/components";
import { useMouseDrag, useMouseEvent } from "@vue-tui/runtime/fullscreen";
import { inputText } from "./input-event.js";

type Scenario =
  | "static"
  | "stdout"
  | "stderr"
  | "console"
  | "rerender"
  | "overflow"
  | "horizontal-overflow"
  | "horizontal-left-wide"
  | "horizontal-wide"
  | "horizontal-transform"
  | "target-lifetime"
  | "targeted-mouse"
  | "screen-reader"
  | "foreground-reset";

const scenario = (process.argv[3] ?? "static") as Scenario;
const autoExitTargetLifetime = process.argv[4] === "auto-exit";
const label = shallowRef("BUTTON");
const targetPhase = shallowRef<"none" | "first" | "second">("none");
const targetedTargetsVisible = shallowRef(false);
const targetedDragActive = shallowRef(false);
const targetedConsumeClick = shallowRef(false);

const LifetimeTarget = defineComponent(() => {
  return () => {
    if (targetPhase.value === "none") return null;
    if (targetPhase.value === "first") {
      return (
        <Box key="first" width={7} height={2}>
          <Text>FIRST</Text>
        </Box>
      );
    }
    return (
      <Box key="second" marginLeft={5} width={11} height={1}>
        <Text>TARGET-B</Text>
      </Box>
    );
  };
});

// term() waits for this marker before sending input. Write it before entering
// the alternate screen so it cannot move the fullscreen frame.
process.stdout.write("__READY__\n");

function markSettled(): void {
  // An OSC title update is observable in the raw PTY stream but does not move
  // the terminal cursor or occupy a cell in the emulated screen.
  process.stdout.write(`\x1b]0;__SETTLED__:${scenario}\x07`);
}

function markTargetPhase(): Promise<void> {
  return nextTick()
    .then(() => nextTick())
    .then(() => {
      process.stdout.write(`\x1b]0;__TARGET__:${targetPhase.value}\x07`);
    });
}

function markTargetedState(state: string): Promise<void> {
  return nextTick()
    .then(() => nextTick())
    .then(() => {
      process.stdout.write(`\x1b]0;__TARGETED__:${state}\x07`);
    });
}

function markTargetedEvent(event: string): void {
  process.stdout.write(`\x1b]0;__MOUSE__:${event}\x07`);
}

const App = defineComponent(() => {
  const { exit } = useApp();
  const caretTarget = shallowRef<ComponentPublicInstance | null>(null);
  const caretFocus = useFocus(caretTarget, { autoFocus: true, tabIndex: -1 });
  useCaret(caretTarget, { focus: caretFocus, position: { x: 3, y: 0 } });
  const { write } = useStdout();
  const { write: writeError } = useStderr();
  const clickTarget = shallowRef<ComponentPublicInstance | null>(null);
  const targetedParent = shallowRef<ComponentPublicInstance | null>(null);
  const targetedChild = shallowRef<ComponentPublicInstance | null>(null);
  const targetedWheelTarget = shallowRef<ComponentPublicInstance | null>(null);
  const targetedDivider = shallowRef<ComponentPublicInstance | null>(null);
  const targetedClippedTarget = shallowRef<ComponentPublicInstance | null>(null);
  const targetedScrollBox = shallowRef<ScrollBoxExpose | null>(null);
  const targetedChildFocus = useFocus(targetedChild);
  const target = shallowRef<InstanceType<typeof LifetimeTarget> | null>(null);
  const { geometry: targetGeometry } = useElementGeometry(target);
  const targetMetrics = computed(() => {
    const geometry = targetGeometry.value;
    if (
      geometry.status === "zero-size" ||
      geometry.status === "fully-clipped" ||
      geometry.status === "visible"
    ) {
      return {
        width: geometry.parent.width,
        height: geometry.parent.height,
        measured: true,
      };
    }
    return { width: 0, height: 0, measured: false };
  });
  let dragStarts = 0;
  const drag = useMouseDrag(target, (event) => {
    if (event.phase === "start") dragStarts += 1;
  });
  useMouseEvent(clickTarget, "click", () => {
    exit(scenario === "screen-reader" ? "screen-reader-pointer" : "clicked");
    return "consume";
  });
  useMouseEvent(targetedChild, "click", (event) => {
    targetedChildFocus.focus();
    markTargetedEvent(
      `click:child:${event.delivery}:focused=${String(targetedChildFocus.isFocused.value)}:consume=${String(targetedConsumeClick.value)}`,
    );
    return targetedConsumeClick.value ? "consume" : "continue";
  });
  useMouseEvent(targetedParent, "click", (event) => {
    markTargetedEvent(`click:parent:${event.delivery}`);
    return "continue";
  });
  useMouseEvent(targetedWheelTarget, "wheel", (event) => {
    targetedScrollBox.value?.scrollByLines(event.delta.y);
    void markTargetedState(`wheel:${event.delivery}:${event.delta.x},${event.delta.y}`);
    return "consume";
  });
  useMouseEvent(targetedClippedTarget, "click", (event) => {
    markTargetedEvent(`click:clipped:${event.delivery}:${event.local.x},${event.local.y}`);
    return "consume";
  });

  const registerDividerDrag = (name: "a" | "b") =>
    useMouseDrag(
      targetedDivider,
      (event) => {
        const local = event.local === null ? "outside" : `${event.local.x},${event.local.y}`;
        markTargetedEvent(`drag:${name}:${event.phase}:${local}`);
      },
      { isActive: () => targetedDragActive.value },
    );
  registerDividerDrag("a");
  registerDividerDrag("b");

  const renderSurface = (content: VNodeChild) => (
    <Box ref={caretTarget} flexDirection="column">
      {content}
    </Box>
  );

  useInput((event) => {
    const input = inputText(event);
    if (scenario === "targeted-mouse") {
      if (input === "a") {
        targetedTargetsVisible.value = true;
        void markTargetedState("button");
      } else if (input === "c") {
        targetedConsumeClick.value = true;
        void markTargetedState("consume");
      } else if (input === "d") {
        targetedDragActive.value = true;
        void markTargetedState("drag");
      } else if (input === "g") {
        targetedDragActive.value = false;
        void markTargetedState("button-after-drag");
      } else if (input === "x") {
        targetedTargetsVisible.value = false;
        void markTargetedState("none");
      } else if (input === "p") {
        markTargetedEvent("probe");
      } else if (input === "q") {
        exit("targeted-mouse");
      } else {
        return "continue";
      }
      return "consume";
    }
    if (scenario === "target-lifetime") {
      let exitAfterTransition = false;
      if (input === "1") targetPhase.value = "first";
      else if (input === "2") targetPhase.value = "second";
      else if (input === "p") {
        // PTY synchronization point: report the durable start count only after
        // all input bytes before this key have been routed and rendered.
        void nextTick().then(() => {
          process.stdout.write(`\x1b]0;__DRAG_STARTS__:${dragStarts}\x07`);
        });
        return "consume";
      } else if (input === "x") {
        targetPhase.value = "none";
        exitAfterTransition = autoExitTargetLifetime;
      } else if (input === "q") {
        exit("target-lifetime");
        return "consume";
      } else return "continue";
      const marked = markTargetPhase();
      if (exitAfterTransition) {
        void marked.then(() => {
          setTimeout(() => exit("target-lifetime"), 20);
        });
      }
      return "consume";
    }
    if (scenario === "screen-reader" && input === "q") {
      exit("screen-reader");
      return "consume";
    }
    if (scenario === "foreground-reset" && input === "q") {
      exit("foreground-reset");
      return "consume";
    }
    return "continue";
  });

  onMounted(() => {
    if (scenario === "static") return;
    setTimeout(() => {
      if (scenario === "stdout") {
        write("LOG\n");
        markSettled();
        return;
      }

      if (scenario === "stderr") {
        writeError("ERROR\n");
        markSettled();
        return;
      }

      if (scenario === "console") {
        console.log("CONSOLE");
        markSettled();
        return;
      }

      if (scenario === "rerender") {
        label.value = "UPDATED";
        void nextTick().then(markSettled);
        return;
      }

      markSettled();
    }, 50);
  });

  return () => {
    if (scenario === "targeted-mouse") {
      return renderSurface(
        <Box flexDirection="column">
          <Text>
            targets={targetedTargetsVisible.value ? "visible" : "hidden"} focused=
            {String(targetedChildFocus.isFocused.value)}
          </Text>
          {targetedTargetsVisible.value ? (
            <>
              <Box ref={targetedParent} width={12} height={1} flexShrink={0}>
                <Box ref={targetedChild} width={5} height={1} flexShrink={0}>
                  <Text>CLICK</Text>
                </Box>
              </Box>
              <Box ref={targetedWheelTarget} width={8} height={2} flexShrink={0} overflow="hidden">
                <ScrollBox ref={targetedScrollBox}>
                  {Array.from({ length: 5 }, (_, index) => (
                    <Box key={index} height={1} flexShrink={0}>
                      <Text>ITEM{index}</Text>
                    </Box>
                  ))}
                </ScrollBox>
              </Box>
              <Box ref={targetedDivider} width={5} height={1} flexShrink={0}>
                <Text>-----</Text>
              </Box>
              <Box width={3} height={1} flexShrink={0} overflow="hidden">
                <Box ref={targetedClippedTarget} width={8} height={1} flexShrink={0}>
                  <Text>CLIPPED</Text>
                </Box>
              </Box>
            </>
          ) : null}
        </Box>,
      );
    }

    if (scenario === "target-lifetime") {
      return renderSurface(
        <Box flexDirection="column">
          <Text>phase={targetPhase.value}</Text>
          <LifetimeTarget ref={target} />
          <Text>
            target={targetMetrics.value.width}x{targetMetrics.value.height}:
            {String(targetMetrics.value.measured)} dragging={String(drag.isDragging.value)}
          </Text>
        </Box>,
      );
    }

    if (scenario === "horizontal-transform") {
      return renderSurface(
        <Box ref={clickTarget} width={1} height={1} flexShrink={0}>
          {{
            default: () => (
              <Transform transform={() => "Y".repeat(101)}>
                <Text>X</Text>
              </Transform>
            ),
          }}
        </Box>,
      );
    }

    if (scenario === "horizontal-wide") {
      return renderSurface(
        <Box ref={clickTarget} width={101} height={1} flexShrink={0}>
          {{ default: () => <Text>{{ default: () => `${"X".repeat(99)}你` }}</Text> }}
        </Box>,
      );
    }

    if (scenario === "horizontal-left-wide") {
      return renderSurface(
        <Box ref={clickTarget} width={4} height={1} overflow="hidden">
          <Box marginLeft={-1} flexShrink={0}>
            <Text>中x</Text>
          </Box>
        </Box>,
      );
    }

    if (scenario === "horizontal-overflow") {
      return renderSurface(
        <Box ref={clickTarget} width={101} height={1} flexShrink={0}>
          {{ default: () => <Text>{{ default: () => "X".repeat(101) }}</Text> }}
        </Box>,
      );
    }

    if (scenario === "overflow") {
      return renderSurface(
        <Box flexDirection="column" height={10} flexShrink={0}>
          {{
            default: () =>
              Array.from({ length: 10 }, (_, index) => (
                <Box
                  key={index}
                  ref={index === 0 ? clickTarget : undefined}
                  height={1}
                  flexShrink={0}
                >
                  {{ default: () => <Text>{{ default: () => `LINE${index}` }}</Text> }}
                </Box>
              )),
          }}
        </Box>,
      );
    }

    if (scenario === "foreground-reset") {
      return renderSurface(
        <Box flexDirection="column">
          <Text>Nested foreground reset</Text>
          <Text color="red" backgroundColor="blue">
            red:
            <Text color="revert">
              default:<Text color="green">green</Text>:default
            </Text>
            :red
          </Text>
          <Box width={4} flexShrink={0}>
            <Text color="red">
              AA<Text color="initial">BBB</Text>CC
            </Text>
          </Box>
          <Text color="blue">blue sibling</Text>
          <Text color="red">
            literal:<Text color="revert">reset</Text>:red
          </Text>
          <Text>Press q to restore the shell</Text>
        </Box>,
      );
    }

    return renderSurface(
      <>
        {scenario === "static" ? (
          <Static items={["HISTORY"]}>
            {{ default: ({ item }: { item: string }) => <Text>{item}</Text> }}
          </Static>
        ) : null}
        <Box ref={clickTarget} width={7} height={1}>
          {{ default: () => <Text>{{ default: () => label.value }}</Text> }}
        </Box>
      </>,
    );
  };
});

const app = createApp(App);
app.mount({
  mode: "fullscreen",
  isScreenReaderEnabled: scenario === "screen-reader",
  incrementalRendering: scenario === "stdout",
  maxFps: 0,
});

void app.waitUntilExit().then(
  (result) => {
    process.stdout.write(`__CLICKED__:${String(result)}\n`);
  },
  (error: unknown) => {
    if (scenario === "static") {
      const message = error instanceof Error ? error.message : String(error);
      process.stdout.write(`__STATIC_REJECTED__:${message}\n`);
    }
  },
);
