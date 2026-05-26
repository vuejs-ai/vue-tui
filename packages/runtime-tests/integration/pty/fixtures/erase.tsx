import process from "node:process";
import { Box, Text, createApp } from "@vue-tui/runtime";
import { defineComponent } from "vue";

const Erase = defineComponent(() => {
  return () => (
    <Box flexDirection="column">
      <Text>A</Text>
      <Text>B</Text>
      <Text>C</Text>
    </Box>
  );
});

process.stdout.rows = Number(process.argv[2]);
const app = createApp(Erase);
app.mount();
