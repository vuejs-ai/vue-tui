import { defineComponent, nextTick, onMounted, shallowRef, type VNodeChild } from "vue";
import { Box, Text, createApp, useApp, useInput } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { inputText } from "./input-event.js";

type Scenario =
  | "static"
  | "console"
  | "rerender"
  | "overflow"
  | "horizontal-overflow"
  | "horizontal-left-wide"
  | "horizontal-wide";

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
  const renderSurface = (content: VNodeChild) => <Box flexDirection="column">{content}</Box>;

  useInput((event) => {
    const input = inputText(event);
    if (input === "q") {
      exit();
      return;
    }
  });

  onMounted(() => {
    if (scenario === "static") return;
    setTimeout(() => {
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
    if (scenario === "horizontal-wide") {
      return renderSurface(
        <Box width={101} height={1} flexShrink={0}>
          {{ default: () => <Text>{{ default: () => `${"X".repeat(99)}你` }}</Text> }}
        </Box>,
      );
    }

    if (scenario === "horizontal-left-wide") {
      return renderSurface(
        <Box width={4} height={1} overflowY="hidden">
          <Box position="absolute" left={-1} flexShrink={0}>
            <Text>中x</Text>
          </Box>
        </Box>,
      );
    }

    if (scenario === "horizontal-overflow") {
      return renderSurface(
        <Box width={101} height={1} flexShrink={0}>
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
                <Box key={index} height={1} flexShrink={0}>
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
          <Static>
            <Text>HISTORY</Text>
          </Static>
        ) : null}
        <Box width={7} height={1}>
          {{ default: () => <Text>{{ default: () => label.value }}</Text> }}
        </Box>
      </>,
    );
  };
});

const app = createApp(App);
app.config.warnHandler = () => {};
const exited = app.waitUntilExit();
let mountThrew = false;
let mountError: unknown;
try {
  app.mount({
    mode: "fullscreen",
  });
} catch (error) {
  mountThrew = true;
  mountError = error;
}

if (scenario === "static") {
  if (!mountThrew) throw new Error("Expected Fullscreen Static mount to throw");
  let exitError: unknown;
  try {
    await exited;
    throw new Error("Expected Fullscreen Static exit to reject");
  } catch (error) {
    exitError = error;
  }
  if (exitError !== mountError) {
    throw new Error("Fullscreen Static mount and exit did not preserve the same failure");
  }
  const message = exitError instanceof Error ? exitError.message : String(exitError);
  process.stdout.write(`__STATIC_REJECTED__:${message}\n`);
} else {
  if (mountThrew) throw mountError;
  void exited.then(() => {
    process.stdout.write(`__EXITED__:${scenario}\n`);
  });
}
