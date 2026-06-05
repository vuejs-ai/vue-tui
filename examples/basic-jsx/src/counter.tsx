import { shallowRef, defineComponent } from "vue";
import { Box, Text, useInput } from "@vue-tui/runtime";

export default defineComponent(() => {
  const count = shallowRef(0);

  useInput((input) => {
    if (input === "+") count.value++;
    if (input === "-") count.value--;
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
