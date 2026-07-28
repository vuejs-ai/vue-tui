import { createInternalMountOptions } from "../../../../../packages/runtime/dist/internal.mjs";
import stripAnsi from "strip-ansi";
import { defineComponent, nextTick, onScopeDispose, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { Box, Text, createApp } from "@vue-tui/runtime";
import { Static } from "@vue-tui/runtime/inline";
import { makeFakeStdin } from "../../lifecycle/test-streams.ts";
import { acceptanceHosts, countOccurrences, makeOutput } from "./harness.ts";

test.each(acceptanceHosts)(
  "a normally returned backpressured Static write commits once on $name",
  async ({ name, isTTY, options }) => {
    const marker = `STATIC_FALSE_${name.replaceAll(" ", "_")}`;
    const live = shallowRef("live-1");
    const App = defineComponent(() => () => (
      <Box flexDirection="column">
        <Static>
          <Text>{marker}</Text>
        </Static>
        <Text>{live.value}</Text>
      </Box>
    ));
    const stdout = makeOutput({ isTTY });
    const stderr = makeOutput({ isTTY });
    const { stream: stdin } = makeFakeStdin();
    const chunks: string[] = [];
    stdout.on("data", (chunk: Buffer) => chunks.push(chunk.toString()));
    const originalWrite = stdout.write.bind(stdout);
    let attempts = 0;
    stdout.write = ((...args: unknown[]) => {
      const chunk = String(args[0]);
      const result = (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
      if (chunk.includes(marker)) {
        attempts++;
        queueMicrotask(() => stdout.emit("drain"));
        return false;
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
          patchConsole: false,
          maxFps: 0,
          ...options,
        }),
      );
      await app.waitUntilRenderFlush();

      live.value = "live-2";
      await nextTick();
      await app.waitUntilRenderFlush();
      app.unmount();
      await app.waitUntilExit();

      expect(attempts).toBe(1);
      expect(countOccurrences(stripAnsi(chunks.join("")), marker)).toBe(1);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
      stderr.destroy();
    }
  },
);

test("initial illegal Static nesting writes no history and exits with the mount error", async () => {
  const marker = "ILLEGAL_STATIC_MUST_NOT_WRITE";
  const App = defineComponent(() => () => (
    <Static>
      <Box>
        <Static>
          <Text>{marker}</Text>
        </Static>
      </Box>
    </Static>
  ));
  const stdout = makeOutput({ isTTY: true });
  const stderr = makeOutput({ isTTY: true });
  const { stream: stdin } = makeFakeStdin();
  const stdoutChunks: string[] = [];
  stdout.on("data", (chunk: Buffer) => stdoutChunks.push(chunk.toString()));
  const app = createApp(App);
  const exited = app.waitUntilExit();

  try {
    let mountError: unknown;
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
    } catch (error) {
      mountError = error;
    }

    expect(mountError).toMatchObject({
      message: "<Static> cannot be nested inside another <Static>",
    });
    await expect(exited).rejects.toBe(mountError);
    expect(stdoutChunks).toEqual([]);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("accepted-scope cleanup errors settle when an ancestor removes the Static host", async () => {
  const cleanupFailure = new Error("ancestor-removed Static cleanup failed");
  const events: string[] = [];
  const captured: unknown[] = [];
  const visible = shallowRef(true);
  const live = shallowRef("live-1");
  const Leaf = defineComponent(() => {
    onScopeDispose(() => events.push("leaf"));
    return () => <Text>RACE_STATIC</Text>;
  });
  const Item = defineComponent(() => {
    onScopeDispose(() => {
      events.push("parent");
      throw cleanupFailure;
    });
    return () => (
      <Box>
        <Leaf />
      </Box>
    );
  });
  const App = defineComponent(() => () => (
    <Box flexDirection="column">
      {visible.value ? (
        <Box>
          <Static>
            <Item />
          </Static>
        </Box>
      ) : null}
      <Text>{live.value}</Text>
    </Box>
  ));
  const stdout = makeOutput({ isTTY: true });
  const stderr = makeOutput({ isTTY: true });
  const { stream: stdin } = makeFakeStdin();
  let removedFromWrite = false;
  stdout.on("data", (chunk: Buffer) => {
    if (!removedFromWrite && stripAnsi(chunk.toString()).includes("RACE_STATIC")) {
      removedFromWrite = true;
      visible.value = false;
    }
  });
  const app = createApp(App);
  app.config.errorHandler = (error) => captured.push(error);

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
    await nextTick();
    await app.waitUntilRenderFlush();

    expect(removedFromWrite).toBe(true);
    // Runtime no longer forces every Vue scope cleanup to continue after one
    // throws. Parent dispose still runs; leaf may be stranded by ordinary Vue.
    expect(events).toContain("parent");
    expect(captured[0]).toBe(cleanupFailure);

    app.unmount();
    await app.waitUntilExit();
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test("immediate app unmount rejects exit with an accepted-scope cleanup error", async () => {
  const cleanupFailure = new Error("immediate Static teardown cleanup failed");
  const laterCleanupFailure = new Error("later dynamic cleanup failed");
  const events: string[] = [];
  const Item = defineComponent(() => {
    onScopeDispose(() => {
      events.push("static");
      throw cleanupFailure;
    });
    return () => <Text>IMMEDIATE_UNMOUNT_STATIC</Text>;
  });
  const DynamicSibling = defineComponent(() => {
    onScopeDispose(() => {
      events.push("dynamic");
      throw laterCleanupFailure;
    });
    return () => <Text>dynamic</Text>;
  });
  const App = defineComponent(() => () => (
    <Box>
      <Static>
        <Item />
      </Static>
      <DynamicSibling />
    </Box>
  ));
  const stdout = makeOutput({ isTTY: true });
  const stderr = makeOutput({ isTTY: true });
  const { stream: stdin } = makeFakeStdin();
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
    app.unmount();
    // First cleanup failure rejects exit. Runtime does not force remaining Vue
    // cleanups to run after one throws during ordinary unmount.
    await expect(exited).rejects.toBe(cleanupFailure);
    expect(events).toContain("static");
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});
