import process from "node:process";
import { Box, Text, createApp, useExit } from "@vue-tui/runtime";
import { defineComponent, onMounted, onScopeDispose } from "vue";

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

  return () => (
    <Box width={columns} height={rows} flexDirection="column">
      <Box flexGrow={1}>
        <Text>#442 top</Text>
      </Box>
      <Text>#442 bottom</Text>
    </Box>
  );
});

process.stdout.rows = Number(process.argv[2]) || 5;
const app = createApp(App);
app.mount();
await app.waitUntilExit();
