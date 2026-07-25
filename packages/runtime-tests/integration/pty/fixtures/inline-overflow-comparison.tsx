import process from "node:process";
import ansiEscapes from "ansi-escapes";
import { Box, Text, createApp, useApp, type TuiApp } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import {
  defineComponent,
  h,
  nextTick,
  onMounted,
  onScopeDispose,
  shallowRef,
  vShow,
  watch,
  withDirectives,
} from "vue";

type Scenario =
  | "current-full"
  | "current-shrink"
  | "bounded"
  | "bounded-tail"
  | "static-tail"
  | "fullscreen"
  | "explicit-preclear"
  | "partial-row"
  | "partial-row-static"
  | "post-teardown";

const rows = Number(process.argv[2]) || 6;
const scenario = (process.argv[3] ?? "current-full") as Scenario;
const revision = shallowRef(0);
let app: TuiApp;
const DeferredHistory = defineComponent(
  () => () => h(Text, null, () => (revision.value > 0 ? "DEFERRED" : "")),
);

process.stdout.rows = rows;
process.stdout.write(scenario.startsWith("partial-row") ? "PRE_APP_PARTIAL" : "PRE_APP_HISTORY\n");
if (scenario === "explicit-preclear") process.stdout.write(ansiEscapes.clearTerminal);

// The shorter-frame marker is written only after a render flush, which can
// outlast the 50 ms tick that advances to the exit step. Ordering exit behind
// this gate keeps the marker in the captured output instead of leaving the
// comparison test to lose a race whenever the machine is loaded.
let markShorterCommitted: () => void = () => {};
const shorterFrameCommitted =
  scenario === "current-shrink"
    ? new Promise<void>((resolve) => {
        markShorterCommitted = resolve;
      })
    : Promise.resolve();

const App = defineComponent(() => {
  const { exit } = useApp();
  let timer: ReturnType<typeof setTimeout> | undefined;

  watch(
    revision,
    (value) => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        if (value >= 2) {
          await shorterFrameCommitted;
          exit();
        } else {
          // Nothing may advance past the shorter frame until its marker is in the
          // stream: the comparison test reads byte order, so an advance that ran
          // while the marker was still waiting on a flush would put TOP 2 first.
          if (value === 1) await shorterFrameCommitted;
          revision.value++;
          // Capture the revision this tick produced BEFORE awaiting. Reading the
          // live ref after the flush is a race: under load the next 50 ms tick
          // has already advanced it, so the marker branch never ran and the
          // comparison test saw -1 for its index.
          const committedRevision = revision.value;
          await nextTick();
          await app.waitUntilRenderFlush();
          if (scenario === "current-shrink" && committedRevision === 1) {
            process.stdout.write("\x1b]0;INLINE_OVERFLOW_SHORTER_COMMITTED\x07");
            markShorterCommitted();
          }
        }
      }, 50);
    },
    { immediate: true },
  );

  onMounted(() => {
    process.stdout.write("\x1b]0;INLINE_OVERFLOW_MOUNTED\x07");
  });
  onScopeDispose(() => clearTimeout(timer));

  return () => {
    if (scenario === "partial-row-static") {
      return (
        <Static>
          <Text>COMMITTED</Text>
        </Static>
      );
    }

    if (scenario === "static-tail") {
      const completed = Array.from({ length: revision.value + 1 }, (_, index) => `DONE ${index}`);
      return h(Box, { flexDirection: "column" }, () => [
        withDirectives(
          h(Box, { key: "deferred" }, () => h(Static, null, () => h(DeferredHistory))),
          [[vShow, false]],
        ),
        ...completed.map((item) =>
          withDirectives(
            h(Static, { key: item }, () => h(Text, null, () => item)),
            [[vShow, false]],
          ),
        ),
        h(Text, null, () => `TAIL ${revision.value}`),
      ]);
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

    const targetHeight = scenario === "current-shrink" && revision.value > 0 ? rows - 1 : rows + 1;
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

app = createApp(App);
app.mount({
  mode: scenario === "fullscreen" ? "fullscreen" : "inline",
});

if (scenario.startsWith("post-teardown")) {
  await app.waitUntilExit();
  process.stdout.write("POST_APP\n");
}
