import { defineComponent, onMounted } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useStderr } from "@vue-tui/runtime";

test("useStderr.write does not corrupt the deterministic host's active frame", async () => {
  const App = defineComponent(() => {
    const { write } = useStderr();
    onMounted(() => write("err line\n"));
    return () => <Text>UI</Text>;
  });
  const { lastFrame } = await render(App);
  expect(lastFrame()).toContain("UI");
});

test("useStderr returns stderr stream from context", async () => {
  let stderrRef: NodeJS.WriteStream | undefined;
  const App = defineComponent(() => {
    const { stderr } = useStderr();
    stderrRef = stderr;
    return () => <Text>hello</Text>;
  });
  await render(App);
  expect(stderrRef).toBeDefined();
});
