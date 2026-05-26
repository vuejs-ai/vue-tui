import { defineComponent, onMounted } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useStdout } from "@vue-tui/runtime";

test("useStdout.write does not corrupt active frame in debug mode", async () => {
  const App = defineComponent(() => {
    const { write } = useStdout();
    onMounted(() => write("log line\n"));
    return () => <Text>UI</Text>;
  });
  const { lastFrame } = await render(App);
  expect(lastFrame()).toContain("UI");
});

test("useStdout returns stdout stream from context", async () => {
  let stdoutRef: NodeJS.WriteStream | undefined;
  const App = defineComponent(() => {
    const { stdout } = useStdout();
    stdoutRef = stdout;
    return () => <Text>hello</Text>;
  });
  await render(App);
  expect(stdoutRef).toBeDefined();
});

test("useStdout.write routes through writeToStdout", async () => {
  const writes: string[] = [];
  const App = defineComponent(() => {
    const { write, stdout } = useStdout();
    // Capture all writes to the stdout stream
    const origWrite = stdout.write.bind(stdout);
    stdout.write = ((data: string) => {
      writes.push(data);
      return origWrite(data);
    }) as typeof stdout.write;
    onMounted(() => write("test-data"));
    return () => <Text>frame</Text>;
  });
  const { lastFrame } = await render(App);
  // The write should have gone through, and the frame should still be intact
  expect(lastFrame()).toContain("frame");
  expect(writes.some((w) => w.includes("test-data"))).toBe(true);
});
