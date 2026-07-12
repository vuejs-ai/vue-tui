import { shallowRef, defineComponent } from "vue";
import { Box, Text, useInput } from "@vue-tui/runtime";

export default defineComponent(() => {
  const count = shallowRef(0);

  useInput((event) => {
    if (event.kind !== "text") return "continue";
    if (event.text === "+") {
      count.value++;
      return "consume";
    }
    if (event.text === "-") {
      count.value--;
      return "consume";
    }
    return "continue";
  });

  return () => (
    <Box>
      <Text>Count: </Text>
      <Text bold color="green">
        {count.value}
      </Text>
      <Text dimColor> (+/- to change)</Text>
    </Box>
  );
});
