import { createInternalMountOptions } from "../../../../../packages/runtime/dist/internal.mjs";
import { useStdout } from "../../../../../packages/runtime/dist/internal.mjs";
import stripAnsi from "strip-ansi";
import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, Text, createApp } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { render } from "@vue-tui/testing";
import { makeFakeStdin } from "../../lifecycle/test-streams.ts";
import { countOccurrences, makeOutput, staticTranscript } from "./harness.ts";

test("resize never replays accepted Static output and new items use the new width", async () => {
  const items = shallowRef([{ id: 1, text: "AAAAAAAA" }]);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      {items.value.map((item) => (
        <Static key={item.id}>
          <Text>{item.text}</Text>
        </Static>
      ))}
      <Text>live</Text>
    </Box>
  ));
  const result = await render(App, { columns: 8, rows: 6 });

  try {
    await result.waitUntilRenderFlush();
    expect(staticTranscript(result.frames)).toBe("AAAAAAAA\n");

    await result.terminal.resize(4, 6);
    items.value = [...items.value, { id: 2, text: "BBBBBBBB" }];
    await nextTick();
    await result.waitUntilRenderFlush();

    expect(staticTranscript(result.frames)).toBe("AAAAAAAA\nBBBB\nBBBB\n");
  } finally {
    result.dispose();
  }
});

test("Static append waits while suspended and commits once after continuation", async () => {
  const items = shallowRef([{ id: 1, text: "STATIC_BEFORE_SUSPEND" }]);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      {items.value.map((item) => (
        <Static key={item.id}>
          <Text>{item.text}</Text>
        </Static>
      ))}
      <Text>live</Text>
    </Box>
  ));
  const result = await render(App, { columns: 40, rows: 8 });

  try {
    await result.waitUntilRenderFlush();
    await result.terminal.suspend();
    const suspendedOffset = result.frames.length;

    items.value = [...items.value, { id: 2, text: "STATIC_DURING_SUSPEND" }];
    await nextTick();
    expect(staticTranscript(result.frames.slice(suspendedOffset))).not.toContain(
      "STATIC_DURING_SUSPEND",
    );

    await result.terminal.resume();
    await result.waitUntilRenderFlush();
    const transcript = staticTranscript(result.frames);
    expect(countOccurrences(transcript, "STATIC_BEFORE_SUSPEND")).toBe(1);
    expect(countOccurrences(transcript, "STATIC_DURING_SUSPEND")).toBe(1);
  } finally {
    result.dispose();
  }
});

test("coordinated external output stays ordered between exact Static commits", async () => {
  const first = "STATIC_BEFORE_SIDE_OUTPUT";
  const side = "COORDINATED_SIDE_OUTPUT";
  const second = "STATIC_AFTER_SIDE_OUTPUT";
  const items = shallowRef<Array<{ id: number; text: string }>>([]);
  let write: ((data: string) => void) | undefined;
  const App = defineComponent(() => {
    write = useStdout().write;
    return () => (
      <Box flexDirection="column">
        {items.value.map((item) => (
          <Static key={item.id}>
            <Text>{item.text}</Text>
          </Static>
        ))}
        <Text>live</Text>
      </Box>
    );
  });
  const stdout = makeOutput({ isTTY: true });
  const stderr = makeOutput({ isTTY: true });
  const { stream: stdin } = makeFakeStdin();
  const chunks: string[] = [];
  stdout.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  const app = createApp(App);

  try {
    app.mount(
      createInternalMountOptions({
        stdout,
        stderr,
        stdin,
        mode: "inline",
        patchConsole: false,
        maxFps: 0,
      }),
    );
    await app.waitUntilRenderFlush();

    items.value = [{ id: 1, text: first }];
    await nextTick();
    await app.waitUntilRenderFlush();
    write?.(`${side}\n`);
    items.value = [...items.value, { id: 2, text: second }];
    await nextTick();
    await app.waitUntilRenderFlush();

    const output = stripAnsi(chunks.join(""));
    expect(countOccurrences(output, first)).toBe(1);
    expect(countOccurrences(output, side)).toBe(1);
    expect(countOccurrences(output, second)).toBe(1);
    expect(output.indexOf(first)).toBeLessThan(output.indexOf(side));
    expect(output.indexOf(side)).toBeLessThan(output.indexOf(second));
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("ordinary teardown commits one pending throttled Static append", async () => {
  const marker = "STATIC_PENDING_AT_TEARDOWN";
  const showStatic = shallowRef(false);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      {showStatic.value ? (
        <Static>
          <Text>{marker}</Text>
        </Static>
      ) : null}
      <Text>live</Text>
    </Box>
  ));
  const stdout = makeOutput({ isTTY: true });
  const stderr = makeOutput({ isTTY: true });
  const { stream: stdin } = makeFakeStdin();
  const chunks: string[] = [];
  stdout.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  const app = createApp(App);

  try {
    app.mount(
      createInternalMountOptions({
        stdout,
        stderr,
        stdin,
        mode: "inline",
        patchConsole: false,
        maxFps: 1,
      }),
    );
    await app.waitUntilRenderFlush();

    showStatic.value = true;
    await nextTick();
    app.unmount();
    await app.waitUntilExit();

    expect(countOccurrences(stripAnsi(chunks.join("")), marker)).toBe(1);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});
