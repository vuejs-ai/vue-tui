import process from "node:process";
import ansiEscapes from "ansi-escapes";
import { Box, Static, Text, createApp, useApp, useCursor, useStdout } from "@vue-tui/runtime";
import { defineComponent, nextTick, onMounted, onScopeDispose, shallowRef, watch } from "vue";

type Scenario =
  | "current-full"
  | "current-shrink"
  | "bounded"
  | "bounded-tail"
  | "static-tail"
  | "fullscreen"
  | "explicit-preclear"
  | "partial-row"
  | "partial-row-screen-reader"
  | "partial-row-empty-cursor"
  | "partial-row-coordinated"
  | "partial-row-static"
  | "post-teardown"
  | "post-teardown-cursor"
  | "post-teardown-cursor-incremental"
  | "post-teardown-short-cursor";

const rows = Number(process.argv[2]) || 6;
const scenario = (process.argv[3] ?? "current-full") as Scenario;
const revision = shallowRef(0);

process.stdout.rows = rows;
process.stdout.write(scenario.startsWith("partial-row") ? "PRE_APP_PARTIAL" : "PRE_APP_HISTORY\n");
if (scenario === "explicit-preclear") process.stdout.write(ansiEscapes.clearTerminal);

const App = defineComponent(() => {
  const { exit, waitUntilRenderFlush } = useApp();
  const cursor =
    scenario === "partial-row-empty-cursor" || scenario.includes("teardown-") ? useCursor() : null;
  const coordinated = scenario === "partial-row-coordinated" ? useStdout() : null;
  let timer: ReturnType<typeof setTimeout> | undefined;

  watch(
    revision,
    (value) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (value >= 2) exit();
        else {
          revision.value++;
          await nextTick();
          await waitUntilRenderFlush();
          if (scenario === "current-shrink" && revision.value === 1) {
            process.stdout.write("\x1b]0;INLINE_OVERFLOW_SHORTER_COMMITTED\x07");
          }
        }
      }, 50);
    },
    { immediate: true },
  );

  onMounted(() => {
    coordinated?.write("COMMITTED");
    process.stdout.write("\x1b]0;INLINE_OVERFLOW_MOUNTED\x07");
  });
  onScopeDispose(() => clearTimeout(timer));

  return () => {
    if (cursor) cursor.setCursorPosition({ x: 0, y: 0 });

    if (scenario === "partial-row-empty-cursor" || scenario === "partial-row-coordinated") {
      return null;
    }

    if (scenario === "partial-row-static") {
      return (
        <Static items={["COMMITTED"]}>
          {{ default: ({ item }: { item: string }) => <Text key={item}>{item}</Text> }}
        </Static>
      );
    }

    if (scenario === "static-tail") {
      const completed = Array.from({ length: revision.value + 1 }, (_, index) => `DONE ${index}`);
      return (
        <>
          <Static items={completed}>
            {{ default: ({ item }: { item: string }) => <Text key={item}>{item}</Text> }}
          </Static>
          <Text>TAIL {revision.value}</Text>
        </>
      );
    }

    if (scenario === "bounded" || scenario === "bounded-tail" || scenario === "explicit-preclear") {
      const lines = [
        `TOP ${revision.value}`,
        "BODY A",
        "BODY B",
        "BODY C",
        "BODY D",
        `BOTTOM ${revision.value}`,
      ];
      const visibleLines = scenario === "bounded-tail" ? lines.slice(-(rows - 1)) : lines;

      return (
        <Box height={rows - 1} overflowY="hidden" flexDirection="column">
          <Box height={rows + 2} flexShrink={0} flexDirection="column">
            {visibleLines.map((line) => (
              <Text key={line}>{line}</Text>
            ))}
          </Box>
        </Box>
      );
    }

    const targetHeight =
      scenario === "post-teardown-short-cursor"
        ? 2
        : scenario === "current-shrink" && revision.value > 0
          ? rows - 1
          : rows + 1;
    const height = scenario === "current-full" ? rows : targetHeight;

    return (
      <Box height={height} flexDirection="column">
        <Text>TOP {revision.value}</Text>
        <Box flexGrow={1} />
        <Text>BOTTOM {revision.value}</Text>
      </Box>
    );
  };
});

const app = createApp(App);
app.mount({
  mode: scenario === "fullscreen" ? "fullscreen" : "inline",
  isScreenReaderEnabled: scenario === "partial-row-screen-reader",
  maxFps: 0,
  incrementalRendering: scenario === "post-teardown-cursor-incremental",
});

if (scenario.startsWith("post-teardown")) {
  await app.waitUntilExit();
  process.stdout.write("POST_APP\n");
}
