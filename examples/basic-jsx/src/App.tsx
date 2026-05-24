import { shallowRef, defineComponent } from "vue";
import { Box, Text, useInput } from "@vue-tui/runtime";
import Counter from "./Counter";
import Clock from "./Clock";

export default defineComponent(() => {
  const showClock = shallowRef(true);

  useInput((input) => {
    if (input === "c") showClock.value = !showClock.value;
    if (input === "q") process.exit(0);
  });

  return () => (
    <Box flexDirection="column" paddingX={1}>
      <Text bold color="cyan">
        vue-tui basic (JSX)
      </Text>
      <Text dimColor>Try editing Counter.tsx or App.tsx</Text>
      <Text dimColor>Press c=toggle clock, q=quit</Text>
      <Text> </Text>
      <Counter />
      {showClock.value && <Clock />}
    </Box>
  );
});
