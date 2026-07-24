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
  | "foreground-reset"
  | "box-text-contract";

const scenario = (process.argv[3] ?? "static") as Scenario;
const label = shallowRef("BUTTON");
const contractExpanded = shallowRef(true);

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
    if (scenario === "box-text-contract" && input === "t") {
      contractExpanded.value = !contractExpanded.value;
      void nextTick().then(markSettled);
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

    if (scenario === "foreground-reset") {
      return renderSurface(
        <Box flexDirection="column">
          <Text>Nested foreground reset</Text>
          <Text color="red" backgroundColor="blue">
            red:
            <Text color="default">
              default:<Text color="green">green</Text>:default
            </Text>
            :red
          </Text>
          <Box width={4} flexShrink={0}>
            <Text color="red">
              AA<Text color="default">BBB</Text>CC
            </Text>
          </Box>
          <Text color="blue">blue sibling</Text>
          <Text color="red">
            literal:<Text color="default">reset</Text>:red
          </Text>
          <Text>Press q to restore the shell</Text>
        </Box>,
      );
    }

    if (scenario === "box-text-contract") {
      const expanded = contractExpanded.value;
      return renderSurface(
        <Box
          {...(expanded ? { paddingX: 2 } : {})}
          flexDirection="column"
          width="100%"
          height={18}
          flexShrink={0}
          paddingY={1}
          borderStyle="round"
          borderColor="cyan"
          overflow="hidden"
        >
          <Text bold underline>
            Box/Text · state:{expanded ? "explicit" : "withdrawn"} · t toggle · q exit
          </Text>
          <Box
            {...(expanded ? { columnGap: 3 } : {})}
            flexDirection="row-reverse"
            flexWrap="wrap"
            alignItems="stretch"
            justifyContent="space-between"
            gap={1}
            rowGap={1}
          >
            <Box
              {...(expanded ? { borderRight: false } : {})}
              width="30%"
              minWidth={12}
              maxWidth={24}
              paddingX={1}
              borderStyle="single"
              borderColor="yellow"
            >
              <Text color="yellow">A · reverse</Text>
            </Box>
            <Box
              width="30%"
              minWidth={12}
              maxWidth={24}
              paddingX={1}
              borderStyle="round"
              borderColor="green"
            >
              <Text color="green">B · wrap</Text>
            </Box>
            <Box
              width="30%"
              minWidth={12}
              maxWidth={24}
              paddingX={1}
              borderStyle="single"
              borderColor="magenta"
            >
              <Text color="magenta">C · gap</Text>
            </Box>
          </Box>
          <Text color="red" backgroundColor="blue" bold dimColor underline>
            styles:A<Text {...(expanded ? { bold: false } : {})}>B</Text>
            <Text {...(expanded ? { dimColor: false } : {})}>C</Text>
            <Text color="default" backgroundColor="default" italic strikethrough inverse>
              D
            </Text>
            E
          </Text>
          <Box width={18} height={1} overflowX="hidden">
            <Text>overflow:0123456789ABCDEFGHIJ</Text>
          </Box>
          <Text wrap="truncate-middle">
            truncate-middle:0123456789·中文·👩‍💻·ABCDEFGHIJKLMNOPQRSTUVWXYZ
          </Text>
          <Text wrap="hard">hard-wrap:ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789</Text>
          <Box position="absolute" right="2%" bottom={1}>
            <Text inverse>ABS</Text>
          </Box>
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
