import { shallowRef, defineComponent } from "vue";
import { Box, Text, useInput } from "@vue-tui/runtime";
import Counter from "./counter";
import Clock from "./clock";

export default defineComponent(() => {
  const showClock = shallowRef(true);

  useInput((event) => {
    if (event.kind !== "text") return "continue";
    if (event.text === "c") {
      showClock.value = !showClock.value;
      return "consume";
    }
    if (event.text === "q") {
      process.exit(0);
      return "consume";
    }
    return "continue";
  });

  return () => (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        vue-tui basic (JSX)
      </Text>
      <Text dimColor>Try editing counter.tsx or app.tsx</Text>
      <Text dimColor>Press c=toggle clock, q=quit</Text>
      <Text> </Text>
      <Counter />
      {showClock.value && <Clock />}
    </Box>
  );
});
