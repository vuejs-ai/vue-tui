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
  Static,
  Text,
  Transform,
  createApp,
  useApp,
  useCaret,
  useElementGeometry,
  useFocus,
  useDraggable,
  useInput,
  useStderr,
  useStdout,
} from "@vue-tui/runtime";
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
  | "screen-reader";

const scenario = (process.argv[3] ?? "static") as Scenario;
const autoExitTargetLifetime = process.argv[4] === "auto-exit";
const label = shallowRef("BUTTON");
const targetPhase = shallowRef<"none" | "first" | "second">("none");

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

const App = defineComponent(() => {
  const { exit } = useApp();
  const caretTarget = shallowRef<ComponentPublicInstance | null>(null);
  const caretFocus = useFocus(caretTarget, { autoFocus: true, tabIndex: -1 });
  useCaret(caretTarget, { focus: caretFocus, position: { x: 3, y: 0 } });
  const { write } = useStdout();
  const { write: writeError } = useStderr();
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
  const drag = useDraggable(target, {
    onStart() {
      dragStarts += 1;
    },
  });

  const renderSurface = (content: VNodeChild) => (
    <Box ref={caretTarget} flexDirection="column">
      {content}
    </Box>
  );

  useInput((event) => {
    const input = inputText(event);
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
    return "continue";
  });

  onMounted(() => {
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
        <Box width={1} height={1} flexShrink={0} onClick={() => exit("clicked")}>
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
        <Box width={101} height={1} flexShrink={0} onClick={() => exit("clicked")}>
          {{ default: () => <Text>{{ default: () => `${"X".repeat(99)}你` }}</Text> }}
        </Box>,
      );
    }

    if (scenario === "horizontal-left-wide") {
      return renderSurface(
        <Box width={4} height={1} overflow="hidden" onClick={() => exit("clicked")}>
          <Box marginLeft={-1} flexShrink={0}>
            <Text>中x</Text>
          </Box>
        </Box>,
      );
    }

    if (scenario === "horizontal-overflow") {
      return renderSurface(
        <Box width={101} height={1} flexShrink={0} onClick={() => exit("clicked")}>
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
                  height={1}
                  flexShrink={0}
                  onClick={index === 0 ? () => exit("clicked") : undefined}
                >
                  {{ default: () => <Text>{{ default: () => `LINE${index}` }}</Text> }}
                </Box>
              )),
          }}
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
        <Box
          width={7}
          height={1}
          onClick={() => exit(scenario === "screen-reader" ? "screen-reader-pointer" : "clicked")}
        >
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

void app.waitUntilExit().then((result) => {
  process.stdout.write(`__CLICKED__:${String(result)}\n`);
});
