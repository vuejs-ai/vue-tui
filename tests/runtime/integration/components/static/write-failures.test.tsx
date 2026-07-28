import { createInternalMountOptions } from "../../../../../packages/runtime/dist/internal.mjs";
import stripAnsi from "strip-ansi";
import { defineComponent, nextTick, ref, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, Text, createApp } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { makeFakeStdin } from "../../lifecycle/test-streams.ts";
import { countOccurrences, makeOutput } from "./harness.ts";

test("a synchronous append during the Static write remains pending for the next commit", async () => {
  const first = "STATIC_REENTRANT_FIRST";
  const second = "STATIC_REENTRANT_SECOND";
  const items = ref([{ id: 1, text: first }]);
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
  const stdout = makeOutput({ isTTY: true });
  const stderr = makeOutput({ isTTY: true });
  const { stream: stdin } = makeFakeStdin();
  const chunks: string[] = [];
  stdout.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  const originalWrite = stdout.write.bind(stdout);
  let appended = false;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    const result = (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
    if (!appended && chunk.includes(first)) {
      appended = true;
      items.value.push({ id: 2, text: second });
    }
    return result;
  }) as NodeJS.WriteStream["write"];
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
    await nextTick();
    await app.waitUntilRenderFlush();
    app.unmount();
    await app.waitUntilExit();

    const output = stripAnsi(chunks.join(""));
    expect(appended).toBe(true);
    expect(countOccurrences(output, first)).toBe(1);
    expect(countOccurrences(output, second)).toBe(1);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("a throwing Static write abandons the instance before a synchronous slot replacement", async () => {
  const first = "STATIC_REENTRANT_WRITTEN";
  const replacement = "STATIC_REENTRANT_REPLACEMENT_MUST_NOT_RENDER";
  const text = ref(first);
  const showStatic = shallowRef(false);
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      {showStatic.value ? (
        <Static>
          <Text>{text.value}</Text>
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
  const originalWrite = stdout.write.bind(stdout);
  const injected = new Error("injected reentrant Static write failure");
  let replaced = false;
  let firstAttempts = 0;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    const result = (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
    if (chunk.includes(first)) {
      firstAttempts++;
      if (!replaced) {
        replaced = true;
        text.value = replacement;
      }
      throw injected;
    }
    return result;
  }) as NodeJS.WriteStream["write"];
  const app = createApp(App);
  const exited = app.waitUntilExit();

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
    showStatic.value = true;
    stdout.columns = 79;
    stdout.emit("resize");

    await expect(exited).rejects.toBe(injected);
    const output = stripAnsi(chunks.join(""));
    expect(replaced).toBe(true);
    expect(firstAttempts).toBe(1);
    expect(countOccurrences(output, first)).toBe(1);
    expect(output).not.toContain(replacement);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("accepted Static output is not replayed when the later dynamic write throws", async () => {
  const staticMarker = "STATIC_BEFORE_DYNAMIC_FAILURE";
  const dynamicMarker = "DYNAMIC_WRITE_FAILURE";
  const showStatic = shallowRef(false);
  const live = shallowRef("ready");
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      {showStatic.value ? (
        <Static>
          <Text>{staticMarker}</Text>
        </Static>
      ) : null}
      <Text>{live.value}</Text>
    </Box>
  ));
  const stdout = makeOutput({ isTTY: true });
  const stderr = makeOutput({ isTTY: true });
  const { stream: stdin } = makeFakeStdin();
  const chunks: string[] = [];
  stdout.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
  const originalWrite = stdout.write.bind(stdout);
  const injected = new Error("injected dynamic write failure");
  let staticAttempts = 0;
  let failDynamic = false;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    if (chunk.includes(staticMarker)) staticAttempts++;
    if (failDynamic && chunk.includes(dynamicMarker)) {
      failDynamic = false;
      throw injected;
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];
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
    const exited = app.waitUntilExit();

    failDynamic = true;
    showStatic.value = true;
    live.value = dynamicMarker;
    // Let the resize transaction own the pending Vue update. Its explicit
    // failure path turns the injected writer error into application teardown,
    // which then proves the accepted Static batch is not replayed.
    stdout.columns = 79;
    stdout.emit("resize");

    await expect(exited).rejects.toBe(injected);
    expect(staticAttempts).toBe(1);
    expect(countOccurrences(stripAnsi(chunks.join("")), staticMarker)).toBe(1);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("a throwing Static write is indeterminate and is not retried during teardown", async () => {
  const marker = "STATIC_THROW_NO_RETRY";
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
  const originalWrite = stdout.write.bind(stdout);
  const injected = new Error("injected Static write failure");
  let attempts = 0;
  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    if (chunk.includes(marker)) {
      attempts++;
      if (attempts === 1) throw injected;
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];
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
    const exited = app.waitUntilExit();

    showStatic.value = true;
    stdout.columns = 79;
    stdout.emit("resize");

    await expect(exited).rejects.toBe(injected);
    expect(attempts).toBe(1);
    expect(stripAnsi(chunks.join(""))).not.toContain(marker);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});
