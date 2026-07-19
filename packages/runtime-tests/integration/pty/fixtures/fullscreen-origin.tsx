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
  | "horizontal-wide"
  | "screen-reader"
  | "foreground-reset";

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
    if (input === "q") exit();
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
app.mount({
  mode: "fullscreen",
  presentation: scenario === "screen-reader" ? "screen-reader" : "visual",
});

void app.waitUntilExit().then(
  () => {
    process.stdout.write(`__EXITED__:${scenario}\n`);
  },
  (error: unknown) => {
    if (scenario === "static") {
      const message = error instanceof Error ? error.message : String(error);
      process.stdout.write(`__STATIC_REJECTED__:${message}\n`);
    }
  },
);
