import process from "node:process";
import { Box, Static, Text, createApp } from "@vue-tui/runtime";
import { defineComponent } from "vue";

const EraseWithStatic = defineComponent(() => {
  return () => (
    <>
      <Static items={["A", "B", "C"]}>
        {{ default: ({ item }: { item: string }) => <Text key={item}>{item}</Text> }}
      </Static>

      <Box flexDirection="column">
        <Text>D</Text>
        <Text>E</Text>
        <Text>F</Text>
      </Box>
    </>
  );
});

process.stdout.rows = Number(process.argv[2]);
const app = createApp(EraseWithStatic);
app.mount();
