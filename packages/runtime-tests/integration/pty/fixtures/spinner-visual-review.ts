import process from "node:process";
import { Spinner } from "@vue-tui/components";
import { Box, Text, createApp, useApp, useInput } from "@vue-tui/runtime";
import { defineComponent, h } from "vue";

const frames = ["0", "1", "2", "3"];

const App = defineComponent({
  name: "SpinnerVisualReviewFixture",
  setup() {
    const { exit } = useApp();

    useInput((event) => {
      if (event.kind !== "text" || event.text !== "q") return "continue";
      exit("spinner-visual-review");
      return "consume";
    });

    return () =>
      h(Box, { flexDirection: "column", paddingLeft: 1, paddingRight: 1 }, () => [
        h(Text, { bold: true, color: "cyan" }, () => "Spinner component visual review"),
        h(Spinner, {
          frames,
          interval: 1_500,
          color: "green",
          label: "current glyph (changes every 1.5 seconds)",
        }),
        h(Text, { dimColor: true }, () => "Expected cycle: 0, 1, 2, 3"),
        h(Text, { dimColor: true }, () => "Press q to quit"),
      ]);
  },
});

process.stdout.write("__SPINNER_READY__\n");
const app = createApp(App);
app.mount({ mode: "fullscreen", maxFps: 0 });

void app.waitUntilExit().then(() => {
  process.stdout.write("__SPINNER_EXIT__\n");
});
