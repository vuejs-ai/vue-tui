import process from "node:process";
import { Box, Text, createApp } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { Fragment, defineComponent, h } from "vue";

const EraseWithStatic = defineComponent(() => {
  return () =>
    h(Fragment, [
      ...["A", "B", "C"].map((item) => h(Static, { key: item }, () => h(Text, null, () => item))),
      h(Box, { flexDirection: "column" }, () => [
        h(Text, null, () => "D"),
        h(Text, null, () => "E"),
        h(Text, null, () => "F"),
      ]),
    ]);
});

process.stdout.rows = Number(process.argv[2]);
const app = createApp(EraseWithStatic);
app.mount();
