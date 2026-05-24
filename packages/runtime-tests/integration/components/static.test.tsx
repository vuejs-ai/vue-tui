import { defineComponent, nextTick, ref } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, Static } from "@vue-tui/runtime";

test("Static appends new items above the dynamic frame", async () => {
  const items = ref<string[]>([]);

  const App = defineComponent(() => {
    return () => (
      <Box>
        <Static items={items.value}>
          {{
            default: ({ item, index }: { item: string; index: number }) => (
              <Text key={index}>{item}</Text>
            ),
          }}
        </Static>
        <Text>[dynamic]</Text>
      </Box>
    );
  });

  const { lastFrame, frames } = await render(App);
  expect(lastFrame()).toContain("[dynamic]");

  items.value = ["log-1"];
  await nextTick();

  const allOutput = frames.join("");
  expect(allOutput).toContain("log-1");
  expect(lastFrame()).toContain("[dynamic]");
});

test("Static preserves prior items when new ones are added", async () => {
  const logs = ref<string[]>([]);
  const status = ref("idle");

  const App = defineComponent(() => {
    return () => (
      <Box>
        <Static items={logs.value}>
          {{
            default: ({ item, index }: { item: string; index: number }) => (
              <Text key={index}>{item}</Text>
            ),
          }}
        </Static>
        <Text>status: {status.value}</Text>
      </Box>
    );
  });

  const { lastFrame, frames } = await render(App);
  expect(lastFrame()).toContain("status: idle");

  logs.value = [...logs.value, "log A"];
  await nextTick();
  logs.value = [...logs.value, "log B"];
  await nextTick();
  status.value = "running";
  await nextTick();

  const allOutput = frames.join("");
  expect(allOutput).toContain("log A");
  expect(allOutput).toContain("log B");
  expect(lastFrame()).toContain("status: running");
});
