// The development connection lives in the process-wide HMR registry.
import { afterEach, expect, test } from "vite-plus/test";
import { defineComponent } from "vue";
import { Text } from "@vue-tui/runtime";
import { connectDevtools, disconnectDevtools } from "@vue-tui/runtime/internal/devtools";
import { render } from "@vue-tui/testing";

afterEach(() => disconnectDevtools());

test("development apps render the user root's props", async () => {
  connectDevtools({ on() {}, send() {} });
  const App = defineComponent({
    props: { greeting: { type: String, required: true } },
    setup(props) {
      return () => <Text>{props.greeting}</Text>;
    },
  });

  const result = await render(App, { props: { greeting: "Hello from root props" } });

  expect(result.lastFrame()).toBe("Hello from root props");
});
