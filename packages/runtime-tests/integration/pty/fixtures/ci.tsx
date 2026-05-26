import { createApp, Static, Text } from "@vue-tui/runtime";
import { defineComponent, onMounted, onScopeDispose, shallowRef } from "vue";

const App = defineComponent(() => {
  const items = shallowRef<string[]>([]);
  const counter = shallowRef(0);
  let counterValue = 0;

  onMounted(() => {
    let timer: ReturnType<typeof setTimeout>;

    const onTimeout = () => {
      if (counterValue > 4) {
        return;
      }

      counterValue += 1;
      counter.value = counterValue;
      items.value = [...items.value, `#${counterValue}`];
      timer = setTimeout(onTimeout, 20);
    };

    timer = setTimeout(onTimeout, 20);

    onScopeDispose(() => {
      clearTimeout(timer);
    });
  });

  return () => (
    <>
      <Static items={items.value}>
        {{ default: ({ item }: { item: string }) => <Text key={item}>{item}</Text> }}
      </Static>
      <Text>Counter: {counter.value}</Text>
    </>
  );
});

const app = createApp(App);
app.mount();
