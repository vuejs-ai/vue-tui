import process from "node:process";
import { Box, Text, createApp, useExit } from "@vue-tui/runtime";
import { defineComponent, h, onMounted, onScopeDispose } from "vue";

const App = defineComponent(() => {
  const exit = useExit();

  onMounted(() => {
    const timer = setTimeout(() => {
      exit();
    }, 100);

    onScopeDispose(() => {
      clearTimeout(timer);
    });
  });

  const rows = Number(process.argv[2]) || 5;
  const columns = process.stdout.columns || 100;

  return () =>
    h(Box, { width: columns, height: rows, flexDirection: "column" }, () => [
      h(Box, { flexGrow: 1 }, () => h(Text, null, () => "#442 top")),
      h(Text, null, () => "#442 bottom"),
    ]);
});

process.stdout.rows = Number(process.argv[2]) || 5;
const app = createApp(App);
app.mount();
await app.waitUntilExit();
