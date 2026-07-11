import { PassThrough } from "node:stream";
import ansiEscapes from "ansi-escapes";
import { defineComponent, nextTick, shallowRef } from "vue";
import { expect, test } from "vite-plus/test";
import { createApp, Text, type TuiApp } from "@vue-tui/runtime";
import {
  INTERNAL_SUSPENSION_HOST,
  INTERNAL_TERMINAL_SIZE_PROBE,
  createManualSuspensionHost,
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
      rawMode: "always",
      maxFps: 0,
      patchConsole: false,
      exitOnCtrlC: false,
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as Parameters<TuiApp["mount"]>[0]);

    expect(stateAtRegistration).toEqual({ writes: [], isRaw: false });
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
    const App = defineComponent(() => () => <Text>{content.value}</Text>);
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
          (armedFailure === "hide" && chunk === "\x1b[?25l") ||
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
        rawMode: "always",
        maxFps: 0,
        patchConsole: false,
        exitOnCtrlC: false,
        [INTERNAL_SUSPENSION_HOST]: suspensionHost,
      } as Parameters<TuiApp["mount"]>[0]);
      expect(stdin.isRaw).toBe(true);

      suspensionHost.suspend();
      expect(stdin.isRaw).toBe(false);
      const resumeOffset = forwardedWrites.length;
      armedFailure = failureStage;
      suspensionHost.resume();

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
      rawMode: "always",
      maxFps: 0,
      patchConsole: false,
      exitOnCtrlC: false,
      [INTERNAL_SUSPENSION_HOST]: suspensionHost,
    } as Parameters<TuiApp["mount"]>[0]);
    suspensionHost.suspend();

    const resumeOffset = events.length;
    reenterOnRepaint = true;
    suspensionHost.resume();
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
      rawMode: "always",
      maxFps: 0,
      patchConsole: false,
      exitOnCtrlC: false,
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
        rawMode: "auto",
        maxFps: 0,
        patchConsole: false,
        exitOnCtrlC: false,
        [INTERNAL_SUSPENSION_HOST]: suspensionHost,
        [INTERNAL_TERMINAL_SIZE_PROBE]: () => ({ kind: "unavailable" }),
      } as Parameters<TuiApp["mount"]>[0]);

      suspensionHost.suspend();
      (stdout as { columns?: number }).columns = undefined;
      (stdout as { rows?: number }).rows = undefined;
      const resumeOffset = writes.length;
      suspensionHost.resume();

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
