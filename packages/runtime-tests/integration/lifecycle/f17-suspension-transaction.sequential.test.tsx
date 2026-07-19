import { PassThrough } from "node:stream";
import ansiEscapes from "ansi-escapes";
import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text, useInput, useLayoutWidth, type TuiApp } from "@vue-tui/runtime";
import {
  INTERNAL_KITTY_KEYBOARD,
  INTERNAL_SUSPENSION_HOST,
  INTERNAL_TERMINAL_SIZE_PROBE,
  createManualSuspensionHost,
  type InternalMountOptions,
  type SuspensionHost,
} from "@vue-tui/runtime/internal";

function makeWritable(): NodeJS.WriteStream {
  const stream = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stream, { isTTY: true, columns: 80, rows: 24 });
  return stream;
}

function makeRawTrackingStdin(): NodeJS.ReadStream & { isRaw: boolean } {
  const stream = new PassThrough() as unknown as NodeJS.ReadStream & { isRaw: boolean };
  Object.assign(stream, {
    isTTY: true,
    isRaw: false,
    setRawMode(this: NodeJS.ReadStream & { isRaw: boolean }, mode: boolean) {
      this.isRaw = mode;
      return this;
    },
    setEncoding(this: NodeJS.ReadStream) {
      return this;
    },
    ref() {},
    unref() {},
  });
  return stream;
}

test.sequential("registers suspension before the first terminal acquisition", () => {
  const stdout = makeWritable();
  const stderr = makeWritable();
  const stdin = makeRawTrackingStdin();
  const writes: string[] = [];
  const originalWrite = stdout.write.bind(stdout);
  stdout.write = ((...args: unknown[]) => {
    writes.push(String(args[0]));
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

  let stateAtRegistration: { readonly writes: readonly string[]; readonly isRaw: boolean } | null =
    null;
  const suspensionHost: SuspensionHost = {
    supported: true,
    register() {
      stateAtRegistration = { writes: [...writes], isRaw: stdin.isRaw };
      return () => {};
    },
  };
  const app = createApp(defineComponent(() => () => <Text>frame</Text>));

  try {
    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "fullscreen",
      liveUpdates: true,
      maxFps: 0,
      patchConsole: false,
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as InternalMountOptions);

    expect(stateAtRegistration).toEqual({ writes: [], isRaw: false });
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test.sequential("activating managed input while Fullscreen is suspended defers every acquisition", async () => {
  const stdout = makeWritable();
  const stderr = makeWritable();
  const stdin = makeRawTrackingStdin();
  const suspensionHost = createManualSuspensionHost();
  const active = shallowRef(false);
  const writes: string[] = [];
  const originalWrite = stdout.write.bind(stdout);
  stdout.write = ((...args: unknown[]) => {
    writes.push(String(args[0]));
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];
  const App = defineComponent(() => {
    useInput(() => {}, { isActive: active });
    return () => <Text>frame</Text>;
  });
  const app = createApp(App);

  try {
    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "fullscreen",
      liveUpdates: true,
      maxFps: 0,
      patchConsole: false,
      [INTERNAL_KITTY_KEYBOARD]: { mode: "enabled" },
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as InternalMountOptions);
    await app.waitUntilRenderFlush();
    await suspensionHost.suspend();
    expect(stdin.isRaw).toBe(false);

    const activationOffset = writes.length;
    active.value = true;
    await nextTick();

    expect(writes.slice(activationOffset)).toEqual([]);
    expect(stdin.isRaw).toBe(false);

    await suspensionHost.resume();
    const resumedOutput = writes.slice(activationOffset).join("");
    const enterIndex = resumedOutput.indexOf(ansiEscapes.enterAlternativeScreen);
    const pasteIndex = resumedOutput.indexOf("\x1b[?2004h");
    const kittyIndex = resumedOutput.indexOf("\x1b[>1u");
    expect(enterIndex).toBeGreaterThanOrEqual(0);
    expect(pasteIndex).toBeGreaterThan(enterIndex);
    expect(kittyIndex).toBeGreaterThan(enterIndex);
    expect(stdin.isRaw).toBe(true);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

type ResumeFailureStage = "enter" | "hide" | "repaint";

test.sequential.each<ResumeFailureStage>(["enter", "hide", "repaint"])(
  "a failed Fullscreen %s keeps input suspended and never repaints the main screen",
  async (failureStage) => {
    const stdout = makeWritable();
    const stderr = makeWritable();
    const stdin = makeRawTrackingStdin();
    const suspensionHost = createManualSuspensionHost();
    const content = shallowRef("before-suspend");
    const App = defineComponent(() => {
      useInput(() => {});
      return () => <Text>{content.value}</Text>;
    });
    const app = createApp(App);
    const forwardedWrites: string[] = [];
    const attemptedWrites: string[] = [];
    const originalWrite = stdout.write.bind(stdout);
    let armedFailure: ResumeFailureStage | undefined;
    let failureObserved = false;

    stdout.write = ((...args: unknown[]) => {
      const chunk = String(args[0]);
      attemptedWrites.push(chunk);
      const shouldFail =
        !failureObserved &&
        ((armedFailure === "enter" && chunk.includes(ansiEscapes.enterAlternativeScreen)) ||
          (armedFailure === "hide" && chunk.includes("\x1b[?25l")) ||
          (armedFailure === "repaint" && chunk.includes(ansiEscapes.clearViewport)));
      if (shouldFail) {
        failureObserved = true;
        throw new Error(`resume ${armedFailure} failed`);
      }
      forwardedWrites.push(chunk);
      return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
    }) as NodeJS.WriteStream["write"];

    try {
      app.mount({
        stdout,
        stderr,
        stdin,
        mode: "fullscreen",
        liveUpdates: true,
        maxFps: 0,
        patchConsole: false,
        [INTERNAL_SUSPENSION_HOST]: suspensionHost,
      } as InternalMountOptions);
      expect(stdin.isRaw).toBe(true);

      await suspensionHost.suspend();
      expect(stdin.isRaw).toBe(false);
      const resumeOffset = forwardedWrites.length;
      armedFailure = failureStage;
      await suspensionHost.resume();

      content.value = "after-failed-resume";
      await nextTick();
      await app.waitUntilRenderFlush();

      const resumedOutput = forwardedWrites.slice(resumeOffset).join("");
      expect(failureObserved).toBe(true);
      expect(stdin.isRaw).toBe(false);
      expect(resumedOutput).not.toContain(ansiEscapes.clearViewport);
      expect(resumedOutput).not.toContain("after-failed-resume");

      const enteredIndex = forwardedWrites.findIndex(
        (write, index) =>
          index >= resumeOffset && write.includes(ansiEscapes.enterAlternativeScreen),
      );
      if (enteredIndex !== -1) {
        const exitIndex = forwardedWrites.findIndex(
          (write, index) =>
            index > enteredIndex && write.includes(ansiEscapes.exitAlternativeScreen),
        );
        expect(exitIndex).toBeGreaterThan(enteredIndex);
      }
      expect(
        attemptedWrites.some((write) => write.includes(ansiEscapes.enterAlternativeScreen)),
      ).toBe(true);
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
      stderr.destroy();
    }
  },
);

test.sequential("unmount during the continuation gap cancels repaint and input reacquisition", async () => {
  const stdout = makeWritable();
  const stderr = makeWritable();
  const stdin = makeRawTrackingStdin();
  const suspensionHost = createManualSuspensionHost();
  const writes: string[] = [];
  const originalWrite = stdout.write.bind(stdout);
  stdout.write = ((...args: unknown[]) => {
    writes.push(String(args[0]));
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];
  const app = createApp(defineComponent(() => () => <Text>frame</Text>));

  try {
    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "fullscreen",
      liveUpdates: true,
      maxFps: 0,
      patchConsole: false,
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as InternalMountOptions);
    await suspensionHost.suspend();
    expect(stdin.isRaw).toBe(false);

    const resumeOffset = writes.length;
    const continuation = suspensionHost.resume();
    expect(stdin.isRaw).toBe(false);
    app.unmount();
    await continuation;
    await app.waitUntilExit();

    const outputAfterResumeRequest = writes.slice(resumeOffset).join("");
    expect(stdin.isRaw).toBe(false);
    expect(outputAfterResumeRequest).not.toContain(ansiEscapes.enterAlternativeScreen);
    expect(outputAfterResumeRequest).not.toContain(ansiEscapes.clearViewport);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test.sequential("a resize reported by the continued frame is repainted before input resumes", async () => {
  const stdout = new PassThrough() as unknown as NodeJS.WriteStream;
  const stderr = new PassThrough() as unknown as NodeJS.WriteStream;
  Object.assign(stdout, { isTTY: false, columns: 30 });
  Object.assign(stderr, { isTTY: false, columns: 30 });
  const stdin = makeRawTrackingStdin();
  const suspensionHost = createManualSuspensionHost();
  const renderedFacts: string[] = [];
  const App = defineComponent(() => {
    const width = useLayoutWidth();
    useInput(() => {});
    const frame = () => {
      const facts = `${width.value}:raw=${String(stdin.isRaw)}`;
      renderedFacts.push(facts);
      return facts;
    };
    return () => <Text>{frame()}</Text>;
  });
  const app = createApp(App);
  let resizeReported = false;
  const outputChunks: string[] = [];
  const originalWrite = stdout.write.bind(stdout);
  stdout.write = ((...args: unknown[]) => {
    const output = String(args[0]);
    outputChunks.push(output);
    if (!resizeReported && output.includes("24:raw=false")) {
      resizeReported = true;
      stdout.columns = 18;
      stdout.emit("resize");
    }
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

  try {
    app.mount({
      stdout,
      stderr,
      stdin,
      liveUpdates: true,
      maxFps: 0,
      patchConsole: false,
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as InternalMountOptions);
    await app.waitUntilRenderFlush();
    await suspensionHost.suspend();
    expect(stdin.isRaw).toBe(false);

    stdout.columns = 24;
    await suspensionHost.resume();

    expect(resizeReported).toBe(true);
    expect(outputChunks.join("")).toContain("18:raw=false");
    expect(renderedFacts).toContain("24:raw=false");
    expect(renderedFacts).toContain("18:raw=false");
    expect(renderedFacts).not.toContain("18:raw=true");
    expect(stdin.isRaw).toBe(true);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test.sequential("a reentrant unmount cannot forward a Fullscreen repaint after restoring the main screen", async () => {
  const stdout = makeWritable();
  const stderr = makeWritable();
  const stdin = makeRawTrackingStdin();
  const suspensionHost = createManualSuspensionHost();
  const events: Array<{ readonly kind: "attempt" | "forward"; readonly chunk: string }> = [];
  const originalWrite = stdout.write.bind(stdout);
  let app: TuiApp;
  let reenterOnRepaint = false;

  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    events.push({ kind: "attempt", chunk });
    if (reenterOnRepaint && chunk.includes(ansiEscapes.clearViewport)) {
      reenterOnRepaint = false;
      app.unmount();
    }
    events.push({ kind: "forward", chunk });
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

  app = createApp(defineComponent(() => () => <Text>frame</Text>));
  try {
    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "fullscreen",
      liveUpdates: true,
      maxFps: 0,
      patchConsole: false,
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as InternalMountOptions);
    await suspensionHost.suspend();

    const resumeOffset = events.length;
    reenterOnRepaint = true;
    await suspensionHost.resume();
    await app.waitUntilExit();

    const resumedEvents = events.slice(resumeOffset);
    const exitIndex = resumedEvents.findLastIndex(
      (event) =>
        event.kind === "forward" && event.chunk.includes(ansiEscapes.exitAlternativeScreen),
    );
    expect(exitIndex).toBeGreaterThanOrEqual(0);
    expect(
      resumedEvents
        .slice(exitIndex + 1)
        .some(
          (event) => event.kind === "forward" && event.chunk.includes(ansiEscapes.clearViewport),
        ),
    ).toBe(false);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test.sequential("a reentrant unmount cannot forward the initial Fullscreen paint after restoring the main screen", async () => {
  const stdout = makeWritable();
  const stderr = makeWritable();
  const stdin = makeRawTrackingStdin();
  const events: Array<{ readonly kind: "attempt" | "forward"; readonly chunk: string }> = [];
  const originalWrite = stdout.write.bind(stdout);
  let app: TuiApp;
  let reenterOnFirstPaint = true;

  stdout.write = ((...args: unknown[]) => {
    const chunk = String(args[0]);
    events.push({ kind: "attempt", chunk });
    if (reenterOnFirstPaint && chunk.includes(ansiEscapes.clearViewport)) {
      reenterOnFirstPaint = false;
      app.unmount();
    }
    events.push({ kind: "forward", chunk });
    return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
  }) as NodeJS.WriteStream["write"];

  app = createApp(defineComponent(() => () => <Text>first-frame</Text>));
  try {
    app.mount({
      stdout,
      stderr,
      stdin,
      mode: "fullscreen",
      liveUpdates: true,
      maxFps: 0,
      patchConsole: false,
    });
    await app.waitUntilExit();

    expect(reenterOnFirstPaint).toBe(false);
    const exitIndex = events.findLastIndex(
      (event) =>
        event.kind === "forward" && event.chunk.includes(ansiEscapes.exitAlternativeScreen),
    );
    expect(exitIndex).toBeGreaterThanOrEqual(0);
    expect(
      events
        .slice(exitIndex + 1)
        .some(
          (event) => event.kind === "forward" && event.chunk.includes(ansiEscapes.clearViewport),
        ),
    ).toBe(false);
  } finally {
    app.unmount();
    stdin.destroy();
    stdout.destroy();
    stderr.destroy();
  }
});

test.sequential.each(["inline", "fullscreen"] as const)(
  "%s continuation repaints with the last coherent dimensions when a fresh size is unavailable",
  async (mode) => {
    const stdout = makeWritable();
    const stderr = makeWritable();
    const stdin = makeRawTrackingStdin();
    const suspensionHost = createManualSuspensionHost();
    const writes: string[] = [];
    const originalWrite = stdout.write.bind(stdout);
    stdout.write = ((...args: unknown[]) => {
      writes.push(String(args[0]));
      return (originalWrite as (...writeArgs: unknown[]) => boolean)(...args);
    }) as NodeJS.WriteStream["write"];
    const app = createApp(defineComponent(() => () => <Text>{`${mode}-frame`}</Text>));

    try {
      app.mount({
        stdout,
        stderr,
        stdin,
        mode,
        liveUpdates: true,
        maxFps: 0,
        patchConsole: false,
        [INTERNAL_SUSPENSION_HOST]: suspensionHost,
        [INTERNAL_TERMINAL_SIZE_PROBE]: () => ({ kind: "unavailable" }),
      } as InternalMountOptions);

      await suspensionHost.suspend();
      (stdout as { columns?: number }).columns = undefined;
      (stdout as { rows?: number }).rows = undefined;
      const resumeOffset = writes.length;
      await suspensionHost.resume();

      const resumedOutput = writes.slice(resumeOffset).join("");
      expect(resumedOutput).toContain(`${mode}-frame`);
      if (mode === "fullscreen") {
        expect(resumedOutput).toContain(ansiEscapes.enterAlternativeScreen);
      } else {
        expect(resumedOutput).not.toContain(ansiEscapes.clearViewport);
      }
    } finally {
      app.unmount();
      stdin.destroy();
      stdout.destroy();
      stderr.destroy();
    }
  },
);
