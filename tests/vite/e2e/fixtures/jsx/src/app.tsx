import { shallowRef, onMounted, onUnmounted, defineComponent } from "vue";
import { Box, Text } from "@vue-tui/runtime";
import { emitTestEvent } from "@vue-tui/runtime/internal/testing";

export default defineComponent(() => {
  emitTestEvent("app:setup-ran");
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
