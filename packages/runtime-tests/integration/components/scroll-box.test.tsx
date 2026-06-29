import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, ScrollBox, Text, useStdout } from "@vue-tui/runtime";

const WHEEL_UP = "\x1b[<64;1;1M";

function messages(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `message ${index}`);
}

test("ScrollBox follows the bottom while sticky", async () => {
  const items = shallowRef(messages(8));
  const App = defineComponent(() => {
    return () => (
      <Box height={4} width={20}>
        <ScrollBox>
          {items.value.map((item) => (
            <Text key={item}>{item}</Text>
          ))}
        </ScrollBox>
      </Box>
    );
  });

  const { lastFrame, waitUntilRenderFlush } = await render(App, { columns: 40, rows: 8 });
  expect(lastFrame()).toContain("message 7");

  items.value = [...items.value, "streaming latest"];
  await nextTick();
  await waitUntilRenderFlush();

  expect(lastFrame()).toContain("streaming latest");
});

test("ScrollBox keeps the viewport detached after mouse wheel scroll while content grows", async () => {
  const items = shallowRef(messages(12));
  const App = defineComponent(() => {
    return () => (
      <Box height={4} width={20}>
        <ScrollBox>
          {items.value.map((item) => (
            <Text key={item}>{item}</Text>
          ))}
        </ScrollBox>
      </Box>
    );
  });

  const { lastFrame, stdin, waitUntilRenderFlush } = await render(App, { columns: 40, rows: 8 });
  expect(lastFrame()).toContain("message 11");

  await stdin.write(WHEEL_UP);
  await waitUntilRenderFlush();
  const scrolledFrame = lastFrame()!;
  const anchor = scrolledFrame.match(/message \d+/)?.[0];
  expect(anchor).toBeDefined();
  expect(scrolledFrame).not.toContain("message 11");

  items.value = [...items.value, "streaming latest"];
  await nextTick();
  await waitUntilRenderFlush();

  const updatedFrame = lastFrame()!;
  expect(updatedFrame).toContain(anchor);
  expect(updatedFrame).not.toContain("streaming latest");
});

test("ScrollBox enables SGR mouse mode while mounted", async () => {
  const writes: string[] = [];
  const App = defineComponent(() => {
    const { stdout } = useStdout();
    const originalWrite = stdout.write.bind(stdout);
    stdout.write = ((data: string) => {
      writes.push(data);
      return originalWrite(data);
    }) as typeof stdout.write;

    return () => (
      <ScrollBox>
        <Text>content</Text>
      </ScrollBox>
    );
  });

  const { unmount } = await render(App);
  expect(writes).toContain("\x1b[?1000h\x1b[?1006h");

  unmount();
  expect(writes).toContain("\x1b[?1000l\x1b[?1006l");
});
