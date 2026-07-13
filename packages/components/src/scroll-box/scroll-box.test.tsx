import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { render } from "@vue-tui/testing";
import { Box, Text, useInput } from "@vue-tui/runtime";
import { ScrollBox, type ScrollBoxExpose } from "../index.ts";

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

  const result = await render(App, { columns: 40, rows: 8 });
  try {
    expect(result.lastFrame()).toContain("message 7");

    items.value = [...items.value, "streaming latest"];
    await nextTick();
    await result.waitUntilRenderFlush();

    expect(result.lastFrame()).toContain("streaming latest");
  } finally {
    result.unmount();
  }
});

test("ScrollBox drives scrolling through the exposed handle", async () => {
  const items = shallowRef(messages(12));
  const box = shallowRef<ScrollBoxExpose>();
  const App = defineComponent(() => {
    // ScrollBox listens to no input itself; the app wires its own keys to the
    // exposed handle. Nothing here is a ScrollBox convention.
    useInput((event) => {
      if (event.kind !== "text") return "continue";
      if (event.text === "u") box.value?.scrollByLines(-4);
      else if (event.text === "g") box.value?.scrollToTop();
      else if (event.text === "G") box.value?.scrollToBottom();
      else return "continue";
      return "consume";
    });
    return () => (
      <Box height={4} width={20}>
        <ScrollBox ref={box}>
          {items.value.map((item) => (
            <Text key={item}>{item}</Text>
          ))}
        </ScrollBox>
      </Box>
    );
  });

  const result = await render(App, { columns: 40, rows: 8 });
  try {
    // Sticky at the bottom: the last message is visible.
    expect(result.lastFrame()).toContain("message 11");

    // scrollByLines(-4) scrolls up off the bottom, so the last message leaves.
    await result.stdin.write("u");
    await result.waitUntilRenderFlush();
    expect(result.lastFrame()).not.toContain("message 11");

    // scrollToTop() jumps to the very top: first message shows, last hidden.
    await result.stdin.write("g");
    await result.waitUntilRenderFlush();
    expect(result.lastFrame()).toContain("message 0");
    expect(result.lastFrame()).not.toContain("message 11");

    // scrollToBottom() jumps back down: the last message shows again.
    await result.stdin.write("G");
    await result.waitUntilRenderFlush();
    expect(result.lastFrame()).toContain("message 11");

    // Out-of-bounds values passed straight to the handle clamp (not throw / overshoot).
    box.value?.scrollToLine(-5);
    await result.waitUntilRenderFlush();
    expect(result.lastFrame()).toContain("message 0");
    box.value?.scrollByLines(9999);
    await result.waitUntilRenderFlush();
    expect(result.lastFrame()).toContain("message 11");

    // scrollByLines() past the bottom also re-armed sticky, so new content is followed.
    items.value = [...items.value, "streaming latest"];
    await nextTick();
    await result.waitUntilRenderFlush();
    expect(result.lastFrame()).toContain("streaming latest");
  } finally {
    result.unmount();
  }
});

test("ScrollBox preserves a non-sticky offset across ancestor hiding", async () => {
  const visible = shallowRef(true);
  const box = shallowRef<ScrollBoxExpose>();
  const App = defineComponent(() => {
    return () => (
      <Box display={visible.value ? "flex" : "none"} height={4} width={20}>
        <ScrollBox ref={box}>
          {messages(12).map((item) => (
            <Text key={item}>{item}</Text>
          ))}
        </ScrollBox>
      </Box>
    );
  });

  const result = await render(App, { columns: 40, rows: 8 });
  try {
    box.value?.scrollToLine(4);
    await result.waitUntilRenderFlush();
    const before = result.lastFrame();
    expect(before).toContain("message 4");
    expect(before).not.toContain("message 0");

    visible.value = false;
    await nextTick();
    await result.waitUntilRenderFlush();
    visible.value = true;
    await nextTick();
    await result.waitUntilRenderFlush();

    expect(result.lastFrame()).toBe(before);
  } finally {
    result.unmount();
  }
});

test("ScrollBox preserves a non-sticky offset across suspension, resize, and continuation", async () => {
  const box = shallowRef<ScrollBoxExpose>();
  const App = defineComponent(() => {
    return () => (
      <Box height={4} width={20}>
        <ScrollBox ref={box}>
          {messages(12).map((item) => (
            <Text key={item}>{item}</Text>
          ))}
        </ScrollBox>
      </Box>
    );
  });

  const result = await render(App, { columns: 40, rows: 8 });
  try {
    box.value?.scrollToLine(4);
    await result.waitUntilRenderFlush();
    const before = result.lastFrame();
    expect(before).toContain("message 4");
    expect(before).not.toContain("message 0");

    await result.terminal.suspend();
    await result.terminal.resize(32, 6);
    await result.terminal.resume();

    expect(result.lastFrame()).toBe(before);
  } finally {
    result.unmount();
  }
});
