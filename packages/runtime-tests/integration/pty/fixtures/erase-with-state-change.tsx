import process from "node:process";
import { Box, Text, createApp } from "@vue-tui/runtime";
import { defineComponent, onMounted, onScopeDispose, shallowRef } from "vue";

const Erase = defineComponent(() => {
  const show = shallowRef(true);

  onMounted(() => {
    const timer = setTimeout(() => {
      show.value = false;
    });

    onScopeDispose(() => {
      clearTimeout(timer);
    });
  });

  return () => (
    <Box flexDirection="column">
      {show.value ? (
        <>
          <Text>A</Text>
          <Text>B</Text>
          <Text>C</Text>
        </>
      ) : null}
    </Box>
  );
});

process.stdout.rows = Number(process.argv[2]);
const app = createApp(Erase);
app.mount();
