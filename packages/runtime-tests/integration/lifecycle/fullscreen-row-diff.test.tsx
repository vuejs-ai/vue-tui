import ansiEscapes from "ansi-escapes";
import { defineComponent, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, Text } from "@vue-tui/runtime";
import { mountCapacityHost } from "../../capacity/host.ts";

test("Fullscreen rewrites changed rows absolutely and resets after resize", async () => {
  const middle = shallowRef("middle");
  const bottom = shallowRef("bottom");
  const App = defineComponent(() => () => (
    <Box width={10} height={3} flexDirection="column">
      <Text>top</Text>
      <Text>{middle.value}</Text>
      <Text>{bottom.value}</Text>
    </Box>
  ));
  const host = await mountCapacityHost(App, {
    columns: 10,
    rows: 3,
    mode: "fullscreen",
    trackLifetime: false,
    maxFps: 0,
  });

  try {
    await host.flush("middle");
    expect(host.writes.stdout.join("")).toContain(ansiEscapes.clearViewport);

    let offset = host.writes.stdout.length;
    middle.value = "mid";
    await host.flush("mid");
    const rowUpdate = host.writes.stdout.slice(offset).join("");
    expect(rowUpdate).not.toContain(ansiEscapes.clearViewport);
    expect(rowUpdate).toContain(ansiEscapes.cursorTo(0, 1));
    expect(rowUpdate).not.toContain(ansiEscapes.cursorTo(0, 0));
    expect(rowUpdate).toContain("\x1b[0mmid\x1b[0m" + ansiEscapes.eraseEndLine);
    expect(rowUpdate).toContain(ansiEscapes.cursorTo(0, 2));

    offset = host.writes.stdout.length;
    bottom.value = "1234567890";
    await host.flush("1234567890");
    const exactWidthUpdate = host.writes.stdout.slice(offset).join("");
    expect(exactWidthUpdate).not.toContain(ansiEscapes.clearViewport);
    expect(exactWidthUpdate).toContain(ansiEscapes.cursorTo(0, 2));
    const exactWidthScreen = await host.screen();
    expect(exactWidthScreen.text).toContain("top       \nmid       \n1234567890");

    offset = host.writes.stdout.length;
    await host.resize(12, 4);
    expect(host.writes.stdout.slice(offset).join("")).toContain(ansiEscapes.clearViewport);
  } finally {
    await host.dispose();
  }
});
