import { shallowRef, onMounted, onUnmounted, defineComponent } from "vue";
import { Box, Text } from "@vue-tui/runtime";

export default defineComponent(() => {
  const count = shallowRef(0);
  let t: ReturnType<typeof setInterval>;
  onMounted(() => {
    t = setInterval(() => count.value++, 60);
  });
  onUnmounted(() => clearInterval(t));
  return () => (
    <Box borderStyle="round" flexDirection="column">
      <Text bold>JSX-LABEL</Text>
      <Text>count={count.value}</Text>
    </Box>
  );
});
