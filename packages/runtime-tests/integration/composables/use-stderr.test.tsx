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

test("useStderr.write strips geometry controls but preserves styled lines", async () => {
  const writes: string[] = [];
  const App = defineComponent(() => {
    const { write, stderr } = useStderr();
    const original = stderr.write.bind(stderr);
    stderr.write = ((...args: Parameters<typeof stderr.write>) => {
      writes.push(String(args[0]));
      return original(...args);
    }) as typeof stderr.write;
    onMounted(() => write("SAFE\r\x1b[2J\x1b[31mred\x1b[0m\n"));
    return () => <Text>frame</Text>;
  });

  const result = await render(App);
  const output = writes.join("");

  expect(output).toContain("SAFE\x1b[31mred\x1b[0m\n");
  expect(output).not.toContain("\r");
  expect(output).not.toContain("\x1b[2J");
  result.dispose();
});
