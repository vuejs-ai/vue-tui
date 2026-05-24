import { defineComponent } from "vue";
import { Box, Text } from "@vue-tui/runtime";

export default defineComponent(() => {
  return () => (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        coding-agent
      </Text>
      <Text dimColor>scaffold works</Text>
    </Box>
  );
});
