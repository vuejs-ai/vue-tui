<script lang="ts">
import { shallowRef, defineComponent } from "vue";
import { Box, Text, useInput } from "@vue-tui/runtime";
import Counter from "./Counter.vue";
import Clock from "./Clock.vue";

export default defineComponent({
  components: { Box, Text, Counter, Clock },
  setup() {
    const showClock = shallowRef(true);

    useInput((input) => {
      if (input === "c") showClock.value = !showClock.value;
      if (input === "q") process.exit(0);
    });

    return { showClock };
  },
});
</script>

<template>
  <Box flexDirection="column" :paddingX="1">
    <Text bold color="cyan">vue-tui basic (template)</Text>
    <Text dimColor>Try editing Counter.vue or App.vue</Text>
    <Text dimColor>Press c=toggle clock, q=quit</Text>
    <Text> </Text>
    <Counter />
    <Clock v-if="showClock" />
  </Box>
</template>
