import { createApp, Text } from "@vue-tui/runtime";
import { defineComponent, onMounted, onScopeDispose, shallowRef } from "vue";

const App = defineComponent(() => {
  const counter = shallowRef(0);

  onMounted(() => {
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

setTimeout(() => {
  app.unmount();
}, 500);

await app.waitUntilExit();
console.log("exited");
