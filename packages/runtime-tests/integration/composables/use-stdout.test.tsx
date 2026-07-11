import { defineComponent, onMounted } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useStdout } from "@vue-tui/runtime";

test("useStdout.write does not corrupt the active deterministic frame", async () => {
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
    stdout.write = ((...args: Parameters<typeof stdout.write>) => {
      writes.push(String(args[0]));
      return origWrite(...args);
    }) as typeof stdout.write;
    onMounted(() => write("test-data"));
    return () => <Text>frame</Text>;
  });
  const { lastFrame } = await render(App);
  // The write should have gone through, and the frame should still be intact
  expect(lastFrame()).toContain("frame");
  expect(writes.some((w) => w.includes("test-data"))).toBe(true);
});

test("useStdout.write accepts styled lines while the returned stream remains the raw bypass", async () => {
  const writes: string[] = [];
  const App = defineComponent(() => {
    const { write, stdout } = useStdout();
    const original = stdout.write.bind(stdout);
    stdout.write = ((...args: Parameters<typeof stdout.write>) => {
      writes.push(String(args[0]));
      return original(...args);
    }) as typeof stdout.write;
    onMounted(() => {
      write("SAFE_BEGIN\t\x1b[2J\x1b[3J\x1b[H\x1b[31mred\x1b[0m\x1b]0;Title\x07\nSAFE_END");
      stdout.write("RAW_BEGIN\x1b[3JRAW_END");
    });
    return () => <Text>frame</Text>;
  });

  const result = await render(App);
  const output = writes.join("");

  expect(output).toContain("SAFE_BEGIN\x1b[31mred\x1b[0m\nSAFE_END");
  expect(output).not.toContain("SAFE_BEGIN\t");
  expect(output).not.toContain("SAFE_BEGIN\x1b[2J");
  expect(output).not.toContain("\x1b]0;Title");
  expect(output).toContain("RAW_BEGIN\x1b[3JRAW_END");
  result.dispose();
});
