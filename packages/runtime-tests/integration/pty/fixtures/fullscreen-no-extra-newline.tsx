import process from "node:process";
import { Box, Text, createApp, useAppContext } from "@vue-tui/runtime";
import { defineComponent, h, onMounted, onScopeDispose } from "vue";

const Fullscreen = defineComponent(() => {
  const { exit } = useAppContext();

  onMounted(() => {
    const timer = setTimeout(() => {
      exit();
    }, 100);

    onScopeDispose(() => {
      clearTimeout(timer);
    });
  });

  const rows = Number(process.argv[2]) || 5;

  return () =>
    h(Box, { height: rows, flexDirection: "column" }, () => [
      h(Box, { flexGrow: 1 }, () => h(Text, null, () => "Full-screen: top")),
      h(Text, null, () => "Bottom line (should be usable)"),
    ]);
});

process.stdout.rows = Number(process.argv[2]) || 5;
const app = createApp(Fullscreen);
app.mount();
await app.waitUntilExit();
