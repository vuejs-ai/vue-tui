import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text } from "@vue-tui/runtime";

test("nested Text renders inline without independent layout", async () => {
  const { lastFrame } = await render(() => (
    <Text>
      Hello <Text color="red">world</Text>
    </Text>
  ));
  const frame = lastFrame()!;
  expect(frame).toContain("Hello");
  expect(frame).toContain("world");
});

test("CJK wide characters render without corruption", async () => {
  const { lastFrame } = await render(() => <Text>中文测试</Text>, { columns: 20 });
  const frame = lastFrame()!;
  expect(frame).toContain("中文测试");
});
