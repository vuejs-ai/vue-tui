<script lang="ts">
import { shallowRef, onMounted, onUnmounted, defineComponent } from "vue";
import { Box, Text } from "@vue-tui/runtime";

export default defineComponent({
  components: { Box, Text },
  setup() {
    const time = shallowRef(new Date().toLocaleTimeString());
    let timer: ReturnType<typeof setInterval>;

    onMounted(() => {
      timer = setInterval(() => {
        time.value = new Date().toLocaleTimeString();
      }, 1000);
    });

    onUnmounted(() => {
      clearInterval(timer);
    });

    return { time };
  },
});
</script>

<template>
  <Box>
    <Text>Clock: </Text>
    <Text bold color="yellow">{{ time }}</Text>
  </Box>
</template>
