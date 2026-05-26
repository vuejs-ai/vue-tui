import { createApp, Static, Text, useExit } from "@vue-tui/runtime";
import { defineComponent, onMounted } from "vue";

const App = defineComponent(() => {
  const exit = useExit();

  onMounted(() => {
    exit(new Error("errored"));
  });

  return () => (
    <>
      <Static items={["A", "B", "C"]}>
        {{ default: ({ item }: { item: string }) => <Text key={item}>{item}</Text> }}
      </Static>
      <Text>Dynamic</Text>
    </>
  );
});

const app = createApp(App);
app.mount();

try {
  await app.waitUntilExit();
} catch (error: unknown) {
  console.log((error as Error).message);
}
