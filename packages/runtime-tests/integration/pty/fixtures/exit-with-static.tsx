import { createApp, Static, Text, useApp } from "@vue-tui/runtime";
import { defineComponent, h, onMounted } from "vue";

const App = defineComponent(() => {
  const { exit } = useApp();

  onMounted(() => {
    exit(new Error("errored"));
  });

  // Use a function default slot for <Text> (h(Text, props, () => child)) so Vue
  // does not warn "Non-function value encountered for default slot" — those warns
  // would print to stdout and pollute the duplication assertion in exit.test.ts.
  return () => (
    <>
      <Static items={["A", "B", "C"]}>
        {{ default: ({ item }: { item: string }) => h(Text, { key: item }, () => item) }}
      </Static>
      {h(Text, null, () => "Dynamic")}
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
