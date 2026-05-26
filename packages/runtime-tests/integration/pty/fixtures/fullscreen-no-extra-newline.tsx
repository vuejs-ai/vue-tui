import process from "node:process";
import { Box, Text, createApp, useExit } from "@vue-tui/runtime";
import { defineComponent, onMounted, onScopeDispose } from "vue";

const Fullscreen = defineComponent(() => {
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

  return () => (
    <Box height={rows} flexDirection="column">
      <Box flexGrow={1}>
        <Text>Full-screen: top</Text>
      </Box>
      <Text>Bottom line (should be usable)</Text>
    </Box>
  );
});

process.stdout.rows = Number(process.argv[2]) || 5;
const app = createApp(Fullscreen);
app.mount();
await app.waitUntilExit();
