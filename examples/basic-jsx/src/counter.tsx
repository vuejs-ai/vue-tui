import { shallowRef, defineComponent } from "vue";
import { Box, Text, useInput } from "@vue-tui/runtime";

export default defineComponent(() => {
  const count = shallowRef(0);

  useInput((event) => {
    if (event.type === "key") {
      if (event.key.name === "up") {
        count.value++;
      } else if (event.key.name === "down") {
        count.value--;
      }
    }
  });

  return () => (
    <Box>
      <Text>Count: </Text>
      <Text bold color="green">
        {count.value}
      </Text>
      <Text dimColor> (↑/↓ to change)</Text>
    </Box>
  );
});
