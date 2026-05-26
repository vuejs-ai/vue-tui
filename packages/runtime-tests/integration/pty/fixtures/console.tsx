import { createApp, Text } from "@vue-tui/runtime";
import { defineComponent, h, onMounted, onScopeDispose } from "vue";

const App = defineComponent(() => {
  onMounted(() => {
    const timer = setTimeout(() => {}, 1000);

    onScopeDispose(() => {
      clearTimeout(timer);
    });
  });

  return () => h(Text, null, { default: () => "Hello World" });
});

const app = createApp(App);
app.mount();
console.log("First log");
app.unmount();
console.log("Second log");
