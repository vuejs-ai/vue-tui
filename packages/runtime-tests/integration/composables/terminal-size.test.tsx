import { defineComponent } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Text, useTerminalSize } from "@vue-tui/runtime";

test("useTerminalSize reacts to resize event", async () => {
  const App = defineComponent(() => {
    const { columns, rows } = useTerminalSize();
    return () => (
      <Text>
        {columns.value}x{rows.value}
      </Text>
    );
  });

  const { lastFrame, terminal } = await render(App, { columns: 80, rows: 24 });
  expect(lastFrame()).toContain("80x24");

  await terminal.resize(120, 40);
  expect(lastFrame()).toContain("120x40");
});
