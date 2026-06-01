import process from "node:process";
import { Box, Static, Text, createApp } from "@vue-tui/runtime";
import { Fragment, defineComponent, h } from "vue";

const EraseWithStatic = defineComponent(() => {
  return () =>
    h(Fragment, [
      h(
        Static,
        { items: ["A", "B", "C"] },
        { default: ({ item }: { item: string }) => h(Text, { key: item }, () => item) },
      ),
      h(Box, { flexDirection: "column" }, () => [
        h(Text, null, () => "D"),
        h(Text, null, () => "E"),
        h(Text, null, () => "F"),
      ]),
    ]);
});

process.stdout.rows = Number(process.argv[2]);
const app = createApp(EraseWithStatic);
app.mount({ rawMode: "auto" }); // relies on auto-exit (default "always" holds raw & never exits)
