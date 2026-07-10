import { defineComponent, nextTick, onMounted, shallowRef } from "vue";
import {
  Box,
  Static,
  Text,
  Transform,
  createApp,
  useApp,
  useCursor,
  useInput,
  useStderr,
  useStdout,
} from "@vue-tui/runtime";

type Scenario =
  | "static"
  | "stdout"
  | "stderr"
  | "console"
  | "debug"
  | "overflow"
  | "horizontal-overflow"
  | "horizontal-wide"
  | "horizontal-transform"
  | "screen-reader";

const scenario = (process.argv[3] ?? "static") as Scenario;
const label = shallowRef("BUTTON");

// term() waits for this marker before sending input. Write it before entering
// the alternate screen so it cannot move the fullscreen frame.
process.stdout.write("__READY__\n");

function markSettled(): void {
  // An OSC title update is observable in the raw PTY stream but does not move
  // the terminal cursor or occupy a cell in the emulated screen.
  process.stdout.write(`\x1b]0;__SETTLED__:${scenario}\x07`);
}

const App = defineComponent(() => {
  const { exit } = useApp();
  const { setCursorPosition } = useCursor();
  const { write } = useStdout();
  const { write: writeError } = useStderr();

  if (scenario !== "debug" && scenario !== "screen-reader") {
    setCursorPosition({ x: 3, y: 0 });
  }

  useInput((input) => {
    if (scenario === "screen-reader" && input === "q") {
      exit("screen-reader");
    }
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

      if (scenario === "debug") {
        label.value = "UPDATED";
        void nextTick().then(markSettled);
        return;
      }

      markSettled();
    }, 50);
  });

  return () => {
    if (scenario === "horizontal-transform") {
      return (
        <Box width={1} height={1} flexShrink={0} onClick={() => exit("clicked")}>
          {{
            default: () => (
              <Transform transform={() => "Y".repeat(101)}>
                <Text>X</Text>
              </Transform>
            ),
          }}
        </Box>
      );
    }

    if (scenario === "horizontal-wide") {
      return (
        <Box width={101} height={1} flexShrink={0} onClick={() => exit("clicked")}>
          {{ default: () => <Text>{{ default: () => `${"X".repeat(99)}你` }}</Text> }}
        </Box>
      );
    }

    if (scenario === "horizontal-overflow") {
      return (
        <Box width={101} height={1} flexShrink={0} onClick={() => exit("clicked")}>
          {{ default: () => <Text>{{ default: () => "X".repeat(101) }}</Text> }}
        </Box>
      );
    }

    if (scenario === "overflow") {
      return (
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
        </Box>
      );
    }

    return (
      <>
        {scenario === "static" ? (
          <Static items={["HISTORY"]}>
            {{ default: ({ item }: { item: string }) => <Text>{item}</Text> }}
          </Static>
        ) : null}
        <Box
          width={7}
          height={1}
          onClick={scenario === "screen-reader" ? undefined : () => exit("clicked")}
        >
          {{ default: () => <Text>{{ default: () => label.value }}</Text> }}
        </Box>
      </>
    );
  };
});

const app = createApp(App);
app.mount({
  fullscreen: true,
  debug: scenario === "debug",
  isScreenReaderEnabled: scenario === "screen-reader",
  incrementalRendering: scenario === "stdout",
  exitOnCtrlC: false,
  maxFps: 0,
});

void app.waitUntilExit().then((result) => {
  process.stdout.write(`__CLICKED__:${String(result)}\n`);
});
