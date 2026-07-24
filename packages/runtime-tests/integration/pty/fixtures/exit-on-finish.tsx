import { createApp, Text } from "@vue-tui/runtime";
import { defineComponent, onMounted, onScopeDispose, shallowRef } from "vue";

const App = defineComponent(() => {
  const counter = shallowRef(0);
  let counterValue = 0;
  let timer: ReturnType<typeof setTimeout> | undefined;

  onMounted(() => {
    const onTimeout = () => {
      if (counterValue > 4) {
        return;
      }

      counterValue += 1;
      counter.value = counterValue;
      timer = setTimeout(onTimeout, 20);
    };

    timer = setTimeout(onTimeout, 20);

    onScopeDispose(() => {
      clearTimeout(timer);
    });
  });

  return () => <Text>Counter: {counter.value}</Text>;
});

const app = createApp(App);
app.mount();
await app.waitUntilExit();
