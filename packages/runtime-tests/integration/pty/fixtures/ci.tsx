import { createApp, Text } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
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
      {items.value.map((item) => (
        <Static key={item}>
          <Text>{item}</Text>
        </Static>
      ))}
      <Text>Counter: {counter.value}</Text>
    </>
  );
});

const app = createApp(App);
app.mount();
