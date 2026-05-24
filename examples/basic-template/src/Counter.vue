<script lang="ts">
import { shallowRef, defineComponent } from "vue";
import { Box, Text, useInput } from "@vue-tui/runtime";

export default defineComponent({
  components: { Box, Text },
  setup() {
    const count = shallowRef(0);

    useInput((input) => {
      if (input === "+") count.value++;
      if (input === "-") count.value--;
    });

    return { count };
  },
});
</script>

<template>
  <Box>
    <Text>Count: </Text>
    <Text bold color="green">{{ count }}</Text>
    <Text dimColor> (+/- to change)</Text>
  </Box>
</template>
