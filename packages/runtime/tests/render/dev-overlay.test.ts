import { afterEach, test, expect, vi } from "vite-plus/test";
import { PassThrough } from "node:stream";
import { connectDevtools, devState, disconnectDevtools } from "../../src/dev/hmr.ts";
import { createApp } from "../../src/render.ts";
import { createInternalMountOptions } from "../../src/render.ts";
import { INTERNAL_RENDER_OBSERVER } from "../../src/api/render-observer.ts";
import { Box, Text } from "../../src/api/index.ts";
import {
  defineComponent,
  h,
  nextTick,
  onErrorCaptured,
  onMounted,
  onUnmounted,
  shallowRef,
} from "vue";

afterEach(async () => {
  await disconnectDevtools();
});

interface DevStreams {
  readonly stdout: NodeJS.WriteStream;
  readonly stderr: NodeJS.WriteStream;
  readonly stdin: NodeJS.ReadStream;
}

/** A TTY stdout with a non-TTY stderr — the surface every test in this file mounts on. */
function devStreams(columns = 80, rows = 24): DevStreams {
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  const stdin = new PassThrough() as unknown as NodeJS.ReadStream;
  Object.assign(stdout, { isTTY: true, columns, rows });
  Object.assign(stderr, { isTTY: false });
  return { stdout, stderr, stdin };
}

test("dev overlay preserves the user root and full reload abandons stream observers", async () => {
  const out: string[] = [];
  // Four user rows plus the five-row error panel exceed this viewport by one,
  // so retaining row 3 proves Inline did not shrink the user frame.
  const { stdout, stderr, stdin } = devStreams(80, 8);
  stdout.on("data", (chunk) => out.push(String(chunk)));
  const handlers = new Map<string, (payload: unknown) => void>();
  const sends: string[] = [];
  connectDevtools({
    on(event, callback) {
      handlers.set(event, callback);
    },
    send(event) {
      sends.push(event);
    },
  });
  const listenerBaseline = {
    stdoutError: stdout.listenerCount("error"),
    stdoutClose: stdout.listenerCount("close"),
    stderrError: stderr.listenerCount("error"),
    stdinError: stdin.listenerCount("error"),
    stdinClose: stdin.listenerCount("close"),
  };
  const frames: string[] = [];
  let setups = 0;
  let mounts = 0;
  let unmounts = 0;
  const Root = defineComponent({
    setup(_props, { expose }) {
      setups += 1;
      onMounted(() => {
        mounts += 1;
      });
      onUnmounted(() => {
        unmounts += 1;
      });
      expose({ ping: () => "pong" });
      return () =>
        h(Box, { height: 4, flexDirection: "column" }, () =>
          Array.from({ length: 4 }, (_, index) => h(Text, null, () => `INLINE-USER-ROW-${index}`)),
        );
    },
  });
  const app = createApp(Root);
  const instance = app.mount(
    createInternalMountOptions({
      stdin,
      stdout,
      stderr,
      patchConsole: false,
      maxFps: 0,
      [INTERNAL_RENDER_OBSERVER]: {
        onCommit(frame) {
          if (frame.phase === "update") frames.push(frame.dynamic);
        },
      },
    }),
  ) as unknown as { ping(): string };
  expect(instance.ping()).toBe("pong");
  expect({ setups, mounts, unmounts }).toEqual({ setups: 1, mounts: 1, unmounts: 0 });

  devState.value = { type: "error", error: { message: "BUILD-FAIL-XYZ" } };
  await nextTick();
  await app.waitUntilRenderFlush();
  expect(out.join("")).toContain("BUILD-FAIL-XYZ"); // overlay rendered the error
  const inlineErrorFrame = frames.at(-1)!;
  expect(inlineErrorFrame).toContain("INLINE-USER-ROW-0");
  expect(inlineErrorFrame).toContain("INLINE-USER-ROW-3");
  expect(inlineErrorFrame.indexOf("INLINE-USER-ROW-3")).toBeLessThan(
    inlineErrorFrame.indexOf("Build Error"),
  );
  expect(inlineErrorFrame).toContain("BUILD-FAIL-XYZ");
  expect(instance.ping()).toBe("pong");
  expect({ setups, mounts, unmounts }).toEqual({ setups: 1, mounts: 1, unmounts: 0 });

  devState.value = { type: "ok" };
  await nextTick();
  await app.waitUntilRenderFlush();
  expect(frames.at(-1)).toContain("INLINE-USER-ROW-0");
  expect(frames.at(-1)).toContain("INLINE-USER-ROW-3");
  expect(frames.at(-1)).not.toContain("BUILD-FAIL-XYZ");
  expect({ setups, mounts, unmounts }).toEqual({ setups: 1, mounts: 1, unmounts: 0 });

  let exitSettled = false;
  void app.waitUntilExit().then(
    () => {
      exitSettled = true;
    },
    () => {
      exitSettled = true;
    },
  );
  handlers.get("vite:beforeFullReload")?.(undefined);
  for (let attempt = 0; attempt < 20; attempt++) {
    if (
      stdout.listenerCount("error") === listenerBaseline.stdoutError &&
      stdin.listenerCount("error") === listenerBaseline.stdinError
    ) {
      break;
    }
    await new Promise<void>((resolve) => setImmediate(resolve));
  }

  expect(sends).not.toContain("vue-tui:request-reload");
  expect(exitSettled).toBe(false);
  expect(stdout.listenerCount("error")).toBe(listenerBaseline.stdoutError);
  expect(stdout.listenerCount("close")).toBe(listenerBaseline.stdoutClose);
  expect(stderr.listenerCount("error")).toBe(listenerBaseline.stderrError);
  expect(stdin.listenerCount("error")).toBe(listenerBaseline.stdinError);
  expect(stdin.listenerCount("close")).toBe(listenerBaseline.stdinClose);
  expect({ setups, mounts, unmounts }).toEqual({ setups: 1, mounts: 1, unmounts: 1 });
  stdout.destroy();
  stderr.destroy();
  stdin.destroy();
});

test("dev render errors are held by the overlay and recover without recreating the root", async () => {
  const { stdout, stderr, stdin } = devStreams();
  connectDevtools({ on: () => {}, send: () => {} });

  const frames: string[] = [];
  const trigger = shallowRef(false);
  const renderError = new Error("RENDER-FAIL-XYZ");
  let setups = 0;
  let mounts = 0;
  let unmounts = 0;
  const Root = defineComponent(() => {
    setups += 1;
    onMounted(() => {
      mounts += 1;
    });
    onUnmounted(() => {
      unmounts += 1;
    });
    return () => {
      if (trigger.value) throw renderError;
      return h(Text, null, () => "USER-ROOT-LIVE");
    };
  });
  const app = createApp(Root);
  const errorHandler = vi.fn();
  app.config.errorHandler = errorHandler;

  app.mount(
    createInternalMountOptions({
      stdin,
      stdout,
      stderr,
      patchConsole: false,
      maxFps: 0,
      [INTERNAL_RENDER_OBSERVER]: {
        onCommit(frame) {
          if (frame.phase === "update") frames.push(frame.dynamic);
        },
      },
    }),
  );

  try {
    trigger.value = true;
    await expect(nextTick()).resolves.toBeUndefined();
    await app.waitUntilRenderFlush();

    expect(errorHandler).not.toHaveBeenCalled();
    expect(devState.value).toMatchObject({
      type: "error",
      error: { message: "RENDER-FAIL-XYZ", phase: "render" },
    });
    expect(frames.at(-1)).toContain("Render Error");
    expect(frames.at(-1)).toContain("RENDER-FAIL-XYZ");
    expect(frames.at(-1)).toContain("held up by the dev overlay");
    expect({ setups, mounts, unmounts }).toEqual({ setups: 1, mounts: 1, unmounts: 0 });

    trigger.value = false;
    devState.value = { type: "ok" };
    await nextTick();
    await app.waitUntilRenderFlush();
    expect(frames.at(-1)).toContain("USER-ROOT-LIVE");
    expect({ setups, mounts, unmounts }).toEqual({ setups: 1, mounts: 1, unmounts: 0 });
  } finally {
    app.unmount();
    await app.waitUntilExit();
    stdout.destroy();
    stderr.destroy();
    stdin.destroy();
  }
});

test("a closer user error boundary handles a render error before the dev overlay", async () => {
  const { stdout, stderr, stdin } = devStreams();
  connectDevtools({ on: () => {}, send: () => {} });

  const trigger = shallowRef(false);
  const renderError = new Error("USER-HANDLED-RENDER-FAIL");
  const captured: unknown[] = [];
  const Child = defineComponent(() => () => {
    if (trigger.value) throw renderError;
    return h(Text, null, () => "ready");
  });
  const Root = defineComponent(() => {
    onErrorCaptured((error) => {
      captured.push(error);
      return false;
    });
    return () => h(Child);
  });
  const app = createApp(Root);
  const errorHandler = vi.fn();
  app.config.errorHandler = errorHandler;
  app.mount(
    createInternalMountOptions({
      stdin,
      stdout,
      stderr,
      patchConsole: false,
      maxFps: 0,
    }),
  );

  try {
    trigger.value = true;
    await expect(nextTick()).resolves.toBeUndefined();
    expect(captured).toEqual([renderError]);
    expect(errorHandler).not.toHaveBeenCalled();
    expect(devState.value).toEqual({ type: "ok" });
  } finally {
    app.unmount();
    await app.waitUntilExit();
    stdout.destroy();
    stderr.destroy();
    stdin.destroy();
  }
});

test("fullscreen presents the dev error at the top as an absolute sibling", async () => {
  const { stdout, stderr, stdin } = devStreams();
  connectDevtools({ on: () => {}, send: () => {} });

  const frames: string[] = [];
  let unmounts = 0;
  const Root = defineComponent(() => {
    onUnmounted(() => {
      unmounts += 1;
    });
    return () =>
      h(Box, { flexDirection: "column" }, () => [
        h(Text, null, () => " ROW-BEHIND-BORDER"),
        h(Text, null, () => " LAYER-BEHIND-TITLE"),
        h(Text, null, () => " MESSAGE-BEHIND-ERROR"),
        h(Text, null, () => " HELD-TEXT-BEHIND-ERROR"),
        h(Text, null, () => " LOWER-USER-ROOT"),
      ]);
  });
  const app = createApp(Root);
  app.mount(
    createInternalMountOptions({
      mode: "fullscreen",
      stdin,
      stdout,
      stderr,
      patchConsole: false,
      maxFps: 0,
      [INTERNAL_RENDER_OBSERVER]: {
        onCommit(frame) {
          if (frame.phase === "update") frames.push(frame.dynamic);
        },
      },
    }),
  );

  try {
    devState.value = { type: "error", error: { message: "FULLSCREEN-BUILD-FAIL" } };
    await nextTick();
    await app.waitUntilRenderFlush();

    const errorFrame = frames.at(-1)!;
    // Position is a visible-cell claim; forced test colors may prefix the box
    // drawing character with SGR without changing its screen column.
    const errorLines = errorFrame.replaceAll(/\x1b\[[0-9;]*m/g, "").split("\n");
    expect(errorLines[0]).toMatch(/^┌/);
    expect(errorLines[1]).toMatch(/^│ Build Error/);
    expect(errorLines[2]).toMatch(/^│ FULLSCREEN-BUILD-FAIL/);
    expect(errorFrame).toContain("Build Error");
    expect(errorFrame).toContain("FULLSCREEN-BUILD-FAIL");
    expect(errorLines.slice(0, 5).join("\n")).not.toContain("BEHIND");
    expect(unmounts).toBe(0);
  } finally {
    app.unmount();
    await app.waitUntilExit();
    stdout.destroy();
    stderr.destroy();
    stdin.destroy();
  }
});

test("fullscreen draws the update status over the viewport instead of displacing it", async () => {
  const { stdout, stderr, stdin } = devStreams(40, 6);
  const handlers = new Map<string, (payload: unknown) => void>();
  connectDevtools({
    on(event, callback) {
      handlers.set(event, callback);
    },
    send() {},
  });

  const frames: string[] = [];
  // A flexible spacer with a bottom anchor is what makes displacement visible:
  // a fixed-height tree just overflows instead of relayouting.
  const Root = defineComponent(
    () => () =>
      h(Box, { flexGrow: 1, flexDirection: "column" }, () => [
        h(Text, null, () => "USER-TOP"),
        h(Box, { flexGrow: 1 }, () => []),
        h(Text, null, () => "BOTTOM-ANCHOR"),
      ]),
  );
  const app = createApp(Root);
  app.mount(
    createInternalMountOptions({
      mode: "fullscreen",
      stdin,
      stdout,
      stderr,
      patchConsole: false,
      maxFps: 0,
      [INTERNAL_RENDER_OBSERVER]: {
        onCommit(frame) {
          if (frame.phase === "update") frames.push(frame.dynamic);
        },
      },
    }),
  );

  try {
    await app.waitUntilRenderFlush();
    const steadyRows = (frames.at(-1) ?? "").split("\n");

    handlers.get("vite:beforeUpdate")?.({
      updates: [{ path: "/src/app.vue", timestamp: 10 }],
    });
    handlers.get("vite:afterUpdate")?.(undefined);
    await nextTick();
    await app.waitUntilRenderFlush();

    // The status line draws OVER the viewport, like the error panel. As a flow
    // sibling it took a row for the two seconds it was visible and gave it back,
    // relayouting the whole tree twice on every successful edit.
    const updated = frames.at(-1)!;
    expect(updated).toContain("[HMR] updated: /src/app.vue");
    // The tree must not relayout. As a flow sibling the status line took a row
    // from the growing spacer, moving the anchor UP for the two seconds it was
    // visible and back down afterwards — twice per successful edit, and visible
    // to anything measuring itself. Drawn absolutely it may cover the anchor's
    // row, but it may never move it.
    const rows = updated.split("\n");
    const steadyAnchor = steadyRows.findIndex((row) => row.includes("BOTTOM-ANCHOR"));
    const updatedAnchor = rows.findIndex((row) => row.includes("BOTTOM-ANCHOR"));
    expect(steadyAnchor).toBeGreaterThan(0);
    expect([steadyAnchor, -1]).toContain(updatedAnchor);
  } finally {
    app.unmount();
    await app.waitUntilExit();
    stdout.destroy();
    stderr.destroy();
    stdin.destroy();
  }
});

test("full reload synchronously abandons backpressure before the replacement mount", async () => {
  const { stdout, stderr, stdin } = devStreams();
  const handlers = new Map<string, (payload: unknown) => void>();
  connectDevtools({
    on(event, callback) {
      handlers.set(event, callback);
    },
    send() {},
  });
  const listenerBaseline = {
    stdoutError: stdout.listenerCount("error"),
    stdoutClose: stdout.listenerCount("close"),
    stdinError: stdin.listenerCount("error"),
    stdinClose: stdin.listenerCount("close"),
  };
  const originalWrite = stdout.write.bind(stdout);
  let forceBackpressure = true;
  stdout.write = ((...args: unknown[]) => {
    const result = (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
    return forceBackpressure ? false : result;
  }) as NodeJS.WriteStream["write"];
  const Root = defineComponent(() => () => h(Text, null, () => "blocked"));
  const app = createApp(Root);

  app.mount(
    createInternalMountOptions({
      stdin,
      stdout,
      stderr,
      patchConsole: false,
      maxFps: 0,
    }),
  );
  let exitSettled = false;
  void app.waitUntilExit().then(
    () => {
      exitSettled = true;
    },
    () => {
      exitSettled = true;
    },
  );

  handlers.get("vite:beforeFullReload")?.(undefined);
  forceBackpressure = false;
  stdout.write = originalWrite as NodeJS.WriteStream["write"];
  const replacement = createApp(Root);
  let replacementFailure: unknown;
  let replacementMounted = false;
  try {
    replacement.mount(
      createInternalMountOptions({
        stdin,
        stdout,
        stderr,
        patchConsole: false,
        maxFps: 0,
      }),
    );
    replacementMounted = true;
  } catch (error) {
    replacementFailure = error;
  }

  if (replacementMounted) {
    replacement.unmount();
    await replacement.waitUntilExit();
  } else {
    // Let the pre-fix app finish its deferred teardown so a red regression
    // test does not leave process-global stream ownership behind.
    stdout.emit("drain");
    for (let attempt = 0; attempt < 20; attempt++) {
      if (
        stdout.listenerCount("error") === listenerBaseline.stdoutError &&
        stdin.listenerCount("error") === listenerBaseline.stdinError
      ) {
        break;
      }
      await new Promise<void>((resolve) => setImmediate(resolve));
    }
  }

  expect(replacementFailure).toBeUndefined();
  expect(exitSettled).toBe(false);
  expect(stdout.listenerCount("error")).toBe(listenerBaseline.stdoutError);
  expect(stdout.listenerCount("close")).toBe(listenerBaseline.stdoutClose);
  expect(stdin.listenerCount("error")).toBe(listenerBaseline.stdinError);
  expect(stdin.listenerCount("close")).toBe(listenerBaseline.stdinClose);
  stdout.destroy();
  stderr.destroy();
  stdin.destroy();
});
