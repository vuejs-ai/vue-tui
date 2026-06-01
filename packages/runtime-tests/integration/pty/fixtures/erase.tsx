import process from "node:process";
import { Box, Text, createApp } from "@vue-tui/runtime";
import { defineComponent, h } from "vue";

const Erase = defineComponent(() => {
  return () =>
    h(Box, { flexDirection: "column" }, () => [
      h(Text, null, () => "A"),
      h(Text, null, () => "B"),
      h(Text, null, () => "C"),
    ]);
});

process.stdout.rows = Number(process.argv[2]);
const app = createApp(Erase);
app.mount({ rawMode: "auto" }); // relies on auto-exit (default "always" holds raw & never exits)
