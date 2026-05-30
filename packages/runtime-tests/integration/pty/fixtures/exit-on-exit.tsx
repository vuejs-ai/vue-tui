import { createApp, Text, useAppContext } from "@vue-tui/runtime";
import { defineComponent, onMounted, onScopeDispose, shallowRef } from "vue";

const App = defineComponent(() => {
  const counter = shallowRef(0);
  const { exit } = useAppContext();

  onMounted(() => {
    setTimeout(exit, 500);

    const timer = setInterval(() => {
      counter.value++;
    }, 100);

    onScopeDispose(() => {
      clearInterval(timer);
    });
  });

  return () => <Text>Counter: {counter.value}</Text>;
});

const app = createApp(App);
app.mount();
await app.waitUntilExit();
console.log("exited");
